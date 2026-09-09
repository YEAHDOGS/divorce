/**
 * webhook.js — provider-agnostic webhook SIGNATURE VERIFICATION.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  TEST-MODE ONLY at the app level. No real webhooks are verified by
 *  the SPA: signature verification belongs on the server-side payment
 *  endpoint (the future Cloudflare Worker that will hold the Stripe
 *  secret key), because the webhook secret must never live in browser
 *  code. This module exists so that the day the endpoint is built,
 *  the verification algorithm is ALREADY implemented, tested, and
 *  hardening-reviewed — the endpoint can import it as-is.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Implements the Stripe `Stripe-Signature` scheme:
 *   - signed payload  = `${timestamp}.${payload}`
 *   - HMAC-SHA256     with the endpoint's webhook secret
 *   - header format   = `t=1492774577,v1=<hex>,v1=<hex>,...`
 *   - constant-time   signature comparison (no short-circuit oracles)
 *   - timestamp tolerance (default 300s) to reject replayed webhooks
 *
 * No dependencies: uses globalThis.crypto.subtle (available in browsers
 * and Node 18+). Fails CLOSED: if WebCrypto is unavailable, verification
 * throws instead of passing.
 */

export const SIGNATURE_SCHEME_VERSION = 'v1';

/** Stripe's documented default: reject webhooks older than 5 minutes. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

export const WEBHOOK_ERROR_CODES = Object.freeze({
  CRYPTO_UNAVAILABLE: 'CRYPTO_UNAVAILABLE',
  MISSING_SIGNATURE: 'MISSING_SIGNATURE',
  MALFORMED_SIGNATURE: 'MALFORMED_SIGNATURE',
  TIMESTAMP_OUT_OF_TOLERANCE: 'TIMESTAMP_OUT_OF_TOLERANCE',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
});

export class WebhookError extends Error {
  /**
   * @param {string} code — one of WEBHOOK_ERROR_CODES
   * @param {string} message — human-readable detail
   */
  constructor(code, message) {
    super(message);
    this.name = 'WebhookError';
    this.code = code;
  }
}

const TEXT_ENCODER = new TextEncoder();

/**
 * Constant-time comparison of two hex signature strings. Returns false
 * (not throws) on length mismatch so a malformed signature never passes.
 */
function signaturesEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Parse a Stripe-style signature header: `t=<ts>,v1=<hex>,v1=<hex>`.
 * @returns {{ timestamp: number, signatures: string[] }}
 * @throws {WebhookError} MALFORMED_SIGNATURE
 */
export function parseSignatureHeader(header) {
  if (typeof header !== 'string' || header.length === 0) {
    throw new WebhookError(WEBHOOK_ERROR_CODES.MISSING_SIGNATURE, 'webhook: no signature header supplied.');
  }
  let timestamp = null;
  const signatures = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't' && timestamp === null) {
      timestamp = Number(value);
    } else if (key === SIGNATURE_SCHEME_VERSION && value.length > 0) {
      signatures.push(value);
    }
  }
  if (!Number.isInteger(timestamp) || timestamp <= 0 || signatures.length === 0) {
    throw new WebhookError(
      WEBHOOK_ERROR_CODES.MALFORMED_SIGNATURE,
      'webhook: signature header is not t=<int>,v1=<hex> shaped.'
    );
  }
  return { timestamp, signatures };
}

/**
 * Compute the expected HMAC-SHA256 hex signature for a signed payload.
 * Exported for the endpoint (and for tests) — NOT for the SPA to use
 * with a real secret; see module header.
 */
export async function computeSignature(payload, timestamp, secret) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle || typeof subtle.importKey !== 'function') {
    throw new WebhookError(
      WEBHOOK_ERROR_CODES.CRYPTO_UNAVAILABLE,
      'webhook: WebCrypto is unavailable — refusing to verify.'
    );
  }
  const key = await subtle.importKey('raw', TEXT_ENCODER.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const mac = await subtle.sign('HMAC', key, TEXT_ENCODER.encode(`${timestamp}.${payload}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a webhook signature header against a raw payload string.
 *
 * @param {object} args
 * @param {string} args.payload — the EXACT raw request body (no re-serialization)
 * @param {string} args.signatureHeader — value of the `Stripe-Signature` header
 * @param {string} args.secret — the endpoint's webhook secret (server-side only)
 * @param {number} [args.toleranceSeconds] — max age of the timestamp (default 300)
 * @param {() => number} [args.nowMs] — clock injection for tests (defaults to Date.now)
 * @returns {Promise<{ valid: true, timestamp: number }>}
 * @throws {WebhookError} on any verification failure (fails closed)
 */
export async function verifyWebhookSignature({
  payload,
  signatureHeader,
  secret,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  nowMs = () => Date.now(),
}) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new WebhookError(
      WEBHOOK_ERROR_CODES.MISSING_SIGNATURE,
      'webhook: no secret configured — cannot verify.'
    );
  }
  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  const ageSeconds = Math.abs(nowMs() / 1000 - timestamp);
  if (ageSeconds > toleranceSeconds) {
    throw new WebhookError(
      WEBHOOK_ERROR_CODES.TIMESTAMP_OUT_OF_TOLERANCE,
      `webhook: timestamp is ${Math.round(ageSeconds)}s old (tolerance ${toleranceSeconds}s) — possible replay.`
    );
  }
  const expected = await computeSignature(payload, timestamp, secret);
  const ok = signatures.some((s) => signaturesEqual(s, expected));
  if (!ok) {
    throw new WebhookError(WEBHOOK_ERROR_CODES.INVALID_SIGNATURE, 'webhook: signature does not match payload.');
  }
  return { valid: true, timestamp };
}

/**
 * Build a valid test signature header for fixtures and tests.
 * TEST-ONLY: never sign with a real webhook secret anywhere but the
 * server endpoint. Mirrors what the provider sends, so the endpoint's
 * verification path can be exercised end-to-end with fake data.
 *
 * @param {string} payload — exact raw body to sign
 * @param {string} secret — fixture secret (e.g. 'whsec_test_...')
 * @param {number} [timestamp] — unix seconds (defaults to now)
 * @returns {Promise<string>} header value `t=<ts>,v1=<hex>`
 */
export async function signTestWebhook(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${await computeSignature(payload, timestamp, secret)}`;
}
