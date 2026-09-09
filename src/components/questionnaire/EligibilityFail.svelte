<script>
  /**
   * EligibilityFail — presentational dead-end screen when the engine rules
   * the user out (contested, minor children, out-of-state, etc.).
   *
   * Props:
   *   reason ((string) | null) — optional engine-supplied reason, shown
   *     verbatim below the standard copy. Must already be localized by the
   *     engine (sibling's "q.*" keys) — never hardcode reason text here.
   *   onhome (() => void) | null — returns to the landing page.
   *
   * WIRING (coordinator): the engine decides WHEN to show this; pass its
   * localized disqualification reason as `reason`.
   */
  import { t } from "svelte-i18n";

  let { reason = null, onhome = null } = $props();
</script>

<div class="w-full max-w-xl sm:max-w-2xl mx-auto text-center">
  <div class="bg-[#0e0e12]/70 border border-[#ff3344]/20 rounded-2xl p-6 sm:p-8 md:p-10 shadow-2xl">
    <div class="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-4 rounded-full bg-[#ff3344]/10 border border-[#ff3344]/30 flex items-center justify-center">
      <span class="text-[#ff3344] text-xl sm:text-2xl font-bold" aria-hidden="true">!</span>
    </div>
    <h2 class="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-3">
      {$t("questionnaire.eligibility_fail_title")}
    </h2>
    <p class="text-xs sm:text-sm md:text-base text-neutral-400 leading-relaxed max-w-prose mx-auto">
      {$t("questionnaire.eligibility_fail_body")}
    </p>
    {#if reason}
      <p class="mt-4 text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-prose mx-auto border-t border-white/5 pt-4">
        {reason}
      </p>
    {/if}
    <button
      type="button"
      onclick={onhome}
      class="no-print mt-6 sm:mt-8 px-6 sm:px-8 py-2.5 sm:py-3 rounded-full bg-[#ff3344] hover:bg-[#ff4757] text-white text-xs sm:text-sm font-bold tracking-wide transition-all duration-300 cursor-pointer shadow-lg shadow-[#ff3344]/20"
    >
      {$t("questionnaire.eligibility_fail_cta")}
    </button>
  </div>
</div>
