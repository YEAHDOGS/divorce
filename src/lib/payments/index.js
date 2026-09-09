/**
 * payments/index.js — THE ONE FILE THAT CHANGES when Brandon picks a
 * payment provider.
 *
 * Checkout code everywhere (CheckoutModal, questionnaire flow, packet
 * unlock) goes through this module, never a provider module directly:
 *
 *   import { getProvider, ACTIVE_PROVIDER_NAME } from './payments/index.js';
 *   const provider = getProvider(); // or getProvider(ACTIVE_PROVIDER_NAME)
 *   const receipt = await provider.createPayment(amountCents, currency, metadata);
 *
 * To go live one day:
 *   1. StripeProvider scaffold exists (src/lib/payments/stripe-provider.js).
 *      Implement its createPayment/refund against a server-side endpoint
 *      that holds the Stripe SECRET key (never in this SPA).
 *   2. Set its testMode to false in the scaffold.
 *   3. Flip ACTIVE_PROVIDER_NAME to 'stripe' (registered below).
 * Nothing else in the app changes.
 */

import { PaymentProviderError, ERROR_CODES } from './provider.js';
import { TEST_PROVIDER } from './test-provider.js';
import { STRIPE_PROVIDER } from './stripe-provider.js';

/* ── Provider registry ───────────────────────────────────────────── */
/* Keys are the `name` each provider module declares. */

const REGISTRY = Object.freeze({
  [TEST_PROVIDER.name]: TEST_PROVIDER,
  [STRIPE_PROVIDER.name]: STRIPE_PROVIDER,
});

/**
 * The active provider key. The day Brandon picks a real provider, this
 * one constant (plus the new provider's registration above) is the only
 * app-side change required.
 */
export const ACTIVE_PROVIDER_NAME = 'test';

/**
 * Resolve a provider by registry key.
 *
 * @param {string} [name] — defaults to ACTIVE_PROVIDER_NAME
 * @returns the provider export (conforms to provider.js interface)
 * @throws {PaymentProviderError} code UNKNOWN_PROVIDER
 */
export function getProvider(name = ACTIVE_PROVIDER_NAME) {
  const provider = REGISTRY[name];
  if (!provider) {
    throw new PaymentProviderError(
      ERROR_CODES.UNKNOWN_PROVIDER,
      `payments: no provider registered under '${name}'. Known: ${Object.keys(REGISTRY).join(', ')}.`
    );
  }
  return provider;
}

/* ── Convenience re-exports ──────────────────────────────────────── */
/* Checkout consumers import product + card-field helpers from here so
   they never reach past the adapter boundary into a provider module. */

export {
  PRODUCT,
  TEST_CARD,
  sanitizeCardDigits,
  isValidTestExpiry,
  isValidTestCvc,
} from './test-provider.js';

/* ── Failure UX ──────────────────────────────────────────────────── */
/* The checkout modal shows classifyPaymentFailure's copy instead of raw
   error codes: honest charge-state claims + the right recovery step. */

export { FAILURE_KINDS, failureKindOf, classifyPaymentFailure } from './failure-copy.js';
