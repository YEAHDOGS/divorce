<!--
  PacketReceiptStub.svelte — printable paid-receipt + packet unlock page.

  Shown after a successful TEST-MODE checkout. The receipt proves the
  $30 test payment happened; the "Download printable packet" button
  builds the packet through the real pipeline (buildPacket →
  packetToPrintableHtml) from staging demo answers — the same gates
  (receipt validity, pre-flight, output completeness) that guard the
  production path.

  Every copy line states TEST MODE / no real money moved.
  Svelte escapes interpolated text, so receipt fields cannot inject HTML.
-->
<script>
  import { buildPacket, downloadPacketHtml, PACKET_ERROR_CODES } from "../lib/packet.js";
  import { TEST_PROVIDER } from "../lib/payments/test-provider.js";
  import { STAGING_DEMO_ANSWERS } from "../lib/staging-demo-answers.js";

  /** @type {{ id: string, paymentIntentId: string, amount: number, currency: string, cardLast4: string, paidAt: string, productId?: string } | null} */
  let { receipt = null, onback = () => {} } = $props();

  /** Honest inline error from the packet build — resets on every attempt. */
  let packetError = $state("");

  /**
   * Build the paid packet from the test receipt and download it as a
   * standalone printable HTML document. Guards in packet.js throw first:
   * an invalid receipt (PACKET_UNPAID) or a failed pre-flight can never
   * produce packet bytes.
   */
  function downloadPacket() {
    packetError = "";
    try {
      const packet = buildPacket(TEST_PROVIDER, receipt, STAGING_DEMO_ANSWERS);
      downloadPacketHtml(packet);
    } catch (err) {
      const code = err && err.code ? ` (${err.code})` : "";
      packetError = `The packet could not be built: ${err && err.message ? err.message : "unknown error"}${code}`;
    }
  }

  /** Packet sections the real document will carry (placeholders until the packet flow is done). */
  const PACKET_SECTIONS = [
    "Petition for divorce (uncontested)",
    "Petitioner & respondent identification",
    "Marriage details & grounds",
    "Property & debt division worksheet",
    "Filing instructions & county court checklist",
  ];

  const TEST_MODE_BANNER = "TEST MODE — no real money was moved.";

  function formatMoney(cents, currency) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: String(currency || "usd").toUpperCase(),
      minimumFractionDigits: 2,
    }).format((Number(cents) || 0) / 100);
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
  }

  function printReceipt() {
    window.print();
  }
</script>

{#if receipt}
  <section
    class="receipt-stub mx-auto w-full max-w-3xl rounded-2xl bg-white text-neutral-900 shadow-xl p-5 sm:p-8 lg:p-10"
    aria-label="Test payment receipt"
  >
    <p
      class="no-print mb-4 rounded-lg bg-amber-100 px-3 py-2 text-center text-xs sm:text-sm font-bold uppercase tracking-widest text-amber-900"
    >
      {TEST_MODE_BANNER}
    </p>

    <header class="mb-6 border-b-2 border-neutral-900 pb-4">
      <h1 class="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight">
        Divorce Packet — Paid Receipt
      </h1>
      <p class="mt-1 text-xs sm:text-sm text-neutral-500">
        Uncontested Divorce Packet · TEST checkout · receipt kept locally, not legal advice
      </p>
    </header>

    <dl
      class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm sm:text-base"
    >
      <div>
        <dt class="font-semibold text-neutral-500">Receipt ID</dt>
        <dd class="font-mono break-all">{receipt.id}</dd>
      </div>
      <div>
        <dt class="font-semibold text-neutral-500">Payment ID</dt>
        <dd class="font-mono break-all">{receipt.paymentIntentId}</dd>
      </div>
      <div>
        <dt class="font-semibold text-neutral-500">Paid at</dt>
        <dd>{formatDate(receipt.paidAt)}</dd>
      </div>
      <div>
        <dt class="font-semibold text-neutral-500">Amount</dt>
        <dd class="font-bold">{formatMoney(receipt.amount, receipt.currency)}</dd>
      </div>
      <div>
        <dt class="font-semibold text-neutral-500">Card</dt>
        <dd class="font-mono">···· {receipt.cardLast4} (test card)</dd>
      </div>
      <div>
        <dt class="font-semibold text-neutral-500">Mode</dt>
        <dd class="font-semibold text-amber-700">{TEST_MODE_BANNER}</dd>
      </div>
    </dl>

    <h2 class="mt-8 text-base sm:text-lg font-bold">Your packet (staging preview)</h2>
    <p class="mt-1 text-xs sm:text-sm text-neutral-500">
      The packet below is built from <strong>staging demo answers</strong>
      (test-mode fixture — the fake "Sample" parties) so the $30 flow can
      be exercised end to end. Real questionnaire answers will flow
      through here when intake ships. Every line says TEST MODE until
      then.
    </p>
    <ol class="mt-3 list-decimal space-y-1.5 pl-6 text-sm sm:text-base">
      {#each PACKET_SECTIONS as section}
        <li class="text-neutral-700">
          {section}
          <span class="text-neutral-400">— in the downloaded packet</span>
        </li>
      {/each}
    </ol>

    {#if packetError}
      <p
        role="alert"
        class="no-print mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs sm:text-sm text-red-800 break-words"
      >
        {packetError}
      </p>
    {/if}

    <div class="no-print mt-8 flex flex-col sm:flex-row gap-3">
      <button
        type="button"
        onclick={downloadPacket}
        class="rounded-xl bg-[#ff3344] px-5 py-2.5 text-sm sm:text-base font-bold text-white hover:bg-[#ff5566] transition-colors"
      >
        Download printable packet (test mode)
      </button>
      <button
        type="button"
        onclick={printReceipt}
        class="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm sm:text-base font-bold text-white hover:bg-neutral-700 transition-colors"
      >
        Print receipt
      </button>
      <button
        type="button"
        onclick={onback}
        class="rounded-xl border border-neutral-300 px-5 py-2.5 text-sm sm:text-base font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors"
      >
        Back
      </button>
    </div>
  </section>
{:else}
  <p class="text-center text-sm text-neutral-500">No receipt to show yet.</p>
{/if}

<style>
  /* Print: the receipt becomes a clean black-on-white document; app chrome and buttons vanish. */
  @media print {
    .receipt-stub {
      box-shadow: none !important;
      border-radius: 0 !important;
      max-width: none !important;
    }
    .no-print {
      display: none !important;
    }
  }
</style>
