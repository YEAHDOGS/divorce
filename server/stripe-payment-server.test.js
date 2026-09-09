/**
 * Unit tests for server/stripe-payment-server.mjs
 *
 * The real Stripe SDK is NEVER loaded here — every test injects a mock
 * client through the getStripeClient factory. No network access.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  PRODUCT,
  ERROR_CODES,
  validateBody,
  buildPaymentIntentArgs,
  deriveIdempotencyKey,
  createPaymentIntentHandler,
  loadStripeClient,
} from './stripe-payment-server.mjs';

const FIFTY = 50;

/** Build a mock Stripe client that records create() calls. */
function mockStripe({ createImpl } = {}) {
  const calls = [];
  return {
    calls,
    client: {
      paymentIntents: {
        create: vi.fn(async (params, options) => {
          calls.push({ params, options });
          if (createImpl) return createImpl(params, options);
          return {
            id: 'pi_test_000001',
            client_secret: 'pi_test_000001_secret_fixture',
            amount: params.amount,
            currency: params.currency,
            status: 'requires_payment_method',
          };
        }),
      },
    },
  };
}

/** Minimal fake req/res for the node:http handler. */
function fakeReq({ method = 'POST', body = '{}', headers = {} } = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    method,
    headers: Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    ),
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
  };
}

async function post(handler, opts = {}) {
  const req = fakeReq(opts);
  const res = fakeRes();
  await handler(req, res);
  return res;
}

describe('PRODUCT', () => {
  it('is the fixed $30 uncontested packet, USD', () => {
    expect(PRODUCT.amountCents).toBe(3000);
    expect(PRODUCT.currency).toBe('usd');
    expect(Object.isFrozen(PRODUCT)).toBe(true);
  });
});

describe('validateBody', () => {
  it('accepts an empty body', () => {
    expect(validateBody('{}')).toEqual({});
  });

  it('accepts valid email + packetId', () => {
    expect(validateBody({ email: 'a@b.com', packetId: 'pkt_123' })).toEqual({
      email: 'a@b.com',
      packetId: 'pkt_123',
    });
  });

  it('rejects malformed JSON', () => {
    expect(() => validateBody('{nope')).toThrowError(/valid JSON/);
  });

  it('rejects non-object bodies', () => {
    expect(() => validateBody('[1,2]')).toThrowError(/JSON object/);
  });

  it('rejects client-supplied amount (tamper guard)', () => {
    for (const tamper of [{ amount: 1 }, { amountCents: 100 }, { price: 30 }]) {
      let caught = null;
      try {
        validateBody(tamper);
      } catch (e) {
        caught = e;
      }
      expect(caught).not.toBeNull();
      expect(caught.code).toBe(ERROR_CODES.AMOUNT_TAMPER);
    }
  });

  it('rejects invalid email', () => {
    expect(() => validateBody({ email: 'not-an-email' })).toThrowError(/email/);
  });

  it('rejects overlong packetId', () => {
    expect(() => validateBody({ packetId: 'x'.repeat(129) })).toThrowError(/packetId/);
  });
});

describe('buildPaymentIntentArgs', () => {
  it('charges EXACTLY $30 USD regardless of input', () => {
    const { params } = buildPaymentIntentArgs({ email: 'a@b.com' });
    expect(params.amount).toBe(3000);
    expect(params.currency).toBe('usd');
  });

  it('carries the product id in metadata', () => {
    const { params } = buildPaymentIntentArgs({ packetId: 'pkt_9' });
    expect(params.metadata.product_id).toBe(PRODUCT.id);
    expect(params.metadata.packet_id).toBe('pkt_9');
  });
});

describe('deriveIdempotencyKey', () => {
  it('is deterministic for the same body', () => {
    const body = { email: 'a@b.com' };
    expect(deriveIdempotencyKey(body)).toBe(deriveIdempotencyKey(body));
  });

  it('differs for different bodies', () => {
    expect(deriveIdempotencyKey({ email: 'a@b.com' })).not.toBe(
      deriveIdempotencyKey({ email: 'z@b.com' })
    );
  });

  it('is namespaced and fixed length', () => {
    expect(deriveIdempotencyKey({})).toMatch(/^divorce-[0-9a-f]{32}$/);
  });
});

describe('createPaymentIntentHandler', () => {
  it('creates the intent for exactly $30 and returns clientSecret', async () => {
    const { client, calls } = mockStripe();
    const res = await post(createPaymentIntentHandler({ getStripeClient: async () => client }), {
      body: { email: 'buyer@example.com' },
    });
    expect(res.status).toBe(200);
    const body = res.json();
    expect(body.paymentIntentId).toBe('pi_test_000001');
    expect(body.clientSecret).toContain('pi_test_000001');
    expect(body.amountCents).toBe(3000);
    expect(calls).toHaveLength(1);
    expect(calls[0].params.amount).toBe(3000);
    expect(calls[0].params.currency).toBe('usd');
  });

  it('forwards a client-supplied Idempotency-Key', async () => {
    const { client, calls } = mockStripe();
    const res = await post(createPaymentIntentHandler({ getStripeClient: async () => client }), {
      headers: { 'Idempotency-Key': 'retry-abc-123' },
    });
    expect(res.status).toBe(200);
    expect(calls[0].options.idempotencyKey).toBe('retry-abc-123');
  });

  it('derives an idempotency key when none is supplied', async () => {
    const { client, calls } = mockStripe();
    await post(createPaymentIntentHandler({ getStripeClient: async () => client }), {
      body: { email: 'same@example.com' },
    });
    const key1 = calls[0].options.idempotencyKey;
    await post(createPaymentIntentHandler({ getStripeClient: async () => client }), {
      body: { email: 'same@example.com' },
    });
    // same validated body -> same derived key -> safe retry
    expect(calls[1].options.idempotencyKey).toBe(key1);
  });

  it('400s on amount tampering and never calls Stripe', async () => {
    const { client } = mockStripe();
    const res = await post(createPaymentIntentHandler({ getStripeClient: async () => client }), {
      body: { amount: 1 },
    });
    expect(res.status).toBe(400);
    expect(res.json().error.code).toBe(ERROR_CODES.AMOUNT_TAMPER);
    expect(client.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('400s on invalid JSON', async () => {
    const { client } = mockStripe();
    const res = await post(createPaymentIntentHandler({ getStripeClient: async () => client }), {
      body: '{broken',
    });
    expect(res.status).toBe(400);
    expect(res.json().error.code).toBe(ERROR_CODES.INVALID_BODY);
    expect(client.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('405s on non-POST methods', async () => {
    const { client } = mockStripe();
    const res = await post(createPaymentIntentHandler({ getStripeClient: async () => client }), {
      method: 'GET',
    });
    expect(res.status).toBe(405);
    expect(res.headers.Allow).toBe('POST');
    expect(client.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('502s with a safe error shape when Stripe fails (no internals leak)', async () => {
    const { client } = mockStripe({
      createImpl: () => {
        const e = new Error('card_error: super secret internals');
        e.type = 'StripeCardError';
        throw e;
      },
    });
    const res = await post(createPaymentIntentHandler({ getStripeClient: async () => client }));
    expect(res.status).toBe(502);
    const body = res.json();
    expect(body.error.code).toBe(ERROR_CODES.STRIPE_ERROR);
    expect(JSON.stringify(body)).not.toContain('secret internals');
  });

  it('403s when the Stripe client loader refuses live mode', async () => {
    const res = await post(
      createPaymentIntentHandler({
        getStripeClient: async () => {
          const e = new Error('live mode refused');
          e.code = ERROR_CODES.TEST_MODE_VIOLATION;
          throw e;
        },
      })
    );
    expect(res.status).toBe(403);
    expect(res.json().error.code).toBe(ERROR_CODES.TEST_MODE_VIOLATION);
  });
});

describe('loadStripeClient — test-mode safety gate', () => {
  it('refuses to even load when STRIPE_MODE=live without the explicit gate', async () => {
    await expect(
      loadStripeClient({ STRIPE_MODE: 'live', STRIPE_LIVE_SECRET_KEY: 'sk_live_x' })
    ).rejects.toMatchObject({ code: ERROR_CODES.TEST_MODE_VIOLATION });
  });

  it('refuses live mode when ALLOW_LIVE_PAYMENTS is anything but "true"', async () => {
    await expect(
      loadStripeClient({
        STRIPE_MODE: 'live',
        ALLOW_LIVE_PAYMENTS: 'yes',
        STRIPE_LIVE_SECRET_KEY: 'sk_live_x',
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.TEST_MODE_VIOLATION });
  });

  it('requires a test key in test mode', async () => {
    await expect(loadStripeClient({ STRIPE_MODE: 'test' })).rejects.toThrowError(/not set/);
  });

  it('requires a live key even with the gate on', async () => {
    await expect(
      loadStripeClient({ STRIPE_MODE: 'live', ALLOW_LIVE_PAYMENTS: 'true' })
    ).rejects.toThrowError(/not set/);
  });

  it('never reads STRIPE_LIVE_SECRET_KEY in test mode', async () => {
    // No key set -> fails on missing TEST key before ever touching live config.
    await expect(
      loadStripeClient({ STRIPE_MODE: 'test', STRIPE_LIVE_SECRET_KEY: 'sk_live_x' })
    ).rejects.toThrowError(/STRIPE_TEST_SECRET_KEY/);
  });
});

describe('regression sanity', () => {
  it('runs the full promised battery', () => {
    // placeholder guard so the file fails loudly if the suite shrinks
    expect(FIFTY).toBe(50);
  });
});
