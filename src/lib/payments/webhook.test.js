/**
 * webhook.test.js — tests for the webhook signature verification harness.
 *
 * These tests exercise the verification algorithm only (sign with a
 * FIXTURE secret, verify, tamper, replay). No real secrets, no network,
 * no money movement — see webhook.js module header.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TOLERANCE_SECONDS,
  WEBHOOK_ERROR_CODES,
  WebhookError,
  parseSignatureHeader,
  computeSignature,
  verifyWebhookSignature,
  signTestWebhook,
} from './webhook.js';

const FIXTURE_SECRET = 'whsec_test_fixture_only';
const FIXTURE_PAYLOAD = JSON.stringify({ id: 'evt_test_123', type: 'payment_intent.succeeded' });

const verify = (overrides = {}) =>
  verifyWebhookSignature({
    payload: FIXTURE_PAYLOAD,
    signatureHeader: '',
    secret: FIXTURE_SECRET,
    ...overrides,
  });

describe('webhook signature verification', () => {
  it('accepts a valid signed webhook', async () => {
    const header = await signTestWebhook(FIXTURE_PAYLOAD, FIXTURE_SECRET);
    const result = await verify({ signatureHeader: header });
    expect(result.valid).toBe(true);
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('rejects a tampered payload', async () => {
    const header = await signTestWebhook(FIXTURE_PAYLOAD, FIXTURE_SECRET);
    const err = await verify({ payload: FIXTURE_PAYLOAD + 'tampered', signatureHeader: header }).catch((e) => e);
    expect(err).toBeInstanceOf(WebhookError);
    expect(err.code).toBe(WEBHOOK_ERROR_CODES.INVALID_SIGNATURE);
  });

  it('rejects the wrong secret', async () => {
    const header = await signTestWebhook(FIXTURE_PAYLOAD, 'whsec_test_wrong_secret');
    const err = await verify({ signatureHeader: header }).catch((e) => e);
    expect(err).toBeInstanceOf(WebhookError);
    expect(err.code).toBe(WEBHOOK_ERROR_CODES.INVALID_SIGNATURE);
  });

  it('rejects a replayed webhook past the timestamp tolerance', async () => {
    const oldTs = Math.floor(Date.now() / 1000) - (DEFAULT_TOLERANCE_SECONDS + 60);
    const header = await signTestWebhook(FIXTURE_PAYLOAD, FIXTURE_SECRET, oldTs);
    const err = await verify({ signatureHeader: header }).catch((e) => e);
    expect(err).toBeInstanceOf(WebhookError);
    expect(err.code).toBe(WEBHOOK_ERROR_CODES.TIMESTAMP_OUT_OF_TOLERANCE);
  });

  it('rejects a far-future timestamp (clock abuse either way)', async () => {
    const futureTs = Math.floor(Date.now() / 1000) + DEFAULT_TOLERANCE_SECONDS + 60;
    const header = await signTestWebhook(FIXTURE_PAYLOAD, FIXTURE_SECRET, futureTs);
    const err = await verify({ signatureHeader: header }).catch((e) => e);
    expect(err).toBeInstanceOf(WebhookError);
    expect(err.code).toBe(WEBHOOK_ERROR_CODES.TIMESTAMP_OUT_OF_TOLERANCE);
  });

  it('rejects a missing signature header', async () => {
    const err = await verify({ signatureHeader: '' }).catch((e) => e);
    expect(err).toBeInstanceOf(WebhookError);
    expect(err.code).toBe(WEBHOOK_ERROR_CODES.MISSING_SIGNATURE);
  });

  it('rejects a malformed signature header', async () => {
    const err = await verify({ signatureHeader: 'not-a-signature-header' }).catch((e) => e);
    expect(err).toBeInstanceOf(WebhookError);
    expect(err.code).toBe(WEBHOOK_ERROR_CODES.MALFORMED_SIGNATURE);
  });

  it('rejects a header with no v1 scheme signature', async () => {
    const header = `t=${Math.floor(Date.now() / 1000)},v0=abcdef`;
    const err = await verify({ signatureHeader: header }).catch((e) => e);
    expect(err).toBeInstanceOf(WebhookError);
    expect(err.code).toBe(WEBHOOK_ERROR_CODES.MALFORMED_SIGNATURE);
  });

  it('fails closed when no secret is configured', async () => {
    const header = await signTestWebhook(FIXTURE_PAYLOAD, FIXTURE_SECRET);
    const err = await verify({ signatureHeader: header, secret: '' }).catch((e) => e);
    expect(err).toBeInstanceOf(WebhookError);
    expect(err.code).toBe(WEBHOOK_ERROR_CODES.MISSING_SIGNATURE);
  });

  it('accepts when one of several rolled-key v1 signatures matches', async () => {
    const header = await signTestWebhook(FIXTURE_PAYLOAD, FIXTURE_SECRET);
    const rolled = `t=${header.match(/t=(\d+)/)[1]},v1=deadbeefcafeface,v1=${header.split('v1=')[1]}`;
    const result = await verify({ signatureHeader: rolled });
    expect(result.valid).toBe(true);
  });

  it('respects a custom (tighter) tolerance window', async () => {
    const ts = Math.floor(Date.now() / 1000) - 120;
    const header = await signTestWebhook(FIXTURE_PAYLOAD, FIXTURE_SECRET, ts);
    const err = await verify({ signatureHeader: header, toleranceSeconds: 60 }).catch((e) => e);
    expect(err).toBeInstanceOf(WebhookError);
    expect(err.code).toBe(WEBHOOK_ERROR_CODES.TIMESTAMP_OUT_OF_TOLERANCE);
    const ok = await verify({ signatureHeader: header, toleranceSeconds: 300 });
    expect(ok.valid).toBe(true);
  });

  it('the signed body is the EXACT raw string — re-serialization fails', async () => {
    const pretty = JSON.stringify(JSON.parse(FIXTURE_PAYLOAD), null, 2);
    const header = await signTestWebhook(FIXTURE_PAYLOAD, FIXTURE_SECRET);
    const err = await verify({ payload: pretty, signatureHeader: header }).catch((e) => e);
    expect(err).toBeInstanceOf(WebhookError);
    expect(err.code).toBe(WEBHOOK_ERROR_CODES.INVALID_SIGNATURE);
  });
});

describe('parseSignatureHeader', () => {
  it('parses timestamp and multiple v1 signatures', () => {
    const { timestamp, signatures } = parseSignatureHeader('t=1492774577,v1=aaa,v1=bbb');
    expect(timestamp).toBe(1492774577);
    expect(signatures).toEqual(['aaa', 'bbb']);
  });

  it('rejects a non-integer timestamp', () => {
    expect(() => parseSignatureHeader('t=soon,v1=aaa')).toThrow(WebhookError);
  });
});

describe('computeSignature', () => {
  it('is deterministic for the same inputs', async () => {
    const a = await computeSignature(FIXTURE_PAYLOAD, 123, FIXTURE_SECRET);
    const b = await computeSignature(FIXTURE_PAYLOAD, 123, FIXTURE_SECRET);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
