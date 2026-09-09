<script>
  /**
   * QuestionStep — presentational single question renderer.
   *
   * Props:
   *   question: {
   *     title: string,                       // question heading
   *     body?: string,                        // optional explainer
   *     options: [{ value, label, hint? }]    // answer choices
   *   }
   *   value    (string | null) — currently selected option value
   *   onanswer ((value: string) => void) — called when an option is picked
   *
   * WIRING (coordinator): the engine builds `question` from its step
   * definitions (labels under the sibling's "q.*" i18n keys) and passes the
   * stored answer as `value`. Selection state lives in the engine; this
   * component only reports picks via `onanswer`. Do NOT add engine logic here.
   */
  let { question, value = null, onanswer = null } = $props();
</script>

<fieldset>
  <legend class="text-lg sm:text-xl md:text-2xl font-bold text-white leading-snug mb-2">
    {question.title}
  </legend>
  {#if question.body}
    <p class="text-xs sm:text-sm md:text-sm text-neutral-400 leading-relaxed mb-4 sm:mb-6 max-w-prose">
      {question.body}
    </p>
  {/if}

  <div class="flex flex-col gap-2.5 sm:gap-3" role="radiogroup" aria-label={question.title}>
    {#each question.options as option (option.value)}
      <button
        type="button"
        role="radio"
        aria-checked={value === option.value}
        onclick={() => onanswer?.(option.value)}
        class="w-full text-left px-4 sm:px-5 py-3 sm:py-4 rounded-xl border transition-all duration-300 cursor-pointer
          {value === option.value
            ? 'border-[#ff3344] bg-[#ff3344]/10 text-white shadow-lg shadow-[#ff3344]/10'
            : 'border-white/10 bg-white/[0.02] text-neutral-300 hover:border-white/25 hover:text-white hover:bg-white/[0.04]'}"
      >
        <span class="block text-sm sm:text-base font-semibold tracking-wide">{option.label}</span>
        {#if option.hint}
          <span class="block text-[11px] sm:text-xs text-neutral-500 mt-1 leading-relaxed">{option.hint}</span>
        {/if}
      </button>
    {/each}
  </div>
</fieldset>
