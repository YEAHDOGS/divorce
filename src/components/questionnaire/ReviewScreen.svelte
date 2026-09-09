<script>
  /**
   * ReviewScreen — presentational filing-organizer review.
   *
   * Props:
   *   sections: [{ id: string, title: string, rows: [{ label, value }] }]
   *     — fully localized by the caller (engine). Empty value renders the
   *     "review_empty" placeholder for that row.
   *   onprint (() => void) | null — overrides the default window.print().
   *
   * PRINT: the section list is wrapped in `.print-area`; chrome (buttons,
   * hints) carries `.no-print` and is hidden by src/styles/print.scss.
   *
   * WIRING (coordinator): the engine builds `sections` from collected
   * answers. This component never reads the engine directly.
   */
  import { t } from "svelte-i18n";

  let { sections = [], onprint = null } = $props();

  /** Print the organizer; defaults to the browser print dialog. */
  function handlePrint() {
    if (onprint) onprint();
    else window.print();
  }
</script>

<div class="w-full max-w-2xl sm:max-w-3xl md:max-w-4xl mx-auto">
  <!-- Screen-only intro -->
  <div class="no-print text-center mb-4 sm:mb-6">
    <h2 class="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-2">
      {$t("questionnaire.review_title")}
    </h2>
    <p class="text-xs sm:text-sm md:text-base text-neutral-400 max-w-prose mx-auto">
      {$t("questionnaire.review_subtitle")}
    </p>
  </div>

  <!-- Printable organizer -->
  <div class="print-area bg-[#0e0e12]/70 border border-white/5 rounded-2xl p-4 sm:p-6 md:p-8 print:border-0 print:p-0">
    <h2 class="only-print hidden text-2xl font-bold mb-4">{$t("print.title")}</h2>
    {#if sections.length === 0}
      <p class="text-sm text-neutral-500 text-center py-8">{$t("questionnaire.review_empty")}</p>
    {:else}
      {#each sections as section (section.id)}
        <section class="mb-5 sm:mb-6 last:mb-0 print:break-inside-avoid">
          <h3 class="text-sm sm:text-base font-bold tracking-wide text-[#ff3344] uppercase mb-2 sm:mb-3 print:text-black">
            {section.title}
          </h3>
          <dl class="divide-y divide-white/5 print:divide-black/10 border-y border-white/5 print:border-black/10">
            {#each section.rows as row, i (i)}
              <div class="py-2 sm:py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-0.5 sm:gap-4">
                <dt class="text-[11px] sm:text-xs md:text-sm text-neutral-500 print:text-black/70">{row.label}</dt>
                <dd class="text-xs sm:text-sm md:text-sm text-white font-medium break-words print:text-black">
                  {row.value || $t("questionnaire.review_empty")}
                </dd>
              </div>
            {/each}
          </dl>
        </section>
      {/each}
    {/if}
  </div>

  <!-- Screen-only actions -->
  <div class="no-print mt-4 sm:mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
    <button
      type="button"
      onclick={handlePrint}
      class="w-full sm:w-auto px-8 py-3 rounded-full bg-[#ff3344] hover:bg-[#ff4757] text-white text-sm font-bold tracking-wide transition-all duration-300 cursor-pointer shadow-lg shadow-[#ff3344]/20"
    >
      {$t("print.button")}
    </button>
    <p class="text-[10px] sm:text-xs text-neutral-600">{$t("print.hint")}</p>
  </div>
</div>

<style lang="scss">
  // Screen-only: hide the print-only heading; the print stylesheet flips it.
  @media screen {
    .only-print { display: none !important; }
  }
</style>
