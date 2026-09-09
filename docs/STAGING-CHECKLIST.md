# Divorce — Money Milestone Staging Checklist

Goal: a real **$30 test payment on staging** that produces a **printable divorce packet**.

Staging: `https://yeahdogs.github.io/divorce/` (`gh-pages` branch, staging only —
production promotion goes through PR + Brando).

## Pipeline (all local/SPA today)

```
questionnaire (10 steps, complete + eligible)
  → TestProvider.createPayment($30.00 USD)   [simulated, zero network]
  → receipt validated (rcpt_test_*)
  → buildPacket(provider, receipt, answers)  [THROWS on unpaid/ineligible]
  → DivorcePacket.svelte (on-screen, print CSS)
  → Download → packetToPrintableHtml() (standalone HTML file, escaped)
```

## ✅ Done

- [x] Packet assembly lib (`src/lib/packet.js`): `buildPacket` throws `PACKET_UNPAID`
      on missing/invalid receipt and `QUESTIONNAIRE_INCOMPLETE` on incomplete/
      ineligible answers. 13 tests.
- [x] Printable HTML download (`packetToPrintableHtml`): standalone document,
      every section, all user input escaped (XSS-tested), signature lines,
      clerk-verification disclaimer. No PAN or secrets in packet or HTML.
- [x] On-screen packet view (`DivorcePacket.svelte`): payment block
      (receipt, `$30.00 USD` price-paid, last4, paid-on, provider), parties,
      marriage, filing, attestations, checklist, signatures, disclaimer;
      print button (defaults to `window.print`), download button, back link,
      TEST MODE badge. 12 component tests.
- [x] Webhook signature verification harness (HMAC-SHA256, constant-time
      compare, timestamp replay guard) — ready for the day a server endpoint
      exists. 15 tests.
- [x] Stripe provider scaffold: inert, contract-tested, can never unlock a
      packet until wired to a real endpoint.
- [x] Checkout modal: test-card validation (4242…, `0002` declines), success
      wires receipt → packet page.
- [x] Spanish dictionary parity (en/es packet keys verified).
- [x] Smoke test: questionnaire → payment → packet end-to-end (TX + OK).

## 🔲 Remaining — real $30 test payment on staging

These need Brando; nothing below can move without him.

1. [ ] **Stripe test-mode keys.** Stripe test publishable + secret keys
      (test mode only — no real money). Secret lives server-side only,
      never in the SPA.
2. [ ] **Server-side `create-payment-intent` endpoint** (the secret key's
      home; e.g. a tiny Cloudflare Worker — free tier). SPA calls it,
      Stripe returns `client_secret`, SPA calls `confirmCardPayment`.
3. [ ] **Wire StripeProvider to the endpoint**, flip `ACTIVE_PROVIDER_NAME`.
      The modal and packet flow stay untouched (adapter contract).
4. [ ] **Deploy to staging, run the real test:** walk the questionnaire on
      `yeahdogs.github.io/divorce`, pay $30 in Stripe TEST mode, verify
      the receipt → packet → printable download works with a real
      (non-simulated) receipt.
5. [ ] **Refund the test payment** and confirm the packet-revocation story
      (refund ≠ packet invalidation today — decide the policy).

## Security notes (re-check every run)

- No real secrets/keys in this repo (grep: only fixtures and `*_secret_test_fixture`
  strings). Last verified 2026-09-09.
- Test provider is inert by design: `verifyWebhook` returns unsupported,
  `STRIPE_PROVIDER.isValidReceipt` rejects everything.
- Legal: app is a paperwork tool, not a law firm — disclaimers print with
  every packet. See LEGAL.md.
