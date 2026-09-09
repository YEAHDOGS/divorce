/**
 * Divorce packet checkout — server-side Stripe Checkout Session endpoint.
 *
 * POST /api/stripe-checkout-session → creates a Stripe Checkout Session in
 * TEST MODE ONLY. This is the real-money-shaped step of the staging flow:
 * on a machine with STRIPE_TEST_SECRET_KEY set, the injected Stripe client
 * creates a live Checkout Session URL the payer can complete. On machines
 * without a key, the endpoint runs in LOG-ONLY mode: it writes what it
 * *would* have sent to Stripe to the log and returns a stub session —
 * no HTTP request ever leaves this machine, no money can move.
 *
 * Fail-closed rules (in this order):
 *  1. STRIPE_MODE=live → refused (TEST_MODE_VIOLATION). Checkout Sessions
 *     are only ever created against test keys on staging.
 *  2. Any key present MUST match the test pattern /^sk_test_[A-Za-z0-9]+$/.
 *     A live key (or anything else) is refused — we never let a live key
 *     touch an endpoint that could move real money by accident.
 *  3. No key at all → log-only stub response (200 with logOnly:true).
 *
 * Security model inherited from stripe-payment-server.mjs:
 *  - The $30 amount is FIXED server-side via PRODUCT. Client-supplied
 *    amount/price fields are rejected (AMOUNT_TAMPER).
 *  - The Stripe SDK import stays behind the same runtime-only named
 *    specifier constant — never statically resolvable by bundlers.
 *  - The actual HTTP call to Stripe is an INJECTED boundary
 *    (`createSession(params)`): unit tests supply a stub, so the test
 *    suite never needs a key, a network socket, or Stripe's API.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  PRODUCT,
  ERROR_CODES,
  validateBody,
  STRIPE_MODULE_SPECIFIER,
} from './stripe-payment-server.mjs';
import { readRequestBody, BodyTooLargeError, MAX_BODY_BYTES } from './request-limits.mjs';

export const CHECKOUT_SESSION_ERROR_CODES = Object.freeze({
  ...ERROR_CODES,
  LOG_ONLY_NO_KEY: 'LOG_ONLY_NO_KEY',
});

/** Test secret keys look like sk_test_<alphanumerics>. Anything else fails closed. */
export const TEST_SECRET_KEY_PATTERN = /^sk_test_[A-Za-z0-9]+$/;

/** Returned (200) when no key is configured — nothing was created at Stripe. */
export const LOG_ONLY_SESSION_ID_PREFIX = 'cs_logonly_';

/**
 * Resolve the key policy for this environment.
 *
 * Returns { mode: 'live-with-key', key } on success.
 * Returns { mode: 'log-only' } when no key is configured (log-only stub).
 * Throws a TEST_MODE_VIOLATION-coded error when live mode or a
 * non-test key is detected — always fail closed.
 */
export function resolveTestSecretKey(env = process.env) {
  const mode = String(env.STRIPE_MODE || 'test').toLowerCase();
  if (mode === 'live') {
    const e = new Error(
      'stripe: /api/stripe-checkout-session is test-mode-only — live Checkout Sessions are refused on staging.'
    );
    e.code = ERROR_CODES.TEST_MODE_VIOLATION;
    throw e;
  }
  const key = env.STRIPE_TEST_SECRET_KEY || env.STRIPE_SECRET_KEY;
  if (!key) return { mode: 'log-only', key: null };
  if (!TEST_SECRET_KEY_PATTERN.test(String(key).trim())) {
    const e = new Error(
      'stripe: the configured secret key is not a test key (must start with sk_test_) — refusing to continue.'
    );
    e.code = ERROR_CODES.TEST_MODE_VIOLATION;
    throw e;
  }
  return { mode: 'live-with-key', key: String(key).trim() };
}

/**
 * Build the Stripe checkout.sessions.create() params.
 * Amount, currency, and product name are ALWAYS server-side constants —
 * the client can only supply email/packetId metadata.
 *
 * Exported so tests can assert the exact session payload without touching
 * any network: this is the unit-testable contract with Stripe.
 */
export function buildCheckoutSessionParams(validated, { successUrl, cancelUrl } = {}) {
  const fallback = 'http://127.0.0.1:5173';
  return {
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: PRODUCT.currency,
          unit_amount: PRODUCT.amountCents, // $30.00 — fixed, tamper-proof
          product_data: { name: PRODUCT.name },
        },
        quantity: 1,
      },
    ],
    metadata: {
      product_id: PRODUCT.id,
      ...(validated.packetId ? { packet_id: validated.packetId } : {}),
      ...(validated.email ? { customer_email: validated.email } : {}),
    },
    ...(validated.email ? { customer_email: validated.email } : {}),
    success_url: successUrl || `${fallback}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl || `${fallback}/checkout/cancel`,
  };
}

/** Deterministic stub session id for log-only mode (retries collapse to one). */
export function deriveLogOnlySessionId(validated) {
  return (
    LOG_ONLY_SESSION_ID_PREFIX +
    createHash('sha256').update(JSON.stringify(validated)).digest('hex').slice(0, 24)
  );
}

/**
 * Load the Stripe client lazily — the injectable boundary for the real
 * network call. DEFAULT-DENY: callers MUST have run resolveTestSecretKey
 * first; a non-test key here is a bug, so it fails closed again.
 */
export async function loadTestStripeClient(key) {
  if (!TEST_SECRET_KEY_PATTERN.test(String(key || ''))) {
    const e = new Error('stripe: refusing to build a client from a non-test key.');
    e.code = ERROR_CODES.TEST_MODE_VIOLATION;
    throw e;
  }
  const { default: Stripe } = await import(STRIPE_MODULE_SPECIFIER);
  return Stripe(key);
}

/**
 * Default production wiring for the HTTP boundary: creates the Checkout
 * Session through the real SDK (only reachable with a resolved test key).
 * In unit tests this is replaced with a stub — zero network.
 */
export function makeRealCreateSession(getKey) {
  return async (params) => {
    const stripe = await loadTestStripeClient(await getKey());
    return stripe.checkout.sessions.create(params);
  };
}

/**
 * Factory: request handler for POST /api/stripe-checkout-session.
 *
 * `createSession` — the injected HTTP boundary: async (params) => session.
 *   Omit it in log-only mode; provide it when a test key is configured.
 * `log` — injected logger (defaults to console.log); log-only mode always
 *   records the payload it would have sent.
 */
export function createCheckoutSessionApiHandler({
  createSession = null,
  log = (...args) => console.log(...args),
  env = process.env,
  clock = () => new Date(),
} = {}) {
  return async function handle(req, res) {
    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' });
      res.end(
        JSON.stringify({ error: { code: ERROR_CODES.METHOD_NOT_ALLOWED, message: 'Use POST.' } })
      );
      return;
    }

    try {
      const validated = validateBody((await readRequestBody(req, { maxBytes: MAX_BODY_BYTES })) || '{}');
      const policy = resolveTestSecretKey(env);
      const params = buildCheckoutSessionParams(validated, {
        successUrl: env.CHECKOUT_SUCCESS_URL,
        cancelUrl: env.CHECKOUT_CANCEL_URL,
      });

      if (policy.mode === 'log-only') {
        // No key configured: record the payload, return a stub. No HTTP
        // request leaves this machine, no session is created at Stripe.
        const sessionId = deriveLogOnlySessionId(validated);
        log(
          `[checkout-session] LOG-ONLY (no Stripe key): would create Checkout Session ` +
            `${sessionId} with params ${JSON.stringify(params)}`
        );
        send(200, {
          sessionId,
          url: null,
          logOnly: true,
          amountCents: PRODUCT.amountCents,
          currency: PRODUCT.currency,
          testMode: true,
          message:
            'TEST MODE — no Stripe key configured. No Checkout Session was created and no network request was made. Set STRIPE_TEST_SECRET_KEY to create a real test session.',
          createdAt: clock().toISOString(),
        });
        return;
      }

      if (!createSession) {
        throw Object.assign(
          new Error('stripe: no session-creation boundary configured for keyed mode.'),
          { code: ERROR_CODES.STRIPE_ERROR }
        );
      }

      const session = await createSession(params);
      log(`[checkout-session] created ${session.id} (test mode, $30.00 USD)`);
      send(200, {
        sessionId: session.id,
        url: session.url || null,
        logOnly: false,
        amountCents: PRODUCT.amountCents,
        currency: PRODUCT.currency,
        testMode: true,
        createdAt: clock().toISOString(),
      });
    } catch (e) {
      if (e instanceof BodyTooLargeError || e.code === ERROR_CODES.BODY_TOO_LARGE) {
        send(413, { error: { code: ERROR_CODES.BODY_TOO_LARGE, message: e.message } });
      } else if (e.code === ERROR_CODES.INVALID_BODY || e.code === ERROR_CODES.AMOUNT_TAMPER) {
        send(400, { error: { code: e.code, message: e.message } });
      } else if (e.code === ERROR_CODES.TEST_MODE_VIOLATION) {
        send(403, { error: { code: e.code, message: e.message } });
      } else {
        send(502, {
          error: { code: ERROR_CODES.STRIPE_ERROR, message: 'Payment provider error. Please try again.' },
        });
      }
    }
  };
}
