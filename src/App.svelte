<script>
  import { t, isLoading } from "svelte-i18n";
  import LanguageSelector from "./components/LanguageSelector.svelte";

  // Import SVG assets as static resource URLs
  import logo from "./assets/logo.svg";
  import hero from "./assets/hero.svg";

  // Constant configurations for layout metrics
  const APP_MAX_WIDTH = "max-w-7xl";
</script>

<!-- Dynamic Metadata Head tags managed via svelte-i18n -->
<svelte:head>
  <title>{$isLoading ? "DOGS" : $t("meta.title")}</title>
  <meta
    name="description"
    content={$isLoading ? "DOGS template" : $t("meta.description")}
  />
</svelte:head>

<main
  class="h-100dvh max-h-100dvh w-full flex flex-col justify-between bg-[#050508] text-white p-4 sm:p-6 md:p-8 lg:p-12 select-none overflow-hidden relative"
>
  <!-- Subtle Glowing background grids -->
  <div
    class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,51,68,0.08),transparent_50%)] pointer-events-none"
  ></div>
  <div
    class="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,51,68,0.03),transparent_50%)] pointer-events-none"
  ></div>

  {#if $isLoading}
    <!-- Loading placeholder state aligned with core theme -->
    <div class="flex-1 flex flex-col items-center justify-center gap-4">
      <div
        class="w-12 h-12 border-2 border-[#ff3344] border-t-transparent rounded-full animate-spin"
      ></div>
      <p
        class="text-xs font-semibold uppercase tracking-widest text-[#ff3344] animate-pulse"
      >
        Loading DOGS template...
      </p>
    </div>
  {:else}
    <!-- TOP NAV BAR: Puts Language Selector in primary, always-visible focus -->
    <header
      class="w-full mx-auto {APP_MAX_WIDTH} flex items-center justify-between border-b border-white/5 pb-3 sm:pb-4 z-10"
    >
      <div class="flex items-center gap-2.5 sm:gap-3">
        <img
          src={logo}
          alt="DOGS Logo"
          class="w-8 h-8 sm:w-10 sm:h-10 text-[#ff3344] object-contain transition-transform duration-500 hover:rotate-12"
        />
        <h1
          class="text-lg sm:text-xl md:text-2xl font-bold tracking-wider text-white"
        >
          {$t("app.title")}
        </h1>
      </div>
      <div>
        <LanguageSelector />
      </div>
    </header>

    <!-- CENTER BODY (Fits strictly inside viewport bounds) -->
    <div
      class="w-full mx-auto {APP_MAX_WIDTH} flex-1 flex flex-col justify-center gap-6 sm:gap-8 lg:gap-12 my-4 overflow-hidden"
    >
      <!-- HERO MATRIX GRID -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 lg:gap-12 items-center">
        <!-- Left: Text Branding & Header -->
        <div
          class="flex flex-col gap-3.5 text-center sm:text-left justify-center order-2 sm:order-1"
        >
          <!-- Tagline & Description -->
          <p
            class="text-lg sm:text-xl md:text-2xl lg:text-3xl font-light text-neutral-200 leading-snug max-w-xl"
          >
            {$t("app.tagline")}
          </p>

          <p
            class="text-[11px] sm:text-xs md:text-sm text-neutral-500 leading-relaxed max-w-md mx-auto sm:mx-0"
          >
            {$t("app.intro")}
          </p>
        </div>

        <!-- Right: Swarm Hero Vector Art (sized dynamically to prevent overflow) -->
        <div class="flex items-center justify-center order-1 sm:order-2">
          <div
            class="relative w-full max-w-[130px] sm:max-w-[180px] md:max-w-[220px] lg:max-w-[260px] aspect-square flex items-center justify-center bg-[#0e0e12]/30 border border-white/5 rounded-2xl p-3 backdrop-blur-md shadow-2xl transition-all duration-500 hover:border-[#ff3344]/20"
          >
            <div
              class="absolute inset-0 bg-radial from-[#ff3344]/5 to-transparent rounded-2xl pointer-events-none"
            ></div>
            <img
              src={hero}
              alt="DOGS Hero Artwork"
              class="w-full h-full object-contain animate-[pulse_6s_ease-in-out_infinite]"
            />
          </div>
        </div>
      </div>

      <!-- FEATURES CARD GRID SECTION -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <!-- i18n Feature Card -->
        <div
          class="p-4 bg-[#0e0e12]/60 hover:bg-[#14141a]/80 border border-white/5 hover:border-[#ff3344]/30 rounded-xl transition-all duration-300 group"
        >
          <h3
            class="text-xs sm:text-sm font-bold tracking-wide mb-1 group-hover:text-[#ff3344] transition-colors duration-300"
          >
            {$t("app.features.i18n")}
          </h3>
          <p class="text-[10px] sm:text-xs text-neutral-500 leading-relaxed">
            {$t("app.features.i18n_desc")}
          </p>
        </div>

        <!-- Responsive Layout Feature Card -->
        <div
          class="p-4 bg-[#0e0e12]/60 hover:bg-[#14141a]/80 border border-white/5 hover:border-[#ff3344]/30 rounded-xl transition-all duration-300 group"
        >
          <h3
            class="text-xs sm:text-sm font-bold tracking-wide mb-1 group-hover:text-[#ff3344] transition-colors duration-300"
          >
            {$t("app.features.responsive")}
          </h3>
          <p class="text-[10px] sm:text-xs text-neutral-500 leading-relaxed">
            {$t("app.features.responsive_desc")}
          </p>
        </div>

        <!-- Styles Feature Card -->
        <div
          class="p-4 bg-[#0e0e12]/60 hover:bg-[#14141a]/80 border border-white/5 hover:border-[#ff3344]/30 rounded-xl transition-all duration-300 group"
        >
          <h3
            class="text-xs sm:text-sm font-bold tracking-wide mb-1 group-hover:text-[#ff3344] transition-colors duration-300"
          >
            {$t("app.features.styles")}
          </h3>
          <p class="text-[10px] sm:text-xs text-neutral-500 leading-relaxed">
            {$t("app.features.styles_desc")}
          </p>
        </div>
      </div>
    </div>

    <!-- BOTTOM FOOTER -->
    <footer
      class="w-full mx-auto {APP_MAX_WIDTH} pt-3 border-t border-white/5 text-center sm:text-left z-10"
    >
      <div class="text-[10px] tracking-wider text-neutral-600 select-none">
        &copy; {new Date().getFullYear()}
        {$t("app.title")}. {$t("app.footer.made_by")}
        <a
          href="https://cptnbrando.com"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-white underline transition-colors duration-300"
          >DOGS</a
        >
      </div>
    </footer>
  {/if}
</main>

<style lang="scss">
  // Specific custom styling using standard SCSS and CSS variable maps
  @use "./styles/variables" as *;

  main {
    background-color: var(--bg-app);
    color: var(--color-text);
  }
</style>
