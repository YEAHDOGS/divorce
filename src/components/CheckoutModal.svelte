<!--
  CheckoutModal.svelte — staging $30 checkout dialog for the divorce packet.

  Wire it anywhere a paid packet is unlocked:
    <CheckoutModal {open} providerName="test" onsuccess={...} onclose={...} />

  Props:
    open         — boolean; the dialog renders only while true.
    providerName — payments registry key; defaults to the active provider.
                   Pass 'stripe' to see the honest "not configured" path.
    onsuccess    — called with the provider receipt after a validated payment.
    onclose      — called when the user dismisses the dialog.

  Money safety:
    - STAGING ONLY while the active provider is a test provider. A
      test-mode badge says so plainly on the dialog; no real money moves.
    - The full card PAN never leaves the form fields: only the last-4
      reaches runCheckout (it rides in provider metadata).
    - The Pay button is disabled while a payment is pending — a
      double-click cannot fire two charges.
    - Failures are classified through runCheckout → classifyPaymentFailure:
      the dialog repeats its headline/detail/recovery verbatim, so the
      copy about whether money moved is always honest.
-->
<script>
  import { runCheckout } from "../lib/checkout.js";
  import {
    getProvider,
    ACTIVE_PROVIDER_NAME,
    PRODUCT,
    TEST_CARD,
    sanitizeCardDigits,
    isValidTestExpiry,
    isValidTestCvc,
  } from "../lib/payments/index.js";

  /* ── Hoisted constants ───────────────────────────────────────────── */

  /** Component UI strings (staging copy lives with the component; failure
      copy stays the single source of truth in failure-copy.js). */
  const COPY = Object.freeze({
    title: "Checkout — staging",
    productLine: "Uncontested Divorce Packet",
    badge: "STAGING — test card only · no real money moves",
    cardLabel: "Card number (test)",
    cardHint: "Use the Stripe test card — do NOT enter a real card.",
    expiryLabel: "Expiry (MM/YY)",
    cvcLabel: "CVC",
    payLabel: "Pay $30.00",
    payingLabel: "Processing…",
    cancelLabel: "Cancel",
    closeLabel: "Close checkout",
    retryLabel: "Try again",
    doneLabel: "Done",
    successTitle: "Payment complete (test)",
    successNote:
      "This was a test-mode charge — no money moved. The receipt below unlocks your printable packet.",
  });

  /** Dialog lifecycle states: idle → pending → error | success. */
  const STATE_IDLE = "idle";
  const STATE_PENDING = "pending";
  const STATE_ERROR = "error";
  const STATE_SUCCESS = "success";

  let {
    open = false,
    providerName = ACTIVE_PROVIDER_NAME,
    onsuccess = () => {},
    onclose = () => {},
  } = $props();

  /* ── Form state ──────────────────────────────────────────────────── */

  let cardNumber = $state("");
  let expiry = $state("");
  let cvc = $state("");
  let state = $state(STATE_IDLE);
  /** FailureCopy from runCheckout (kind/headline/detail/recovery/retryable/charged). */
  let failure = $state(null);
  let receipt = $state(null);

  const provider = $derived.by(() => {
    try {
      return getProvider(providerName);
    } catch {
      return null;
    }
  });

  /** The digits-only card string, grouped in fours for display. */
  function onCardInput(e) {
    cardNumber = sanitizeCardDigits(e.currentTarget.value);
  }

  const cardOk = $derived(cardNumber.replace(/\D/g, "").length === 16);
  const expiryOk = $derived(isValidTestExpiry(expiry));
  const cvcOk = $derived(isValidTestCvc(cvc));
  const formOk = $derived(cardOk && expiryOk && cvcOk);
  const canPay = $derived(state !== STATE_PENDING && formOk);

  function reset() {
    cardNumber = "";
    expiry = "";
    cvc = "";
    state = STATE_IDLE;
    failure = null;
    receipt = null;
  }

  function close() {
    reset();
    onclose();
  }

  async function pay() {
    if (!canPay) return;
    state = STATE_PENDING;
    failure = null;
    const last4 = cardNumber.replace(/\D/g, "").slice(-4);
    const result = await runCheckout({ providerName, cardLast4: last4 });
    if (result.ok) {
      receipt = result.receipt;
      state = STATE_SUCCESS;
      onsuccess(receipt);
    } else {
      failure = result.copy;
      state = STATE_ERROR;
    }
  }

  /** Enter on a field submits; the decline test card is the 0002 last-4. */
  function onKeydown(e) {
    if (e.key === "Enter" && canPay) pay();
    if (e.key === "Escape") close();
  }

  /** Pre-fill helper for the operator running the staging drill. */
  function fillTestCard() {
    cardNumber = sanitizeCardDigits(TEST_CARD.number);
    expiry = TEST_CARD.exp;
    cvc = TEST_CARD.cvc;
  }
</script>

{#if open}
  <!-- Backdrop as a real button (keyboard-dismissable, no a11y hacks needed). -->
  <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6">
    <button
      type="button"
      aria-label={COPY.closeLabel}
      class="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
      onclick={close}
    ></button>

    <!-- Dialog card: explicit viewport matrix (AGENTS.md §4). -->
    <div
      role="dialog"
      aria-modal="true"
      aria-label={COPY.title}
      class="relative w-full sm:max-w-md md:max-w-lg lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl
             max-h-full overflow-y-auto rounded-2xl border border-white/10 bg-[#0e0e12]
             p-4 sm:p-6 md:p-7 lg:p-8 2xl:p-10 shadow-2xl"
      onkeydown={onKeydown}
    >
      <!-- Header -->
      <div class="flex items-start justify-between gap-3 mb-3 sm:mb-4">
        <div>
          <h2 class="text-base sm:text-lg md:text-xl 2xl:text-2xl font-bold tracking-wide text-white">
            {COPY.title}
          </h2>
          <p class="text-xs sm:text-sm 2xl:text-base text-neutral-400 mt-0.5">
            {provider ? provider.PRODUCT.name : COPY.productLine} — $30.00
          </p>
        </div>
        <button
          type="button"
          aria-label={COPY.closeLabel}
          class="shrink-0 w-8 h-8 rounded-full border border-white/10 text-neutral-400 hover:text-white hover:border-white/30 transition-colors"
          onclick={close}
        >
          ✕
        </button>
      </div>

      <!-- Test-mode badge: always visible, always honest. -->
      <div
        class="mb-4 sm:mb-5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2
               text-[10px] sm:text-xs 2xl:text-sm font-semibold uppercase tracking-widest text-amber-300"
      >
        {COPY.badge}
      </div>

      {#if state === STATE_SUCCESS}
        <!-- Success: receipt summary, never card digits. -->
        <div class="flex flex-col gap-3 sm:gap-4">
          <p class="text-sm sm:text-base 2xl:text-lg font-semibold text-emerald-300">
            {COPY.successTitle}
          </p>
          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm 2xl:text-base">
            <div class="rounded-lg bg-white/5 p-3">
              <dt class="text-neutral-500 uppercase tracking-wider text-[10px]">Receipt</dt>
              <dd class="font-mono text-white break-all">{receipt.id}</dd>
            </div>
            <div class="rounded-lg bg-white/5 p-3">
              <dt class="text-neutral-500 uppercase tracking-wider text-[10px]">Amount</dt>
              <dd class="text-white">$30.00 USD</dd>
            </div>
            <div class="rounded-lg bg-white/5 p-3">
              <dt class="text-neutral-500 uppercase tracking-wider text-[10px]">Card</dt>
              <dd class="text-white">•••• {receipt.cardLast4} (test)</dd>
            </div>
            <div class="rounded-lg bg-white/5 p-3">
              <dt class="text-neutral-500 uppercase tracking-wider text-[10px]">Paid at</dt>
              <dd class="text-white">{new Date(receipt.paidAt).toLocaleString()}</dd>
            </div>
          </dl>
          <p class="text-[11px] sm:text-xs 2xl:text-sm text-neutral-500">{COPY.successNote}</p>
          <button
            type="button"
            class="mt-1 w-full rounded-xl bg-[#ff3344] px-4 py-3 text-sm sm:text-base font-bold text-white
                   hover:bg-[#ff5566] transition-colors"
            onclick={close}
          >
            {COPY.doneLabel}
          </button>
        </div>
      {:else}
        <!-- Card form -->
        <form
          class="flex flex-col gap-3 sm:gap-4"
          onsubmit={(e) => {
            e.preventDefault();
            pay();
          }}
        >
          <div>
            <label
              for="checkout-card"
              class="block text-[11px] sm:text-xs 2xl:text-sm font-semibold uppercase tracking-wider text-neutral-400 mb-1.5"
            >
              {COPY.cardLabel}
            </label>
            <input
              id="checkout-card"
              type="text"
              inputmode="numeric"
              autocomplete="cc-number"
              placeholder={TEST_CARD.number}
              value={cardNumber}
              oninput={onCardInput}
              disabled={state === STATE_PENDING}
              class="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 sm:py-3
                     font-mono text-sm sm:text-base 2xl:text-lg text-white placeholder:text-neutral-600
                     focus:border-[#ff3344]/60 focus:outline-none disabled:opacity-50"
            />
            <p class="mt-1 text-[10px] sm:text-xs text-neutral-500">
              {COPY.cardHint}
              <button
                type="button"
                class="underline text-neutral-400 hover:text-white"
                onclick={fillTestCard}
              >
                Fill test card
              </button>
            </p>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label
                for="checkout-expiry"
                class="block text-[11px] sm:text-xs 2xl:text-sm font-semibold uppercase tracking-wider text-neutral-400 mb-1.5"
              >
                {COPY.expiryLabel}
              </label>
              <input
                id="checkout-expiry"
                type="text"
                inputmode="numeric"
                autocomplete="cc-exp"
                placeholder="12/34"
                bind:value={expiry}
                disabled={state === STATE_PENDING}
                class="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 sm:py-3
                       font-mono text-sm sm:text-base 2xl:text-lg text-white placeholder:text-neutral-600
                       focus:border-[#ff3344]/60 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label
                for="checkout-cvc"
                class="block text-[11px] sm:text-xs 2xl:text-sm font-semibold uppercase tracking-wider text-neutral-400 mb-1.5"
              >
                {COPY.cvcLabel}
              </label>
              <input
                id="checkout-cvc"
                type="text"
                inputmode="numeric"
                autocomplete="cc-csc"
                placeholder="123"
                bind:value={cvc}
                disabled={state === STATE_PENDING}
                class="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 sm:py-3
                       font-mono text-sm sm:text-base 2xl:text-lg text-white placeholder:text-neutral-600
                       focus:border-[#ff3344]/60 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>

          {#if state === STATE_ERROR && failure}
            <!-- Honest failure copy, verbatim from runCheckout. -->
            <div
              role="alert"
              class="rounded-xl border border-red-400/30 bg-red-400/10 p-3 sm:p-4 flex flex-col gap-1.5"
            >
              <p class="text-sm sm:text-base 2xl:text-lg font-semibold text-red-200">
                {failure.headline}
              </p>
              <p class="text-xs sm:text-sm text-neutral-300">{failure.detail}</p>
              <p class="text-xs sm:text-sm text-neutral-400">{failure.recovery}</p>
              {#if failure.retryable}
                <button
                  type="button"
                  class="mt-2 self-start rounded-lg border border-red-300/40 px-3 py-1.5 text-xs sm:text-sm
                         text-red-100 hover:bg-red-400/20 transition-colors"
                  onclick={() => {
                    failure = null;
                    state = STATE_IDLE;
                  }}
                >
                  {COPY.retryLabel}
                </button>
              {/if}
            </div>
          {/if}

          <div class="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 mt-1">
            <button
              type="button"
              class="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm sm:text-base text-neutral-300
                     hover:border-white/40 hover:text-white transition-colors disabled:opacity-50"
              disabled={state === STATE_PENDING}
              onclick={close}
            >
              {COPY.cancelLabel}
            </button>
            <button
              type="submit"
              disabled={!canPay}
              class="flex-1 rounded-xl bg-[#ff3344] px-4 py-3 text-sm sm:text-base font-bold text-white
                     hover:bg-[#ff5566] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {state === STATE_PENDING ? COPY.payingLabel : COPY.payLabel}
            </button>
          </div>
        </form>
      {/if}
    </div>
  </div>
{/if}
