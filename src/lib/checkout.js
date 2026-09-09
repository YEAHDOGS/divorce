/**
 * checkout.js — headless staging checkout runner.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  TEST MODE ONLY while the active provider is a test provider.
 *  This module never touches a secret key and never holds a card PAN —
 *  only the card's last-4 travels in the payment metadata (see
 *  provider.js PaymentMetadata typedef). Whether real money can move is
 *  decided by the provider in payments/index.js, not here.
 * ═══════════════════════════════════════════════════════════════════
 *
 * The CheckoutModal (and any future questionnaire flow) call runCheckout
 * instead of talking to a provider directly, so the money step has ONE
 * implementation:
 *
 *   runCheckout({ providerName, cardLast4 })
 *     -> { ok: true,  receipt }               on a validated payment
 *     -> { ok: false, copy, code }            on ANY failure — `copy` is
 *        the honest FailureCopy from failure-copy.js, so the UI never
 *        has to decide what to say about a failed charge.
 *
 * This function never throws for payment failures: classification is
 * total (garbage in → safe 'unknown' copy out). It DOES throw for
 * programming errors (e.g. a malformed options object is still rejected
 * loudly) — those are bugs, not failed payments.
 */

/* ── Hoisted constants ───────────────────────────────────────────── */

import {
  getProvider,
  ACTIVE_PROVIDER_NAME,
} from './payments/index.js';
import { classifyPaymentFailure } from './payments/failure-copy.js';

/** Card last-4: exactly four digits, nothing else. A PAN must never arrive here. */
const LAST4_RE = /^\d{4}$/;

/** Shape-check the options bag; programming errors fail loudly. */
function assertOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('checkout: runCheckout requires an options object.');
  }
}

/**
 * Run the $30 staging checkout through the active payment provider.
 *
 * @param {object} [options]
 * @param {string} [options.providerName] — registry key; defaults to
 *   the active provider in payments/index.js.
 * @param {string} [options.cardLast4] — four digits, e.g. '4242'. The
 *   fixture decline card is '0002'. Anything else falls back to the
 *   provider's default test card — a malformed value never blocks the
 *   flow, and the full PAN must never be passed here.
 * @returns {Promise<
 *   { ok: true, receipt: import('./payments/provider.js').PaymentReceipt } |
 *   { ok: false, copy: object, code: string }
 * >}
 */
export async function runCheckout(options = {}) {
  assertOptions(options);
  const providerName =
    typeof options.providerName === 'string' && options.providerName.length > 0
      ? options.providerName
      : ACTIVE_PROVIDER_NAME;

  let provider;
  try {
    provider = getProvider(providerName);
  } catch (e) {
    // Unknown provider: classify as a config failure. testMode is
    // false here on purpose — live-safe wording wins when we cannot
    // even resolve the provider.
    return { ok: false, copy: classifyPaymentFailure(e, { testMode: false }), code: e && e.code ? e.code : 'UNKNOWN' };
  }

  const testMode = provider.testMode === true;
  const cardLast4 = LAST4_RE.test(String(options.cardLast4 || '')) ? String(options.cardLast4) : undefined;

  try {
    const receipt = await provider.createPayment(
      provider.PRODUCT.amountCents,
      provider.PRODUCT.currency,
      {
        productId: provider.PRODUCT.id,
        ...(cardLast4 ? { cardLast4 } : {}),
      }
    );
    // Belt and suspenders: the receipt must validate through the
    // provider's own isValidReceipt before we call this a success.
    const valid = typeof provider.isValidReceipt === 'function' ? provider.isValidReceipt(receipt) : !!receipt;
    if (!valid) {
      return {
        ok: false,
        copy: classifyPaymentFailure({ code: 'INVALID_RECEIPT' }, { testMode }),
        code: 'INVALID_RECEIPT',
      };
    }
    return { ok: true, receipt };
  } catch (e) {
    return {
      ok: false,
      copy: classifyPaymentFailure(e, { testMode }),
      code: e && typeof e === 'object' && e.code ? String(e.code) : 'UNKNOWN',
    };
  }
}

/** Re-export so checkout consumers have one import site. */
export { ACTIVE_PROVIDER_NAME, classifyPaymentFailure };
