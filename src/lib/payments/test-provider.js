/**
 * test-provider.js — TestProvider: the simulated payment provider.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  TEST MODE ONLY. NO REAL MONEY CAN MOVE THROUGH THIS MODULE.
 *  It wraps the stripe-test fixtures (src/lib/stripe-test.js): it
 *  creates a `pi_test_*` intent, confirms it with the simulated card,
 *  and returns an `rcpt_test_*` receipt — zero network calls.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Implements the adapter interface in provider.js:
 *   createPayment(amountCents, currency, metadata) -> Promise<Receipt>
 *   refund(receiptId) -> Promise<RefundResult>      (fixture no-op)
 *   verifyWebhook(...) -> { supported: false }     (no real webhooks)
 *
 * This is the default active provider until Brandon picks a real one.
 * Swapping to Stripe later means writing a stripe-provider.js that
 * implements the same three functions and flipping ACTIVE_PROVIDER_NAME
 * in index.js — the modal and packet flow stay untouched.
 */

import {
  validateCreatePaymentArgs,
  assertConformsToContract,
  PaymentProviderError,
  ERROR_CODES,
} from './provider.js';
import {
  PRODUCT,
  TEST_CARD,
  TEST_MODE,
  createTestPaymentIntent,
  confirmTestPayment,
  isValidTestReceipt,
  sanitizeCardDigits,
  isValidTestExpiry,
  isValidTestCvc,
} from '../stripe-test.js';

/* ── createPayment ───────────────────────────────────────────────── */

/**
 * Simulate charging the card for the $30 packet.
 *
 * @param {number} amountCents — must be PRODUCT.amountCents (3000)
 * @param {string} currency — must be PRODUCT.currency ('usd')
 * @param {import('./provider.js').PaymentMetadata} [metadata] —
 *   { productId, cardLast4 }. cardLast4 '0002' simulates a decline.
 * @returns {Promise<import('./provider.js').PaymentReceipt>}
 * @throws {PaymentProviderError} code INVALID_AMOUNT | INVALID_CURRENCY |
 *   INVALID_PRODUCT | DECLINED
 */
export async function createPayment(amountCents, currency, metadata = {}) {
  validateCreatePaymentArgs(TEST_PROVIDER, amountCents, currency, metadata);
  const cardLast4 = metadata && metadata.cardLast4 ? String(metadata.cardLast4) : TEST_CARD.last4;
  const intent = createTestPaymentIntent(PRODUCT.amountCents);
  const receipt = confirmTestPayment(intent.id, { last4: cardLast4 });
  return receipt;
}

/* ── refund ──────────────────────────────────────────────────────── */

/**
 * Simulate refunding a receipt. There is nothing to refund against (no
 * money moved), so this is a state-change no-op that returns the
 * canonical RefundResult shape for the given test receipt id.
 *
 * @param {string} receiptId — must be an `rcpt_test_*` fixture id
 * @returns {Promise<import('./provider.js').RefundResult>}
 * @throws {PaymentProviderError} code UNKNOWN_RECEIPT
 */
export async function refund(receiptId) {
  if (typeof receiptId !== 'string' || !receiptId.startsWith('rcpt_test_')) {
    throw new PaymentProviderError(
      ERROR_CODES.UNKNOWN_RECEIPT,
      'test-provider: can only refund rcpt_test_* fixture receipts.'
    );
  }
  return {
    status: 'refunded',
    receiptId,
    refundedAt: new Date().toISOString(),
  };
}

/* ── verifyWebhook ───────────────────────────────────────────────── */

/**
 * TestProvider has no webhooks — simulated payments need no signature
 * verification. A real provider (Stripe) implements HMAC verification
 * here; see provider.js typedef.
 *
 * @returns {import('./provider.js').WebhookVerification}
 */
export function verifyWebhook() {
  return {
    supported: false,
    valid: false,
    reason: 'test-provider has no webhooks; simulated payments are trusted by construction.',
  };
}

/* ── Provider export ─────────────────────────────────────────────── */

export const TEST_PROVIDER = Object.freeze({
  name: 'test',
  displayName: 'TestProvider',
  testMode: true,
  PRODUCT,
  TEST_CARD,
  TEST_MODE,
  createPayment,
  refund,
  verifyWebhook,
  /** Receipt validator consumed by the packet unlock flow. */
  isValidReceipt: isValidTestReceipt,
});

assertConformsToContract(TEST_PROVIDER);

/* ── Re-exports for checkout consumers ───────────────────────────── */
/* The modal imports card-field helpers and the product through the
   payments entry point, so providers can relocate them later. */

export { PRODUCT, TEST_CARD, sanitizeCardDigits, isValidTestExpiry, isValidTestCvc };
