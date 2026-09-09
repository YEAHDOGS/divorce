/**
 * Divorce packet checkout — server-side create-payment-intent endpoint.
 *
 * Stack: pure Node.js (node:http), zero extra dependencies, so it runs anywhere
 * Node runs without touching the Svelte frontend build.
 *
 * Security model:
 *  - The $30 amount is FIXED server-side. The client never sends an amount;
 *    a body that tries to set one is rejected (tamper protection).
 *  - TEST-MODE SAFE by default: live keys are refused unless
 *    ALLOW_LIVE_PAYMENTS=true is set explicitly in the environment.
 *  - Idempotent: pass Idempotency-Key, or a deterministic key is derived from
 *    the validated request body — retries never double-charge.
 *
 * The real Stripe SDK is loaded LAZILY via `loadStripeClient()` so unit tests
 * can inject a mock and this machine never needs network access to Stripe.
 */
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { readRequestBody, BodyTooLargeError, MAX_BODY_BYTES } from './request-limits.mjs';

/**
 * Bare specifier for the real Stripe SDK, kept in a named constant so the
 * import stays a runtime-only dynamic import: bundlers and test
 * transforms must NOT statically resolve it (the package is installed
 * only on the machine that actually runs the staging server, per
 * docs/STRIPE-STAGING-CHECKLIST.md — never on this build machine).
 * Exported so sibling server modules share the exact specifier.
 */
export const STRIPE_MODULE_SPECIFIER = 'stripe';

/** The one and only product: the uncontested divorce packet, fixed price. */
export const PRODUCT = Object.freeze({
  id: 'uncontested_packet',
  name: 'Uncontested Divorce Packet',
  amountCents: 3000, // $30.00 — the ONLY amount this endpoint will ever charge
  currency: 'usd',
});

export const ERROR_CODES = Object.freeze({
  TEST_MODE_VIOLATION: 'TEST_MODE_VIOLATION',
  INVALID_BODY: 'INVALID_BODY',
  BODY_TOO_LARGE: 'BODY_TOO_LARGE',
  AMOUNT_TAMPER: 'AMOUNT_TAMPER',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  STRIPE_ERROR: 'STRIPE_ERROR',
});

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * Load the real Stripe client. DEFAULT-DENY on live mode:
 *  - STRIPE_MODE=test   -> uses STRIPE_TEST_SECRET_KEY, always safe.
 *  - STRIPE_MODE=live   -> REFUSED unless ALLOW_LIVE_PAYMENTS=true,
 *                          then uses STRIPE_LIVE_SECRET_KEY.
 * Throws TEST_MODE_VIOLATION otherwise.
 */
export async function loadStripeClient(env = process.env) {
  const mode = String(env.STRIPE_MODE || 'test').toLowerCase();
  if (mode !== 'test') {
    if (env.ALLOW_LIVE_PAYMENTS !== 'true') {
      throw err(
        ERROR_CODES.TEST_MODE_VIOLATION,
        'stripe: live mode refused — set ALLOW_LIVE_PAYMENTS=true explicitly to charge real money.'
      );
    }
    const key = env.STRIPE_LIVE_SECRET_KEY;
    if (!key) throw err(ERROR_CODES.TEST_MODE_VIOLATION, 'stripe: STRIPE_LIVE_SECRET_KEY is not set.');
    const { default: Stripe } = await import(STRIPE_MODULE_SPECIFIER);
    return Stripe(key);
  }
  const key = env.STRIPE_TEST_SECRET_KEY;
  if (!key) throw err(ERROR_CODES.INVALID_BODY, 'stripe: STRIPE_TEST_SECRET_KEY is not set.');
  const { default: Stripe } = await import(STRIPE_MODULE_SPECIFIER);
  return Stripe(key);
}

/** Validate the request body. Returns { email?, packetId?, metadata }. */
export function validateBody(raw) {
  let body;
  try {
    body = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw err(ERROR_CODES.INVALID_BODY, 'Request body must be valid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw err(ERROR_CODES.INVALID_BODY, 'Request body must be a JSON object.');
  }
  // Tamper guard: the client must NEVER set the amount. Server fixes $30.
  if ('amount' in body || 'amountCents' in body || 'price' in body) {
    throw err(
      ERROR_CODES.AMOUNT_TAMPER,
      'Amount is fixed server-side at $30. Do not send an amount field.'
    );
  }
  const out = {};
  if (body.email !== undefined) {
    if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      throw err(ERROR_CODES.INVALID_BODY, 'email must be a valid email address.');
    }
    out.email = body.email;
  }
  if (body.packetId !== undefined) {
    if (typeof body.packetId !== 'string' || body.packetId.length > 128) {
      throw err(ERROR_CODES.INVALID_BODY, 'packetId must be a string up to 128 chars.');
    }
    out.packetId = body.packetId;
  }
  return out;
}

/**
 * Build the Stripe create() args — amount is ALWAYS PRODUCT.amountCents.
 * Exported so tests can assert the exact charge parameters.
 */
export function buildPaymentIntentArgs(validated, { idempotencySeed = '' } = {}) {
  return {
    params: {
      amount: PRODUCT.amountCents,
      currency: PRODUCT.currency,
      description: PRODUCT.name,
      metadata: {
        product_id: PRODUCT.id,
        ...(validated.packetId ? { packet_id: validated.packetId } : {}),
        ...(validated.email ? { customer_email: validated.email } : {}),
      },
      ...(validated.email ? { receipt_email: validated.email } : {}),
    },
    options: idempotencySeed ? { idempotencyKey: idempotencySeed } : {},
  };
}

/** Deterministic idempotency key from the validated body (retries don't double-charge). */
export function deriveIdempotencyKey(validated) {
  return `divorce-${createHash('sha256').update(JSON.stringify(validated)).digest('hex').slice(0, 32)}`;
}

/**
 * Factory: returns a request handler for POST /api/create-payment-intent.
 * `getStripeClient` is a zero-arg function returning the (real or mock) client.
 */
export function createPaymentIntentHandler({ getStripeClient }) {
  return async function handle(req, res) {
    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' });
      res.end(JSON.stringify({ error: { code: ERROR_CODES.METHOD_NOT_ALLOWED, message: 'Use POST.' } }));
      return;
    }

    try {
      const validated = validateBody((await readRequestBody(req, { maxBytes: MAX_BODY_BYTES })) || '{}');

      // Client MAY supply an idempotency key; otherwise derive one deterministically.
      const headerKey = req.headers['idempotency-key'];
      const idempotencyKey =
        typeof headerKey === 'string' && headerKey.length > 0 && headerKey.length <= 255
          ? headerKey
          : deriveIdempotencyKey(validated);

      const { params, options } = buildPaymentIntentArgs(validated);
      const stripe = await getStripeClient();
      const intent = await stripe.paymentIntents.create(params, { idempotencyKey, ...options });

      send(200, {
        paymentIntentId: intent.id,
        clientSecret: intent.client_secret,
        amountCents: PRODUCT.amountCents,
        currency: PRODUCT.currency,
      });
    } catch (e) {
      if (e instanceof BodyTooLargeError || e.code === ERROR_CODES.BODY_TOO_LARGE) {
        send(413, { error: { code: ERROR_CODES.BODY_TOO_LARGE, message: e.message } });
      } else if (e.code === ERROR_CODES.INVALID_BODY || e.code === ERROR_CODES.AMOUNT_TAMPER) {
        send(400, { error: { code: e.code, message: e.message } });
      } else if (e.code === ERROR_CODES.TEST_MODE_VIOLATION) {
        send(403, { error: { code: e.code, message: e.message } });
      } else {
        // Stripe API errors and anything unexpected: never leak internals.
        send(502, {
          error: { code: ERROR_CODES.STRIPE_ERROR, message: 'Payment provider error. Please try again.' },
        });
      }
    }
  };
}

/** Start the standalone staging server. Not auto-run on import. */
export function startServer({ port = 8787, env = process.env } = {}) {
  const handle = createPaymentIntentHandler({ getStripeClient: () => loadStripeClient(env) });
  const server = createServer((req, res) => {
    if (new URL(req.url, 'http://x').pathname === '/api/create-payment-intent') {
      return handle(req, res);
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found.' } }));
  });
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`divorce payment server listening on :${port} (mode=${env.STRIPE_MODE || 'test'})`);
  });
  return server;
}

// `node server/stripe-payment-server.mjs` -> run the server directly.
if (process.argv[1] === new URL(import.meta.url).pathname) {
  startServer({ port: Number(process.env.PORT || 8787) });
}
