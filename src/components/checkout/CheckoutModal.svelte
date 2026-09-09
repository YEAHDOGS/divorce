<script>
  /**
   * CheckoutModal — STRIPE TEST-MODE-ONLY checkout dialog.
   *
   * ══════════════════════════════════════════════════════════════
   *  TEST MODE ONLY. NO REAL MONEY MOVES HERE. See
   *  src/lib/payments/. The card form is a simulated input:
   *  never enter real card details. Payment goes through the
   *  provider adapter (getProvider(ACTIVE_PROVIDER_NAME)) — when
   *  Brandon picks a real provider, only payments/index.js changes.
   * ══════════════════════════════════════════════════════════════
   *
   * Flow: idle → processing (simulated 1.2s) → success (receipt) or
   * error (test decline). Emits:
   *   onsuccess(receipt) — with the provider receipt object
   *   onclose()          — when the user cancels/closes
   *
   * Props: open (bool). Logic is delegated to the payments adapter so
   * this component stays purely presentational.
   */
  import { t } from "svelte-i18n";
  import { get } from "svelte/store";
  import {
    PRODUCT,
    TEST_CARD,
    sanitizeCardDigits,
    isValidTestExpiry,
    isValidTestCvc,
    getProvider,
    ACTIVE_PROVIDER_NAME,
  } from "../../lib/payments/index.js";

  let { open = false, onsuccess = null, onclose = null } = $props();

  /** The active payment provider (today: TestProvider, test mode). */
  const provider = getProvider(ACTIVE_PROVIDER_NAME);

  let phase = $state("idle"); // idle | processing | success | error
  let receipt = $state(null);
  let errorMsg = $state("");
  let cardNumber = $state(TEST_CARD.number);
  let cardExp = $state(TEST_CARD.exp);
  let cardCvc = $state(TEST_CARD.cvc);
  /** Locale lookup outside markup (get(t) is rune-safe). */
  const tr = (key) => get(t)(key);

  /** Strip non-digits as the user types; keeps the fixture consistent. */
  function handleCardInput(e) {
    cardNumber = sanitizeCardDigits(e.currentTarget.value);
  }

  /** Reset transient state when the dialog opens. */
  function resetForOpen() {
    phase = "idle";
    receipt = null;
    errorMsg = "";
    cardNumber = TEST_CARD.number;
    cardExp = TEST_CARD.exp;
    cardCvc = TEST_CARD.cvc;
  }

  $effect(() => {
    if (open) resetForOpen();
  });

  function handlePay() {
    // Never silently default to the test card: an empty/invalid field is
    // a user error, not a payment attempt. Expiry and CVC are validated
    // too — the modal collects them, so it must reject junk in them.
    const digits = String(cardNumber).replace(/\D/g, "");
    if (digits.length < 4) {
      errorMsg = tr("checkout.card_invalid");
      phase = "error";
      return;
    }
    if (!isValidTestExpiry(cardExp)) {
      errorMsg = tr("checkout.exp_invalid");
      phase = "error";
      return;
    }
    if (!isValidTestCvc(cardCvc)) {
      errorMsg = tr("checkout.cvc_invalid");
      phase = "error";
      return;
    }
    phase = "processing";
    errorMsg = "";
    const last4 = digits.slice(-4);
    // Simulated network latency so the processing state is visible.
    setTimeout(async () => {
      try {
        const r = await provider.createPayment(PRODUCT.amountCents, PRODUCT.currency, {
          productId: PRODUCT.id,
          cardLast4: last4,
        });
        receipt = r;
        phase = "success";
      } catch (e) {
        errorMsg = e && e.message ? e.message : "";
        phase = "error";
      }
    }, 1200);
  }

  function handleContinue() {
    if (onsuccess && receipt) onsuccess(receipt);
  }

  function handleKeydown(e) {
    if (e.key === "Escape" && onclose) onclose();
  }

  const priceLabel = "$" + (PRODUCT.amountCents / 100).toFixed(0);
</script>

{#if open}
  <div
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    aria-labelledby="checkout-title"
    onkeydown={handleKeydown}
    class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6"
  >
    <button
      type="button"
      aria-label={$t("checkout.cancel")}
      onclick={onclose}
      class="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-pointer"
    ></button>

    <div
      class="no-print relative my-auto w-full max-w-sm sm:max-w-md md:max-w-lg rounded-3xl border border-white/10 bg-[#0e0e12] p-6 sm:p-8 shadow-2xl shadow-black/60"
    >
      <!-- Test-mode banner: shown whenever the active provider is in
           test mode; never removable while a test provider is active -->
      {#if provider.testMode}
        <div
          class="mb-4 sm:mb-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-center"
        >
          <p class="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-amber-300">
            {$t("checkout.test_banner")}
          </p>
        </div>
      {/if}

      {#if phase === "success" && receipt}
        <div class="text-center">
          <p class="text-2xl sm:text-3xl mb-2" aria-hidden="true">✓</p>
          <h2
            id="checkout-title"
            class="text-lg sm:text-xl md:text-2xl font-bold text-white mb-2"
          >
            {$t("checkout.success_title")}
          </h2>
          <dl class="my-4 sm:my-5 rounded-xl border border-white/10 bg-white/5 p-4 text-left">
            <div class="flex justify-between gap-4 py-1">
              <dt class="text-[11px] sm:text-xs text-neutral-500">{$t("checkout.receipt_label")}</dt>
              <dd class="text-[11px] sm:text-xs font-mono text-white break-all text-right">{receipt.id}</dd>
            </div>
            <div class="flex justify-between gap-4 py-1">
              <dt class="text-[11px] sm:text-xs text-neutral-500">{$t("checkout.amount_label")}</dt>
              <dd class="text-[11px] sm:text-xs font-bold text-white">
                ${(receipt.amount / 100).toFixed(2)} {receipt.currency.toUpperCase()}
              </dd>
            </div>
            <div class="flex justify-between gap-4 py-1">
              <dt class="text-[11px] sm:text-xs text-neutral-500">{$t("checkout.card_label")}</dt>
              <dd class="text-[11px] sm:text-xs text-white">•••• {receipt.cardLast4}</dd>
            </div>
          </dl>
          <button
            type="button"
            onclick={handleContinue}
            class="w-full px-7 py-3 rounded-full bg-[#ff3344] hover:bg-[#ff4757] text-white text-sm font-bold tracking-wide transition-colors duration-300 cursor-pointer"
          >
            {$t("checkout.continue")}
          </button>
        </div>
      {:else}
        <h2
          id="checkout-title"
          class="text-lg sm:text-xl md:text-2xl font-bold text-white mb-1"
        >
          {$t("checkout.title")}
        </h2>
        <p class="text-xs sm:text-sm text-neutral-400 mb-4 sm:mb-5">
          {$t("checkout.product_name")} · <span class="font-bold text-white">{priceLabel}</span>
          <span class="text-neutral-500"> {$t("pricing.card_period")}</span>
        </p>

        <fieldset disabled={phase === "processing"} class="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-5">
          <label class="block">
            <span class="text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-neutral-500">
              {$t("checkout.card_label")} — {$t("checkout.test_only")}
            </span>
            <input
              type="text"
              bind:value={cardNumber}
              oninput={handleCardInput}
              maxlength="19"
              inputmode="numeric"
              autocomplete="off"
              aria-label={$t("checkout.card_label")}
              class="mt-1 w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white text-sm font-mono placeholder:text-neutral-600 outline-none focus:border-[#ff3344]/50 transition-colors"
            />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-neutral-500">MM/YY</span>
              <input
                type="text"
                bind:value={cardExp}
                inputmode="numeric"
                autocomplete="off"
                class="mt-1 w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white text-sm font-mono outline-none focus:border-[#ff3344]/50 transition-colors"
              />
            </label>
            <label class="block">
              <span class="text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-neutral-500">CVC</span>
              <input
                type="text"
                bind:value={cardCvc}
                inputmode="numeric"
                autocomplete="off"
                class="mt-1 w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white text-sm font-mono outline-none focus:border-[#ff3344]/50 transition-colors"
              />
            </label>
          </div>
        </fieldset>

        {#if phase === "error"}
          <p role="alert" class="mb-3 sm:mb-4 text-xs sm:text-sm text-[#ff3344]">
            {$t("checkout.error_prefix")} {errorMsg}
          </p>
        {/if}

        <div class="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
          <button
            type="button"
            onclick={handlePay}
            disabled={phase === "processing"}
            class="flex-1 px-7 py-3 rounded-full bg-[#ff3344] hover:bg-[#ff4757] disabled:opacity-60 disabled:cursor-wait text-white text-sm font-bold tracking-wide transition-colors duration-300 cursor-pointer"
          >
            {#if phase === "processing"}
              <span class="inline-flex items-center gap-2">
                <span class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true"></span>
                {$t("checkout.processing")}
              </span>
            {:else}
              {$t("checkout.pay_button", { values: { price: priceLabel } })}
            {/if}
          </button>
          <button
            type="button"
            onclick={onclose}
            disabled={phase === "processing"}
            class="px-6 py-3 rounded-full border border-white/15 text-neutral-300 hover:text-white text-sm font-semibold transition-colors duration-300 cursor-pointer disabled:opacity-50"
          >
            {$t("checkout.cancel")}
          </button>
        </div>
        <p class="mt-3 text-center text-[10px] sm:text-xs text-neutral-600">
          {$t("checkout.unlock_note")}
        </p>
      {/if}
    </div>
  </div>
{/if}
