/**
 * provider.js — the payment-provider ADAPTER INTERFACE for the divorce checkout.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  TEST MODE ONLY at the app level. The active provider (see index.js)
 *  decides what "charging" means. Today that is TestProvider, a pure
 *  fixture that moves no money and makes no network calls. When Brandon
 *  picks a real provider (Stripe, Square, ...), only index.js's
 *  ACTIVE_PROVIDER_NAME and the new provider module change — the
 *  checkout modal, the questionnaire flow, and the packet code do not.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Every provider MUST export an object shaped like:
 *
 *   {
 *     name,         // string — registry key, e.g. 'test', 'stripe'
 *     displayName,  // string — shown to the operator, e.g. 'TestProvider'
 *     testMode,     // boolean — true while no real money can move
 *     PRODUCT,      // { id, name, amountCents, currency } — the one
 *                    // product this checkout is allowed to sell
 *     createPayment(amountCents, currency, metadata) -> Promise<Receipt>
 *     refund(receiptId, options?) -> Promise<RefundResult>
 *     verifyWebhook(payload, signature, secret) -> WebhookVerification
 *   }
 *
 * The Receipt MUST satisfy the packet unlock contract: it carries only
 * last4 + provider ids, never a full PAN, and the packet flow consumes
 * it through a provider-specific `isValidReceipt` check. Receipts are
 * intentionally kept compatible with the old stripe-test receipt shape.
 */

/* ── Hoisted constants ───────────────────────────────────────────── */

export const ERROR_CODES = Object.freeze({
  UNKNOWN_PROVIDER: 'UNKNOWN_PROVIDER',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_CURRENCY: 'INVALID_CURRENCY',
  INVALID_PRODUCT: 'INVALID_PRODUCT',
  DECLINED: 'DECLINED',
  UNKNOWN_RECEIPT: 'UNKNOWN_RECEIPT',
  WEBHOOKS_UNSUPPORTED: 'WEBHOOKS_UNSUPPORTED',
});

/* ── Error class ─────────────────────────────────────────────────── */

/**
 * Uniform error for provider operations. Every provider error carries a
 * `code` from ERROR_CODES so callers can branch on failure kind instead
 * of parsing messages.
 */
export class PaymentProviderError extends Error {
  /**
   * @param {string} code — one of ERROR_CODES
   * @param {string} message — human-readable detail
   */
  constructor(code, message) {
    super(message);
    this.name = 'PaymentProviderError';
    this.code = code;
  }
}

/* ── Contract types (JSDoc) ──────────────────────────────────────── */

/**
 * @typedef {object} PaymentMetadata
 * @property {string} productId — must equal provider.PRODUCT.id
 * @property {string} [cardLast4] — test/sandbox card last-4 only, never a PAN
 */

/**
 * @typedef {object} PaymentReceipt
 * @property {string} id — provider receipt id (test ids must be
 *   unmistakably fake, e.g. `rcpt_test_*`)
 * @property {string} paymentIntentId — provider intent/charge id
 * @property {string} productId — must equal provider.PRODUCT.id
 * @property {number} amount — cents, must equal provider.PRODUCT.amountCents
 * @property {string} currency — must equal provider.PRODUCT.currency
 * @property {string} cardLast4
 * @property {'succeeded'} status
 * @property {string} paidAt — ISO timestamp
 * @property {boolean} testMode — true while no real money can move
 * @property {string} [receiptUrl] — optional, for real providers
 */

/**
 * @typedef {object} RefundResult
 * @property {'refunded'} status
 * @property {string} receiptId — the receipt that was refunded
 * @property {string} refundedAt — ISO timestamp
 */

/**
 * @typedef {object} WebhookVerification
 * @property {boolean} supported — false until a provider implements
 *   real signature verification
 * @property {boolean} valid
 * @property {string} [reason]
 */

/* ── Shared guards (used by providers, tested here) ─────────────── */

/**
 * Validate createPayment arguments against the provider's declared
 * PRODUCT. Guards first, main path last.
 *
 * @param {object} provider — the provider module (must export PRODUCT)
 * @param {number} amountCents
 * @param {string} currency
 * @param {PaymentMetadata} [metadata]
 * @throws {PaymentProviderError} code INVALID_AMOUNT | INVALID_CURRENCY |
 *   INVALID_PRODUCT
 */
export function validateCreatePaymentArgs(provider, amountCents, currency, metadata = {}) {
  const product = provider && provider.PRODUCT;
  if (!product) {
    throw new PaymentProviderError(ERROR_CODES.INVALID_PRODUCT, 'provider: declares no PRODUCT.');
  }
  if (amountCents !== product.amountCents) {
    throw new PaymentProviderError(
      ERROR_CODES.INVALID_AMOUNT,
      `provider: only ${product.amountCents}¢ can be charged (got ${amountCents}¢).`
    );
  }
  if (currency !== product.currency) {
    throw new PaymentProviderError(
      ERROR_CODES.INVALID_CURRENCY,
      `provider: only ${product.currency} is accepted (got ${currency}).`
    );
  }
  const meta = metadata || {};
  if (meta.productId && meta.productId !== product.id) {
    throw new PaymentProviderError(
      ERROR_CODES.INVALID_PRODUCT,
      `provider: unknown product ${meta.productId}.`
    );
  }
  return true;
}

/**
 * Check that a provider object implements the full adapter interface.
 * Used by the registry at startup and by contract tests.
 *
 * @param {object} provider — candidate provider export
 * @returns {true}
 * @throws {PaymentProviderError} code UNKNOWN_PROVIDER
 */
export function assertConformsToContract(provider) {
  const p = provider || {};
  const missing = ['createPayment', 'refund', 'verifyWebhook'].filter((f) => typeof p[f] !== 'function');
  if (typeof p.name !== 'string' || typeof p.displayName !== 'string' || typeof p.testMode !== 'boolean' || !p.PRODUCT) {
    throw new PaymentProviderError(ERROR_CODES.UNKNOWN_PROVIDER, 'provider: missing name/displayName/testMode/PRODUCT.');
  }
  if (missing.length > 0) {
    throw new PaymentProviderError(
      ERROR_CODES.UNKNOWN_PROVIDER,
      `provider ${p.name}: missing interface methods: ${missing.join(', ')}.`
    );
  }
  return true;
}
