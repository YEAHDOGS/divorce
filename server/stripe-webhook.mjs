/**
 * Divorce packet checkout — Stripe webhook endpoint (TEST MODE ONLY).
 *
 * Completes the $30 money milestone on staging WITHOUT touching Stripe's
 * network: the endpoint verifies provider webhook signatures, records
 * succeeded payments in a local ledger, and generates the printable
 * divorce packet through the same gates the frontend uses
 * (pre-flight + printable-output completeness).
 *
 * Routes (wired into startServer in stripe-payment-server.mjs):
 *   POST /api/checkout-session  — intake: { email?, answers } → { sessionId }
 *   POST /api/stripe-webhook    — provider event delivery (signature-verified)
 *   GET  /api/packet/:paymentIntentId — download the paid packet (404 until paid)
 *
 * Security model:
 *  - TEST-MODE SAFE by default: the webhook secret is read from
 *    STRIPE_WEBHOOK_SECRET, and live mode is refused unless
 *    ALLOW_LIVE_PAYMENTS=true is set explicitly (same rule as the
 *    create-payment-intent endpoint).
 *  - Signature verification is HMAC-SHA256 with constant-time comparison
 *    and a 300s timestamp tolerance. Bad signatures → 400, no processing.
 *  - Idempotent: every event id is recorded once; duplicate deliveries
 *    return { deduped: true } and never re-record or re-generate.
 *  - A packet is generated ONLY for a signature-verified
 *    payment_intent.succeeded with the exact $30.00 USD amount whose
 *    receipt is recorded in the paid-receipts store. buildPacket still
 *    throws PACKET_UNPAID for anything else — the gate code is the
 *    second lock, not just the router.
 *  - Failed payments, wrong amounts, and unknown sessions are recorded
 *    in the ledger but produce NO packet and NO receipt.
 *  - User values are escaped by packetToPrintableHtml; the download
 *    endpoint allowlists the payment-intent id (no path traversal).
 *
 * Storage: server/data/ (gitignored) — sessions, paid receipts, processed
 * event ids, generated packet HTML, and an append-only ledger.jsonl.
 * Single-process staging storage; not a production database.
 */

import { createHmac, createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT, ERROR_CODES, createPaymentIntentHandler, loadStripeClient } from './stripe-payment-server.mjs';
import { buildPacket, packetToPrintableHtml } from '../src/lib/packet.js';
import { createRateLimiter, DEFAULT_RATE_LIMIT, RATE_LIMIT_ERROR_CODE } from './rate-limit.mjs';

/* Exported for tests and for pinning in docs: the staging server's limits. */
export { DEFAULT_RATE_LIMIT, RATE_LIMIT_ERROR_CODE };

/* ── Hoisted constants ───────────────────────────────────────────── */

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));

/** Default on-disk store for staging (overridable per handler). */
export const DEFAULT_DATA_DIR = join(SERVER_DIR, 'data');

/** Stripe's documented default: reject webhooks older than 5 minutes. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/** Allowlist for ids that become file names (kills path traversal). */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/** Placeholder when the event carries no card last-4 — never a real PAN. */
const UNKNOWN_LAST4 = '----';

export const WEBHOOK_ERROR_CODES = Object.freeze({
  ...ERROR_CODES,
  WEBHOOK_SECRET_MISSING: 'WEBHOOK_SECRET_MISSING',
  SIGNATURE_INVALID: 'SIGNATURE_INVALID',
  EVENT_INVALID: 'EVENT_INVALID',
  SESSION_INVALID: 'SESSION_INVALID',
  PACKET_NOT_READY: 'PACKET_NOT_READY',
  PACKET_INTEGRITY_FAILED: 'PACKET_INTEGRITY_FAILED',
  RATE_LIMITED: RATE_LIMIT_ERROR_CODE,
});

/**
 * Privacy headers for the paid-packet download. The packet is a sensitive
 * legal document: it must never sit in a proxy/browser cache (no-store),
 * must never be sniffed as another MIME type (nosniff), and must not leak
 * its URL to third parties (no-referrer). Exported so tests can pin them.
 */
export const PACKET_DOWNLOAD_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});

/* ── Error class ─────────────────────────────────────────────────── */

export class WebhookError extends Error {
  /**
   * @param {string} code — one of WEBHOOK_ERROR_CODES
   * @param {string} message — human-readable detail (safe to log, not to echo secrets)
   */
  constructor(code, message) {
    super(message);
    this.name = 'WebhookError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new WebhookError(code, message);
}

/* ── Webhook secret (test-mode safe) ─────────────────────────────── */

/**
 * Resolve the webhook signing secret. DEFAULT-DENY on live mode, mirroring
 * loadStripeClient: STRIPE_MODE=live is refused unless
 * ALLOW_LIVE_PAYMENTS=true is set explicitly.
 */
export function loadWebhookSecret(env = process.env) {
  const mode = String(env.STRIPE_MODE || 'test').toLowerCase();
  if (mode !== 'test' && env.ALLOW_LIVE_PAYMENTS !== 'true') {
    fail(
      WEBHOOK_ERROR_CODES.TEST_MODE_VIOLATION,
      'webhook: live mode refused — set ALLOW_LIVE_PAYMENTS=true explicitly.'
    );
  }
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (typeof secret !== 'string' || secret.length === 0) {
    fail(
      WEBHOOK_ERROR_CODES.WEBHOOK_SECRET_MISSING,
      'webhook: STRIPE_WEBHOOK_SECRET is not set — cannot verify signatures.'
    );
  }
  return secret;
}

/* ── Signature verification (node:crypto, sync, constant-time) ───── */

/**
 * Parse a Stripe-style signature header: `t=<ts>,v1=<hex>,v1=<hex>`.
 * @returns {{ timestamp: number, signatures: string[] }}
 */
export function parseSignatureHeader(header) {
  if (typeof header !== 'string' || header.length === 0) {
    fail(WEBHOOK_ERROR_CODES.SIGNATURE_INVALID, 'webhook: missing Stripe-Signature header.');
  }
  let timestamp = null;
  const signatures = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't' && timestamp === null) timestamp = Number(value);
    else if (key === 'v1' && value.length > 0) signatures.push(value);
  }
  if (!Number.isInteger(timestamp) || timestamp <= 0 || signatures.length === 0) {
    fail(
      WEBHOOK_ERROR_CODES.SIGNATURE_INVALID,
      'webhook: signature header is not t=<int>,v1=<hex> shaped.'
    );
  }
  return { timestamp, signatures };
}

/**
 * Verify a webhook signature header against the EXACT raw request body.
 * Fails closed: any problem throws WebhookError.
 *
 * @param {object} args
 * @param {string} args.rawBody — the exact raw request body (no re-serialization)
 * @param {string} args.signatureHeader — value of the `Stripe-Signature` header
 * @param {string} args.secret — the endpoint's webhook secret (server-side only)
 * @param {number} [args.toleranceSeconds] — max timestamp age (default 300)
 * @param {() => number} [args.nowMs] — clock injection for tests
 * @returns {{ valid: true, timestamp: number }}
 */
export function verifyWebhookSignature({
  rawBody,
  signatureHeader,
  secret,
  toleranceSeconds = WEBHOOK_TOLERANCE_SECONDS,
  nowMs = () => Date.now(),
}) {
  if (typeof secret !== 'string' || secret.length === 0) {
    fail(WEBHOOK_ERROR_CODES.WEBHOOK_SECRET_MISSING, 'webhook: no secret configured — cannot verify.');
  }
  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  const ageSeconds = Math.abs(nowMs() / 1000 - timestamp);
  if (ageSeconds > toleranceSeconds) {
    fail(
      WEBHOOK_ERROR_CODES.SIGNATURE_INVALID,
      `webhook: signature timestamp is ${Math.round(ageSeconds)}s old (tolerance ${toleranceSeconds}s) — possible replay.`
    );
  }
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest();
  const ok = signatures.some((s) => {
    let buf;
    try {
      buf = Buffer.from(s, 'hex');
    } catch {
      return false;
    }
    if (buf.length !== expected.length) return false;
    return timingSafeEqual(buf, expected);
  });
  if (!ok) fail(WEBHOOK_ERROR_CODES.SIGNATURE_INVALID, 'webhook: signature does not match payload.');
  return { valid: true, timestamp };
}

/**
 * Build a valid signature header for fixtures, tests, and the simulate
 * CLI. TEST-ONLY: never sign with a real webhook secret outside the
 * provider's own delivery.
 */
export function signTestWebhook(rawBody, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

/* ── Staging store (server/data/, gitignored) ─────────────────────── */

function paths(dataDir) {
  return {
    sessionsDir: join(dataDir, 'sessions'),
    packetsDir: join(dataDir, 'packets'),
    processedFile: join(dataDir, 'processed-events.json'),
    receiptsFile: join(dataDir, 'paid-receipts.json'),
    ledgerFile: join(dataDir, 'ledger.jsonl'),
  };
}

export function ensureDataDir(dataDir) {
  const p = paths(dataDir);
  mkdirSync(p.sessionsDir, { recursive: true });
  mkdirSync(p.packetsDir, { recursive: true });
  return p;
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Append one JSON line to the ledger (append-only audit trail). */
export function recordLedger(dataDir, entry) {
  const p = ensureDataDir(dataDir);
  appendFileSync(p.ledgerFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', 'utf8');
}

export function sanitizeId(value) {
  return typeof value === 'string' && SAFE_ID.test(value) ? value : null;
}

/* Sessions: questionnaire answers captured at checkout start, keyed for
   the webhook to find via the payment intent's metadata.packet_id. */

export function saveSession(dataDir, { email, answers }) {
  const p = ensureDataDir(dataDir);
  const sessionId = `sess_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const record = { sessionId, email: email || null, answers, createdAt: new Date().toISOString() };
  writeFileSync(join(p.sessionsDir, `${sessionId}.json`), JSON.stringify(record), 'utf8');
  recordLedger(dataDir, { kind: 'session_created', sessionId, email: email || null });
  return record;
}

export function loadSession(dataDir, sessionId) {
  const p = ensureDataDir(dataDir);
  if (!sanitizeId(sessionId)) return null;
  return readJsonFile(join(p.sessionsDir, `${sessionId}.json`), null);
}

/* Processed events: the idempotency record. One event id → one outcome. */

export function isEventProcessed(dataDir, eventId) {
  const p = ensureDataDir(dataDir);
  return Object.prototype.hasOwnProperty.call(readJsonFile(p.processedFile, {}), eventId);
}

export function markEventProcessed(dataDir, eventId, outcome) {
  const p = ensureDataDir(dataDir);
  const processed = readJsonFile(p.processedFile, {});
  processed[eventId] = { outcome, at: new Date().toISOString() };
  writeFileSync(p.processedFile, JSON.stringify(processed, null, 2), 'utf8');
  recordLedger(dataDir, { kind: 'event_processed', eventId, outcome });
}

/* Paid receipts: the ONLY thing that unlocks packet generation.
   A receipt exists here only after a signature-verified
   payment_intent.succeeded for the exact $30.00 USD amount. */

export function recordPaidReceipt(dataDir, receipt) {
  const p = ensureDataDir(dataDir);
  const receipts = readJsonFile(p.receiptsFile, {});
  receipts[receipt.id] = receipt;
  writeFileSync(p.receiptsFile, JSON.stringify(receipts, null, 2), 'utf8');
  recordLedger(dataDir, {
    kind: 'payment_recorded',
    receiptId: receipt.id,
    paymentIntentId: receipt.paymentIntentId,
    amountCents: receipt.amount,
    currency: receipt.currency,
    eventId: receipt.eventId,
  });
}

export function isPaidReceipt(dataDir, receipt) {
  const p = ensureDataDir(dataDir);
  const receipts = readJsonFile(p.receiptsFile, {});
  return !!receipt && typeof receipt.id === 'string' && !!receipts[receipt.id];
}

/** The provider shape buildPacket expects; isValidReceipt ONLY trusts the ledger. */
export function webhookProvider(dataDir) {
  return {
    name: 'stripe-webhook',
    PRODUCT,
    isValidReceipt: (receipt) => isPaidReceipt(dataDir, receipt),
  };
}

/* Generated packets: standalone printable HTML, keyed by payment intent id. */

export function savePacketHtml(dataDir, paymentIntentId, html) {
  const p = ensureDataDir(dataDir);
  const safe = sanitizeId(paymentIntentId);
  if (!safe) fail(WEBHOOK_ERROR_CODES.EVENT_INVALID, 'webhook: unsafe payment intent id.');
  writeFileSync(join(p.packetsDir, `${safe}.html`), html, 'utf8');
  // Integrity sidecar: sha256 of the exact bytes served. loadPacketHtml
  // re-computes and compares before serving — a tampered or truncated
  // file on disk is refused instead of handed to the payer.
  const sha256 = packetDigest(html);
  writeFileSync(join(p.packetsDir, `${safe}.sha256`), sha256, 'utf8');
  recordLedger(dataDir, { kind: 'packet_ready', paymentIntentId: safe, sha256 });
}

/**
 * sha256 hex digest of the packet bytes. Exported so tests can pin the
 * algorithm and the download path can be verified independently.
 * @param {string} html — packet HTML bytes as written by savePacketHtml
 * @returns {string} lowercase hex sha256
 */
export function packetDigest(html) {
  return createHash('sha256').update(html, 'utf8').digest('hex');
}

/** Read the integrity sidecar written by savePacketHtml; null if absent. */
export function readPacketDigest(dataDir, paymentIntentId) {
  const p = ensureDataDir(dataDir);
  const safe = sanitizeId(paymentIntentId);
  if (!safe) return null;
  const file = join(p.packetsDir, `${safe}.sha256`);
  if (!existsSync(file)) return null;
  const digest = readFileSync(file, 'utf8').trim();
  return /^[0-9a-f]{64}$/.test(digest) ? digest : null;
}

/**
 * Load the paid packet HTML, verifying its integrity digest first.
 * @returns {string|null} the HTML, or null when no packet exists yet
 * @throws {WebhookError} PACKET_INTEGRITY_FAILED when the file on disk no
 *   longer matches the digest recorded at generation time (tamper or
 *   truncation). Fail closed: never serve bytes we cannot vouch for.
 */
export function loadPacketHtml(dataDir, paymentIntentId) {
  const p = ensureDataDir(dataDir);
  const safe = sanitizeId(paymentIntentId);
  if (!safe) return null;
  const file = join(p.packetsDir, `${safe}.html`);
  if (!existsSync(file)) return null;
  const html = readFileSync(file, 'utf8');
  const expected = readPacketDigest(dataDir, safe);
  const actual = packetDigest(html);
  if (!expected || !timingSafeDigestEqual(actual, expected)) {
    fail(
      WEBHOOK_ERROR_CODES.PACKET_INTEGRITY_FAILED,
      'webhook: packet failed its integrity check — the paid receipt is intact, request a fresh download.'
    );
  }
  return html;
}

/**
 * Constant-time digest comparison (both values are already validated
 * lowercase hex from readPacketDigest / packetDigest).
 */
function timingSafeDigestEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/* ── Event → receipt → packet pipeline ───────────────────────────── */

function extractLast4(intent) {
  try {
    const charges = intent?.charges?.data;
    const last4 = charges?.[0]?.payment_method_details?.card?.last4;
    return typeof last4 === 'string' && /^[0-9]{4}$/.test(last4) ? last4 : UNKNOWN_LAST4;
  } catch {
    return UNKNOWN_LAST4;
  }
}

/**
 * Handle one verified payment_intent.succeeded object.
 * @returns {{ packetId: string, receiptId: string }}
 * @throws {WebhookError} SESSION_INVALID / packet-gate errors on failure
 *   (caller records these as rejected outcomes — no packet, no receipt)
 */
export function fulfillSucceededPayment(dataDir, event, intent, { nowMs = () => Date.now() } = {}) {
  if (intent.amount !== PRODUCT.amountCents || intent.currency !== PRODUCT.currency) {
    fail(
      WEBHOOK_ERROR_CODES.EVENT_INVALID,
      `webhook: expected exactly ${PRODUCT.amountCents} ${PRODUCT.currency}, got ${intent.amount} ${intent.currency} — no packet.`
    );
  }
  const sessionId = intent?.metadata?.packet_id;
  const session = loadSession(dataDir, sessionId);
  if (!session) {
    fail(WEBHOOK_ERROR_CODES.SESSION_INVALID, 'webhook: no checkout session for this payment — no packet.');
  }

  // 1) Record the payment FIRST — the receipt is valid only from this moment.
  const receipt = {
    id: `rcpt_${sanitizeId(event.id) || randomUUID()}`,
    eventId: event.id,
    paymentIntentId: intent.id,
    amount: intent.amount,
    currency: intent.currency,
    cardLast4: extractLast4(intent),
    paidAt: new Date(typeof intent.created === 'number' ? intent.created * 1000 : nowMs()).toISOString(),
    testMode: true,
  };
  recordPaidReceipt(dataDir, receipt);

  // 2) Generate the packet through the same gates the frontend uses:
  //    buildPacket runs the pre-flight gate; packetToPrintableHtml runs
  //    the printable-output completeness gate. Either throws → no packet.
  const packet = buildPacket(webhookProvider(dataDir), receipt, session.answers);
  const html = packetToPrintableHtml(packet);
  savePacketHtml(dataDir, intent.id, html);
  return { packetId: packet.packetId, receiptId: receipt.id };
}

/**
 * Validate the shape of a decoded webhook event.
 * @returns {{ id: string, type: string, object: object }}
 */
export function parseEvent(rawBody) {
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    fail(WEBHOOK_ERROR_CODES.EVENT_INVALID, 'webhook: body is not valid JSON.');
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    fail(WEBHOOK_ERROR_CODES.EVENT_INVALID, 'webhook: event must be a JSON object.');
  }
  if (typeof event.id !== 'string' || !sanitizeId(event.id) || typeof event.type !== 'string') {
    fail(WEBHOOK_ERROR_CODES.EVENT_INVALID, 'webhook: event needs a safe string id and a type.');
  }
  const object = event?.data?.object;
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    fail(WEBHOOK_ERROR_CODES.EVENT_INVALID, 'webhook: event.data.object is missing.');
  }
  return { id: event.id, type: event.type, object };
}

/* ── HTTP handlers ───────────────────────────────────────────────── */

function readRawBody(req) {
  return (async () => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
  })();
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

/**
 * Factory: POST /api/stripe-webhook handler.
 * `getWebhookSecret` is a zero-arg function returning the signing secret.
 */
export function createWebhookHandler({ getWebhookSecret, dataDir = DEFAULT_DATA_DIR, nowMs } = {}) {
  return async function handleWebhook(req, res) {
    if (req.method !== 'POST') {
      return sendJson(res, 405, {
        error: { code: ERROR_CODES.METHOD_NOT_ALLOWED, message: 'Use POST.' },
      });
    }
    try {
      const secret = getWebhookSecret();
      const rawBody = await readRawBody(req);
      verifyWebhookSignature({
        rawBody,
        signatureHeader: req.headers['stripe-signature'],
        secret,
        nowMs,
      });
      const { id: eventId, type, object } = parseEvent(rawBody);

      // Idempotency: Stripe redelivers; the second delivery is a no-op.
      if (isEventProcessed(dataDir, eventId)) {
        return sendJson(res, 200, { received: true, deduped: true, eventId });
      }

      if (type === 'payment_intent.succeeded') {
        try {
          const { packetId, receiptId } = fulfillSucceededPayment(dataDir, { id: eventId, type }, object, {
            nowMs,
          });
          markEventProcessed(dataDir, eventId, 'fulfilled');
          return sendJson(res, 200, { received: true, eventId, packetId, receiptId });
        } catch (e) {
          // Data problems (wrong amount, unknown session, gate failure):
          // record the outcome, return 200 — retrying won't fix bad data.
          // A packet is NEVER produced on these paths.
          const code = e.code || 'PACKET_FAILED';
          recordLedger(dataDir, {
            kind: 'payment_rejected',
            eventId,
            paymentIntentId: object.id,
            reason: code,
            detail: e.message,
          });
          markEventProcessed(dataDir, eventId, `rejected:${code}`);
          return sendJson(res, 200, { received: true, eventId, rejected: code });
        }
      }

      // Anything else (payment_failed, etc.): recorded, never fulfilled.
      markEventProcessed(dataDir, eventId, `ignored:${type}`);
      return sendJson(res, 200, { received: true, eventId, ignored: type });
    } catch (e) {
      if (e instanceof WebhookError) {
        const status =
          e.code === WEBHOOK_ERROR_CODES.SIGNATURE_INVALID ||
          e.code === WEBHOOK_ERROR_CODES.EVENT_INVALID
            ? 400
            : 500;
        return sendJson(res, status, { error: { code: e.code, message: e.message } });
      }
      return sendJson(res, 500, { error: { code: 'WEBHOOK_ERROR', message: 'Webhook handler error.' } });
    }
  };
}

/**
 * Factory: POST /api/checkout-session handler.
 * Captures the questionnaire answers at checkout start so the webhook can
 * find them via the payment intent's metadata.packet_id. Answers are NOT
 * validated here — the packet gates validate at generation time.
 */
export function createCheckoutSessionHandler({ dataDir = DEFAULT_DATA_DIR } = {}) {
  return async function handleCheckoutSession(req, res) {
    if (req.method !== 'POST') {
      return sendJson(res, 405, {
        error: { code: ERROR_CODES.METHOD_NOT_ALLOWED, message: 'Use POST.' },
      });
    }
    let body;
    try {
      body = JSON.parse((await readRawBody(req)) || '{}');
    } catch {
      return sendJson(res, 400, {
        error: { code: WEBHOOK_ERROR_CODES.SESSION_INVALID, message: 'Body must be valid JSON.' },
      });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(res, 400, {
        error: { code: WEBHOOK_ERROR_CODES.SESSION_INVALID, message: 'Body must be a JSON object.' },
      });
    }
    const { email, answers } = body;
    if (email !== undefined && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return sendJson(res, 400, {
        error: { code: WEBHOOK_ERROR_CODES.SESSION_INVALID, message: 'email must be a valid email address.' },
      });
    }
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return sendJson(res, 400, {
        error: {
          code: WEBHOOK_ERROR_CODES.SESSION_INVALID,
          message: 'answers must be the questionnaire answers object.',
        },
      });
    }
    const record = saveSession(dataDir, { email, answers });
    return sendJson(res, 200, { sessionId: record.sessionId });
  };
}

/**
 * Factory: GET /api/packet/:paymentIntentId handler.
 * Serves the generated printable packet as a download. 404 until a
 * signature-verified payment has produced one — the packet can never be
 * fetched before (or without) payment.
 */
export function createPacketDownloadHandler({ dataDir = DEFAULT_DATA_DIR } = {}) {
  return async function handlePacketDownload(req, res, paymentIntentId) {
    if (req.method !== 'GET') {
      return sendJson(res, 405, {
        error: { code: ERROR_CODES.METHOD_NOT_ALLOWED, message: 'Use GET.' },
      });
    }
    let html;
    try {
      html = loadPacketHtml(dataDir, paymentIntentId);
    } catch (e) {
      if (e instanceof WebhookError && e.code === WEBHOOK_ERROR_CODES.PACKET_INTEGRITY_FAILED) {
        recordLedger(dataDir, { kind: 'packet_integrity_failed', paymentIntentId });
        return sendJson(res, 502, {
          error: {
            code: e.code,
            message: e.message + ' The paid receipt is intact — ask support to re-issue the download.',
          },
        });
      }
      throw e;
    }
    if (html === null) {
      return sendJson(res, 404, {
        error: {
          code: WEBHOOK_ERROR_CODES.PACKET_NOT_READY,
          message: 'No packet for this payment yet — it is generated only after a succeeded $30 payment.',
        },
      });
    }
    recordLedger(dataDir, { kind: 'packet_downloaded', paymentIntentId });
    // paymentIntentId is allowlist-sanitized by loadPacketHtml before this
    // point — SAFE_ID permits no quotes, CR, or LF, so the interpolated
    // filename cannot inject response headers.
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="divorce-packet-${paymentIntentId}.html"`,
      ...PACKET_DOWNLOAD_HEADERS,
    });
    res.end(html);
  };
}

/* ── Combined staging server: all checkout routes in one process ─── */

/**
 * Start the full staging checkout server:
 *   POST /api/create-payment-intent (fixed $30, test-mode safe)
 *   POST /api/checkout-session      (questionnaire intake for the webhook)
 *   POST /api/stripe-webhook        (signature-verified fulfillment)
 *   GET  /api/packet/:paymentIntentId (paid packet download)
 *
 * The mutation endpoints (/api/create-payment-intent, /api/checkout-session)
 * are rate-limited per client IP (server/rate-limit.mjs): abuse there burns
 * Stripe API calls or disk writes. The webhook endpoint is NOT rate-limited —
 * Stripe retries deliveries with backoff, and a strict limiter could drop a
 * retry carrying money. The packet download sends privacy headers (no-store,
 * nosniff, no-referrer) because it is a sensitive legal document.
 *
 * The original payment-only startServer in stripe-payment-server.mjs is
 * left untouched — this is the one the end-to-end drill uses.
 */
export function startCheckoutServer({ port = 8787, env = process.env, dataDir = DEFAULT_DATA_DIR } = {}) {
  const intentHandler = createPaymentIntentHandler({ getStripeClient: () => loadStripeClient(env) });
  const webhookHandler = createWebhookHandler({
    getWebhookSecret: () => loadWebhookSecret(env),
    dataDir,
  });
  const sessionHandler = createCheckoutSessionHandler({ dataDir });
  const downloadHandler = createPacketDownloadHandler({ dataDir });
  const limiter = createRateLimiter();

  /** Per-IP rate gate for the mutation endpoints (not the webhook — see above). */
  const rateGated = (route, handler) => (req, res) => {
    const verdict = limiter.check(req, route);
    if (!verdict.allowed) {
      recordLedger(dataDir, { kind: 'rate_limited', route, retryAfterSec: verdict.retryAfterSec });
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': String(verdict.retryAfterSec),
      });
      res.end(
        JSON.stringify({
          error: {
            code: WEBHOOK_ERROR_CODES.RATE_LIMITED,
            message: 'Too many requests — slow down and try again shortly.',
          },
        })
      );
      return;
    }
    return handler(req, res);
  };

  const gatedIntentHandler = rateGated('create-payment-intent', intentHandler);
  const gatedSessionHandler = rateGated('checkout-session', sessionHandler);

  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://x').pathname;
    if (pathname === '/api/create-payment-intent') return gatedIntentHandler(req, res);
    if (pathname === '/api/stripe-webhook') return webhookHandler(req, res);
    if (pathname === '/api/checkout-session') return gatedSessionHandler(req, res);
    const packetMatch = /^\/api\/packet\/([^/]+)$/.exec(pathname);
    if (packetMatch) return downloadHandler(req, res, decodeURIComponent(packetMatch[1]));
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found.' } }));
  });
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `divorce checkout server listening on :${port} (mode=${env.STRIPE_MODE || 'test'}, data=${dataDir})`
    );
  });
  return server;
}

// `node server/stripe-webhook.mjs` -> run the full checkout server directly.
if (process.argv[1] === new URL(import.meta.url).pathname) {
  startCheckoutServer({ port: Number(process.env.PORT || 8787) });
}
