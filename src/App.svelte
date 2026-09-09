<script>
  import { t, isLoading } from "svelte-i18n";
  import NavBar from "./components/landing/NavBar.svelte";
  import HeroSection from "./components/landing/HeroSection.svelte";
  import HowItWorks from "./components/landing/HowItWorks.svelte";
  import WhoItsFor from "./components/landing/WhoItsFor.svelte";
  import PricingCard from "./components/landing/PricingCard.svelte";
  import FaqSection from "./components/landing/FaqSection.svelte";
  import DisclaimerFooter from "./components/landing/DisclaimerFooter.svelte";
  import QuestionnairePreview from "./components/questionnaire/QuestionnairePreview.svelte";

  // View router. "questionnaire" mounts the TEMPORARY presentational preview
  // (see QuestionnairePreview.svelte for the coordinator's wiring contract).
  // Once src/lib/questionnaire.js lands, the coordinator replaces the
  // preview mount with the real engine-driven flow.
  let view = $state("landing");

  /** Open the questionnaire preview and reset scroll to the top. */
  function openQuestionnaire() {
    view = "questionnaire";
    window.scrollTo({ top: 0 });
  }

  /** Return to the landing page. */
  function closeQuestionnaire() {
    view = "landing";
    window.scrollTo({ top: 0 });
  }
</script>

<!-- Dynamic Metadata Head tags managed via svelte-i18n -->
<svelte:head>
  <title>{$isLoading ? "DOGS" : $t("meta.title")}</title>
  <meta
    name="description"
    content={$isLoading ? "DOGS template" : $t("meta.description")}
  />
</svelte:head>

<main class="min-h-dvh w-full bg-[#050508] text-white relative overflow-x-clip">
  <!-- Subtle glowing background grids (hidden from print) -->
  <div
    aria-hidden="true"
    class="no-print absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,51,68,0.08),transparent_50%)] pointer-events-none"
  ></div>
  <div
    aria-hidden="true"
    class="no-print absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,51,68,0.03),transparent_50%)] pointer-events-none"
  ></div>

  {#if $isLoading}
    <!-- Loading placeholder state aligned with core theme -->
    <div class="min-h-dvh flex flex-col items-center justify-center gap-4">
      <div
        class="w-12 h-12 border-2 border-[#ff3344] border-t-transparent rounded-full animate-spin"
      ></div>
      <p
        class="text-xs font-semibold uppercase tracking-widest text-[#ff3344] animate-pulse"
      >
        Loading DOGS template...
      </p>
    </div>
  {:else if view === "questionnaire"}
    <!-- Questionnaire preview (temporary; see wiring contract in the component) -->
    <div class="no-print">
      <NavBar onstart={openQuestionnaire} />
    </div>
    <div class="relative z-10 mx-auto max-w-7xl 2xl:max-w-[90rem] px-4 sm:px-6 md:px-8 py-8 sm:py-12 md:py-14">
      <QuestionnairePreview onexit={closeQuestionnaire} />
    </div>
  {:else}
    <!-- Landing page -->
    <div class="no-print relative z-10">
      <NavBar onstart={openQuestionnaire} />
    </div>
    <div class="relative z-10">
      <HeroSection onstart={openQuestionnaire} />
      <HowItWorks />
      <WhoItsFor />
      <PricingCard onstart={openQuestionnaire} />
      <FaqSection />
    </div>
    <div class="relative z-10">
      <DisclaimerFooter />
    </div>
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
