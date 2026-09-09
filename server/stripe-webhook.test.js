/**
 * Tests for server/stripe-webhook.mjs — the staging fulfillment path.
 *
 * No network, no Stripe SDK, no real secrets: events are signed with a
 * throwaway fixture secret via signTestWebhook, and every test gets a fresh
 * temp data dir. Covers the money-milestone guarantees:
 *   - bad signatures are rejected (no processing, no packet)
 *   - duplicate deliveries are deduped (one payment, one packet)
 *   - a packet exists ONLY after a verified $30 succeeded payment
 *   - failed / wrong-amount / session-less payments produce NO packet
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WEBHOOK_ERROR_CODES,
  WebhookError,
  verifyWebhookSignature,
  signTestWebhook,
  parseSignatureHeader,
  loadWebhookSecret,
  loadDownloadSecret,
  saveSession,
  loadSession,
  isEventProcessed,
  markEventProcessed,
  recordPaidReceipt,
  isPaidReceipt,
  findPaidReceiptByIntent,
  webhookProvider,
  savePacketHtml,
  loadPacketHtml,
  packetDigest,
  readPacketDigest,
  sanitizeId,
  updateReceiptPacketId,
  fulfillSucceededPayment,
  parseEvent,
  createWebhookHandler,
  createCheckoutSessionHandler,
  createPacketDownloadTokenHandler,
  createPacketDownloadHandler,
  mintDownloadToken,
  peekDownloadToken,
  consumeDownloadToken,
  DOWNLOAD_TOKEN_TTL_SEC,
} from './stripe-webhook.mjs';
import { buildPacket } from '../src/lib/packet.js';
import { MAX_BODY_BYTES } from './request-limits.mjs';

const FIXTURE_SECRET = 'whsec_test_fixture_only';
const WRONG_SECRET = 'whsec_test_wrong';

/** Complete + eligible questionnaire answers (mirrors packet.test.js fixture). */
const FIXTURE_ANSWERS = Object.freeze({
  state: 'TX',
  petitionerName: 'Alex Rivera',
  respondentName: 'Jordan Rivera',
  county: 'Tulsa',
  marriageDate: '2015-06-20',
  marriagePlace: 'Dallas, Texas',
  residency: true,
  uncontested: true,
  minorChildren: false,
  propertySplit: true,
});

/** Minimal fake req/res for the node:http handlers. */
function fakeReq({ method = 'POST', body = '', headers = {} } = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    method,
    headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    [Symbol.asyncIterator]() {
      let done = false;
      return {
        next: async () => {
          if (done) return { done: true };
          done = true;
          return { value: Buffer.from(data), done: false };
        },
      };
    },
  };
}

function fakeRes() {
  let body = '';
  return {
    status: null,
    headers: null,
    writeHead(s, h) {
      this.status = s;
      this.headers = h;
    },
    end(b) {
      body = b || '';
    },
    json() {
      return JSON.parse(body);
    },
    text() {
      return body;
    },
  };
}

/** A fresh temp data dir per test — nothing touches server/data/. */
let dataDir;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'divorce-webhook-test-'));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

/** Build a payment_intent.succeeded-shaped event body for a session. */
function succeededEvent({ eventId = 'evt_test_1', intentId = 'pi_sim_test_1', sessionId, amount = 3000, currency = 'usd', withCharges = true } = {}) {
  const intent = {
    id: intentId,
    object: 'payment_intent',
    amount,
    currency,
    created: Math.floor(Date.now() / 1000),
    metadata: { packet_id: sessionId },
  };
  if (withCharges) {
    intent.charges = { data: [{ payment_method_details: { card: { last4: '4242' } } }] };
  }
  return JSON.stringify({ id: eventId, object: 'event', type: 'payment_intent.succeeded', data: { object: intent } });
}

function signedReq(rawBody, secret = FIXTURE_SECRET) {
  return fakeReq({
    body: rawBody,
    headers: { 'stripe-signature': signTestWebhook(rawBody, secret) },
  });
}

function webhookHandler(secret = FIXTURE_SECRET) {
  return createWebhookHandler({ getWebhookSecret: () => secret, dataDir });
}

/* ── Signature verification ──────────────────────────────────────── */

describe('verifyWebhookSignature', () => {
  it('accepts a correctly signed payload', () => {
    const body = '{"a":1}';
    const header = signTestWebhook(body, FIXTURE_SECRET);
    expect(verifyWebhookSignature({ rawBody: body, signatureHeader: header, secret: FIXTURE_SECRET }).valid).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = '{"a":1}';
    const header = signTestWebhook(body, FIXTURE_SECRET);
    expect(() =>
      verifyWebhookSignature({ rawBody: '{"a":2}', signatureHeader: header, secret: FIXTURE_SECRET })
    ).toThrowError(WebhookError);
  });

  it('rejects the wrong secret', () => {
    const body = '{"a":1}';
    const header = signTestWebhook(body, FIXTURE_SECRET);
    try {
      verifyWebhookSignature({ rawBody: body, signatureHeader: header, secret: WRONG_SECRET });
      expect.unreachable('wrong secret must not verify');
    } catch (e) {
      expect(e.code).toBe(WEBHOOK_ERROR_CODES.SIGNATURE_INVALID);
    }
  });

  it('rejects a missing header', () => {
    expect(() =>
      verifyWebhookSignature({ rawBody: '{}', signatureHeader: undefined, secret: FIXTURE_SECRET })
    ).toThrowError(WebhookError);
  });

  it('rejects a malformed header', () => {
    expect(() =>
      verifyWebhookSignature({ rawBody: '{}', signatureHeader: 'not-a-signature', secret: FIXTURE_SECRET })
    ).toThrowError(WebhookError);
  });

  it('rejects a stale timestamp (replay guard)', () => {
    const body = '{}';
    const old = Math.floor(Date.now() / 1000) - 3600;
    const header = signTestWebhook(body, FIXTURE_SECRET, old);
    try {
      verifyWebhookSignature({ rawBody: body, signatureHeader: header, secret: FIXTURE_SECRET });
      expect.unreachable('stale signature must not verify');
    } catch (e) {
      expect(e.code).toBe(WEBHOOK_ERROR_CODES.SIGNATURE_INVALID);
    }
  });

  it('parseSignatureHeader extracts t and all v1 signatures', () => {
    const { timestamp, signatures } = parseSignatureHeader('t=123,v1=aaa,v1=bbb');
    expect(timestamp).toBe(123);
    expect(signatures).toEqual(['aaa', 'bbb']);
  });
});

describe('loadWebhookSecret', () => {
  it('refuses live mode without explicit opt-in', () => {
    expect(() => loadWebhookSecret({ STRIPE_MODE: 'live', STRIPE_WEBHOOK_SECRET: 'x' })).toThrowError(
      expect.objectContaining({ code: WEBHOOK_ERROR_CODES.TEST_MODE_VIOLATION })
    );
  });

  it('fails closed when no secret is configured', () => {
    expect(() => loadWebhookSecret({ STRIPE_MODE: 'test' })).toThrowError(
      expect.objectContaining({ code: WEBHOOK_ERROR_CODES.WEBHOOK_SECRET_MISSING })
    );
  });

  it('fails closed on a weak (short) secret — a guessable HMAC key is not a secret', () => {
    expect(() => loadWebhookSecret({ STRIPE_MODE: 'test', STRIPE_WEBHOOK_SECRET: 'abc123' })).toThrowError(
      expect.objectContaining({ code: WEBHOOK_ERROR_CODES.WEBHOOK_SECRET_MISSING })
    );
    // 15 chars is still short: the boundary is 16.
    expect(() =>
      loadWebhookSecret({ STRIPE_MODE: 'test', STRIPE_WEBHOOK_SECRET: '123456789012345' })
    ).toThrowError(expect.objectContaining({ code: WEBHOOK_ERROR_CODES.WEBHOOK_SECRET_MISSING }));
  });

  it('accepts a 16-char secret (the strength boundary)', () => {
    expect(loadWebhookSecret({ STRIPE_MODE: 'test', STRIPE_WEBHOOK_SECRET: '1234567890123456' })).toBe(
      '1234567890123456'
    );
  });
});

describe('loadDownloadSecret', () => {
  it('rejects a weak dedicated DOWNLOAD_TOKEN_SECRET', () => {
    expect(() =>
      loadDownloadSecret({ STRIPE_MODE: 'test', DOWNLOAD_TOKEN_SECRET: 'short' })
    ).toThrowError(expect.objectContaining({ code: WEBHOOK_ERROR_CODES.WEBHOOK_SECRET_MISSING }));
  });

  it('rejects a weak STRIPE_WEBHOOK_SECRET fallback', () => {
    expect(() =>
      loadDownloadSecret({ STRIPE_MODE: 'test', STRIPE_WEBHOOK_SECRET: 'weak' })
    ).toThrowError(expect.objectContaining({ code: WEBHOOK_ERROR_CODES.WEBHOOK_SECRET_MISSING }));
  });
});

/* ── Handler: signature failures → 400, nothing processed ─────────── */

describe('POST /api/stripe-webhook — signature failures', () => {
  it('400s on a bad signature and records nothing', async () => {
    const rawBody = succeededEvent({ sessionId: 'sess_x' });
    const res = fakeRes();
    await webhookHandler()(signedReq(rawBody, WRONG_SECRET), res);
    expect(res.status).toBe(400);
    expect(res.json().error.code).toBe(WEBHOOK_ERROR_CODES.SIGNATURE_INVALID);
    expect(isEventProcessed(dataDir, 'evt_test_1')).toBe(false);
  });

  it('400s with no signature header at all', async () => {
    const res = fakeRes();
    await webhookHandler()(fakeReq({ body: '{}' }), res);
    expect(res.status).toBe(400);
  });

  it('400s on non-JSON body', async () => {
    const rawBody = 'this is not json';
    const res = fakeRes();
    await webhookHandler()(signedReq(rawBody), res);
    expect(res.status).toBe(400);
    expect(res.json().error.code).toBe(WEBHOOK_ERROR_CODES.EVENT_INVALID);
  });

  it('405s on GET', async () => {
    const res = fakeRes();
    await webhookHandler()(fakeReq({ method: 'GET' }), res);
    expect(res.status).toBe(405);
  });

  it('500s when the webhook secret is not configured', async () => {
    const handler = createWebhookHandler({
      getWebhookSecret: () => {
        throw new WebhookError(WEBHOOK_ERROR_CODES.WEBHOOK_SECRET_MISSING, 'no secret');
      },
      dataDir,
    });
    const res = fakeRes();
    await handler(signedReq('{}'), res);
    expect(res.status).toBe(500);
    expect(res.json().error.code).toBe(WEBHOOK_ERROR_CODES.WEBHOOK_SECRET_MISSING);
  });
});

/* ── Happy path: verified $30 success → ledger + packet ───────────── */

describe('POST /api/stripe-webhook — payment_intent.succeeded', () => {
  it('records the payment and generates the printable packet', async () => {
    const session = saveSession(dataDir, { email: 'buyer@example.com', answers: FIXTURE_ANSWERS });
    const rawBody = succeededEvent({ sessionId: session.sessionId });
    const res = fakeRes();
    await webhookHandler()(signedReq(rawBody), res);

    expect(res.status).toBe(200);
    const json = res.json();
    expect(json.received).toBe(true);
    expect(json.packetId).toMatch(/^pkt_rcpt_/);

    // Ledger: one payment recorded, one packet ready.
    const ledger = readFileSync(join(dataDir, 'ledger.jsonl'), 'utf8');
    expect(ledger).toContain('"kind":"payment_recorded"');
    expect(ledger).toContain('"kind":"packet_ready"');
    expect(ledger.match(/"kind":"payment_recorded"/g)).toHaveLength(1);

    // Packet HTML is stored and gated: names in, $30.00 line in.
    const html = loadPacketHtml(dataDir, 'pi_sim_test_1');
    expect(html).toContain('Alex Rivera');
    expect(html).toContain('Jordan Rivera');
    expect(html).toContain('$30.00');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('dedupes duplicate deliveries: one payment, one packet, second is a no-op', async () => {
    const session = saveSession(dataDir, { answers: FIXTURE_ANSWERS });
    const rawBody = succeededEvent({ sessionId: session.sessionId });
    const req1 = signedReq(rawBody);
    const req2 = signedReq(rawBody);

    const res1 = fakeRes();
    await webhookHandler()(req1, res1);
    expect(res1.status).toBe(200);
    expect(res1.json().packetId).toBeDefined();

    const res2 = fakeRes();
    await webhookHandler()(req2, res2);
    expect(res2.status).toBe(200);
    expect(res2.json().deduped).toBe(true);
    expect(res2.json().packetId).toBeUndefined();

    const ledger = readFileSync(join(dataDir, 'ledger.jsonl'), 'utf8');
    expect(ledger.match(/"kind":"payment_recorded"/g)).toHaveLength(1);
    expect(ledger.match(/"kind":"packet_ready"/g)).toHaveLength(1);
  });

  it('uses the card last4 from the event when present', async () => {
    const session = saveSession(dataDir, { answers: FIXTURE_ANSWERS });
    const rawBody = succeededEvent({ sessionId: session.sessionId, withCharges: true });
    const res = fakeRes();
    await webhookHandler()(signedReq(rawBody), res);
    expect(res.status).toBe(200);
    expect(loadPacketHtml(dataDir, 'pi_sim_test_1')).toContain('4242');
  });

  it('ignores non-succeeded event types without producing a packet', async () => {
    const rawBody = JSON.stringify({
      id: 'evt_test_fail',
      object: 'event',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_sim_failed_1', amount: 3000, currency: 'usd' } },
    });
    const res = fakeRes();
    await webhookHandler()(signedReq(rawBody), res);
    expect(res.status).toBe(200);
    expect(res.json().ignored).toBe('payment_intent.payment_failed');
    expect(loadPacketHtml(dataDir, 'pi_sim_failed_1')).toBeNull();
    expect(isPaidReceipt(dataDir, { id: 'rcpt_evt_test_fail' })).toBe(false);
  });
});

/* ── Rejection paths: verified but never fulfilled ────────────────── */

describe('POST /api/stripe-webhook — verified but rejected', () => {
  it('a failed payment produces NO packet and NO receipt', async () => {
    const rawBody = JSON.stringify({
      id: 'evt_test_failed',
      object: 'event',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_sim_nope_1', amount: 3000, currency: 'usd' } },
    });
    const res = fakeRes();
    await webhookHandler()(signedReq(rawBody), res);
    expect(res.status).toBe(200);
    expect(loadPacketHtml(dataDir, 'pi_sim_nope_1')).toBeNull();
    const ledger = existsSync(join(dataDir, 'ledger.jsonl'))
      ? readFileSync(join(dataDir, 'ledger.jsonl'), 'utf8')
      : '';
    expect(ledger).not.toContain('"kind":"payment_recorded"');
  });

  it('a wrong amount is rejected: no packet, no receipt', async () => {
    const session = saveSession(dataDir, { answers: FIXTURE_ANSWERS });
    const rawBody = succeededEvent({ sessionId: session.sessionId, amount: 2999 });
    const res = fakeRes();
    await webhookHandler()(signedReq(rawBody), res);
    expect(res.status).toBe(200);
    expect(res.json().rejected).toBeDefined();
    expect(loadPacketHtml(dataDir, 'pi_sim_test_1')).toBeNull();
    expect(isPaidReceipt(dataDir, { id: 'rcpt_evt_test_1' })).toBe(false);
  });

  it('an unknown session is rejected: payment data never becomes a packet', async () => {
    const rawBody = succeededEvent({ sessionId: 'sess_does_not_exist' });
    const res = fakeRes();
    await webhookHandler()(signedReq(rawBody), res);
    expect(res.status).toBe(200);
    expect(res.json().rejected).toBe(WEBHOOK_ERROR_CODES.SESSION_INVALID);
    expect(loadPacketHtml(dataDir, 'pi_sim_test_1')).toBeNull();
  });

  it('incomplete answers fail the packet gate: payment recorded, NO packet', async () => {
    const session = saveSession(dataDir, { answers: { state: 'TX' } });
    const rawBody = succeededEvent({ sessionId: session.sessionId });
    const res = fakeRes();
    await webhookHandler()(signedReq(rawBody), res);
    expect(res.status).toBe(200);
    // The money is honestly recorded…
    expect(isPaidReceipt(dataDir, { id: 'rcpt_evt_test_1' })).toBe(true);
    // …but a half-filled legal document is never generated.
    expect(loadPacketHtml(dataDir, 'pi_sim_test_1')).toBeNull();
    const ledger = readFileSync(join(dataDir, 'ledger.jsonl'), 'utf8');
    expect(ledger).toContain('"kind":"payment_rejected"');
  });
});

/* ── Packet gate: only the ledger unlocks buildPacket ─────────────── */

describe('packet generated ONLY after payment', () => {
  it('buildPacket throws PACKET_UNPAID for a receipt that was never recorded', () => {
    const provider = webhookProvider(dataDir);
    const fakeReceipt = {
      id: 'rcpt_forged',
      paymentIntentId: 'pi_forged',
      amount: 3000,
      currency: 'usd',
      cardLast4: '4242',
      paidAt: new Date().toISOString(),
      testMode: true,
    };
    expect(provider.isValidReceipt(fakeReceipt)).toBe(false);
    expect(() => buildPacket(provider, fakeReceipt, FIXTURE_ANSWERS)).toThrowError(
      expect.objectContaining({ code: 'PACKET_UNPAID' })
    );
  });

  it('buildPacket succeeds for a receipt recorded by the webhook', () => {
    const receipt = {
      id: 'rcpt_evt_recorded',
      eventId: 'evt_recorded',
      paymentIntentId: 'pi_recorded',
      amount: 3000,
      currency: 'usd',
      cardLast4: '4242',
      paidAt: new Date().toISOString(),
      testMode: true,
    };
    recordPaidReceipt(dataDir, receipt);
    const provider = webhookProvider(dataDir);
    expect(provider.isValidReceipt(receipt)).toBe(true);
    const packet = buildPacket(provider, receipt, FIXTURE_ANSWERS);
    expect(packet.packetId).toBe('pkt_rcpt_evt_recorded');
  });
});

/* ── Checkout session intake ──────────────────────────────────────── */

describe('POST /api/checkout-session', () => {
  it('stores answers and returns a sessionId', async () => {
    const handler = createCheckoutSessionHandler({ dataDir });
    const res = fakeRes();
    await handler(fakeReq({ body: { email: 'buyer@example.com', answers: FIXTURE_ANSWERS } }), res);
    expect(res.status).toBe(200);
    const { sessionId } = res.json();
    expect(sessionId).toMatch(/^sess_/);
    const loaded = loadSession(dataDir, sessionId);
    expect(loaded.answers.petitionerName).toBe('Alex Rivera');
    expect(loaded.email).toBe('buyer@example.com');
  });

  it('400s on a bad email', async () => {
    const handler = createCheckoutSessionHandler({ dataDir });
    const res = fakeRes();
    await handler(fakeReq({ body: { email: 'not-an-email', answers: FIXTURE_ANSWERS } }), res);
    expect(res.status).toBe(400);
  });

  it('400s when answers are missing', async () => {
    const handler = createCheckoutSessionHandler({ dataDir });
    const res = fakeRes();
    await handler(fakeReq({ body: { email: 'buyer@example.com' } }), res);
    expect(res.status).toBe(400);
  });

  it('400s on invalid JSON', async () => {
    const handler = createCheckoutSessionHandler({ dataDir });
    const res = fakeRes();
    await handler(fakeReq({ body: 'nope{{{' }), res);
    expect(res.status).toBe(400);
  });

  it('loadSession returns null for an unknown session', () => {
    expect(loadSession(dataDir, 'sess_missing')).toBeNull();
  });
});

/* ── Packet download ──────────────────────────────────────────────── */

describe('GET /api/packet/:paymentIntentId', () => {
  /** Download handler wired with the fixture token secret. */
  const dlHandler = () => createPacketDownloadHandler({ dataDir, getDownloadSecret: () => FIXTURE_SECRET });
  /** Record a paid receipt and mint a download token for it. */
  const paidToken = (paymentIntentId, { nowMs } = {}) => {
    recordPaidReceipt(dataDir, {
      id: `rcpt_${paymentIntentId}`,
      paymentIntentId,
      amount: 3000,
      currency: 'usd',
    });
    return mintDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId, nowMs });
  };

  it('401s before any payment: no token exists and the id alone never unlocks', async () => {
    const handler = dlHandler();
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res, 'pi_sim_test_1', null);
    expect(res.status).toBe(401);
    expect(res.json().error.code).toBe(WEBHOOK_ERROR_CODES.DOWNLOAD_TOKEN_INVALID);
  });

  it('401s even when a packet exists but no token is presented', async () => {
    savePacketHtml(dataDir, 'pi_sim_test_1', '<!DOCTYPE html><html><body>PACKET</body></html>');
    const handler = dlHandler();
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res, 'pi_sim_test_1', null);
    expect(res.status).toBe(401);
    expect(res.json().error.code).toBe(WEBHOOK_ERROR_CODES.DOWNLOAD_TOKEN_INVALID);
  });

  it('serves the paid packet as an attachment download with a valid token', async () => {
    savePacketHtml(dataDir, 'pi_sim_test_1', '<!DOCTYPE html><html><body>PACKET</body></html>');
    const { token } = paidToken('pi_sim_test_1');
    const handler = dlHandler();
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res, 'pi_sim_test_1', token);
    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toContain('text/html');
    expect(res.headers['Content-Disposition']).toContain('attachment');
    expect(res.text()).toContain('PACKET');
  });

  it('403s when the same single-use token is presented twice', async () => {
    savePacketHtml(dataDir, 'pi_sim_test_1', '<!DOCTYPE html><html><body>PACKET</body></html>');
    const { token } = paidToken('pi_sim_test_1');
    const handler = dlHandler();
    const first = fakeRes();
    await handler(fakeReq({ method: 'GET' }), first, 'pi_sim_test_1', token);
    expect(first.status).toBe(200);
    const second = fakeRes();
    await handler(fakeReq({ method: 'GET' }), second, 'pi_sim_test_1', token);
    expect(second.status).toBe(403);
    expect(second.json().error.code).toBe(WEBHOOK_ERROR_CODES.DOWNLOAD_TOKEN_USED);
  });

  it('401s when a token minted for one payment is used for another', async () => {
    savePacketHtml(dataDir, 'pi_sim_test_2', '<!DOCTYPE html><html><body>PACKET</body></html>');
    const { token } = paidToken('pi_sim_test_1');
    const handler = dlHandler();
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res, 'pi_sim_test_2', token);
    expect(res.status).toBe(401);
    expect(res.json().error.code).toBe(WEBHOOK_ERROR_CODES.DOWNLOAD_TOKEN_MISMATCH);
  });

  it('does not burn a valid token when the packet is not ready yet', async () => {
    const { token } = paidToken('pi_sim_unpaid_1');
    const handler = dlHandler();
    const first = fakeRes();
    await handler(fakeReq({ method: 'GET' }), first, 'pi_sim_unpaid_1', token);
    expect(first.status).toBe(404);
    expect(first.json().error.code).toBe(WEBHOOK_ERROR_CODES.PACKET_NOT_READY);
    // The payer still has their download: the token was NOT consumed.
    savePacketHtml(dataDir, 'pi_sim_unpaid_1', '<!DOCTYPE html><html><body>PACKET</body></html>');
    const second = fakeRes();
    await handler(fakeReq({ method: 'GET' }), second, 'pi_sim_unpaid_1', token);
    expect(second.status).toBe(200);
  });

  it('rejects path traversal without touching the filesystem', async () => {
    expect(sanitizeId('../../etc/passwd')).toBeNull();
    expect(sanitizeId('pi_ok-123_ABC')).toBe('pi_ok-123_ABC');
    expect(loadPacketHtml(dataDir, '../../etc/passwd')).toBeNull();
    const handler = dlHandler();
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res, '..%2F..%2Fetc', null);
    expect(res.status).toBe(404);
  });

  it('405s on POST', async () => {
    const handler = dlHandler();
    const res = fakeRes();
    await handler(fakeReq({ method: 'POST' }), res, 'pi_sim_test_1', null);
    expect(res.status).toBe(405);
  });
});

describe('loadDownloadSecret', () => {
  it('prefers the dedicated DOWNLOAD_TOKEN_SECRET', () => {
    // Strength gate now applies: routing fixtures must be 16+ chars.
    expect(loadDownloadSecret({ DOWNLOAD_TOKEN_SECRET: 'token-secret-fixture-01' })).toBe(
      'token-secret-fixture-01'
    );
  });

  it('falls back to STRIPE_WEBHOOK_SECRET so the staging drill needs one secret', () => {
    expect(loadDownloadSecret({ STRIPE_WEBHOOK_SECRET: 'webhook-secret-fixture-01' })).toBe(
      'webhook-secret-fixture-01'
    );
  });
  it('fails closed when no secret is set', () => {
    expect(() => loadDownloadSecret({})).toThrowError(
      expect.objectContaining({ code: WEBHOOK_ERROR_CODES.WEBHOOK_SECRET_MISSING })
    );
  });

  it('refuses live mode unless explicitly opted in', () => {
    expect(() =>
      loadDownloadSecret({ STRIPE_MODE: 'live', DOWNLOAD_TOKEN_SECRET: 'x' })
    ).toThrowError(expect.objectContaining({ code: WEBHOOK_ERROR_CODES.TEST_MODE_VIOLATION }));
  });
});

describe('download token mint / verify / consume', () => {
  it('round-trips: mint → peek valid → consume → peek fails as used', () => {
    const { token } = mintDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId: 'pi_tok_1' });
    const valid = peekDownloadToken(dataDir, {
      secret: FIXTURE_SECRET,
      paymentIntentId: 'pi_tok_1',
      token,
    });
    expect(valid.paymentIntentId).toBe('pi_tok_1');
    consumeDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId: 'pi_tok_1', token });
    expect(() =>
      peekDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId: 'pi_tok_1', token })
    ).toThrowError(expect.objectContaining({ code: WEBHOOK_ERROR_CODES.DOWNLOAD_TOKEN_USED }));
  });

  it('rejects a signature made with the wrong secret', () => {
    const { token } = mintDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId: 'pi_tok_2' });
    expect(() =>
      peekDownloadToken(dataDir, { secret: WRONG_SECRET, paymentIntentId: 'pi_tok_2', token })
    ).toThrowError(expect.objectContaining({ code: WEBHOOK_ERROR_CODES.DOWNLOAD_TOKEN_INVALID }));
  });

  it('rejects an expired token', () => {
    let now = 1_000_000_000_000;
    const { token } = mintDownloadToken(dataDir, {
      secret: FIXTURE_SECRET,
      paymentIntentId: 'pi_tok_3',
      ttlSec: 60,
      nowMs: () => now,
    });
    now += (60 + 1) * 1000; // past expiry
    expect(() =>
      peekDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId: 'pi_tok_3', token, nowMs: () => now })
    ).toThrowError(expect.objectContaining({ code: WEBHOOK_ERROR_CODES.DOWNLOAD_TOKEN_EXPIRED }));
  });

  it('defaults to a 24h TTL', () => {
    expect(DOWNLOAD_TOKEN_TTL_SEC).toBe(86400);
    const before = Math.floor(Date.now() / 1000);
    const { token } = mintDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId: 'pi_tok_4' });
    const { exp } = peekDownloadToken(dataDir, {
      secret: FIXTURE_SECRET,
      paymentIntentId: 'pi_tok_4',
      token,
    });
    expect(exp - before).toBeGreaterThanOrEqual(86400 - 1);
    expect(exp - before).toBeLessThanOrEqual(86400 + 1);
  });

  it('rejects a token presented for a different payment intent', () => {
    const { token } = mintDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId: 'pi_tok_5' });
    expect(() =>
      peekDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId: 'pi_tok_other', token })
    ).toThrowError(expect.objectContaining({ code: WEBHOOK_ERROR_CODES.DOWNLOAD_TOKEN_MISMATCH }));
  });

  it('rejects malformed tokens without touching secrets', () => {
    for (const bad of [null, '', 'no-dot-here', 'abc.def', `${Buffer.from('x').toString('base64url')}.deadbeef`]) {
      expect(() =>
        peekDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId: 'pi_tok_6', token: bad })
      ).toThrowError(expect.objectContaining({ code: WEBHOOK_ERROR_CODES.DOWNLOAD_TOKEN_INVALID }));
    }
  });

  it('prunes expired records so the store stays bounded', () => {
    let now = 2_000_000_000_000;
    const { token } = mintDownloadToken(dataDir, {
      secret: FIXTURE_SECRET,
      paymentIntentId: 'pi_tok_7',
      ttlSec: 10,
      nowMs: () => now,
    });
    now += 11_000;
    expect(() =>
      peekDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId: 'pi_tok_7', token, nowMs: () => now })
    ).toThrowError(expect.objectContaining({ code: WEBHOOK_ERROR_CODES.DOWNLOAD_TOKEN_EXPIRED }));
    // Expired records are pruned from the store (signature/expiry are still
    // checked first, so a re-presented expired token keeps failing as EXPIRED).
    const store = JSON.parse(readFileSync(join(dataDir, 'download-tokens.json'), 'utf8'));
    expect(Object.keys(store)).toHaveLength(0);
    expect(() =>
      peekDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId: 'pi_tok_7', token, nowMs: () => now })
    ).toThrowError(expect.objectContaining({ code: WEBHOOK_ERROR_CODES.DOWNLOAD_TOKEN_EXPIRED }));
  });

  it('findPaidReceiptByIntent returns the paid receipt for the intent, null when unpaid', () => {
    expect(findPaidReceiptByIntent(dataDir, 'pi_unpaid_x')).toBeNull();
    recordPaidReceipt(dataDir, { id: 'rcpt_x', paymentIntentId: 'pi_paid_x', amount: 3000, currency: 'usd' });
    expect(findPaidReceiptByIntent(dataDir, 'pi_paid_x')?.id).toBe('rcpt_x');
    expect(findPaidReceiptByIntent(dataDir, '../../etc/passwd')).toBeNull();
  });
});

describe('POST /api/packet-token', () => {
  const tokenHandler = () =>
    createPacketDownloadTokenHandler({ getDownloadSecret: () => FIXTURE_SECRET, dataDir });

  it('404s when there is no paid receipt for the intent', async () => {
    const res = fakeRes();
    await tokenHandler()(fakeReq({ body: { paymentIntentId: 'pi_unpaid_y' } }), res);
    expect(res.status).toBe(404);
    expect(res.json().error.code).toBe(WEBHOOK_ERROR_CODES.PACKET_NOT_READY);
  });

  it('mints a single-use token once a paid receipt exists', async () => {
    recordPaidReceipt(dataDir, { id: 'rcpt_y', paymentIntentId: 'pi_paid_y', amount: 3000, currency: 'usd' });
    const res = fakeRes();
    await tokenHandler()(fakeReq({ body: { paymentIntentId: 'pi_paid_y' } }), res);
    expect(res.status).toBe(200);
    const json = res.json();
    expect(typeof json.downloadToken).toBe('string');
    expect(json.singleUse).toBe(true);
    expect(json.paymentIntentId).toBe('pi_paid_y');
    // The minted token verifies for exactly this payment.
    const valid = peekDownloadToken(dataDir, {
      secret: FIXTURE_SECRET,
      paymentIntentId: 'pi_paid_y',
      token: json.downloadToken,
    });
    expect(valid.paymentIntentId).toBe('pi_paid_y');
  });

  it('400s on a missing paymentIntentId and on non-JSON', async () => {
    const missing = fakeRes();
    await tokenHandler()(fakeReq({ body: {} }), missing);
    expect(missing.status).toBe(400);
    const notJson = fakeRes();
    await tokenHandler()(fakeReq({ body: 'not-json{' }), notJson);
    expect(notJson.status).toBe(400);
  });

  it('405s on GET', async () => {
    const res = fakeRes();
    await tokenHandler()(fakeReq({ method: 'GET' }), res);
    expect(res.status).toBe(405);
  });
});

/* ── Event parsing + processed-event idempotency primitives ───────── */

describe('parseEvent / processed events', () => {
  it('rejects events with an unsafe id', () => {
    const rawBody = JSON.stringify({
      id: '../../evil',
      type: 'payment_intent.succeeded',
      data: { object: {} },
    });
    expect(() => parseEvent(rawBody)).toThrowError(
      expect.objectContaining({ code: WEBHOOK_ERROR_CODES.EVENT_INVALID })
    );
  });

  it('markEventProcessed / isEventProcessed round-trip', () => {
    expect(isEventProcessed(dataDir, 'evt_x')).toBe(false);
    markEventProcessed(dataDir, 'evt_x', 'fulfilled');
    expect(isEventProcessed(dataDir, 'evt_x')).toBe(true);
  });

  it('fulfillSucceededPayment throws SESSION_INVALID for a missing session', () => {
    expect(() =>
      fulfillSucceededPayment(dataDir, { id: 'evt_no_sess' }, { id: 'pi_x', amount: 3000, currency: 'usd', metadata: {} })
    ).toThrowError(expect.objectContaining({ code: WEBHOOK_ERROR_CODES.SESSION_INVALID }));
  });
});

/* ── Packet download privacy headers ──────────────────────────────── */

import {
  PACKET_DOWNLOAD_HEADERS,
  startCheckoutServer,
} from './stripe-webhook.mjs';
import {
  createRateLimiter,
  DEFAULT_RATE_LIMIT,
  RATE_LIMIT_ERROR_CODE,
  clientKey,
} from './rate-limit.mjs';

describe('GET /api/packet/:paymentIntentId — privacy headers', () => {
  it('sends no-store / nosniff / no-referrer on the paid download', async () => {
    savePacketHtml(dataDir, 'pi_sim_priv_1', '<!DOCTYPE html><html><body>PACKET</body></html>');
    const { token } = mintDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId: 'pi_sim_priv_1' });
    const handler = createPacketDownloadHandler({ dataDir, getDownloadSecret: () => FIXTURE_SECRET });
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res, 'pi_sim_priv_1', token);
    expect(res.status).toBe(200);
    expect(res.headers['Cache-Control']).toBe(PACKET_DOWNLOAD_HEADERS['Cache-Control']);
    expect(res.headers['Cache-Control']).toContain('no-store');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['Referrer-Policy']).toBe('no-referrer');
    expect(res.headers['Pragma']).toBe('no-cache');
  });

  it('rejects a quote-injection id as an invalid id (never touches the header)', async () => {
    const handler = createPacketDownloadHandler({ dataDir, getDownloadSecret: () => FIXTURE_SECRET });
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res, 'pi_x"\r\nX-Injected: 1', null);
    expect(res.status).toBe(404);
    expect(res.headers['Content-Disposition'] || '').not.toContain('X-Injected');
  });
});

/* ── Download tokens: expiry replay, tamper, header delivery ───────
 * The token is the only key to the paid packet. These tests pin the
 * adversarial paths: an expired token replayed after its 24h life,
 * a token whose payload was rewritten without the signing secret,
 * and token delivery via the x-download-token header (no query-string
 * leak into logs/referrers). */

describe('GET /api/packet — expiry replay and tamper', () => {
  const dlHandler = () => createPacketDownloadHandler({ dataDir, getDownloadSecret: () => FIXTURE_SECRET });

  it('403s when an expired token is replayed — twice, same outcome', async () => {
    savePacketHtml(dataDir, 'pi_sim_exp_1', '<!DOCTYPE html><html><body>PACKET</body></html>');
    // Minted already-expired: what a token looks like replayed after its
    // 24h life. The replay must fail closed as EXPIRED, not INVALID —
    // the payer's recovery path is "mint a fresh token", so the code
    // the client sees has to mean what it says.
    const { token } = mintDownloadToken(dataDir, {
      secret: FIXTURE_SECRET,
      paymentIntentId: 'pi_sim_exp_1',
      ttlSec: -3600,
    });
    const first = fakeRes();
    await dlHandler()(fakeReq({ method: 'GET' }), first, 'pi_sim_exp_1', token);
    expect(first.status).toBe(403);
    expect(first.json().error.code).toBe(WEBHOOK_ERROR_CODES.DOWNLOAD_TOKEN_EXPIRED);
    // Replay of the same expired token: the record was pruned, but the
    // signature/expiry gate fires first — the outcome never changes.
    const second = fakeRes();
    await dlHandler()(fakeReq({ method: 'GET' }), second, 'pi_sim_exp_1', token);
    expect(second.status).toBe(403);
    expect(second.json().error.code).toBe(WEBHOOK_ERROR_CODES.DOWNLOAD_TOKEN_EXPIRED);
  });

  it('401s when the token payload is tampered with — at either payment intent', async () => {
    savePacketHtml(dataDir, 'pi_sim_tamp_1', '<!DOCTYPE html><html><body>PACKET</body></html>');
    savePacketHtml(dataDir, 'pi_sim_tamp_2', '<!DOCTYPE html><html><body>PACKET</body></html>');
    const { token } = mintDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId: 'pi_sim_tamp_1' });
    // Rewrite the payload's payment intent id without re-signing. Without
    // the server secret the HMAC cannot be recomputed — the token must die.
    const [b64, sig] = token.split('.');
    const tampered = Buffer.from(b64, 'base64url').toString('utf8').replace('pi_sim_tamp_1', 'pi_sim_tamp_2');
    const forged = `${Buffer.from(tampered, 'utf8').toString('base64url')}.${sig}`;
    for (const intentId of ['pi_sim_tamp_2', 'pi_sim_tamp_1']) {
      const res = fakeRes();
      await dlHandler()(fakeReq({ method: 'GET' }), res, intentId, forged);
      expect(res.status).toBe(401);
      expect(res.json().error.code).toBe(WEBHOOK_ERROR_CODES.DOWNLOAD_TOKEN_INVALID);
    }
    // The attack did not burn the victim's real token.
    const legit = fakeRes();
    await dlHandler()(fakeReq({ method: 'GET' }), legit, 'pi_sim_tamp_1', token);
    expect(legit.status).toBe(200);
  });
});

/* ── Router-level integration: token via header, expiry, re-mint ─── */

describe('startCheckoutServer packet download (integration)', () => {
  let server;
  let base;

  beforeEach(async () => {
    server = startCheckoutServer({
      port: 0,
      dataDir,
      env: { ...process.env, STRIPE_WEBHOOK_SECRET: FIXTURE_SECRET },
    });
    await new Promise((resolve) => server.on('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  /** Paid receipt + packet on disk, exactly what the webhook would leave. */
  const prepPaid = (paymentIntentId) => {
    recordPaidReceipt(dataDir, {
      id: `rcpt_${paymentIntentId}`,
      paymentIntentId,
      amount: 3000,
      currency: 'usd',
    });
    savePacketHtml(dataDir, paymentIntentId, '<!DOCTYPE html><html><body>PACKET</body></html>');
  };

  const mint = async (paymentIntentId) => {
    const res = await fetch(`${base}/api/packet-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIntentId }),
    });
    expect(res.status).toBe(200);
    return (await res.json()).downloadToken;
  };

  it('serves the paid packet via the x-download-token header, then single-uses it', async () => {
    prepPaid('pi_sim_int_1');
    const downloadToken = await mint('pi_sim_int_1');
    const dl = await fetch(`${base}/api/packet/pi_sim_int_1`, {
      headers: { 'x-download-token': downloadToken },
    });
    expect(dl.status).toBe(200);
    expect(dl.headers.get('content-type')).toContain('text/html');
    expect(await dl.text()).toContain('PACKET');
    const reuse = await fetch(`${base}/api/packet/pi_sim_int_1`, {
      headers: { 'x-download-token': downloadToken },
    });
    expect(reuse.status).toBe(403);
    expect((await reuse.json()).error.code).toBe('DOWNLOAD_TOKEN_USED');
  });

  it('replays an expired token to 403, then the payer re-mints free and downloads', async () => {
    prepPaid('pi_sim_int_2');
    // Already-expired token: the replay of a dead token.
    const { token: expired } = mintDownloadToken(dataDir, {
      secret: FIXTURE_SECRET,
      paymentIntentId: 'pi_sim_int_2',
      ttlSec: -1,
    });
    const replay = await fetch(`${base}/api/packet/pi_sim_int_2`, {
      headers: { 'x-download-token': expired },
    });
    expect(replay.status).toBe(403);
    expect((await replay.json()).error.code).toBe('DOWNLOAD_TOKEN_EXPIRED');
    // Recovery: a paid customer re-mints free — the expiry is not a trap.
    const fresh = await mint('pi_sim_int_2');
    const dl = await fetch(`${base}/api/packet/pi_sim_int_2`, {
      headers: { 'x-download-token': fresh },
    });
    expect(dl.status).toBe(200);
    expect(await dl.text()).toContain('PACKET');
  });
});

/* ── rate-limit.mjs unit tests ────────────────────────────────────── */

describe('createRateLimiter', () => {
  it('allows maxRequests hits, then denies with a retry hint', () => {
    let now = 1_000_000;
    const limiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000, nowMs: () => now });
    const req = { socket: { remoteAddress: '127.0.0.1' } };
    expect(limiter.check(req, 'checkout-session')).toEqual({ allowed: true });
    expect(limiter.check(req, 'checkout-session')).toEqual({ allowed: true });
    expect(limiter.check(req, 'checkout-session')).toEqual({ allowed: true });
    const denied = limiter.check(req, 'checkout-session');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(denied.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('re-opens the window once old hits expire', () => {
    let now = 1_000_000;
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 10_000, nowMs: () => now });
    const req = { socket: { remoteAddress: '::1' } };
    expect(limiter.check(req, 'r').allowed).toBe(true);
    expect(limiter.check(req, 'r').allowed).toBe(false);
    now += 10_001; // window fully slides past the first hit
    expect(limiter.check(req, 'r').allowed).toBe(true);
  });

  it('keeps separate buckets per route and per client', () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    const a = { socket: { remoteAddress: '10.0.0.1' } };
    const b = { socket: { remoteAddress: '10.0.0.2' } };
    expect(limiter.check(a, 'checkout-session').allowed).toBe(true);
    expect(limiter.check(a, 'checkout-session').allowed).toBe(false);
    expect(limiter.check(a, 'create-payment-intent').allowed).toBe(true); // other route: open
    expect(limiter.check(b, 'checkout-session').allowed).toBe(true); // other client: open
    expect(limiter.size()).toBe(3);
  });

  it('validates constructor options', () => {
    expect(() => createRateLimiter({ maxRequests: 0 })).toThrow(RangeError);
    expect(() => createRateLimiter({ windowMs: -5 })).toThrow(RangeError);
  });

  it('clientKey falls back gracefully without a socket', () => {
    expect(clientKey({})).toBe('unknown');
    expect(clientKey(null)).toBe('unknown');
    expect(clientKey({ socket: { remoteAddress: '::ffff:127.0.0.1' } })).toBe('::ffff:127.0.0.1');
  });

  it('ships sane staging defaults', () => {
    expect(DEFAULT_RATE_LIMIT.maxRequests).toBe(20);
    expect(DEFAULT_RATE_LIMIT.windowMs).toBe(10 * 60 * 1000);
    expect(RATE_LIMIT_ERROR_CODE).toBe('RATE_LIMITED');
  });
});

/* ── Router-level integration: real server, localhost only ───────── */

describe('startCheckoutServer rate gating (integration)', () => {
  let server;
  let base;

  beforeEach(async () => {
    // The server now fails fast without a signing secret, so every
    // integration boot passes the fixture secret — the focus here is
    // rate gating, not secret configuration.
    server = startCheckoutServer({
      port: 0,
      dataDir,
      env: { ...process.env, STRIPE_WEBHOOK_SECRET: FIXTURE_SECRET },
    });
    await new Promise((resolve) => server.on('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('429s /api/checkout-session after 20 hits from one IP', async () => {
    const body = JSON.stringify({ email: 'drill@example.com', answers: FIXTURE_ANSWERS });
    let lastStatus = null;
    for (let i = 0; i < 21; i++) {
      const res = await fetch(`${base}/api/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      lastStatus = res.status;
      await res.text();
    }
    expect(lastStatus).toBe(429);
  });

  it('returns a Retry-After + RATE_LIMITED body on the 21st hit', async () => {
    const body = JSON.stringify({ answers: {} });
    for (let i = 0; i < 20; i++) {
      await (await fetch(`${base}/api/checkout-session`, { method: 'POST', body })).text();
    }
    const res = await fetch(`${base}/api/checkout-session`, { method: 'POST', body });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).not.toBeNull();
    const payload = await res.json();
    expect(payload.error.code).toBe('RATE_LIMITED');
  });

  it('never rate-limits the webhook endpoint (Stripe retries must land)', async () => {
    // 25 garbage deliveries: all fail signature verification (400), none 429.
    for (let i = 0; i < 25; i++) {
      const res = await fetch(`${base}/api/stripe-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: `evt_burst_${i}`, type: 'payment_intent.succeeded' }),
      });
      expect(res.status).not.toBe(429);
      await res.text();
    }
  });
});

/* ── Packet download integrity (sha256 sidecar) ───────────────────── */

describe('packet integrity digests', () => {
  it('packetDigest is a deterministic 64-char lowercase hex sha256', () => {
    const a = packetDigest('hello packet');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(packetDigest('hello packet')).toBe(a);
    expect(packetDigest('hello packet!')).not.toBe(a);
  });

  it('savePacketHtml writes a digest sidecar matching the packet bytes', () => {
    const html = '<!DOCTYPE html><html><body>PACKET</body></html>';
    savePacketHtml(dataDir, 'pi_sim_dig_1', html);
    expect(readPacketDigest(dataDir, 'pi_sim_dig_1')).toBe(packetDigest(html));
  });

  it('loadPacketHtml throws PACKET_INTEGRITY_FAILED on a tampered packet file', () => {
    savePacketHtml(dataDir, 'pi_sim_dig_2', '<html>TAMPER-ME</html>');
    const file = join(dataDir, 'packets', 'pi_sim_dig_2.html');
    writeFileSync(file, '<html>TAMPERED-BYTES</html>', 'utf8');
    expect(() => loadPacketHtml(dataDir, 'pi_sim_dig_2')).toThrowError(
      expect.objectContaining({ code: WEBHOOK_ERROR_CODES.PACKET_INTEGRITY_FAILED })
    );
  });

  it('loadPacketHtml throws PACKET_INTEGRITY_FAILED when the sidecar is missing', () => {
    savePacketHtml(dataDir, 'pi_sim_dig_3', '<html>NO-SIDECAR</html>');
    rmSync(join(dataDir, 'packets', 'pi_sim_dig_3.sha256'));
    expect(() => loadPacketHtml(dataDir, 'pi_sim_dig_3')).toThrowError(
      expect.objectContaining({ code: WEBHOOK_ERROR_CODES.PACKET_INTEGRITY_FAILED })
    );
  });

  it('download handler 502s (never serves) a tampered packet and logs it', async () => {
    savePacketHtml(dataDir, 'pi_sim_dig_4', '<html>INTACT</html>');
    writeFileSync(join(dataDir, 'packets', 'pi_sim_dig_4.html'), '<html>SWAPPED</html>', 'utf8');
    const { token } = mintDownloadToken(dataDir, { secret: FIXTURE_SECRET, paymentIntentId: 'pi_sim_dig_4' });
    const handler = createPacketDownloadHandler({ dataDir, getDownloadSecret: () => FIXTURE_SECRET });
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res, 'pi_sim_dig_4', token);
    expect(res.status).toBe(502);
    expect(res.json().error.code).toBe(WEBHOOK_ERROR_CODES.PACKET_INTEGRITY_FAILED);
    expect(res.text()).not.toContain('SWAPPED');
    const ledger = readFileSync(join(dataDir, 'ledger.jsonl'), 'utf8');
    expect(ledger).toContain('packet_integrity_failed');
    expect(ledger).toContain('pi_sim_dig_4');
  });
});

describe('request body limits — 256 KiB cap on every POST endpoint', () => {
  it('rejects an oversized webhook body with 413 before signature verification', async () => {
    // Unsigned AND oversized: if the cap fired after signature verification,
    // this would be a 400 SIGNATURE_INVALID instead.
    const handler = createWebhookHandler({ getWebhookSecret: () => FIXTURE_SECRET, dataDir });
    const res = fakeRes();
    await handler(fakeReq({ body: 'x'.repeat(MAX_BODY_BYTES + 1) }), res);
    expect(res.status).toBe(413);
    expect(res.json().error.code).toBe(WEBHOOK_ERROR_CODES.BODY_TOO_LARGE);
  });

  it('lets a body exactly at the cap through to signature verification', async () => {
    const handler = createWebhookHandler({ getWebhookSecret: () => FIXTURE_SECRET, dataDir });
    const res = fakeRes();
    await handler(fakeReq({ body: 'x'.repeat(MAX_BODY_BYTES) }), res);
    // Cap passed; now fails on the missing signature — not the size.
    expect(res.status).toBe(400);
    expect(res.json().error.code).toBe(WEBHOOK_ERROR_CODES.SIGNATURE_INVALID);
  });

  it('rejects an oversized checkout-session intake body with 413', async () => {
    const handler = createCheckoutSessionHandler({ dataDir });
    const res = fakeRes();
    await handler(fakeReq({ body: 'y'.repeat(MAX_BODY_BYTES + 1) }), res);
    expect(res.status).toBe(413);
    expect(res.json().error.code).toBe(WEBHOOK_ERROR_CODES.BODY_TOO_LARGE);
  });

  it('rejects an oversized packet-token body with 413', async () => {
    const handler = createPacketDownloadTokenHandler({
      getDownloadSecret: () => FIXTURE_SECRET,
      dataDir,
    });
    const res = fakeRes();
    await handler(fakeReq({ body: 'z'.repeat(MAX_BODY_BYTES + 1) }), res);
    expect(res.status).toBe(413);
    expect(res.json().error.code).toBe(WEBHOOK_ERROR_CODES.BODY_TOO_LARGE);
  });
});

/* ── Startup fail-fast: no secret, no socket ─────────────────────── */

describe('startCheckoutServer secret fail-fast (startup)', () => {
  it('refuses to boot when STRIPE_WEBHOOK_SECRET is missing — throws before listen', () => {
    expect(() => startCheckoutServer({ port: 0, dataDir, env: { STRIPE_MODE: 'test' } })).toThrowError(
      expect.objectContaining({ code: WEBHOOK_ERROR_CODES.WEBHOOK_SECRET_MISSING })
    );
  });

  it('refuses to boot on a weak secret', () => {
    expect(() =>
      startCheckoutServer({
        port: 0,
        dataDir,
        env: { STRIPE_MODE: 'test', STRIPE_WEBHOOK_SECRET: 'too-short' },
      })
    ).toThrowError(expect.objectContaining({ code: WEBHOOK_ERROR_CODES.WEBHOOK_SECRET_MISSING }));
  });

  it('refuses to boot in live mode without the explicit opt-in', () => {
    expect(() =>
      startCheckoutServer({
        port: 0,
        dataDir,
        env: { STRIPE_MODE: 'live', STRIPE_WEBHOOK_SECRET: FIXTURE_SECRET },
      })
    ).toThrowError(expect.objectContaining({ code: WEBHOOK_ERROR_CODES.TEST_MODE_VIOLATION }));
  });

  it('boots fine with a strong fixture secret', async () => {
    const server = startCheckoutServer({
      port: 0,
      dataDir,
      env: { ...process.env, STRIPE_WEBHOOK_SECRET: FIXTURE_SECRET },
    });
    await new Promise((resolve) => server.on('listening', resolve));
    await new Promise((resolve) => server.close(resolve));
  });
});

/* ── Payment-record idempotency: the intent id is the idempotency key ─ */

describe('payment_intent.succeeded — intent-level idempotency', () => {
  /** Decode the intent object out of a succeededEvent body. */
  function intentOf(rawBody) {
    return JSON.parse(rawBody).data.object;
  }

  it('records the same payment intent twice via fulfill → one receipt, one packet, deduped:true', () => {
    const session = saveSession(dataDir, { answers: FIXTURE_ANSWERS });
    const intent = intentOf(succeededEvent({ eventId: 'evt_idem_1', intentId: 'pi_idem_1', sessionId: session.sessionId }));

    const first = fulfillSucceededPayment(dataDir, { id: 'evt_idem_1', type: 'payment_intent.succeeded' }, intent);
    expect(first.deduped).toBeUndefined();

    const second = fulfillSucceededPayment(dataDir, { id: 'evt_idem_2', type: 'payment_intent.succeeded' }, intent);
    expect(second.deduped).toBe(true);
    expect(second.receiptId).toBe(first.receiptId);
    expect(second.packetId).toBe(first.packetId);

    const receipts = JSON.parse(readFileSync(join(dataDir, 'paid-receipts.json'), 'utf8'));
    expect(Object.keys(receipts)).toHaveLength(1);
    const ledger = readFileSync(join(dataDir, 'ledger.jsonl'), 'utf8');
    expect(ledger.match(/"kind":"payment_recorded"/g)).toHaveLength(1);
    expect(ledger.match(/"kind":"packet_ready"/g)).toHaveLength(1);
  });

  it('duplicate deliveries with DIFFERENT event ids return the original fulfillment, no double payment', async () => {
    const session = saveSession(dataDir, { answers: FIXTURE_ANSWERS });
    const body1 = succeededEvent({ eventId: 'evt_dup_a', intentId: 'pi_dup_1', sessionId: session.sessionId });
    const body2 = succeededEvent({ eventId: 'evt_dup_b', intentId: 'pi_dup_1', sessionId: session.sessionId });

    const res1 = fakeRes();
    await webhookHandler()(signedReq(body1), res1);
    expect(res1.status).toBe(200);
    const first = res1.json();
    expect(first.packetId).toBeDefined();

    const res2 = fakeRes();
    await webhookHandler()(signedReq(body2), res2);
    expect(res2.status).toBe(200);
    const second = res2.json();
    expect(second.deduped).toBe(true);
    expect(second.receiptId).toBe(first.receiptId);
    expect(second.packetId).toBe(first.packetId);

    // Money side: exactly one payment recorded, one packet generated.
    const ledger = readFileSync(join(dataDir, 'ledger.jsonl'), 'utf8');
    expect(ledger.match(/"kind":"payment_recorded"/g)).toHaveLength(1);
    expect(ledger.match(/"kind":"packet_ready"/g)).toHaveLength(1);
    expect(ledger).toContain('"kind":"payment_duplicate_ignored"');
  });

  it('resumes after a crash between payment record and packet generation (receipt without packetId)', () => {
    const session = saveSession(dataDir, { answers: FIXTURE_ANSWERS });
    // Simulate the crash window: money recorded, packet never generated.
    recordPaidReceipt(dataDir, {
      id: 'rcpt_crash_1',
      eventId: 'evt_crash_1',
      paymentIntentId: 'pi_crash_1',
      amount: 3000,
      currency: 'usd',
      cardLast4: '4242',
      paidAt: new Date().toISOString(),
      testMode: true,
    });

    const intent = intentOf(succeededEvent({ eventId: 'evt_crash_2', intentId: 'pi_crash_1', sessionId: session.sessionId }));
    const resumed = fulfillSucceededPayment(dataDir, { id: 'evt_crash_2', type: 'payment_intent.succeeded' }, intent);

    expect(resumed.deduped).toBe(true);
    expect(resumed.receiptId).toBe('rcpt_crash_1');
    expect(resumed.packetId).toMatch(/^pkt_rcpt_/);
    // The packet now exists and the receipt is linked — a third delivery
    // returns the completed fulfillment without regenerating.
    expect(loadPacketHtml(dataDir, 'pi_crash_1')).toContain('Alex Rivera');
    const again = fulfillSucceededPayment(dataDir, { id: 'evt_crash_3', type: 'payment_intent.succeeded' }, intent);
    expect(again.packetId).toBe(resumed.packetId);
    const ledger = readFileSync(join(dataDir, 'ledger.jsonl'), 'utf8');
    expect(ledger.match(/"kind":"payment_recorded"/g)).toHaveLength(1);
    expect(ledger.match(/"kind":"packet_ready"/g)).toHaveLength(1);
  });

  it('updateReceiptPacketId links the packet and returns false for unknown receipts', () => {
    const session = saveSession(dataDir, { answers: FIXTURE_ANSWERS });
    const intent = intentOf(succeededEvent({ eventId: 'evt_link_1', intentId: 'pi_link_1', sessionId: session.sessionId }));
    const { receiptId, packetId } = fulfillSucceededPayment(
      dataDir,
      { id: 'evt_link_1', type: 'payment_intent.succeeded' },
      intent
    );
    const stored = findPaidReceiptByIntent(dataDir, 'pi_link_1');
    expect(stored.id).toBe(receiptId);
    expect(stored.packetId).toBe(packetId);
    expect(updateReceiptPacketId(dataDir, 'rcpt_nope', 'pkt_nope')).toBe(false);
  });
});
