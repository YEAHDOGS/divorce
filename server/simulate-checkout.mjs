#!/usr/bin/env node
/**
 * simulate-checkout.mjs — drive the full $30 staging flow with ZERO Stripe involvement.
 *
 * Against a running checkout server (or with --spawn to start one), this:
 *   1. POST /api/checkout-session { email, answers }        → sessionId
 *   2. builds a payment_intent.succeeded event (pi_sim_<rand>, exactly
 *      $30.00 USD, metadata.packet_id = sessionId) and signs it with the
 *      local webhook secret, exactly like the provider would
 *   3. POST /api/stripe-webhook with the Stripe-Signature header → packetId
 *   4. GET  /api/packet/<paymentIntentId> → saves ./packet-<pi>.html
 *   5. --resend: delivers the SAME event again → proves idempotent dedupe
 *
 * Nothing here imports Stripe, reads a Stripe key, or touches any network
 * host except localhost. The secret is a local test-mode placeholder — the
 * server must run with the SAME STRIPE_WEBHOOK_SECRET value.
 *
 * Usage:
 *   node server/stripe-webhook.mjs &            # terminal 1 (or use --spawn)
 *   STRIPE_WEBHOOK_SECRET=whsec_test_local_drill_only \
 *     node server/simulate-checkout.mjs --spawn --resend
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHmac } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ── Hoisted constants ───────────────────────────────────────────── */

/** Local-drill placeholder secret. Not a real key; never use a real one here. */
const DEFAULT_DRILL_SECRET = 'whsec_test_local_drill_only';

/** Complete + eligible fixture answers (same shape as packet.test.js). */
const FIXTURE_ANSWERS = Object.freeze({
  state: 'TX',
  petitionerName: 'Alex Rivera',
  respondentName: 'Jordan Rivera',
  county: 'Tulsa',
  marriageDate: '2015-06-20',
  marriagePlace: 'Dallas, Texas',
  residency: true,
  uncontested: true,
  minorChildren: false,
  propertySplit: true,
});

const log = (msg) => console.log(`[simulate] ${msg}`);
const die = (msg) => {
  console.error(`[simulate] FATAL: ${msg}`);
  process.exit(1);
};

/* ── CLI args ────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const args = { port: 8787, email: 'buyer@example.com', spawn: false, resend: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '--email') args.email = argv[++i];
    else if (a === '--answers') args.answersFile = argv[++i];
    else if (a === '--secret') args.secret = argv[++i];
    else if (a === '--out') args.outDir = argv[++i];
    else if (a === '--spawn') args.spawn = true;
    else if (a === '--resend') args.resend = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else die(`unknown argument: ${a}`);
  }
  args.secret = args.secret || process.env.STRIPE_WEBHOOK_SECRET || DEFAULT_DRILL_SECRET;
  args.outDir = args.outDir || process.cwd();
  return args;
}

function usage() {
  console.log(`usage: node server/simulate-checkout.mjs [options]

options:
  --port <n>       checkout server port (default 8787)
  --email <addr>   buyer email for the session (default buyer@example.com)
  --answers <file> questionnaire answers JSON (default: built-in TX fixture)
  --secret <s>     webhook secret (default STRIPE_WEBHOOK_SECRET env or the
                   local drill placeholder — server must use the same value)
  --out <dir>      where to save the packet HTML (default: cwd)
  --spawn          start the checkout server as a child process for the drill
  --resend         deliver the webhook event twice to prove dedupe
  --help           this text

Drives the whole staging flow end-to-end without Stripe: session intake →
signed webhook → ledger → packet generation → download.`);
}

/* ── Flow ────────────────────────────────────────────────────────── */

async function waitForServer(base, timeoutMs = 15000) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${base}/api/checkout-session`, { method: 'OPTIONS' });
      if (res) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() - start > timeoutMs) die(`server did not come up at ${base}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const base = `http://127.0.0.1:${args.port}`;
  if (!args.secret || args.secret.length < 8) die('webhook secret is missing or too short.');

  let child = null;
  if (args.spawn) {
    log(`spawning checkout server on :${args.port} …`);
    child = spawn(process.execPath, [join(HERE, 'stripe-webhook.mjs')], {
      env: {
        ...process.env,
        PORT: String(args.port),
        STRIPE_MODE: 'test',
        STRIPE_WEBHOOK_SECRET: args.secret,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
    child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) console.error(`[simulate] server exited with code ${code}`);
    });
    await waitForServer(base);
  }

  const stop = async () => {
    if (child) {
      child.kill();
      await new Promise((r) => setTimeout(r, 500));
    }
  };
  process.on('SIGINT', () => stop().then(() => process.exit(130)));

  try {
    // 1) Checkout session intake.
    const answers = args.answersFile
      ? JSON.parse(readFileSync(args.answersFile, 'utf8'))
      : { ...FIXTURE_ANSWERS };
    log('1/4 creating checkout session …');
    const sessionRes = await fetch(`${base}/api/checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: args.email, answers }),
    });
    if (!sessionRes.ok) die(`checkout-session failed: ${sessionRes.status} ${await sessionRes.text()}`);
    const { sessionId } = await sessionRes.json();
    log(`    sessionId=${sessionId}`);

    // 2) Build + sign a payment_intent.succeeded event, exactly $30.00 USD.
    const paymentIntentId = `pi_sim_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const eventId = `evt_sim_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const intent = {
      id: paymentIntentId,
      object: 'payment_intent',
      amount: 3000,
      currency: 'usd',
      created: Math.floor(Date.now() / 1000),
      metadata: { packet_id: sessionId },
      charges: { data: [{ payment_method_details: { card: { last4: '4242' } } }] },
    };
    const event = { id: eventId, object: 'event', type: 'payment_intent.succeeded', data: { object: intent } };
    const rawBody = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', args.secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
    const signatureHeader = `t=${timestamp},v1=${sig}`;

    // 3) Deliver the webhook.
    log('2/4 delivering signed webhook …');
    const deliver = async () =>
      fetch(`${base}/api/stripe-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signatureHeader },
        body: rawBody,
      });
    const hookRes = await deliver();
    const hookJson = await hookRes.json();
    if (!hookRes.ok) die(`webhook rejected: ${hookRes.status} ${JSON.stringify(hookJson)}`);
    if (hookJson.rejected) die(`payment rejected by server: ${hookJson.rejected}`);
    log(`    fulfilled: packetId=${hookJson.packetId} receiptId=${hookJson.receiptId}`);

    if (args.resend) {
      log('3/4 re-delivering the same event (dedupe proof) …');
      const again = await deliver();
      const againJson = await again.json();
      if (againJson.deduped !== true) die(`expected deduped:true, got ${JSON.stringify(againJson)}`);
      log('    deduped:true — no double payment, no second packet');
    }

    // 4) Download the paid packet.
    const step = args.resend ? '4/4' : '3/4';
    log(`${step} downloading the paid packet …`);
    const dlRes = await fetch(`${base}/api/packet/${paymentIntentId}`);
    if (!dlRes.ok) die(`packet download failed: ${dlRes.status} ${await dlRes.text()}`);
    const html = await dlRes.text();
    const outFile = join(args.outDir, `packet-${paymentIntentId}.html`);
    writeFileSync(outFile, html, 'utf8');
    log(`    saved ${outFile} (${html.length} bytes)`);
    if (!html.includes('$30.00')) die('downloaded packet is missing the $30.00 price line');
    log('DONE — $30 staging flow complete: session → signed webhook → ledger → packet → download.');
  } finally {
    await stop();
  }
}

main().catch((e) => die(e.message || String(e)));
