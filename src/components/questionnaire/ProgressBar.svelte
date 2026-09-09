<script>
  /**
   * ProgressBar — presentational step progress indicator.
   *
   * Props:
   *   current (number) — 1-based index of the current step
   *   total   (number) — total number of steps
   *
   * WIRING (coordinator): the questionnaire engine should pass the engine's
   * step index and step count. No engine logic lives here.
   */
  import { t } from "svelte-i18n";

  let { current = 1, total = 1 } = $props();

  const pct = $derived(total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0);
</script>

<div class="w-full" role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={total} aria-label={$t("questionnaire.step_of", { values: { current, total } })}>
  <div class="flex items-center justify-between mb-2">
    <span class="text-[10px] sm:text-xs md:text-xs lg:text-sm font-semibold uppercase tracking-widest text-[#ff3344]">
      {$t("questionnaire.step_of", { values: { current, total } })}
    </span>
  </div>
  <div class="h-1.5 sm:h-2 w-full bg-white/5 rounded-full overflow-hidden">
    <div
      class="h-full bg-[#ff3344] rounded-full transition-[width] duration-500 ease-out"
      style="width: {pct}%"
    ></div>
  </div>
</div>
