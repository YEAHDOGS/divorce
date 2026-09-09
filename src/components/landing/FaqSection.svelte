<script>
  /** FaqSection — honest-answers accordion (native <details>, no JS state). */
  import { t } from "svelte-i18n";

  const FAQ_KEYS = ["q1", "q2", "q3", "q4", "q5", "q6"];
</script>

<section id="faq" class="w-full border-t border-white/5 scroll-mt-20">
  <div class="mx-auto max-w-7xl 2xl:max-w-[90rem] px-4 sm:px-6 md:px-8 py-10 sm:py-14 md:py-16 lg:py-20">
    <h2 class="text-2xl sm:text-3xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-white tracking-tight text-center mb-6 sm:mb-8 md:mb-10">
      {$t("faq.title")}
    </h2>

    <div class="max-w-2xl lg:max-w-3xl mx-auto flex flex-col gap-2.5 sm:gap-3">
      {#each FAQ_KEYS as q}
        <details class="group p-4 sm:p-5 lg:p-6 rounded-2xl border border-white/5 bg-[#0e0e12]/60 hover:border-[#ff3344]/25 transition-all duration-300 open:border-[#ff3344]/25">
          <summary class="flex items-center justify-between gap-4 cursor-pointer list-none text-sm sm:text-base lg:text-lg font-semibold text-white">
            <span>{$t(`faq.${q}_q`)}</span>
            <span class="shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full border border-white/10 flex items-center justify-center text-[#ff3344] text-sm transition-transform duration-300 group-open:rotate-45" aria-hidden="true">+</span>
          </summary>
          <p class="mt-2.5 sm:mt-3 text-xs sm:text-sm lg:text-sm text-neutral-400 leading-relaxed max-w-prose">
            {$t(`faq.${q}_a`)}
          </p>
        </details>
      {/each}
    </div>
  </div>
</section>

<style lang="scss">
  // Hide the native disclosure triangle; the custom "+" handles it.
  details summary::-webkit-details-marker {
    display: none;
  }
</style>
