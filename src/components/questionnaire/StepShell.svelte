<script>
  /**
   * StepShell — presentational chrome for one questionnaire step.
   *
   * Props:
   *   onback           (() => void) | null — engine's "go to previous step"
   *   oncontinue       (() => void) | null — engine's "advance to next step"
   *   showBack         (boolean) — show the back button
   *   showContinue     (boolean) — show the continue button
   *   continueDisabled (boolean) — disable continue until the step is answered
   *
   * Snippets: header (e.g. ProgressBar), children (the QuestionStep), footer (extra).
   *
   * WIRING (coordinator): connect onback/oncontinue to the engine's
   * navigation. This shell never advances on its own.
   */
  import { t } from "svelte-i18n";

  let {
    onback = null,
    oncontinue = null,
    showBack = true,
    showContinue = true,
    continueDisabled = false,
    header = null,
    children = null,
    footer = null,
  } = $props();
</script>

<div class="w-full max-w-xl sm:max-w-2xl md:max-w-2xl lg:max-w-3xl xl:max-w-3xl mx-auto">
  {#if header}
    <div class="no-print mb-4 sm:mb-6">
      {@render header()}
    </div>
  {/if}

  <div class="bg-[#0e0e12]/70 border border-white/5 rounded-2xl p-4 sm:p-6 md:p-8 shadow-2xl">
    {#if children}{@render children()}{/if}
  </div>

  <div class="no-print mt-4 sm:mt-6 flex items-center justify-between gap-3">
    {#if showBack}
      <button
        type="button"
        onclick={onback}
        disabled={!onback}
        class="px-4 sm:px-6 py-2.5 sm:py-3 rounded-full border border-white/10 text-xs sm:text-sm font-semibold tracking-wide text-neutral-300 hover:text-white hover:border-white/25 transition-all duration-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {$t("questionnaire.back")}
      </button>
    {:else}
      <span></span>
    {/if}
    {#if showContinue}
      <button
        type="button"
        onclick={oncontinue}
        disabled={continueDisabled || !oncontinue}
        class="px-6 sm:px-8 py-2.5 sm:py-3 rounded-full bg-[#ff3344] hover:bg-[#ff4757] text-white text-xs sm:text-sm font-bold tracking-wide transition-all duration-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#ff3344]/20"
      >
        {$t("questionnaire.continue")}
      </button>
    {/if}
  </div>

  {#if footer}
    <div class="no-print mt-2">
      {@render footer()}
    </div>
  {/if}
</div>
