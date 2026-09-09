/**
 * checkout.test.js — contract tests for the headless checkout runner.
 *
 * Covers the single money step the checkout UI performs:
 *   success → a valid receipt, failure → honest FailureCopy, never a throw.
 */
import { describe, it, expect } from 'vitest';
import { runCheckout } from './checkout.js';
import { PRODUCT } from './payments/index.js';
import { ERROR_CODES } from './payments/provider.js';

describe('runCheckout', () => {
  it('pays $30 and returns a valid test receipt', async () => {
    const result = await runCheckout({ cardLast4: '4242' });
    expect(result.ok).toBe(true);
    const { receipt } = result;
    expect(receipt.id).toMatch(/^rcpt_test_/);
    expect(receipt.paymentIntentId).toMatch(/^pi_test_/);
    expect(receipt.amount).toBe(PRODUCT.amountCents);
    expect(receipt.currency).toBe(PRODUCT.currency);
    expect(receipt.productId).toBe(PRODUCT.id);
    expect(receipt.cardLast4).toBe('4242');
    expect(receipt.testMode).toBe(true);
  });

  it('the 0002 decline card yields honest declined copy, no receipt, no throw', async () => {
    const result = await runCheckout({ cardLast4: '0002' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(ERROR_CODES.DECLINED);
    expect(result.copy.kind).toBe('declined');
    expect(result.copy.headline).toMatch(/declined/i);
    expect(result.copy.retryable).toBe(true);
    // Never claim money moved on a decline.
    expect(result.copy.charged).toBe('no');
    expect(result.receipt).toBeUndefined();
  });

  it('the unconfigured stripe scaffold yields "not available" config copy', async () => {
    const result = await runCheckout({ providerName: 'stripe', cardLast4: '4242' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(ERROR_CODES.NOT_CONFIGURED);
    expect(result.copy.kind).toBe('config');
    expect(result.copy.retryable).toBe(false);
    expect(result.copy.charged).toBe('no');
    // The scaffold is test-mode: copy must say no money moved.
    expect(result.copy.detail).toMatch(/no money moved/i);
  });

  it('an unknown provider name yields live-safe config copy, never throws', async () => {
    const result = await runCheckout({ providerName: 'nope' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(ERROR_CODES.UNKNOWN_PROVIDER);
    expect(result.copy.kind).toBe('config');
    expect(result.copy.retryable).toBe(false);
  });

  it('a malformed cardLast4 falls back to the default test card instead of failing', async () => {
    const result = await runCheckout({ cardLast4: '4242-4242-4242-4242' });
    expect(result.ok).toBe(true);
    expect(result.receipt.cardLast4).toBe('4242');
  });

  it('a non-object options bag is a programming error and throws', async () => {
    await expect(runCheckout(null)).rejects.toThrow(TypeError);
  });

  it('no PAN or secret-ish material ever appears in the result', async () => {
    const ok = await runCheckout({ cardLast4: '4242' });
    const fail = await runCheckout({ cardLast4: '0002' });
    const dumped = JSON.stringify({ ok, fail });
    expect(dumped).not.toMatch(/\b\d{16}\b/);
    expect(dumped).not.toMatch(/sk_(test|live)_/);
  });
});
