/**
 * stripe-test.js — STRIPE TEST-MODE-ONLY payment fixtures.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  TEST MODE ONLY. NO REAL MONEY CAN MOVE THROUGH THIS MODULE.
 * ═══════════════════════════════════════════════════════════════════
 *
 * This module simulates the Stripe checkout flow used by the divorce
 * staging site so the $30 money milestone can be exercised end-to-end
 * (questionnaire → checkout → printable packet) WITHOUT any live
 * Stripe account, secret key, or network call.
 *
 * Guarantees by construction:
 *   - There is no field anywhere in this module for a publishable or
 *     secret key. Do NOT add one. Live Stripe integration belongs in a
 *     server-side endpoint reviewed by Brandon, never in this SPA.
 *   - `TEST_MODE` is a hard-coded `true`. Any attempt to run these
 *     fixtures with a live-mode flag throws a TEST_MODE_VIOLATION error.
 *   - Generated ids always carry the `pi_test_` / `rcpt_test_` prefix so
 *     they can never be mistaken for real Stripe objects.
 *
 * When live checkout is approved: replace calls to this module with a
 * server-side `create-payment-intent` endpoint (Stripe secret key stays
 * on the server) and swap `confirmTestPayment` for Stripe.js's
 * `confirmCardPayment(clientSecret)`. The receipt shape below is kept
 * compatible on purpose.
 */

/* ── Hoisted constants ───────────────────────────────────────────── */

/** Hard-coded true. Never conditional on env, flags, or input. */
export const TEST_MODE = true;

/** The single product sold at checkout: $30 flat, one-time. */
export const PRODUCT = Object.freeze({
  id: 'uncontested_packet',
  name: 'Uncontested Divorce Packet',
  amountCents: 3000,
  currency: 'usd',
});

/** Stripe's documented test card. Never a real card number. */
export const TEST_CARD = Object.freeze({
  number: '4242 4242 4242 4242',
  exp: '12/34',
  cvc: '123',
  last4: '4242',
});

export const ERROR_CODES = Object.freeze({
  TEST_MODE_VIOLATION: 'TEST_MODE_VIOLATION',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  UNKNOWN_INTENT: 'UNKNOWN_INTENT',
  DECLINED: 'DECLINED',
});

/* ── Test-mode guard ─────────────────────────────────────────────── */

/**
 * Refuse to run if anyone attempts to flip this module into live mode.
 * @param {object} [options] — must not contain `live: true` / `mode: 'live'`.
 * @throws {Error} code TEST_MODE_VIOLATION
 */
export function assertTestMode(options = {}) {
  const o = options || {};
  if (o.live === true || o.mode === 'live' || o.mode === 'production') {
    const err = new Error(
      'stripe-test: live mode is forbidden — this module only simulates TEST payments. No real money can move here.'
    );
    err.code = ERROR_CODES.TEST_MODE_VIOLATION;
    throw err;
  }
  return true;
}

/* ── Payment intent fixtures ─────────────────────────────────────── */

let intentCounter = 0;

/**
 * Create a fake Stripe PaymentIntent for the $30 packet.
 * @param {object} [options] test-mode options (see assertTestMode)
 * @returns {{ id: string, clientSecret: string, amount: number, currency: string,
 *   status: string, testMode: true }}
 * @throws {Error} code INVALID_AMOUNT when the amount is not exactly $30.
 */
export function createTestPaymentIntent(amountCents = PRODUCT.amountCents, options = {}) {
  assertTestMode(options);
  if (amountCents !== PRODUCT.amountCents) {
    const err = new Error(`stripe-test: only the $30 packet can be purchased (got ${amountCents}¢).`);
    err.code = ERROR_CODES.INVALID_AMOUNT;
    throw err;
  }
  intentCounter += 1;
  const id = `pi_test_${String(intentCounter).padStart(6, '0')}`;
  return {
    id,
    clientSecret: `${id}_secret_test_fixture`,
    amount: PRODUCT.amountCents,
    currency: PRODUCT.currency,
    status: 'requires_payment_method',
    testMode: true,
  };
}

/* ── Confirmation ────────────────────────────────────────────────── */

let receiptCounter = 0;

/**
 * Simulate confirming the payment with the test card.
 *
 * @param {string} intentId — must be a `pi_test_` fixture id
 * @param {{ last4?: string }} [card] — defaults to the 4242 test card
 * @param {object} [options] test-mode options (see assertTestMode)
 * @returns {{ id: string, paymentIntentId: string, amount: number,
 *   currency: string, cardLast4: string, status: 'succeeded',
 *   paidAt: string, testMode: true }}
 * @throws {Error} code UNKNOWN_INTENT | DECLINED | TEST_MODE_VIOLATION
 */
export function confirmTestPayment(intentId, card = { last4: TEST_CARD.last4 }, options = {}) {
  assertTestMode(options);
  if (typeof intentId !== 'string' || !intentId.startsWith('pi_test_')) {
    const err = new Error('stripe-test: unknown payment intent — only pi_test_* fixtures can be confirmed.');
    err.code = ERROR_CODES.UNKNOWN_INTENT;
    throw err;
  }
  // Stripe test-card convention: 4000 0000 0000 0002 is always declined.
  if (card && card.last4 === '0002') {
    const err = new Error('stripe-test: card declined (test decline card).');
    err.code = ERROR_CODES.DECLINED;
    throw err;
  }
  receiptCounter += 1;
  return {
    id: `rcpt_test_${String(receiptCounter).padStart(6, '0')}`,
    paymentIntentId: intentId,
    productId: PRODUCT.id,
    amount: PRODUCT.amountCents,
    currency: PRODUCT.currency,
    cardLast4: card && card.last4 ? card.last4 : TEST_CARD.last4,
    status: 'succeeded',
    paidAt: new Date().toISOString(),
    testMode: true,
  };
}

/**
 * Validate a receipt object: succeeded, $30, for the uncontested packet,
 * USD, and unmistakably test-mode. A receipt for any other product,
 * currency, or intent id can never unlock the packet.
 * @returns {boolean}
 */
export function isValidTestReceipt(receipt) {
  return (
    !!receipt &&
    receipt.testMode === true &&
    receipt.status === 'succeeded' &&
    receipt.amount === PRODUCT.amountCents &&
    receipt.currency === PRODUCT.currency &&
    receipt.productId === PRODUCT.id &&
    typeof receipt.paymentIntentId === 'string' &&
    receipt.paymentIntentId.startsWith('pi_test_') &&
    typeof receipt.id === 'string' &&
    receipt.id.startsWith('rcpt_test_')
  );
}

/**
 * Sanitize a card-number input to digits only, grouped in fours and capped
 * at 16 digits (19 display chars). Keeps the simulated card field free of
 * injected junk and consistent for the fixture confirmation.
 * @param {string} value raw input value
 * @returns {string} digits only, grouped "4242 4242 4242 4242" style
 */
export function sanitizeCardDigits(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 16);
  const groups = [];
  for (let i = 0; i < digits.length; i += 4) groups.push(digits.slice(i, i + 4));
  return groups.join(' ');
}

/* ── Card-field validation ─────────────────────────────────────────── */

/**
 * Validate an MM/YY expiry: two-digit month 01-12, two-digit year, and not
 * expired. Pure check used by the checkout modal so malformed or past-dated
 * input is rejected before any payment attempt is made.
 * @param {string} value raw input value
 * @returns {boolean}
 */
export function isValidTestExpiry(value) {
  const m = /^(\d{2})\/(\d{2})$/.exec(String(value || '').trim());
  if (!m) return false;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return false;
  const year = 2000 + Number(m[2]);
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  return year > nowYear || (year === nowYear && month >= nowMonth);
}

/**
 * Validate a CVC: 3-4 digits, nothing else.
 * @param {string} value raw input value
 * @returns {boolean}
 */
export function isValidTestCvc(value) {
  return /^\d{3,4}$/.test(String(value || '').trim());
}
