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
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WEBHOOK_ERROR_CODES,
  WebhookError,
  verifyWebhookSignature,
  signTestWebhook,
  parseSignatureHeader,
  loadWebhookSecret,
  saveSession,
  loadSession,
  isEventProcessed,
  markEventProcessed,
  recordPaidReceipt,
  isPaidReceipt,
  webhookProvider,
  savePacketHtml,
  loadPacketHtml,
  sanitizeId,
  fulfillSucceededPayment,
  parseEvent,
  createWebhookHandler,
  createCheckoutSessionHandler,
  createPacketDownloadHandler,
} from './stripe-webhook.mjs';
import { buildPacket } from '../src/lib/packet.js';

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
  it('404s before any payment (packet never exists pre-payment)', async () => {
    const handler = createPacketDownloadHandler({ dataDir });
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res, 'pi_sim_test_1');
    expect(res.status).toBe(404);
    expect(res.json().error.code).toBe(WEBHOOK_ERROR_CODES.PACKET_NOT_READY);
  });

  it('serves the paid packet as an attachment download', async () => {
    savePacketHtml(dataDir, 'pi_sim_test_1', '<!DOCTYPE html><html><body>PACKET</body></html>');
    const handler = createPacketDownloadHandler({ dataDir });
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res, 'pi_sim_test_1');
    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toContain('text/html');
    expect(res.headers['Content-Disposition']).toContain('attachment');
    expect(res.text()).toContain('PACKET');
  });

  it('rejects path traversal without touching the filesystem', async () => {
    expect(sanitizeId('../../etc/passwd')).toBeNull();
    expect(sanitizeId('pi_ok-123_ABC')).toBe('pi_ok-123_ABC');
    expect(loadPacketHtml(dataDir, '../../etc/passwd')).toBeNull();
    const handler = createPacketDownloadHandler({ dataDir });
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res, '..%2F..%2Fetc');
    expect(res.status).toBe(404);
  });

  it('405s on POST', async () => {
    const handler = createPacketDownloadHandler({ dataDir });
    const res = fakeRes();
    await handler(fakeReq({ method: 'POST' }), res, 'pi_sim_test_1');
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
