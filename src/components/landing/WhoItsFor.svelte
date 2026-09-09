<script>
  /** WhoItsFor — "for you" / "NOT for you" two-column fit check. */
  import { t } from "svelte-i18n";

  const FOR_KEYS = ["landing.who.for1", "landing.who.for2", "landing.who.for3"];
  const NOT_KEYS = ["landing.who.not1", "landing.who.not2", "landing.who.not3", "landing.who.not4"];
</script>

<section class="w-full border-y border-white/5 bg-white/[0.015]">
  <div class="mx-auto max-w-7xl 2xl:max-w-[90rem] px-4 sm:px-6 md:px-8 py-10 sm:py-14 md:py-16 lg:py-20">
    <h2 class="text-2xl sm:text-3xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-white tracking-tight text-center mb-6 sm:mb-8 md:mb-10">
      {$t("landing.who.title")}
    </h2>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-5 lg:gap-6 max-w-5xl mx-auto">
      <!-- For -->
      <div class="p-5 sm:p-6 lg:p-7 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04]">
        <h3 class="text-sm sm:text-base lg:text-lg font-bold text-emerald-300 mb-3 sm:mb-4">
          {$t("landing.who.for_title")}
        </h3>
        <ul class="flex flex-col gap-2.5 sm:gap-3">
          {#each FOR_KEYS as key}
            <li class="flex items-start gap-2.5 text-xs sm:text-sm lg:text-sm text-neutral-300 leading-relaxed">
              <span class="mt-0.5 shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300 text-[10px] sm:text-xs font-bold" aria-hidden="true">✓</span>
              <span>{$t(key)}</span>
            </li>
          {/each}
        </ul>
      </div>

      <!-- Not for -->
      <div class="p-5 sm:p-6 lg:p-7 rounded-2xl border border-[#ff3344]/20 bg-[#ff3344]/[0.04]">
        <h3 class="text-sm sm:text-base lg:text-lg font-bold text-[#ff3344] mb-3 sm:mb-4">
          {$t("landing.who.not_title")}
        </h3>
        <ul class="flex flex-col gap-2.5 sm:gap-3">
          {#each NOT_KEYS as key}
            <li class="flex items-start gap-2.5 text-xs sm:text-sm lg:text-sm text-neutral-300 leading-relaxed">
              <span class="mt-0.5 shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#ff3344]/10 border border-[#ff3344]/30 flex items-center justify-center text-[#ff3344] text-[10px] sm:text-xs font-bold" aria-hidden="true">✕</span>
              <span>{$t(key)}</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </div>
</section>
