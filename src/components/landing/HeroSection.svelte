<script>
  /**
   * HeroSection — landing hero: eyebrow, headline, subcopy, CTAs, price note.
   *
   * Props:
   *   onstart (() => void) | null — opens the questionnaire preview.
   */
  import { t } from "svelte-i18n";
  import hero from "../../assets/hero.svg";

  let { onstart = null } = $props();

  /** Smooth-scroll to an in-page anchor. */
  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }
</script>

<section id="top" class="relative w-full overflow-hidden">
  <div class="mx-auto max-w-7xl 2xl:max-w-[90rem] px-4 sm:px-6 md:px-8 pt-10 sm:pt-14 md:pt-16 lg:pt-20 xl:pt-24 pb-10 sm:pb-14 md:pb-16 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 lg:gap-14 items-center">
    <!-- Copy -->
    <div class="flex flex-col items-start gap-4 sm:gap-5 order-2 md:order-1">
      <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#ff3344]/30 bg-[#ff3344]/10 text-[10px] sm:text-xs md:text-xs font-semibold uppercase tracking-widest text-[#ff3344]">
        {$t("landing.hero.eyebrow")}
      </span>
      <h1 class="text-3xl sm:text-4xl md:text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl font-bold text-white leading-[1.05] tracking-tight max-w-xl">
        {$t("landing.hero.title")}
      </h1>
      <p class="text-sm sm:text-base md:text-base lg:text-lg text-neutral-400 leading-relaxed max-w-lg">
        {$t("landing.hero.subtitle")}
      </p>
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto mt-1 sm:mt-2">
        <button
          type="button"
          onclick={onstart}
          class="px-7 sm:px-8 py-3 sm:py-3.5 rounded-full bg-[#ff3344] hover:bg-[#ff4757] text-white text-sm sm:text-base font-bold tracking-wide transition-all duration-300 cursor-pointer shadow-xl shadow-[#ff3344]/25 text-center"
        >
          {$t("landing.hero.cta_primary")}
        </button>
        <button
          type="button"
          onclick={() => scrollTo("how")}
          class="px-7 sm:px-8 py-3 sm:py-3.5 rounded-full border border-white/15 hover:border-white/30 text-neutral-200 hover:text-white text-sm sm:text-base font-semibold tracking-wide transition-all duration-300 cursor-pointer text-center"
        >
          {$t("landing.hero.cta_secondary")}
        </button>
      </div>
      <p class="text-[11px] sm:text-xs md:text-sm text-neutral-500 font-medium tracking-wide">
        {$t("landing.hero.price_note")}
      </p>
    </div>

    <!-- Art -->
    <div class="flex items-center justify-center order-1 md:order-2">
      <div class="relative w-full max-w-[180px] sm:max-w-[240px] md:max-w-[280px] lg:max-w-[340px] xl:max-w-[400px] aspect-square flex items-center justify-center bg-[#0e0e12]/40 border border-white/5 rounded-3xl p-4 sm:p-6 backdrop-blur-md shadow-2xl">
        <div class="absolute inset-0 bg-radial from-[#ff3344]/10 to-transparent rounded-3xl pointer-events-none" aria-hidden="true"></div>
        <img src={hero} alt="" class="w-full h-full object-contain animate-[pulse_6s_ease-in-out_infinite]" />
      </div>
    </div>
  </div>
</section>
