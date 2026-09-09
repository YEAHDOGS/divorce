# Stripe Staging Checklist — $30 Divorce Packet Test Payment

Goal: one real **$30 test-mode** payment on staging that unlocks the printable
divorce packet. Nothing here touches live money — the server refuses live mode
unless you explicitly opt in.

## What you paste (2 keys, that's it)

1. Go to https://dashboard.stripe.com/test/apikeys (make sure the **Test mode** toggle is ON).
2. Copy your **Secret key** — it starts with `sk_test_`.
3. Create a file named `.env` next to this doc's repo root (same folder as `server/`):

```sh
STRIPE_MODE=test
STRIPE_TEST_SECRET_KEY=sk_test_paste_yours_here
PORT=8787
```

Never commit `.env`. Never paste a key starting with `sk_live_` here.

## Start the endpoint (one command)

```sh
node server/stripe-payment-server.mjs
```

The `stripe` npm package must be installed once on the machine that runs this:
`npm i stripe` (real dependency, official registry — safe to install).

Health check: `POST http://localhost:8787/api/create-payment-intent` with body `{}`.
Expected: `200` with `paymentIntentId`, `clientSecret`, `amountCents: 3000`.

## The $30 drill (staging)

1. Start the server as above (test mode).
2. From your frontend, POST to `/api/create-payment-intent` with:
   ```json
   { "email": "you@example.com", "packetId": "pkt_staging_1" }
   ```
   Optionally send header `Idempotency-Key: <uuid>` so retries never double-charge.
3. Use Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC.
4. Confirm the payment with the returned `clientSecret` (Stripe.js `confirmCardPayment`).
5. Verify in the [Stripe test dashboard](https://dashboard.stripe.com/test/payments):
   a payment of exactly **$30.00 USD** exists.
6. Packet unlock: the printable packet download is gated on a succeeded payment
   (see the pre-flight work on branch `jack/divorce-preflight`).

## Safety rules (built into the server)

- Amount is **fixed server-side at $30** — any `amount`/`amountCents`/`price`
  field in the request body is rejected with `AMOUNT_TAMPER` (400).
- Live keys are refused (`403 TEST_MODE_VIOLATION`) unless the environment has
  `ALLOW_LIVE_PAYMENTS=true` **and** `STRIPE_MODE=live`. Test mode is the default.
- Errors never leak Stripe internals to the client (generic 502 shape).

## What's still needed from you

- [ ] Paste `sk_test_...` into `.env` as above
- [ ] Run the drill, confirm the $30 test payment in the dashboard
- [ ] Say the word and the frontend "Pay $30" button gets wired to this endpoint
