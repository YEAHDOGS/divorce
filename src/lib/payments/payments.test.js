/**
 * payments.test.js — adapter CONTRACT tests.
 *
 * These tests pin the swappable-provider contract in provider.js so the
 * day Brandon picks a real provider, only a new provider module has to
 * satisfy them. They also keep the modal's field validators and the
 * receipt→packet unlock path green through the payments entry point.
 *
 * Security-relevant assertions: no full PAN in any receipt, test-mode
 * ids only, and wrong-product/wrong-amount charges are rejected before
 * any payment happens.
 */
import { describe, it, expect } from 'vitest';
import {
  PaymentProviderError,
  ERROR_CODES,
  validateCreatePaymentArgs,
  assertConformsToContract,
} from './provider.js';
import {
  getProvider,
  ACTIVE_PROVIDER_NAME,
  PRODUCT,
  sanitizeCardDigits,
  isValidTestExpiry,
  isValidTestCvc,
} from './index.js';
import { TEST_PROVIDER, isValidReceipt } from './test-provider.js';
import { STRIPE_PROVIDER } from './stripe-provider.js';
import { isValidTestReceipt } from '../stripe-test.js';

const CHARGE = { productId: PRODUCT.id, cardLast4: '4242' };

/* ── Interface guards (provider.js) ──────────────────────────────── */

describe('provider interface guards', () => {
  it('TestProvider conforms to the adapter contract', () => {
    expect(assertConformsToContract(TEST_PROVIDER)).toBe(true);
  });

  it('rejects providers missing interface methods', () => {
    expect(() => assertConformsToContract({ name: 'x', displayName: 'X', testMode: true, PRODUCT }))
      .toThrowError(expect.objectContaining({ code: ERROR_CODES.UNKNOWN_PROVIDER }));
  });

  it('rejects a null/empty provider', () => {
    expect(() => assertConformsToContract(null))
      .toThrowError(expect.objectContaining({ code: ERROR_CODES.UNKNOWN_PROVIDER }));
  });

  it('rejects wrong amount, currency, and product up front', () => {
    expect(() => validateCreatePaymentArgs(TEST_PROVIDER, 9999, PRODUCT.currency, CHARGE))
      .toThrowError(expect.objectContaining({ code: ERROR_CODES.INVALID_AMOUNT }));
    expect(() => validateCreatePaymentArgs(TEST_PROVIDER, PRODUCT.amountCents, 'eur', CHARGE))
      .toThrowError(expect.objectContaining({ code: ERROR_CODES.INVALID_CURRENCY }));
    expect(() => validateCreatePaymentArgs(TEST_PROVIDER, PRODUCT.amountCents, PRODUCT.currency, { productId: 'nope' }))
      .toThrowError(expect.objectContaining({ code: ERROR_CODES.INVALID_PRODUCT }));
  });

  it('PaymentProviderError carries its code', () => {
    const err = new PaymentProviderError(ERROR_CODES.DECLINED, 'nope');
    expect(err.code).toBe(ERROR_CODES.DECLINED);
    expect(err).toBeInstanceOf(Error);
  });
});

/* ── Registry (index.js) ─────────────────────────────────────────── */

describe('provider registry', () => {
  it('defaults to the test provider', () => {
    expect(ACTIVE_PROVIDER_NAME).toBe('test');
    expect(getProvider()).toBe(TEST_PROVIDER);
    expect(getProvider().testMode).toBe(true);
  });

  it('rejects unknown provider names', () => {
    expect(() => getProvider('square'))
      .toThrowError(expect.objectContaining({ code: ERROR_CODES.UNKNOWN_PROVIDER }));
  });

  it('resolves the registered stripe scaffold by name', () => {
    const stripe = getProvider('stripe');
    expect(stripe.name).toBe('stripe');
    expect(stripe.displayName).toBe('StripeProvider');
  });
});

/* ── TestProvider contract ───────────────────────────────────────── */

describe('TestProvider.createPayment', () => {
  it('returns a receipt the packet flow accepts', async () => {
    const receipt = await TEST_PROVIDER.createPayment(PRODUCT.amountCents, PRODUCT.currency, CHARGE);
    expect(receipt.status).toBe('succeeded');
    expect(receipt.amount).toBe(PRODUCT.amountCents);
    expect(receipt.currency).toBe(PRODUCT.currency);
    expect(receipt.productId).toBe(PRODUCT.id);
    expect(receipt.cardLast4).toBe('4242');
    expect(receipt.id).toMatch(/^rcpt_test_/);
    expect(receipt.paymentIntentId).toMatch(/^pi_test_/);
    // The packet unlock path consumes this exact validator.
    expect(TEST_PROVIDER.isValidReceipt(receipt)).toBe(true);
    expect(isValidTestReceipt(receipt)).toBe(true);
  });

  it('carries no full PAN or secret-ish material', async () => {
    const receipt = await TEST_PROVIDER.createPayment(PRODUCT.amountCents, PRODUCT.currency, CHARGE);
    expect(JSON.stringify(receipt)).not.toMatch(/\b\d{16}\b/);
    expect(JSON.stringify(receipt)).toMatch(/test/);
  });

  it('declines the test decline card (last4 0002)', async () => {
    await expect(
      TEST_PROVIDER.createPayment(PRODUCT.amountCents, PRODUCT.currency, { ...CHARGE, cardLast4: '0002' })
    ).rejects.toThrowError(expect.objectContaining({ code: ERROR_CODES.DECLINED }));
  });

  it('rejects the wrong amount before any payment', async () => {
    await expect(
      TEST_PROVIDER.createPayment(5000, PRODUCT.currency, CHARGE)
    ).rejects.toThrowError(expect.objectContaining({ code: ERROR_CODES.INVALID_AMOUNT }));
  });
});

describe('TestProvider.refund', () => {
  it('refunds a fixture receipt with the canonical shape', async () => {
    const receipt = await TEST_PROVIDER.createPayment(PRODUCT.amountCents, PRODUCT.currency, CHARGE);
    const result = await TEST_PROVIDER.refund(receipt.id);
    expect(result.status).toBe('refunded');
    expect(result.receiptId).toBe(receipt.id);
    expect(() => new Date(result.refundedAt)).not.toThrow();
  });

  it('rejects non-fixture receipt ids', async () => {
    await expect(TEST_PROVIDER.refund('rcpt_live_123'))
      .rejects.toThrowError(expect.objectContaining({ code: ERROR_CODES.UNKNOWN_RECEIPT }));
  });
});

describe('TestProvider.verifyWebhook', () => {
  it('declares webhooks unsupported (no real verification surface)', () => {
    const v = TEST_PROVIDER.verifyWebhook({}, 'sig', 'secret');
    expect(v.supported).toBe(false);
    expect(v.valid).toBe(false);
  });
});

/* ── StripeProvider scaffold ─────────────────────────────────────── */
/* Registered and inert: no live account, no endpoint, no charge possible. */

describe('StripeProvider scaffold', () => {
  it('conforms to the adapter contract', () => {
    expect(assertConformsToContract(STRIPE_PROVIDER)).toBe(true);
  });

  it('stays in test mode: no real money can move', () => {
    expect(STRIPE_PROVIDER.testMode).toBe(true);
    expect(STRIPE_PROVIDER.scaffold).toBe(true);
  });

  it('createPayment refuses every charge with NOT_CONFIGURED', async () => {
    await expect(
      STRIPE_PROVIDER.createPayment(PRODUCT.amountCents, PRODUCT.currency, CHARGE)
    ).rejects.toThrowError(expect.objectContaining({ code: ERROR_CODES.NOT_CONFIGURED }));
  });

  it('still validates the charge args before refusing', async () => {
    await expect(
      STRIPE_PROVIDER.createPayment(5000, PRODUCT.currency, CHARGE)
    ).rejects.toThrowError(expect.objectContaining({ code: ERROR_CODES.INVALID_AMOUNT }));
  });

  it('refund refuses with NOT_CONFIGURED (nothing live to refund)', async () => {
    await expect(STRIPE_PROVIDER.refund('rcpt_test_000001'))
      .rejects.toThrowError(expect.objectContaining({ code: ERROR_CODES.NOT_CONFIGURED }));
  });

  it('never validates a receipt — packet unlock stays locked', () => {
    expect(STRIPE_PROVIDER.isValidReceipt(null)).toBe(false);
    expect(STRIPE_PROVIDER.isValidReceipt({ id: 'rcpt_live_1' })).toBe(false);
  });

  it('declares webhooks unsupported (no endpoint to verify)', () => {
    const v = STRIPE_PROVIDER.verifyWebhook({}, 'sig', 'secret');
    expect(v.supported).toBe(false);
    expect(v.valid).toBe(false);
  });
});

/* ── Card-field validators still exposed via the adapter ─────────── */
/* The checkout modal imports these from payments/index.js. */

describe('card-field validation (modal path)', () => {
  it('sanitizes card digits through the adapter', () => {
    expect(sanitizeCardDigits('4242-4242-4242-4242xyz')).toBe('4242 4242 4242 4242');
  });

  it('accepts a future MM/YY expiry, rejects junk and the past', () => {
    expect(isValidTestExpiry('12/34')).toBe(true);
    expect(isValidTestExpiry('13/30')).toBe(false);
    expect(isValidTestExpiry('01/20')).toBe(false);
    expect(isValidTestExpiry('not-a-date')).toBe(false);
  });

  it('accepts 3-4 digit CVCs, rejects anything else', () => {
    expect(isValidTestCvc('123')).toBe(true);
    expect(isValidTestCvc('1234')).toBe(true);
    expect(isValidTestCvc('12')).toBe(false);
    expect(isValidTestCvc('12a')).toBe(false);
  });
});
