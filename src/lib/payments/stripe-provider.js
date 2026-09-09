/**
 * stripe-provider.js — StripeProvider SCAFFOLD. Registered but inert.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  SCAFFOLD — NO REAL MONEY CAN MOVE THROUGH THIS MODULE.
 *  createPayment and refund ALWAYS throw NOT_CONFIGURED: there is no
 *  server-side endpoint holding a Stripe secret key, and the SPA must
 *  NEVER hold one. This module exists so the contract tests, the
 *  registry, and the checkout UI can treat Stripe as the assumed
 *  provider today without a live account, and so going live later is
 *  a contained change inside this one file (see below).
 * ═══════════════════════════════════════════════════════════════════
 *
 * Implements the adapter interface in provider.js:
 *   createPayment(amountCents, currency, metadata) -> always throws
 *   refund(receiptId) -> always throws
 *   verifyWebhook(...) -> { supported: false } (no endpoint to verify)
 *
 * Going live (Brandon's decision, PROVIDERS.md "Open questions"):
 *   1. Build a server-side endpoint that holds the Stripe SECRET key
 *      (Cloudflare Worker / serverless function) and creates + confirms
 *      PaymentIntents there. The SPA calls THAT endpoint, never Stripe.
 *   2. Implement createPayment here to call the endpoint and return the
 *      canonical Receipt shape; implement refund against the endpoint.
 *   3. Set testMode: false and flip ACTIVE_PROVIDER_NAME in index.js.
 * Until then the active provider stays TestProvider.
 */

import {
  validateCreatePaymentArgs,
  assertConformsToContract,
  PaymentProviderError,
  ERROR_CODES,
} from './provider.js';
import { PRODUCT } from '../stripe-test.js';

/* ── Hoisted constants ───────────────────────────────────────────── */

const SCAFFOLD_REASON =
  'stripe-provider is a scaffold: no server-side payment-intent endpoint ' +
  'is configured, so no charge can be attempted. The Stripe secret key must ' +
  'live on a server endpoint reviewed by Brandon — never in this SPA.';

/* ── createPayment ───────────────────────────────────────────────── */

/**
 * Always throws NOT_CONFIGURED — a scaffold can never attempt a charge.
 * The argument validation still runs first so misconfigured callers get
 * the same INVALID_AMOUNT / INVALID_CURRENCY / INVALID_PRODUCT errors
 * they would get from a live provider.
 *
 * @returns {Promise<never>}
 * @throws {PaymentProviderError} code INVALID_AMOUNT | INVALID_CURRENCY |
 *   INVALID_PRODUCT | NOT_CONFIGURED
 */
export async function createPayment(amountCents, currency, metadata = {}) {
  validateCreatePaymentArgs(STRIPE_PROVIDER, amountCents, currency, metadata);
  throw new PaymentProviderError(ERROR_CODES.NOT_CONFIGURED, SCAFFOLD_REASON);
}

/* ── refund ──────────────────────────────────────────────────────── */

/**
 * Always throws NOT_CONFIGURED — there is no live charge to refund.
 *
 * @returns {Promise<never>}
 * @throws {PaymentProviderError} code NOT_CONFIGURED
 */
export async function refund(receiptId) {
  void receiptId;
  throw new PaymentProviderError(ERROR_CODES.NOT_CONFIGURED, SCAFFOLD_REASON);
}

/* ── verifyWebhook ───────────────────────────────────────────────── */

/**
 * No webhook endpoint exists, so there is nothing to verify against.
 *
 * @returns {import('./provider.js').WebhookVerification}
 */
export function verifyWebhook() {
  return {
    supported: false,
    valid: false,
    reason: 'stripe-provider scaffold: no webhook endpoint configured.',
  };
}

/**
 * A scaffold can never confirm a payment, so no receipt can ever
 * validate against it. Packet unlock with Stripe stays locked until the
 * live implementation lands. Returns false for every input.
 *
 * @returns {boolean} always false
 */
export function isValidReceipt() {
  return false;
}

/* ── Provider export ─────────────────────────────────────────────── */

export const STRIPE_PROVIDER = Object.freeze({
  name: 'stripe',
  displayName: 'StripeProvider',
  testMode: true, // scaffold: true while no real money can move
  scaffold: true,
  PRODUCT,
  createPayment,
  refund,
  verifyWebhook,
  /** Receipt validator consumed by the packet unlock flow. */
  isValidReceipt,
});

assertConformsToContract(STRIPE_PROVIDER);
