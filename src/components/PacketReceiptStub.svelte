<!--
  PacketReceiptStub.svelte — printable paid-receipt / packet stub page.

  Shown after a successful TEST-MODE checkout. It is NOT the legal
  packet itself — it's a clean, print-friendly receipt that proves the
  $30 test payment happened and lists the packet sections the real
  document will contain once the packet flow is finished.

  Every copy line states TEST MODE / no real money moved.
  Svelte escapes interpolated text, so receipt fields cannot inject HTML.
-->
<script>
  /** @type {{ id: string, paymentIntentId: string, amount: number, currency: string, cardLast4: string, paidAt: string, productId?: string } | null} */
  let { receipt = null, onback = () => {} } = $props();

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

    <h2 class="mt-8 text-base sm:text-lg font-bold">Packet sections (stub)</h2>
    <p class="mt-1 text-xs sm:text-sm text-neutral-500">
      The printable legal packet is still being built. Your paid receipt
      unlocks these sections when the packet flow ships:
    </p>
    <ol class="mt-3 list-decimal space-y-1.5 pl-6 text-sm sm:text-base">
      {#each PACKET_SECTIONS as section}
        <li class="text-neutral-700">
          {section}
          <span class="text-neutral-400">— placeholder</span>
        </li>
      {/each}
    </ol>

    <div class="no-print mt-8 flex flex-col sm:flex-row gap-3">
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
