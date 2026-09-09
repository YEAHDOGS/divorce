/**
 * rate-limit.mjs — tiny per-IP token-bucket rate limiter for the checkout
 * staging server. No dependencies, no network, no timers: timestamps are
 * pruned lazily on each check, and nowMs is injectable so tests control
 * time deterministically.
 *
 * Why it exists: the checkout server exposes mutation endpoints that cost
 * Stripe API calls (/api/create-payment-intent) or disk writes
 * (/api/checkout-session). A naive retry loop or a curious crawler could
 * hammer them. The webhook endpoint is deliberately NOT rate-limited here:
 * Stripe retries failed deliveries with backoff, and a strict limiter could
 * drop a legitimate retry carrying money.
 *
 * 429 shape: JSON { error: { code: 'RATE_LIMITED', message } } plus a
 * Retry-After response header (seconds) — the client knows when to retry.
 */

/* ── Hoisted constants ───────────────────────────────────────────── */

const DEFAULT_MAX_REQUESTS = 20;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const UNKNOWN_IP = 'unknown';

/** Exported so the server module can advertise / pin the staging defaults. */
export const DEFAULT_RATE_LIMIT = Object.freeze({
  maxRequests: DEFAULT_MAX_REQUESTS,
  windowMs: DEFAULT_WINDOW_MS,
});

export const RATE_LIMIT_ERROR_CODE = 'RATE_LIMITED';

/**
 * Best-effort client identity for the limiter. Staging runs on localhost
 * behind no proxy, so the socket address is trusted and X-Forwarded-For is
 * ignored on purpose (it is client-controlled and trivially spoofable).
 * @param {object} req — an http.IncomingMessage (or a test fake)
 * @returns {string} the client key
 */
export function clientKey(req) {
  const remote = req && req.socket && typeof req.socket.remoteAddress === 'string'
    ? req.socket.remoteAddress
    : '';
  if (remote) return remote;
  return UNKNOWN_IP;
}

/**
 * Create a rate limiter.
 * @param {object} [opts]
 * @param {number} [opts.maxRequests] — hits allowed per window, per key
 * @param {number} [opts.windowMs] — sliding window size in milliseconds
 * @param {() => number} [opts.nowMs] — clock (inject for deterministic tests)
 * @returns {{ check(req, route): { allowed: boolean, retryAfterSec?: number }, reset(): void, size(): number }}
 */
export function createRateLimiter({
  maxRequests = DEFAULT_MAX_REQUESTS,
  windowMs = DEFAULT_WINDOW_MS,
  nowMs = () => Date.now(),
} = {}) {
  if (!Number.isInteger(maxRequests) || maxRequests < 1) {
    throw new RangeError('rate-limit: maxRequests must be a positive integer.');
  }
  if (!Number.isInteger(windowMs) || windowMs < 1) {
    throw new RangeError('rate-limit: windowMs must be a positive integer.');
  }

  /** key (`route|ip`) → array of hit timestamps (ascending). */
  const buckets = new Map();

  function check(req, route) {
    const key = `${route}|${clientKey(req)}`;
    const now = nowMs();
    const windowStart = now - windowMs;
    let hits = buckets.get(key);
    if (!hits) {
      hits = [];
      buckets.set(key, hits);
    }
    while (hits.length > 0 && hits[0] <= windowStart) hits.shift();
    if (hits.length >= maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
      return { allowed: false, retryAfterSec };
    }
    hits.push(now);
    return { allowed: true };
  }

  function reset() {
    buckets.clear();
  }

  function size() {
    return buckets.size;
  }

  return { check, reset, size };
}
