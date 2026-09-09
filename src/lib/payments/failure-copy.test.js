/**
 * failure-copy.test.js — tests for the payment-failure recovery copy.
 *
 * The promises under test: the classifier never throws, never claims a
 * charge it cannot prove, and points the payer at the right recovery
 * for every failure kind (declined / network / expired session / config /
 * unknown).
 */

import { describe, it, expect } from 'vitest';
import { PaymentProviderError, ERROR_CODES } from './provider.js';
import { FAILURE_KINDS, failureKindOf, classifyPaymentFailure } from './failure-copy.js';

/* ── failureKindOf ────────────────────────────────────────────────── */

describe('failureKindOf', () => {
  it('maps DECLINED errors', () => {
    expect(failureKindOf(new PaymentProviderError(ERROR_CODES.DECLINED, 'nope'))).toBe(
      FAILURE_KINDS.DECLINED
    );
  });

  it('maps SESSION_EXPIRED codes', () => {
    expect(failureKindOf({ code: 'SESSION_EXPIRED' })).toBe(FAILURE_KINDS.SESSION_EXPIRED);
  });

  it('maps config failures (not configured / invalid amount)', () => {
    expect(failureKindOf(new PaymentProviderError(ERROR_CODES.NOT_CONFIGURED, 'x'))).toBe(
      FAILURE_KINDS.CONFIG
    );
    expect(failureKindOf(new PaymentProviderError(ERROR_CODES.INVALID_AMOUNT, 'x'))).toBe(
      FAILURE_KINDS.CONFIG
    );
    expect(failureKindOf(new PaymentProviderError(ERROR_CODES.UNKNOWN_RECEIPT, 'x'))).toBe(
      FAILURE_KINDS.CONFIG
    );
  });

  it('maps network fingerprints: fetch TypeError, AbortError, transport codes', () => {
    expect(failureKindOf(new TypeError('fetch failed'))).toBe(FAILURE_KINDS.NETWORK);
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(failureKindOf(abort)).toBe(FAILURE_KINDS.NETWORK);
    expect(failureKindOf({ code: 'ECONNREFUSED' })).toBe(FAILURE_KINDS.NETWORK);
  });

  it('maps garbage to unknown', () => {
    expect(failureKindOf(new Error('mystery'))).toBe(FAILURE_KINDS.UNKNOWN);
    expect(failureKindOf(null)).toBe(FAILURE_KINDS.UNKNOWN);
    expect(failureKindOf('a string, not an error')).toBe(FAILURE_KINDS.UNKNOWN);
    expect(failureKindOf(undefined)).toBe(FAILURE_KINDS.UNKNOWN);
  });
});

/* ── classifyPaymentFailure: copy honesty ─────────────────────────── */

describe('classifyPaymentFailure', () => {
  it('declined: says so plainly, certifies no charge, invites retry', () => {
    const copy = classifyPaymentFailure(new PaymentProviderError(ERROR_CODES.DECLINED, 'x'));
    expect(copy.kind).toBe(FAILURE_KINDS.DECLINED);
    expect(copy.headline).toContain('declined');
    expect(copy.charged).toBe('no');
    expect(copy.detail.toLowerCase()).toContain('no money was taken');
    expect(copy.retryable).toBe(true);
  });

  it('network drop in test mode: no money moved, answers preserved', () => {
    const copy = classifyPaymentFailure(new TypeError('fetch failed'), { testMode: true });
    expect(copy.kind).toBe(FAILURE_KINDS.NETWORK);
    expect(copy.charged).toBe('no');
    expect(copy.retryable).toBe(true);
    expect(copy.recovery).toContain('answers are still in this tab');
  });

  it('network drop in live mode: refuses to claim the charge state', () => {
    const copy = classifyPaymentFailure(new TypeError('fetch failed'));
    expect(copy.kind).toBe(FAILURE_KINDS.NETWORK);
    expect(copy.charged).toBe('unknown');
    expect(copy.detail).toContain('check your statement');
    expect(copy.retryable).toBe(true);
  });

  it('expired session: nothing charged, restart offered, answers saved', () => {
    const copy = classifyPaymentFailure({ code: 'SESSION_EXPIRED' });
    expect(copy.kind).toBe(FAILURE_KINDS.SESSION_EXPIRED);
    expect(copy.charged).toBe('no');
    expect(copy.retryable).toBe(true);
    expect(copy.recovery).toContain('saved');
  });

  it('config failure: blames our side, never retries automatically', () => {
    const copy = classifyPaymentFailure(
      new PaymentProviderError(ERROR_CODES.NOT_CONFIGURED, 'x'),
      { testMode: true }
    );
    expect(copy.kind).toBe(FAILURE_KINDS.CONFIG);
    expect(copy.retryable).toBe(false);
    expect(copy.charged).toBe('no');
    expect(copy.detail).toContain('our side');
  });

  it('unknown failure: honest about uncertainty, single retry only', () => {
    const copy = classifyPaymentFailure(new Error('something exploded'), { testMode: true });
    expect(copy.kind).toBe(FAILURE_KINDS.UNKNOWN);
    expect(copy.retryable).toBe(true);
    expect(copy.recovery).toContain('Retry once');
  });

  it('never throws on garbage input', () => {
    for (const bad of [null, undefined, 42, 'nope', {}, { code: 7 }]) {
      const copy = classifyPaymentFailure(bad);
      expect(copy.kind).toBe(FAILURE_KINDS.UNKNOWN);
      expect(typeof copy.headline).toBe('string');
    }
  });

  it('FAILURE_KINDS is a frozen, complete kind list', () => {
    expect(Object.isFrozen(FAILURE_KINDS)).toBe(true);
    expect(Object.values(FAILURE_KINDS).sort()).toEqual(
      ['config', 'declined', 'network', 'session_expired', 'unknown'].sort()
    );
  });
});
