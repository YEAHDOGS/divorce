/**
 * stripe-checkout-session.test.js — regression coverage for the server-side
 * Stripe Checkout Session endpoint.
 *
 * ZERO network by construction: every test injects a stub createSession
 * boundary. Key validation and session-payload logic are asserted against
 * the stub, never against Stripe's API.
 */
import { describe, it, expect } from 'vitest';
import {
  TEST_SECRET_KEY_PATTERN,
  LOG_ONLY_SESSION_ID_PREFIX,
  resolveTestSecretKey,
  buildCheckoutSessionParams,
  deriveLogOnlySessionId,
  createCheckoutSessionApiHandler,
} from './stripe-checkout-session.mjs';
import { ERROR_CODES, PRODUCT } from './stripe-payment-server.mjs';

/* ── In-memory fake req/res for handler tests ─────────────────────── */

function makeReq({ method = 'POST', body = '{}', headers = {} } = {}) {
  const chunks = [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
  return {
    method,
    headers,
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: async () => (i < chunks.length ? { value: chunks[i++], done: false } : { done: true }),
      };
    },
  };
}

function makeRes() {
  const res = {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      res.statusCode = status;
      res.headers = headers;
    },
    end(payload) {
      res.body = payload;
    },
  };
  return res;
}

async function call(handler, req) {
  const res = makeRes();
  await handler(req, res);
  return { ...res, json: JSON.parse(res.body) };
}

describe('TEST_SECRET_KEY_PATTERN', () => {
  it('accepts sk_test_ keys', () => {
    expect(TEST_SECRET_KEY_PATTERN.test('sk_test_examplekey01')).toBe(true);
  });
  it.each(['sk_live_abc123', 'sk_live_examplekey01', 'rk_live_123', 'pk_test_123', ''])(
    'rejects %j — live and non-secret keys fail closed',
    (key) => {
      expect(TEST_SECRET_KEY_PATTERN.test(key)).toBe(false);
    }
  );
});

describe('resolveTestSecretKey', () => {
  it('returns log-only when no key is configured', () => {
    expect(resolveTestSecretKey({})).toEqual({ mode: 'log-only', key: null });
  });
  it('accepts a valid sk_test_ key', () => {
    const out = resolveTestSecretKey({ STRIPE_TEST_SECRET_KEY: 'sk_test_abc123' });
    expect(out.mode).toBe('live-with-key');
    expect(out.key).toBe('sk_test_abc123');
  });
  it('fails closed on a live key', () => {
    let code = null;
    try {
      resolveTestSecretKey({ STRIPE_TEST_SECRET_KEY: 'sk_live_realmoney123' });
    } catch (e) {
      code = e.code;
    }
    expect(code).toBe(ERROR_CODES.TEST_MODE_VIOLATION);
  });
  it('fails closed on STRIPE_MODE=live even with a test key', () => {
    let code = null;
    try {
      resolveTestSecretKey({ STRIPE_MODE: 'live', STRIPE_TEST_SECRET_KEY: 'sk_test_abc123' });
    } catch (e) {
      code = e.code;
    }
    expect(code).toBe(ERROR_CODES.TEST_MODE_VIOLATION);
  });
  it('fails closed on a garbage key', () => {
    let code = null;
    try {
      resolveTestSecretKey({ STRIPE_SECRET_KEY: 'hunter2' });
    } catch (e) {
      code = e.code;
    }
    expect(code).toBe(ERROR_CODES.TEST_MODE_VIOLATION);
  });
});

describe('buildCheckoutSessionParams', () => {
  it('charges exactly the server-fixed $30, never client input', () => {
    const params = buildCheckoutSessionParams({ email: 'buyer@example.com', packetId: 'pkt_1' });
    expect(params.mode).toBe('payment');
    expect(params.line_items).toHaveLength(1);
    expect(params.line_items[0].price_data.unit_amount).toBe(PRODUCT.amountCents);
    expect(params.line_items[0].price_data.unit_amount).toBe(3000);
    expect(params.line_items[0].price_data.currency).toBe('usd');
    expect(params.line_items[0].price_data.product_data.name).toBe(PRODUCT.name);
    expect(params.line_items[0].quantity).toBe(1);
  });
  it('carries product metadata, not money-moving options', () => {
    const params = buildCheckoutSessionParams({ packetId: 'pkt_9' });
    expect(params.metadata.product_id).toBe('uncontested_packet');
    expect(params.metadata.packet_id).toBe('pkt_9');
    expect(params.customer_email).toBeUndefined();
  });
  it('omits packet metadata when the client sent none', () => {
    const params = buildCheckoutSessionParams({});
    expect(params.metadata).toEqual({ product_id: 'uncontested_packet' });
  });
});

describe('deriveLogOnlySessionId', () => {
  it('is deterministic and unmistakably a stub id', () => {
    const a = deriveLogOnlySessionId({ email: 'a@b.c' });
    const b = deriveLogOnlySessionId({ email: 'a@b.c' });
    expect(a).toBe(b);
    expect(a.startsWith(LOG_ONLY_SESSION_ID_PREFIX)).toBe(true);
    expect(a).not.toContain('cs_test_');
  });
});

describe('createCheckoutSessionApiHandler', () => {
  const fixedDate = () => new Date('2026-09-09T14:00:00.000Z');

  it('log-only: returns a stub session and never calls the network boundary', async () => {
    let calls = 0;
    const logs = [];
    const handler = createCheckoutSessionApiHandler({
      createSession: async () => {
        calls += 1;
        throw new Error('must not be called');
      },
      log: (...a) => logs.push(a.join(' ')),
      env: {}, // no key → log-only
      clock: fixedDate,
    });
    const { statusCode, json } = await call(
      handler,
      makeReq({ body: { email: 'buyer@example.com' } })
    );
    expect(statusCode).toBe(200);
    expect(json.logOnly).toBe(true);
    expect(json.url).toBeNull();
    expect(json.testMode).toBe(true);
    expect(json.amountCents).toBe(3000);
    expect(json.sessionId.startsWith(LOG_ONLY_SESSION_ID_PREFIX)).toBe(true);
    expect(json.message).toMatch(/TEST MODE/i);
    expect(calls).toBe(0);
    expect(logs.length).toBeGreaterThan(0); // the payload was logged, not sent
  });

  it('keyed mode: delegates to the injected boundary and returns the session', async () => {
    const logs = [];
    const fakeSession = { id: 'cs_test_stub123', url: 'https://checkout.stripe.com/pay/cs_test_stub123' };
    let received = null;
    const handler = createCheckoutSessionApiHandler({
      createSession: async (params) => {
        received = params;
        return fakeSession;
      },
      log: (...a) => logs.push(a.join(' ')),
      env: { STRIPE_TEST_SECRET_KEY: 'sk_test_stubkey123' },
      clock: fixedDate,
    });
    const { statusCode, json } = await call(
      handler,
      makeReq({ body: { email: 'buyer@example.com', packetId: 'pkt_7' } })
    );
    expect(statusCode).toBe(200);
    expect(json.logOnly).toBe(false);
    expect(json.sessionId).toBe('cs_test_stub123');
    expect(json.url).toBe(fakeSession.url);
    expect(json.testMode).toBe(true);
    // The boundary saw the exact $30 payload.
    expect(received.line_items[0].price_data.unit_amount).toBe(3000);
    expect(received.metadata.packet_id).toBe('pkt_7');
  });

  it('rejects a client-supplied amount (AMOUNT_TAMPER)', async () => {
    const handler = createCheckoutSessionApiHandler({ env: {}, log: () => {} });
    const { statusCode, json } = await call(handler, makeReq({ body: { amount: 1 } }));
    expect(statusCode).toBe(400);
    expect(json.error.code).toBe(ERROR_CODES.AMOUNT_TAMPER);
  });

  it('rejects an invalid body', async () => {
    const handler = createCheckoutSessionApiHandler({ env: {}, log: () => {} });
    const { statusCode, json } = await call(handler, makeReq({ body: '{nope' }));
    expect(statusCode).toBe(400);
    expect(json.error.code).toBe(ERROR_CODES.INVALID_BODY);
  });

  it('fails closed on a live key with 403', async () => {
    const handler = createCheckoutSessionApiHandler({
      env: { STRIPE_TEST_SECRET_KEY: 'sk_live_nope123' },
      log: () => {},
    });
    const { statusCode, json } = await call(handler, makeReq({ body: {} }));
    expect(statusCode).toBe(403);
    expect(json.error.code).toBe(ERROR_CODES.TEST_MODE_VIOLATION);
  });

  it('405s non-POST requests', async () => {
    const handler = createCheckoutSessionApiHandler({ env: {}, log: () => {} });
    const { statusCode, json } = await call(handler, makeReq({ method: 'GET' }));
    expect(statusCode).toBe(405);
    expect(json.error.code).toBe(ERROR_CODES.METHOD_NOT_ALLOWED);
  });

  it('502s honestly when the boundary throws', async () => {
    const handler = createCheckoutSessionApiHandler({
      createSession: async () => {
        throw new Error('stripe exploded');
      },
      env: { STRIPE_TEST_SECRET_KEY: 'sk_test_stubkey123' },
      log: () => {},
    });
    const { statusCode, json } = await call(handler, makeReq({ body: {} }));
    expect(statusCode).toBe(502);
    expect(json.error.code).toBe(ERROR_CODES.STRIPE_ERROR);
    expect(json.error.message).not.toMatch(/exploded/); // no internals leaked
  });
});
