# Payment Providers

The checkout is provider-swappable. The adapter interface is documented in
`src/lib/payments/provider.js`; the active provider is `TestProvider`
(`src/lib/payments/test-provider.js`), a pure fixture that moves no money
and makes no network calls.

## The contract (one file to change later)

Checkout code (`CheckoutModal.svelte`, the questionnaire flow, the packet
unlock) goes through one entry point:

```js
import { getProvider, ACTIVE_PROVIDER_NAME } from '$lib/payments/index.js';
const provider = getProvider(ACTIVE_PROVIDER_NAME);
const receipt = await provider.createPayment(amountCents, currency, {
  productId: 'uncontested_packet',
  cardLast4, // last-4 digits only — never a PAN
});
```

Every provider exports:

| Field | Meaning |
| --- | --- |
| `name` / `displayName` / `testMode` | registry key, operator label, test flag |
| `PRODUCT` | `{ id, name, amountCents, currency }` — the one product sold |
| `createPayment(amountCents, currency, metadata)` → `Promise<Receipt>` | charge the card |
| `refund(receiptId)` → `Promise<{status:'refunded', receiptId, refundedAt}>` | refund |
| `verifyWebhook(payload, signature, secret)` | signature verification for webhooks |

`Receipt` always carries `{ id, paymentIntentId, productId, amount, currency,
cardLast4, status:'succeeded', paidAt, testMode, receiptUrl? }` — last-4 and
ids only, never a full card number. Each provider also exports an
`isValidReceipt(receipt)` the packet unlock flow calls before printing.

## Adding Stripe (or any real provider) later

1. The StripeProvider **scaffold** already exists at
   `src/lib/payments/stripe-provider.js` and is registered under `'stripe'`
   in `payments/index.js`. It is deliberately inert: `createPayment` and
   `refund` always throw `NOT_CONFIGURED`. Going live means implementing
   them against a **server-side endpoint** that holds the Stripe secret
   key — the secret must never live in this SPA. Flip `testMode` to false
   in the scaffold once that implementation exists.
2. Flip `ACTIVE_PROVIDER_NAME` to `'stripe'` in `src/lib/payments/index.js`.
3. Run the full suite: `npx vitest run` — the contract tests in
   `src/lib/payments/payments.test.js` assert every registered provider
   conforms and behaves (the stripe scaffold has its own contract block).

## Open questions for Brandon (blocking a live provider)

1. **Which provider?** Stripe is the assumed pick (test fixtures are
   Stripe-flavored), but Square / Paddle / a crypto option are all
   swappable under the same interface. Decision needed before any live
   keys are touched.
2. **Server endpoint for the secret key.** Live charges need a backend
   route that holds the Stripe secret key (Cloudflare Worker, small
   serverless function, etc.). None exists yet; the SPA must never hold
   the secret.
3. **Webhook URL.** `verifyWebhook` needs a public HTTPS endpoint for
   payment confirmations (packet unlock on real payments). No URL exists
   yet.
4. **Payout account.** Where does the $30 go? No merchant account is
   connected.
5. **Refund policy copy.** The test refund is a no-op; a real one needs
   customer-facing refund terms before we enable `refund`.

Until those are answered, the checkout stays in test mode with the
always-visible "TEST MODE — no real charge" banner.
