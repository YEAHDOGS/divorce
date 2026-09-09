<script>
  /**
   * DisclaimerFooter — prominent legal disclaimers + site footer.
   *
   * LEGAL REVIEW: every string under "disclaimer.*" is best-effort copy from
   * the product team and must be reviewed by the legal worker before launch.
   * Do not soften or remove this panel without legal sign-off.
   */
  import { t } from "svelte-i18n";
</script>

<footer class="w-full border-t border-[#ff3344]/15 bg-[#0a0a0d]">
  <div class="mx-auto max-w-7xl 2xl:max-w-[90rem] px-4 sm:px-6 md:px-8 py-8 sm:py-10 md:py-12">
    <!-- Prominent disclaimer panel -->
    <div class="max-w-3xl lg:max-w-4xl mx-auto mb-8 sm:mb-10 p-5 sm:p-6 lg:p-8 rounded-2xl border border-[#ff3344]/30 bg-[#ff3344]/[0.05]">
      <p class="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#ff3344] mb-2 sm:mb-3">
        {$t("disclaimer.badge")}
      </p>
      <h2 class="text-lg sm:text-xl lg:text-2xl font-bold text-white mb-3 sm:mb-4">
        {$t("disclaimer.title")}
      </h2>
      <div class="flex flex-col gap-2 sm:gap-2.5 text-[11px] sm:text-xs lg:text-sm text-neutral-400 leading-relaxed">
        <p>{$t("disclaimer.not_firm")}</p>
        <p>{$t("disclaimer.not_advice")}</p>
        <p class="text-neutral-300 font-medium">{$t("disclaimer.verify")}</p>
      </div>
    </div>

    <!-- Footer line -->
    <div class="flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] sm:text-xs tracking-wider text-neutral-600">
      <p>
        &copy; {new Date().getFullYear()} {$t("app.title")}. {$t("app.footer.made_by")}
        <a href="https://wearedogs.net" target="_blank" rel="noopener noreferrer" class="hover:text-white underline transition-colors duration-300">DOGS</a>
        {$t("app.footer.for_homies")}
      </p>
      <p class="text-neutral-700">{$t("disclaimer.title")}</p>
    </div>
  </div>
</footer>
