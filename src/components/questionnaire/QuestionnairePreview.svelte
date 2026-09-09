<script>
  /**
   * QuestionnairePreview — TEMPORARY preview mount for the presentational
   * questionnaire components, shown until the sibling engine lands.
   *
   * WIRING CONTRACT FOR THE COORDINATOR (do not invent a conflicting engine):
   *   1. Delete this file's SAMPLE_* fixtures and render the real flow:
   *        StepShell > (ProgressBar in header slot) + QuestionStep
   *      driven by src/lib/questionnaire.js.
   *   2. Engine API the components expect:
   *        - QuestionStep: { question: {title, body?, options:[{value,label,hint?}]},
   *                          value: string|null, onanswer: (v)=>void }
   *          (question labels come from the engine's "q.*" i18n keys)
   *        - ProgressBar:  { current: number, total: number }
   *        - StepShell:    { onback, oncontinue, showBack, showContinue,
   *                          continueDisabled }
   *        - EligibilityFail: { reason: string|null (engine-localized), onhome }
   *        - ReviewScreen: { sections: [{id,title,rows:[{label,value}]}], onprint? }
   *   3. Keep ALL user-facing strings in dictionaries. Never hardcode copy
   *      in the engine or in these components.
   */
  import { t } from "svelte-i18n";
  import StepShell from "./StepShell.svelte";
  import ProgressBar from "./ProgressBar.svelte";
  import QuestionStep from "./QuestionStep.svelte";
  import EligibilityFail from "./EligibilityFail.svelte";
  import ReviewScreen from "./ReviewScreen.svelte";

  let { onexit = null } = $props();

  // --- SAMPLE fixtures (preview only — the engine replaces all of this).
  // All sample copy lives in the "questionnaire.sample_*" dictionary keys.
  const SAMPLE_QUESTION = {
    title: $t("questionnaire.sample_title"),
    body: $t("questionnaire.sample_body"),
    options: [
      { value: "yes", label: $t("questionnaire.sample_yes") },
      { value: "no", label: $t("questionnaire.sample_no") },
    ],
  };
  const SAMPLE_SECTIONS = [
    {
      id: "sample",
      title: $t("questionnaire.sample_section"),
      rows: [{ label: $t("questionnaire.sample_row"), value: "—" }],
    },
  ];

  let sampleValue = $state(null);
  let previewPane = $state("question"); // "question" | "fail" | "review"
</script>

<div class="w-full">
  <div class="no-print max-w-xl sm:max-w-2xl md:max-w-2xl lg:max-w-3xl mx-auto mb-4 sm:mb-6 px-1">
    <p class="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-[#ff3344] mb-1">
      {$t("questionnaire.preview_banner")}
    </p>
    <p class="text-[11px] sm:text-xs md:text-sm text-neutral-500 leading-relaxed">
      {$t("questionnaire.preview_note")}
    </p>
    <div class="mt-3 flex flex-wrap gap-2">
      {#each ["question", "fail", "review"] as pane}
        <button
          type="button"
          onclick={() => (previewPane = pane)}
          class="px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-semibold tracking-wide border transition-all duration-300 cursor-pointer
            {previewPane === pane
              ? 'bg-[#ff3344]/15 border-[#ff3344]/40 text-white'
              : 'border-white/10 text-neutral-500 hover:text-white hover:border-white/25'}"
        >
          {pane}
        </button>
      {/each}
    </div>
  </div>

  {#if previewPane === "question"}
    <StepShell
      onback={() => {}}
      oncontinue={() => (previewPane = "review")}
      continueDisabled={sampleValue === null}
    >
      {#snippet header()}
        <ProgressBar current={2} total={8} />
      {/snippet}
      <QuestionStep question={SAMPLE_QUESTION} value={sampleValue} onanswer={(v) => (sampleValue = v)} />
    </StepShell>
  {:else if previewPane === "fail"}
    <EligibilityFail reason={null} onhome={onexit} />
  {:else}
    <ReviewScreen sections={SAMPLE_SECTIONS} />
  {/if}

  <div class="no-print text-center mt-6 sm:mt-8">
    <button
      type="button"
      onclick={onexit}
      class="text-[11px] sm:text-xs text-neutral-500 hover:text-white underline underline-offset-4 transition-colors duration-300 cursor-pointer"
    >
      {$t("questionnaire.eligibility_fail_cta")}
    </button>
  </div>
</div>
