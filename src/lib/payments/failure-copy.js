/**
 * failure-copy.js — honest, user-facing recovery copy for payment failures.
 *
 * The checkout modal (and the staging drill CLI) show these instead of
 * raw error codes. The rules:
 *  - Never claim money moved when we don't know. `charged` is 'no' only
 *    when the failure kind proves it (declined, refused, unconfigured);
 *    otherwise it is 'unknown' and the copy says so.
 *  - Never fabricate success: a retry is offered only when `retryable`.
 *  - Test mode says so plainly: "no money moved — this is a test."
 *
 * classifyPaymentFailure(err, { testMode }) → FailureCopy
 *   err: anything thrown by provider.createPayment or the checkout
 *        plumbing (PaymentProviderError, fetch TypeError, AbortError,
 *        plain objects with a `code`, or garbage)
 *   testMode: boolean — pass provider.testMode so the copy stays honest
 *        (defaults to false: live-safe wording wins when we don't know)
 *
 * FailureCopy: { kind, headline, detail, recovery, retryable, charged }
 *   kind: one of FAILURE_KINDS
 *   charged: 'no' | 'unknown'
 */

import { ERROR_CODES } from './provider.js';

/* ── Hoisted constants ───────────────────────────────────────────── */

export const FAILURE_KINDS = Object.freeze({
  DECLINED: 'declined',
  NETWORK: 'network',
  SESSION_EXPIRED: 'session_expired',
  CONFIG: 'config',
  UNKNOWN: 'unknown',
});

const CHARGED_NO = 'no';
const CHARGED_UNKNOWN = 'unknown';

/** Network-ish failure fingerprints: fetch rejects with TypeError,
    aborts with AbortError, or node transport codes on the error. */
const NETWORK_CODES = new Set(['NETWORK_ERROR', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE']);

/** Provider errors that mean "the checkout was never attempted". */
const CONFIG_CODES = new Set([
  ERROR_CODES.NOT_CONFIGURED,
  ERROR_CODES.UNKNOWN_PROVIDER,
  ERROR_CODES.WEBHOOKS_UNSUPPORTED,
  ERROR_CODES.INVALID_AMOUNT,
  ERROR_CODES.INVALID_CURRENCY,
  ERROR_CODES.INVALID_PRODUCT,
]);

/* ── Kind detection (guard clauses, main path last) ───────────────── */

/**
 * Decide which failure kind an arbitrary thrown value belongs to.
 * @param {unknown} err
 * @returns {string} one of FAILURE_KINDS
 */
export function failureKindOf(err) {
  const code = err && typeof err === 'object' ? err.code : undefined;
  if (code === ERROR_CODES.DECLINED) return FAILURE_KINDS.DECLINED;
  if (code === 'SESSION_EXPIRED') return FAILURE_KINDS.SESSION_EXPIRED;
  if (typeof code === 'string' && (CONFIG_CODES.has(code) || code === ERROR_CODES.UNKNOWN_RECEIPT)) {
    return FAILURE_KINDS.CONFIG;
  }
  if (typeof code === 'string' && NETWORK_CODES.has(code)) return FAILURE_KINDS.NETWORK;
  if (err instanceof TypeError) return FAILURE_KINDS.NETWORK;
  if (err && typeof err === 'object' && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return FAILURE_KINDS.NETWORK;
  }
  return FAILURE_KINDS.UNKNOWN;
}

/* ── Copy builders: one per kind, honest wording per mode ─────────── */

function declinedCopy() {
  return {
    kind: FAILURE_KINDS.DECLINED,
    headline: 'Your card was declined.',
    detail:
      'Your bank refused the $30.00 charge — no money was taken and nothing will appear on your statement.',
    recovery:
      'Check the card number and expiry date, or try a different card. Then press Pay again.',
    retryable: true,
    charged: CHARGED_NO,
  };
}

function networkCopy(testMode) {
  return {
    kind: FAILURE_KINDS.NETWORK,
    headline: 'The connection dropped before checkout finished.',
    detail: testMode
      ? 'Test checkout, so no money moved. We simply could not confirm the payment before the connection broke.'
      : 'We could not confirm what happened, so do NOT assume you were (or were not) charged — check your statement or your receipt email before retrying.',
    recovery:
      'Reconnect, then retry checkout once. Your questionnaire answers are still in this tab — you will not have to retype them.',
    retryable: true,
    charged: testMode ? CHARGED_NO : CHARGED_UNKNOWN,
  };
}

function sessionExpiredCopy() {
  return {
    kind: FAILURE_KINDS.SESSION_EXPIRED,
    headline: 'Your checkout session expired.',
    detail:
      'Checkout sessions time out for safety. Nothing was charged — the $30.00 step never started.',
    recovery:
      'Start checkout again. Your questionnaire answers are saved — you will not have to retype them.',
    retryable: true,
    charged: CHARGED_NO,
  };
}

function configCopy(testMode) {
  return {
    kind: FAILURE_KINDS.CONFIG,
    headline: 'Checkout is not available right now.',
    detail: testMode
      ? 'The test payment service is not configured. That is on our side, not yours — no charge was attempted and no money moved.'
      : 'The payment service is not configured correctly. That is on our side, not yours — no charge was attempted.',
    recovery:
      'Try again later. If it keeps happening, contact support and mention the exact error you saw.',
    retryable: false,
    charged: CHARGED_NO,
  };
}

function unknownCopy(testMode) {
  return {
    kind: FAILURE_KINDS.UNKNOWN,
    headline: 'The payment did not go through.',
    detail: testMode
      ? 'Something unexpected broke in the test checkout — no money moved.'
      : 'Something unexpected broke during payment. We could not confirm a charge, so check your statement before retrying.',
    recovery:
      'Retry once. If it fails again, try a different card or contact support with the exact error you saw.',
    retryable: true,
    charged: testMode ? CHARGED_NO : CHARGED_UNKNOWN,
  };
}

/**
 * Classify a checkout failure into honest, user-facing recovery copy.
 * Never throws — garbage in still gets a safe, honest message out.
 *
 * @param {unknown} err — the thrown failure (any shape)
 * @param {{ testMode?: boolean }} [opts] — pass provider.testMode
 * @returns {{ kind: string, headline: string, detail: string,
 *   recovery: string, retryable: boolean, charged: 'no' | 'unknown' }}
 */
export function classifyPaymentFailure(err, { testMode = false } = {}) {
  const kind = failureKindOf(err);
  if (kind === FAILURE_KINDS.DECLINED) return declinedCopy();
  if (kind === FAILURE_KINDS.NETWORK) return networkCopy(testMode);
  if (kind === FAILURE_KINDS.SESSION_EXPIRED) return sessionExpiredCopy();
  if (kind === FAILURE_KINDS.CONFIG) return configCopy(testMode);
  return unknownCopy(testMode);
}
