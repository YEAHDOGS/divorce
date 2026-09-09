<script>
  /**
   * QuestionnaireFlow — the real engine-driven questionnaire.
   *
   * Drives src/lib/questionnaire.js (createSession) through the presentational
   * set: StepShell + ProgressBar + QuestionStep for SELECT/YESNO steps,
   * a native text/date input for TEXT/DATE steps, EligibilityFail when the
   * engine rules the user out, and ReviewScreen with the printable filing
   * organizer when complete. All copy comes from the dictionaries.
   */
  import { t } from "svelte-i18n";
  import { get } from "svelte/store";
  import {
    createSession,
    STEP_KIND,
    SUPPORTED_STATES,
    buildOrganizer,
  } from "../../lib/questionnaire.js";
  import StepShell from "./StepShell.svelte";
  import ProgressBar from "./ProgressBar.svelte";
  import QuestionStep from "./QuestionStep.svelte";
  import EligibilityFail from "./EligibilityFail.svelte";
  import ReviewScreen from "./ReviewScreen.svelte";
  import CheckoutModal from "../checkout/CheckoutModal.svelte";
  import DivorcePacket from "../packet/DivorcePacket.svelte";
  import { getProvider, ACTIVE_PROVIDER_NAME } from "../../lib/payments/index.js";
  import { buildPacket, downloadPacketHtml } from "../../lib/packet.js";

  let { onexit = null } = $props();

  /** Locale lookup outside markup (get(t) is rune-safe). */
  const tr = (key) => get(t)(key);

  let session = createSession();

  // UI mirror of engine state; refreshed via sync() after every action.
  let step = $state(session.currentStep);
  let status = $state(session.status);
  let progress = $state(session.progress);
  let answers = $state(session.answers);
  let reasons = $state(session.ineligibilityReasons);
  let inputValue = $state("");
  let errorKey = $state(null);

  // Payment state: the receipt appears after the $30 payment succeeds;
  // the printable organizer stays free to preview, and a valid receipt
  // assembles the paid DivorcePacket the customer downloads/prints.
  let receipt = $state(null);
  let packet = $state(null);
  let packetView = $state(true);
  let checkoutOpen = $state(false);

  /** The active payment provider (today: TestProvider, test mode). */
  const provider = getProvider(ACTIVE_PROVIDER_NAME);

  /**
   * Checkout-success wiring: the modal hands back a provider receipt.
   * Accept it only through the adapter's validator, then assemble the
   * paid packet. A valid receipt with an unbuildable packet (shouldn't
   * happen) falls back to the pre-payment print path — the user is never
   * stranded after paying.
   */
  function handleCheckoutSuccess(r) {
    if (provider.isValidReceipt(r)) {
      receipt = r;
      try {
        packet = buildPacket(provider, r, session.answers);
      } catch {
        packet = null;
      }
      packetView = true;
    }
    checkoutOpen = false;
  }

  /** Download the assembled packet as a standalone printable HTML file. */
  function handleDownloadPacket() {
    if (packet) downloadPacketHtml(packet);
  }

  function sync() {
    step = session.currentStep;
    status = session.status;
    progress = session.progress;
    answers = session.answers;
    reasons = session.ineligibilityReasons;
    errorKey = null;
    const prior = step ? answers[step.id] : undefined;
    inputValue = prior === undefined || prior === null ? "" : String(prior);
  }

  const isTextStep = () =>
    !!step && (step.kind === STEP_KIND.TEXT || step.kind === STEP_KIND.DATE);

  function optionsFor(s) {
    if (s.kind === STEP_KIND.SELECT) {
      return SUPPORTED_STATES.map((v) => ({
        value: v,
        label: tr(`q.state.option_${v.toLowerCase()}`),
      }));
    }
    return [
      { value: true, label: tr("q.yes") },
      { value: false, label: tr("q.no") },
    ];
  }

  function submitAnswer(value) {
    const res = session.answer(value);
    if (!res.ok) {
      errorKey = res.error;
      return;
    }
    sync();
  }

  function handleBack() {
    session.back();
    sync();
  }

  function handleStartOver() {
    session.reset();
    receipt = null;
    packet = null;
    packetView = true;
    sync();
  }

  /** Build ReviewScreen sections from the finished organizer. */
  function buildSections() {
    const org = buildOrganizer(session.answers);
    const parties = {
      id: "parties",
      title: tr("q.organizer.parties_title"),
      rows: [
        { label: tr("q.petitionerName.question"), value: org.parties.petitioner },
        { label: tr("q.respondentName.question"), value: org.parties.respondent },
        { label: tr("q.marriageDate.question"), value: org.marriage.date },
        { label: tr("q.marriagePlace.question"), value: org.marriage.place },
        { label: tr("q.county.question"), value: org.filing.county },
        { label: tr("q.state.question"), value: org.stateName },
      ],
    };
    // Every yes/no answer becomes a printed statement — nothing the user
    // told us is dropped from the packet.
    const yn = (value) => tr(value ? "q.yes" : "q.no");
    const attestations = {
      id: "attestations",
      title: tr("q.organizer.attestations_title"),
      rows: [
        { label: tr("q.residency.question"), value: yn(org.attestations.residency) },
        { label: tr("q.uncontested.question"), value: yn(org.attestations.uncontested) },
        { label: tr("q.minorChildren.question"), value: yn(!org.attestations.noMinorChildren) },
        { label: tr("q.propertySplit.question"), value: yn(org.attestations.propertySplit) },
      ],
    };
    const checklist = {
      id: "checklist",
      title: tr("q.organizer.checklist_title"),
      rows: org.checklist.map((item) => ({
        label: tr(item.titleKey),
        value: tr(item.detailKey),
      })),
    };
    return [parties, attestations, checklist];
  }
</script>

<div class="w-full">
  {#if status === "ineligible"}
    <EligibilityFail
      reason={reasons.length > 0 ? tr(`q.reasons.${reasons[0]}`) : null}
      onhome={onexit}
    />
  {:else if status === "complete"}
    {#if packet && packetView}
      <!-- Paid packet page: the deliverable. Print + download live here. -->
      <DivorcePacket
        {packet}
        ondownload={handleDownloadPacket}
        onback={() => (packetView = false)}
      />
    {:else}
      {@const sections = buildSections()}
      <!-- Legal banner prints WITH the organizer -->
      <div
        class="max-w-2xl sm:max-w-3xl md:max-w-4xl mx-auto mb-4 sm:mb-6 px-4 sm:px-5 py-3 sm:py-4 rounded-xl border border-[#ff3344]/25 bg-[#ff3344]/5"
      >
        <p class="text-[11px] sm:text-xs md:text-sm text-neutral-300 leading-relaxed">
          <span class="font-bold text-white">{$t("disclaimer.title")}</span>
          {$t("print_banner.organizer")}
        </p>
      </div>
      <ReviewScreen {sections} />

      <!-- $30 checkout: receipt unlocks the printable packet page. -->
      <div class="no-print max-w-2xl sm:max-w-3xl md:max-w-4xl mx-auto mt-6 sm:mt-8">
        {#if receipt}
          <div
            class="rounded-2xl border border-emerald-400/25 bg-emerald-400/5 px-5 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div class="min-w-0">
              <p class="text-xs sm:text-sm font-bold uppercase tracking-widest text-emerald-300 mb-1">
                {$t("checkout.paid_badge")}
              </p>
              <p class="text-[11px] sm:text-xs text-neutral-400 font-mono break-all">
                {$t("checkout.receipt_label")}: {receipt.id} · {receipt.cardLast4}
              </p>
            </div>
            {#if packet}
              <button
                type="button"
                onclick={() => (packetView = true)}
                class="shrink-0 px-7 py-3 rounded-full bg-[#ff3344] hover:bg-[#ff4757] text-white text-sm font-bold tracking-wide transition-colors duration-300 cursor-pointer"
              >
                {$t("checkout.continue")}
              </button>
            {:else}
              <button
                type="button"
                onclick={() => window.print()}
                class="shrink-0 px-7 py-3 rounded-full bg-[#ff3344] hover:bg-[#ff4757] text-white text-sm font-bold tracking-wide transition-colors duration-300 cursor-pointer"
              >
                {$t("checkout.print_packet")}
              </button>
            {/if}
          </div>
        {:else}
          <div class="rounded-2xl border border-amber-400/25 bg-amber-400/5 px-5 sm:px-6 py-5 sm:py-6 text-center">
            <button
              type="button"
              onclick={() => (checkoutOpen = true)}
              class="w-full sm:w-auto px-8 py-3.5 rounded-full bg-[#ff3344] hover:bg-[#ff4757] text-white text-sm sm:text-base font-bold tracking-wide transition-colors duration-300 cursor-pointer shadow-lg shadow-[#ff3344]/20"
            >
              {$t("checkout.unlock_cta")}
            </button>
            <p class="mt-2.5 text-[10px] sm:text-xs text-neutral-500">
              {$t("checkout.unlock_note")}
            </p>
          </div>
        {/if}
      </div>
    {/if}
    <CheckoutModal
      open={checkoutOpen}
      onsuccess={handleCheckoutSuccess}
      onclose={() => (checkoutOpen = false)}
    />

    <div class="no-print text-center mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
      <button
        type="button"
        onclick={handleStartOver}
        class="text-[11px] sm:text-xs text-neutral-500 hover:text-white underline underline-offset-4 transition-colors duration-300 cursor-pointer"
      >
        {$t("q.start_over")}
      </button>
      <button
        type="button"
        onclick={onexit}
        class="text-[11px] sm:text-xs text-neutral-500 hover:text-white underline underline-offset-4 transition-colors duration-300 cursor-pointer"
      >
        {$t("questionnaire.eligibility_fail_cta")}
      </button>
    </div>
  {:else if step}
    <StepShell
      onback={handleBack}
      oncontinue={() => isTextStep() && submitAnswer(inputValue)}
      showBack={progress.current > 1}
      showContinue={isTextStep()}
      continueDisabled={false}
    >
      {#snippet header()}
        <ProgressBar current={progress.current} total={progress.total} />
      {/snippet}

      {#if isTextStep()}
        <fieldset>
          <legend class="text-lg sm:text-xl md:text-2xl font-bold text-white leading-snug mb-2">
            {$t(step.questionKey)}
          </legend>
          <input
            type={step.kind === STEP_KIND.DATE ? "date" : "text"}
            bind:value={inputValue}
            maxlength="120"
            aria-label={$t(step.questionKey)}
            class="w-full px-4 sm:px-5 py-3 sm:py-4 rounded-xl border border-white/10 bg-white/5 text-white text-sm sm:text-base placeholder:text-neutral-600 outline-none focus:border-[#ff3344]/50 transition-colors duration-300"
            onkeydown={(e) => e.key === "Enter" && submitAnswer(inputValue)}
          />
          {#if errorKey}
            <p role="alert" class="mt-2 text-xs sm:text-sm text-[#ff3344]">{$t(errorKey)}</p>
          {/if}
        </fieldset>
      {:else}
        <QuestionStep
          question={{
            title: $t(step.questionKey),
            body: step.id === "residency" ? $t("eligibility.residency_unsure") : undefined,
            options: optionsFor(step),
          }}
          value={answers[step.id] ?? null}
          onanswer={(v) => submitAnswer(v)}
        />
        {#if errorKey}
          <p role="alert" class="mt-2 text-xs sm:text-sm text-[#ff3344]">{$t(errorKey)}</p>
        {/if}
      {/if}
    </StepShell>

    <div class="no-print text-center mt-6 sm:mt-8">
      <button
        type="button"
        onclick={onexit}
        class="text-[11px] sm:text-xs text-neutral-500 hover:text-white underline underline-offset-4 transition-colors duration-300 cursor-pointer"
      >
        {$t("questionnaire.eligibility_fail_cta")}
      </button>
    </div>
  {/if}
</div>
