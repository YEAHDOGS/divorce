<script>
  /**
   * NavBar — sticky top navigation for the landing page.
   *
   * Props:
   *   onstart (() => void) | null — opens the questionnaire preview.
   */
  import { t } from "svelte-i18n";
  import LanguageSelector from "../LanguageSelector.svelte";
  import logo from "../../assets/logo.svg";

  let { onstart = null } = $props();
</script>

<header class="no-print sticky top-0 z-40 w-full bg-[#050508]/90 backdrop-blur-md border-b border-white/5">
  <div class="mx-auto max-w-7xl 2xl:max-w-[90rem] px-4 sm:px-6 md:px-8 flex items-center justify-between h-14 sm:h-16">
    <a href="#top" class="flex items-center gap-2 sm:gap-2.5 min-w-0">
      <img src={logo} alt="DOGS Logo" class="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0" />
      <span class="text-sm sm:text-base md:text-lg font-bold tracking-wider text-white truncate">
        DOGS <span class="text-[#ff3344]">{$t("app.title")}</span>
      </span>
    </a>

    <nav class="hidden md:flex items-center gap-6 lg:gap-8" aria-label="Primary">
      <a href="#how" class="text-xs lg:text-sm text-neutral-400 hover:text-white transition-colors duration-300">{$t("landing.nav.how")}</a>
      <a href="#pricing" class="text-xs lg:text-sm text-neutral-400 hover:text-white transition-colors duration-300">{$t("landing.nav.pricing")}</a>
      <a href="#faq" class="text-xs lg:text-sm text-neutral-400 hover:text-white transition-colors duration-300">{$t("landing.nav.faq")}</a>
    </nav>

    <div class="flex items-center gap-2 sm:gap-3">
      <LanguageSelector />
      <button
        type="button"
        onclick={onstart}
        class="hidden sm:inline-flex px-4 lg:px-5 py-2 rounded-full bg-[#ff3344] hover:bg-[#ff4757] text-white text-[11px] lg:text-xs font-bold tracking-wide transition-all duration-300 cursor-pointer shadow-lg shadow-[#ff3344]/20"
      >
        {$t("landing.nav.start")}
      </button>
    </div>
  </div>
</header>
