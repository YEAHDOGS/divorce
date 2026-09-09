<script>
  /**
   * PricingCard — the $30 one-time pricing card.
   *
   * Deliberately NO checkout and NO email capture: checkout is marked
   * "early access, opening soon" and the CTA opens the free questionnaire
   * preview instead.
   *
   * Props:
   *   onstart (() => void) | null — opens the questionnaire preview.
   */
  import { t } from "svelte-i18n";

  let { onstart = null } = $props();

  const FEATURE_KEYS = ["pricing.f1", "pricing.f2", "pricing.f3", "pricing.f4"];
</script>

<section id="pricing" class="w-full scroll-mt-20">
  <div class="mx-auto max-w-7xl 2xl:max-w-[90rem] px-4 sm:px-6 md:px-8 py-10 sm:py-14 md:py-16 lg:py-20">
    <h2 class="text-2xl sm:text-3xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-white tracking-tight text-center mb-6 sm:mb-8 md:mb-10">
      {$t("pricing.title")}
    </h2>

    <div class="max-w-md sm:max-w-lg lg:max-w-xl mx-auto">
      <div class="relative p-6 sm:p-8 lg:p-10 rounded-3xl border border-[#ff3344]/25 bg-[#0e0e12]/80 shadow-2xl shadow-[#ff3344]/10 overflow-hidden">
        <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#ff3344] to-transparent" aria-hidden="true"></div>

        <p class="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">
          {$t("pricing.card_name")}
        </p>
        <div class="flex items-baseline gap-2 mb-4 sm:mb-5">
          <span class="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight">{$t("pricing.card_price")}</span>
          <span class="text-xs sm:text-sm text-neutral-500">{$t("pricing.card_period")}</span>
        </div>

        <ul class="flex flex-col gap-2.5 sm:gap-3 mb-6 sm:mb-8">
          {#each FEATURE_KEYS as key}
            <li class="flex items-start gap-2.5 text-xs sm:text-sm lg:text-sm text-neutral-300 leading-relaxed">
              <span class="mt-0.5 shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#ff3344]/10 border border-[#ff3344]/30 flex items-center justify-center text-[#ff3344] text-[10px] sm:text-xs font-bold" aria-hidden="true">✓</span>
              <span>{$t(key)}</span>
            </li>
          {/each}
        </ul>

        <button
          type="button"
          onclick={onstart}
          class="w-full px-7 py-3 sm:py-3.5 rounded-full bg-[#ff3344] hover:bg-[#ff4757] text-white text-sm sm:text-base font-bold tracking-wide transition-all duration-300 cursor-pointer shadow-xl shadow-[#ff3344]/25"
        >
          {$t("pricing.card_cta")}
        </button>
        <p class="mt-3 sm:mt-4 text-center text-[10px] sm:text-xs text-neutral-500">
          {$t("pricing.card_note")}
        </p>
      </div>

      <p class="mt-4 sm:mt-5 text-center text-[11px] sm:text-xs md:text-sm text-neutral-600 font-medium tracking-wide">
        {$t("pricing.guarantee")}
      </p>

      <p class="mt-3 sm:mt-4 mx-auto max-w-xl text-center text-[10px] sm:text-xs text-neutral-500 leading-relaxed">
        {$t("pricing.fees_note")}
      </p>
    </div>
  </div>
</section>
