<script>
  /**
   * DivorcePacket — the printable divorce packet the customer gets AFTER
   * payment. Purely presentational: every value comes from the `packet`
   * prop (assembled by src/lib/packet.js buildPacket), every label from
   * the dictionaries. Buttons carry .no-print; the document itself is
   * wrapped in .print-area so src/styles/print.scss flips it to clean
   * black-on-white paper.
   *
   * Props:
   *   packet   — buildPacket() output (parties, marriage, filing,
   *              attestations, checklist, payment block, disclaimer)
   *   onprint  (() => void) | null — defaults to window.print()
   *   ondownload (() => void) | null
   *   onback   (() => void) | null — return to the organizer preview
   */
  import { t } from "svelte-i18n";

  let { packet = null, onprint = null, ondownload = null, onback = null } = $props();

  const yn = (value) => (value ? $t("q.yes") : $t("q.no"));

  function handlePrint() {
    if (onprint) onprint();
    else window.print();
  }

  function handleDownload() {
    if (ondownload) ondownload();
  }

  /** Paid amount line — derived so it tracks the packet prop reactively. */
  const pricePaid = $derived(
    packet ? `$${(packet.payment.amountCents / 100).toFixed(2)} ${String(packet.payment.currency).toUpperCase()}` : ""
  );
</script>

{#if packet}
  <div class="w-full max-w-2xl sm:max-w-3xl md:max-w-4xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto px-4 sm:px-5 md:px-6">
    <!-- Screen-only success header -->
    <div class="no-print text-center mb-4 sm:mb-6 md:mb-8">
      {#if packet.payment.testMode}
        <p
          class="inline-block mb-2 sm:mb-3 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 sm:px-4 py-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-amber-300"
        >
          {$t("packet.test_badge")}
        </p>
      {/if}
      <h2 class="text-xl sm:text-2xl md:text-3xl xl:text-4xl font-bold text-white mb-1.5 sm:mb-2">
        {$t("packet.title")}
      </h2>
      <p class="text-xs sm:text-sm md:text-base text-neutral-400 max-w-prose mx-auto">
        {$t("packet.success_sub")}
      </p>
    </div>

    <!-- Printable packet document -->
    <div
      class="print-area bg-[#0e0e12]/70 border border-white/5 rounded-2xl p-4 sm:p-6 md:p-8 xl:p-10 print:border-0 print:p-0"
    >
      <h2 class="only-print hidden text-2xl font-bold mb-1">{$t("packet.heading")}</h2>
      <p class="only-print hidden text-xs text-neutral-600 mb-6 print:text-black/60">
        {packet.packetId} · {$t("print.title")}
      </p>

      <!-- Payment receipt block -->
      <section class="mb-5 sm:mb-6 md:mb-8 print:break-inside-avoid">
        <h3
          class="text-sm sm:text-base md:text-lg font-bold tracking-wide text-[#ff3344] uppercase mb-2 sm:mb-3 print:text-black"
        >
          {$t("packet.payment_title")}
        </h3>
        <dl
          class="divide-y divide-white/5 print:divide-black/10 border-y border-white/5 print:border-black/10"
        >
          <div
            class="py-2 sm:py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-0.5 sm:gap-4"
          >
            <dt class="text-[11px] sm:text-xs md:text-sm text-neutral-500 print:text-black/70">
              {$t("packet.receipt_label")}
            </dt>
            <dd
              class="text-xs sm:text-sm text-white font-mono break-all print:text-black"
            >
              {packet.payment.receiptId}
            </dd>
          </div>
          <div
            class="py-2 sm:py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-0.5 sm:gap-4"
          >
            <dt class="text-[11px] sm:text-xs md:text-sm text-neutral-500 print:text-black/70">
              {$t("packet.amount_label")}
            </dt>
            <dd class="text-xs sm:text-sm text-white font-bold print:text-black">{pricePaid}</dd>
          </div>
          <div
            class="py-2 sm:py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-0.5 sm:gap-4"
          >
            <dt class="text-[11px] sm:text-xs md:text-sm text-neutral-500 print:text-black/70">
              {$t("packet.card_label")}
            </dt>
            <dd class="text-xs sm:text-sm text-white print:text-black">
              •••• {packet.payment.cardLast4}
            </dd>
          </div>
          <div
            class="py-2 sm:py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-0.5 sm:gap-4"
          >
            <dt class="text-[11px] sm:text-xs md:text-sm text-neutral-500 print:text-black/70">
              {$t("packet.paid_on_label")}
            </dt>
            <dd class="text-xs sm:text-sm text-white print:text-black">
              {new Date(packet.payment.paidAt).toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </section>

      <!-- Parties -->
      <section class="mb-5 sm:mb-6 md:mb-8 print:break-inside-avoid">
        <h3
          class="text-sm sm:text-base md:text-lg font-bold tracking-wide text-[#ff3344] uppercase mb-2 sm:mb-3 print:text-black"
        >
          {$t("packet.parties_title")}
        </h3>
        <dl
          class="divide-y divide-white/5 print:divide-black/10 border-y border-white/5 print:border-black/10"
        >
          <div
            class="py-2 sm:py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-0.5 sm:gap-4"
          >
            <dt class="text-[11px] sm:text-xs md:text-sm text-neutral-500 print:text-black/70">
              {$t("packet.petitioner_label")}
            </dt>
            <dd class="text-xs sm:text-sm md:text-base text-white font-medium break-words print:text-black">
              {packet.parties.petitioner}
            </dd>
          </div>
          <div
            class="py-2 sm:py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-0.5 sm:gap-4"
          >
            <dt class="text-[11px] sm:text-xs md:text-sm text-neutral-500 print:text-black/70">
              {$t("packet.respondent_label")}
            </dt>
            <dd class="text-xs sm:text-sm md:text-base text-white font-medium break-words print:text-black">
              {packet.parties.respondent}
            </dd>
          </div>
        </dl>
      </section>

      <!-- Marriage facts -->
      <section class="mb-5 sm:mb-6 md:mb-8 print:break-inside-avoid">
        <h3
          class="text-sm sm:text-base md:text-lg font-bold tracking-wide text-[#ff3344] uppercase mb-2 sm:mb-3 print:text-black"
        >
          {$t("packet.marriage_title")}
        </h3>
        <dl
          class="divide-y divide-white/5 print:divide-black/10 border-y border-white/5 print:border-black/10"
        >
          <div
            class="py-2 sm:py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-0.5 sm:gap-4"
          >
            <dt class="text-[11px] sm:text-xs md:text-sm text-neutral-500 print:text-black/70">
              {$t("packet.marriage_date_label")}
            </dt>
            <dd class="text-xs sm:text-sm text-white print:text-black">{packet.marriage.date}</dd>
          </div>
          <div
            class="py-2 sm:py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-0.5 sm:gap-4"
          >
            <dt class="text-[11px] sm:text-xs md:text-sm text-neutral-500 print:text-black/70">
              {$t("packet.marriage_place_label")}
            </dt>
            <dd class="text-xs sm:text-sm text-white break-words print:text-black">
              {packet.marriage.place}
            </dd>
          </div>
        </dl>
      </section>

      <!-- Filing target -->
      <section class="mb-5 sm:mb-6 md:mb-8 print:break-inside-avoid">
        <h3
          class="text-sm sm:text-base md:text-lg font-bold tracking-wide text-[#ff3344] uppercase mb-2 sm:mb-3 print:text-black"
        >
          {$t("packet.filing_title")}
        </h3>
        <dl
          class="divide-y divide-white/5 print:divide-black/10 border-y border-white/5 print:border-black/10"
        >
          <div
            class="py-2 sm:py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-0.5 sm:gap-4"
          >
            <dt class="text-[11px] sm:text-xs md:text-sm text-neutral-500 print:text-black/70">
              {$t("packet.state_label")}
            </dt>
            <dd class="text-xs sm:text-sm text-white print:text-black">{packet.stateName}</dd>
          </div>
          <div
            class="py-2 sm:py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-0.5 sm:gap-4"
          >
            <dt class="text-[11px] sm:text-xs md:text-sm text-neutral-500 print:text-black/70">
              {$t("packet.county_label")}
            </dt>
            <dd class="text-xs sm:text-sm text-white print:text-black">{packet.filing.county}</dd>
          </div>
          <div
            class="py-2 sm:py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-0.5 sm:gap-4"
          >
            <dt class="text-[11px] sm:text-xs md:text-sm text-neutral-500 print:text-black/70">
              {$t("packet.court_label")}
            </dt>
            <dd class="text-xs sm:text-sm text-white break-words print:text-black">
              {packet.filing.court}
            </dd>
          </div>
        </dl>
      </section>

      <!-- Attestations -->
      <section class="mb-5 sm:mb-6 md:mb-8 print:break-inside-avoid">
        <h3
          class="text-sm sm:text-base md:text-lg font-bold tracking-wide text-[#ff3344] uppercase mb-2 sm:mb-3 print:text-black"
        >
          {$t("packet.attestations_title")}
        </h3>
        <dl
          class="divide-y divide-white/5 print:divide-black/10 border-y border-white/5 print:border-black/10"
        >
          {#each [
            [$t("packet.residency_label"), yn(packet.attestations.residency)],
            [$t("packet.uncontested_label"), yn(packet.attestations.uncontested)],
            [$t("packet.no_minor_children_label"), yn(packet.attestations.noMinorChildren)],
            [$t("packet.property_split_label"), yn(packet.attestations.propertySplit)],
          ] as [label, value], i (i)}
            <div
              class="py-2 sm:py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-0.5 sm:gap-4"
            >
              <dt class="text-[11px] sm:text-xs md:text-sm text-neutral-500 print:text-black/70">
                {label}
              </dt>
              <dd class="text-xs sm:text-sm text-white font-medium print:text-black">{value}</dd>
            </div>
          {/each}
        </dl>
      </section>

      <!-- Filing checklist -->
      <section class="mb-5 sm:mb-6 md:mb-8 print:break-inside-avoid">
        <h3
          class="text-sm sm:text-base md:text-lg font-bold tracking-wide text-[#ff3344] uppercase mb-2 sm:mb-3 print:text-black"
        >
          {$t("packet.checklist_title")}
        </h3>
        <ol class="list-decimal pl-5 sm:pl-6 space-y-2 sm:space-y-2.5">
          {#each packet.checklist as item (item.id)}
            <li class="text-xs sm:text-sm md:text-base text-white print:text-black">
              <span class="font-bold">{$t(item.titleKey)}</span>
              <span class="text-neutral-400 print:text-black/70"> — {$t(item.detailKey)}</span>
            </li>
          {/each}
        </ol>
      </section>

      <!-- Signature lines -->
      <section class="mb-2 sm:mb-3 print:break-inside-avoid">
        <h3
          class="text-sm sm:text-base md:text-lg font-bold tracking-wide text-[#ff3344] uppercase mb-2 sm:mb-3 print:text-black"
        >
          {$t("packet.signatures_title")}
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 pt-6">
          <div>
            <div class="border-t border-white/20 print:border-black/40 pt-2">
              <p class="text-[11px] sm:text-xs text-neutral-500 print:text-black/70">
                {$t("packet.signature_petitioner")}
              </p>
              <p class="text-[11px] sm:text-xs text-neutral-500 print:text-black/70 mt-6">
                {$t("packet.date_line")}: ____________________
              </p>
            </div>
          </div>
          <div>
            <div class="border-t border-white/20 print:border-black/40 pt-2">
              <p class="text-[11px] sm:text-xs text-neutral-500 print:text-black/70">
                {$t("packet.signature_respondent")}
              </p>
              <p class="text-[11px] sm:text-xs text-neutral-500 print:text-black/70 mt-6">
                {$t("packet.date_line")}: ____________________
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Legal disclaimer prints with the packet -->
      <div class="mt-6 sm:mt-8 rounded-xl border border-[#ff3344]/25 bg-[#ff3344]/5 print:border-black/30 print:bg-transparent p-3 sm:p-4">
        <p class="text-[10px] sm:text-xs text-neutral-300 print:text-black leading-relaxed">
          {$t("print_banner.verify_clerk")}
        </p>
      </div>
    </div>

    <!-- Screen-only actions -->
    <div
      class="no-print mt-4 sm:mt-6 md:mt-8 flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3"
    >
      <button
        type="button"
        onclick={handlePrint}
        class="w-full sm:w-auto px-8 py-3 rounded-full bg-[#ff3344] hover:bg-[#ff4757] text-white text-sm font-bold tracking-wide transition-colors duration-300 cursor-pointer shadow-lg shadow-[#ff3344]/20"
      >
        {$t("packet.print_button")}
      </button>
      <button
        type="button"
        onclick={handleDownload}
        class="w-full sm:w-auto px-8 py-3 rounded-full border border-white/15 text-neutral-300 hover:text-white text-sm font-semibold transition-colors duration-300 cursor-pointer"
      >
        {$t("packet.download_button")}
      </button>
      {#if onback}
        <button
          type="button"
          onclick={onback}
          class="text-[11px] sm:text-xs text-neutral-500 hover:text-white underline underline-offset-4 transition-colors duration-300 cursor-pointer sm:ml-2"
        >
          {$t("packet.back_to_review")}
        </button>
      {/if}
    </div>
    <p class="no-print mt-2 text-center text-[10px] sm:text-xs text-neutral-600">
      {$t("packet.download_hint")}
    </p>
  </div>
{/if}

<style lang="scss">
  // Screen-only: hide the print-only heading; the print stylesheet flips it.
  @media screen {
    .only-print { display: none !important; }
  }
</style>
