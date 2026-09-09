/**
 * stripe-test.test.js — smoke/regression tests for the test-mode payment
 * fixtures. These guard the money milestone's core invariants:
 *
 *   1. The module can NEVER move real money (no keys, test-mode locked,
 *      live flags throw).
 *   2. Only the exact $30 amount is purchasable.
 *   3. Confirmation returns a valid, unmistakably-test receipt.
 */
import { describe, it, expect } from 'vitest';
import {
  TEST_MODE,
  PRODUCT,
  TEST_CARD,
  ERROR_CODES,
  assertTestMode,
  createTestPaymentIntent,
  confirmTestPayment,
  isValidTestReceipt,
} from './stripe-test.js';

describe('test-mode lock', () => {
  it('is hard-coded to test mode', () => {
    expect(TEST_MODE).toBe(true);
  });

  it('throws TEST_MODE_VIOLATION on any live-mode flag', () => {
    expect(() => assertTestMode({ live: true })).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.TEST_MODE_VIOLATION })
    );
    expect(() => assertTestMode({ mode: 'live' })).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.TEST_MODE_VIOLATION })
    );
    expect(() => assertTestMode({ mode: 'production' })).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.TEST_MODE_VIOLATION })
    );
  });

  it('passes for benign options', () => {
    expect(assertTestMode()).toBe(true);
    expect(assertTestMode({})).toBe(true);
  });

  it('exposes no key-shaped fields anywhere in its exports', () => {
    const dumped = JSON.stringify({ PRODUCT, TEST_CARD });
    expect(dumped).not.toMatch(/sk_(live|test)/);
    expect(dumped).not.toMatch(/pk_(live|test)/);
    expect(dumped).not.toMatch(/whsec/);
  });
});

describe('createTestPaymentIntent', () => {
  it('creates a pi_test_* intent for exactly $30', () => {
    const intent = createTestPaymentIntent();
    expect(intent.id).toMatch(/^pi_test_/);
    expect(intent.amount).toBe(3000);
    expect(intent.currency).toBe('usd');
    expect(intent.status).toBe('requires_payment_method');
    expect(intent.testMode).toBe(true);
  });

  it('rejects any amount that is not $30', () => {
    expect(() => createTestPaymentIntent(100)).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.INVALID_AMOUNT })
    );
  });

  it('generates unique intent ids', () => {
    const a = createTestPaymentIntent();
    const b = createTestPaymentIntent();
    expect(a.id).not.toBe(b.id);
  });
});

describe('confirmTestPayment', () => {
  it('confirms with the 4242 test card and returns a valid receipt', () => {
    const intent = createTestPaymentIntent();
    const receipt = confirmTestPayment(intent.id);
    expect(isValidTestReceipt(receipt)).toBe(true);
    expect(receipt.id).toMatch(/^rcpt_test_/);
    expect(receipt.paymentIntentId).toBe(intent.id);
    expect(receipt.cardLast4).toBe('4242');
    expect(receipt.status).toBe('succeeded');
  });

  it('rejects non-fixture intent ids', () => {
    expect(() => confirmTestPayment('pi_3FakeLiveId')).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.UNKNOWN_INTENT })
    );
    expect(() => confirmTestPayment('')).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.UNKNOWN_INTENT })
    );
  });

  it('declines the 4000...0002 test decline card', () => {
    const intent = createTestPaymentIntent();
    expect(() => confirmTestPayment(intent.id, { last4: '0002' })).toThrowError(
      expect.objectContaining({ code: ERROR_CODES.DECLINED })
    );
  });
});

describe('isValidTestReceipt', () => {
  it('rejects receipts that are not test-mode', () => {
    const intent = createTestPaymentIntent();
    const receipt = confirmTestPayment(intent.id);
    expect(isValidTestReceipt({ ...receipt, testMode: false })).toBe(false);
    expect(isValidTestReceipt({ ...receipt, status: 'pending' })).toBe(false);
    expect(isValidTestReceipt({ ...receipt, amount: 9999 })).toBe(false);
    expect(isValidTestReceipt({ ...receipt, id: 'rcpt_live_1' })).toBe(false);
    expect(isValidTestReceipt(null)).toBe(false);
  });
});
