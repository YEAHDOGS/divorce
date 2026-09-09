<script>
  /** HowItWorks — the 3-step process strip. */
  import { t } from "svelte-i18n";

  const STEPS = [
    { n: "01", titleKey: "landing.how.step1_title", bodyKey: "landing.how.step1_body" },
    { n: "02", titleKey: "landing.how.step2_title", bodyKey: "landing.how.step2_body" },
    { n: "03", titleKey: "landing.how.step3_title", bodyKey: "landing.how.step3_body" },
  ];
</script>

<section id="how" class="w-full scroll-mt-20">
  <div class="mx-auto max-w-7xl 2xl:max-w-[90rem] px-4 sm:px-6 md:px-8 py-10 sm:py-14 md:py-16 lg:py-20">
    <div class="text-center mb-6 sm:mb-8 md:mb-10">
      <h2 class="text-2xl sm:text-3xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-white tracking-tight">
        {$t("landing.how.title")}
      </h2>
      <p class="mt-2 sm:mt-3 text-xs sm:text-sm md:text-base text-neutral-500">
        {$t("landing.how.subtitle")}
      </p>
    </div>

    <ol class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
      {#each STEPS as step}
        <li class="relative p-5 sm:p-6 md:p-6 lg:p-7 bg-[#0e0e12]/60 hover:bg-[#14141a]/80 border border-white/5 hover:border-[#ff3344]/30 rounded-2xl transition-all duration-300 group">
          <span class="block text-3xl sm:text-4xl lg:text-5xl font-bold text-[#ff3344]/25 group-hover:text-[#ff3344]/50 transition-colors duration-300 mb-3 sm:mb-4" aria-hidden="true">
            {step.n}
          </span>
          <h3 class="text-sm sm:text-base lg:text-lg font-bold text-white mb-1.5 sm:mb-2 group-hover:text-[#ff3344] transition-colors duration-300">
            {$t(step.titleKey)}
          </h3>
          <p class="text-[11px] sm:text-xs lg:text-sm text-neutral-500 leading-relaxed">
            {$t(step.bodyKey)}
          </p>
        </li>
      {/each}
    </ol>
  </div>
</section>
