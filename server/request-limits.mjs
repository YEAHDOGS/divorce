/**
 * Request-body size limits for the divorce checkout staging server.
 *
 * Every POST endpoint on this server (/api/create-payment-intent,
 * /api/checkout-session, /api/stripe-webhook, /api/packet-token) reads its
 * body through {@link readRequestBody}. Legitimate bodies — questionnaire
 * answers, checkout payloads, Stripe webhook events — are single-digit
 * kilobytes, so the cap can sit far above them while still killing the
 * classic "post an unbounded body and OOM the staging box" trick.
 *
 * Stack: pure Node.js (node:http streams), zero dependencies.
 */

/** Hard cap on any request body the staging server will buffer. */
export const MAX_BODY_BYTES = 256 * 1024; // 256 KiB — 100x any legitimate body

/**
 * Thrown by {@link readRequestBody} when a body exceeds its cap.
 * Carries code `BODY_TOO_LARGE` so HTTP handlers can map it to 413
 * without importing this module's other details.
 */
export class BodyTooLargeError extends Error {
  /**
   * @param {number} limitBytes — the cap that was exceeded (for messages/logs)
   */
  constructor(limitBytes) {
    super(`Request body exceeds ${limitBytes} bytes.`);
    this.name = 'BodyTooLargeError';
    this.code = 'BODY_TOO_LARGE';
    this.limitBytes = limitBytes;
  }
}

/**
 * Read a request body with a hard byte cap.
 *
 * The stream is destroyed the moment the cap is exceeded — a malicious
 * client can't keep the socket fed to slow-loris its way around the limit —
 * and callers get a `BodyTooLargeError` instead of a partially-read body.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {{ maxBytes?: number }} [opts]
 * @returns {Promise<string>} the full body as UTF-8 text
 * @throws {BodyTooLargeError} when the body exceeds the cap
 */
export function readRequestBody(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  return (async () => {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > maxBytes) {
        // Fail closed: cut the socket, then throw — never hand back a partial body.
        if (typeof req.destroy === 'function') req.destroy();
        throw new BodyTooLargeError(maxBytes);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  })();
}
