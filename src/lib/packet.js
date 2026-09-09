/**
 * packet.js — the customer-facing divorce packet, assembled AFTER payment.
 *
 * The money milestone in one pipeline:
 *
 *   questionnaire answers (complete + eligible)
 *     → provider.createPayment ($30) → valid receipt
 *     → buildPacket(provider, receipt, answers) → printable packet
 *
 * The packet is a plain data object: product + payment block (last4 and
 * ids only — never a PAN) + the full organizer (parties, marriage,
 * filing, attestations, checklist, disclaimer). Presentation lives in
 * src/components/packet/DivorcePacket.svelte; downloads serialize to a
 * standalone printable HTML file via packetToPrintableHtml.
 *
 * Guards first, main path last. buildPacket THROWS when the receipt is
 * missing/invalid or the questionnaire is incomplete/ineligible — the
 * paid packet can never be forged client-side without a real receipt.
 */

import { buildOrganizer } from './questionnaire.js';

/* ── Hoisted constants ───────────────────────────────────────────── */

export const PACKET_VERSION = 1;

export const PACKET_ERROR_CODES = Object.freeze({
  PACKET_UNPAID: 'PACKET_UNPAID',
});

const HTML_ESCAPES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

/* ── Error class ─────────────────────────────────────────────────── */

/**
 * Thrown when a packet is requested without a valid paid receipt.
 * (Incomplete/ineligible questionnaires throw the engine's
 * QUESTIONNAIRE_INCOMPLETE from buildOrganizer.)
 */
export class PacketError extends Error {
  /**
   * @param {string} code — one of PACKET_ERROR_CODES
   * @param {string} message — human-readable detail
   */
  constructor(code, message) {
    super(message);
    this.name = 'PacketError';
    this.code = code;
  }
}

/* ── Packet assembly ─────────────────────────────────────────────── */

/**
 * Assemble the printable divorce packet for a paid customer.
 *
 * @param {object} provider — active payment provider (must export
 *   isValidReceipt + PRODUCT, per the adapter interface)
 * @param {*} receipt — the provider receipt from createPayment
 * @param {Record<string, *>} answers — validated questionnaire answers
 * @param {Record<string, string>} [strings] — flat `q.*` dictionary used
 *   to resolve checklist titles/details (falls back to raw keys)
 * @returns {object} the packet: envelope + payment block + organizer
 * @throws {PacketError} code PACKET_UNPAID when the receipt does not
 *   validate against the provider
 * @throws {Error} code QUESTIONNAIRE_INCOMPLETE (from the engine) when
 *   answers are not complete and eligible
 */
export function buildPacket(provider, receipt, answers, strings = {}) {
  const p = provider || {};
  if (typeof p.isValidReceipt !== 'function' || !p.isValidReceipt(receipt)) {
    throw new PacketError(
      PACKET_ERROR_CODES.PACKET_UNPAID,
      'packet: no valid paid receipt — the packet stays locked until the $30 payment succeeds.'
    );
  }

  // buildOrganizer throws QUESTIONNAIRE_INCOMPLETE when answers are not
  // complete and eligible — nothing the user told us is dropped, and an
  // unpaid/ineligible session can never produce a packet.
  const organizer = buildOrganizer(answers, strings);
  const r = receipt;

  return {
    version: PACKET_VERSION,
    packetId: `pkt_${r.id}`,
    generatedAt: new Date().toISOString(),
    product: { ...(p.PRODUCT || {}) },
    payment: {
      receiptId: r.id,
      paymentIntentId: r.paymentIntentId,
      amountCents: r.amount,
      currency: r.currency,
      cardLast4: r.cardLast4,
      paidAt: r.paidAt,
      provider: p.name || 'unknown',
      testMode: r.testMode === true,
    },
    ...organizer,
  };
}

/* ── HTML escaping ───────────────────────────────────────────────── */

/**
 * Escape a value for interpolation into the printable HTML download.
 * User-supplied names/places flow through here: a hand-built packet must
 * never smuggle markup into the downloaded document.
 *
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value).replace(
    /[&<>"']/g,
    (ch) => HTML_ESCAPES[ch]
  );
}

/* ── Printable HTML download ─────────────────────────────────────── */

/**
 * Render the packet as a standalone printable HTML document (inline
 * styles, black-on-white, no external assets) suitable for the
 * "Download packet" path. All user values are escaped.
 *
 * @param {object} packet — as returned by buildPacket
 * @param {Record<string, string>} [labels] — optional label overrides;
 *   defaults to English packet labels
 * @returns {string} complete HTML document
 */
export function packetToPrintableHtml(packet, labels = {}) {
  if (!packet || typeof packet !== 'object') {
    throw new PacketError(
      PACKET_ERROR_CODES.PACKET_UNPAID,
      'packet: cannot render a packet that was never assembled.'
    );
  }
  const L = { ...DEFAULT_PACKET_LABELS, ...labels };
  const e = escapeHtml;
  const amount = `$${(packet.payment.amountCents / 100).toFixed(2)} ${String(packet.payment.currency).toUpperCase()}`;
  const yn = (v) => (v ? L.yes : L.no);

  const section = (title, rows) => `
    <section>
      <h2>${e(title)}</h2>
      <table>
        ${rows
          .map(
            ([label, value]) =>
              `<tr><th>${e(label)}</th><td>${e(value)}</td></tr>`
          )
          .join('\n')}
      </table>
    </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(L.documentTitle)} — ${e(packet.packetId)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #000; background: #fff; margin: 32px; line-height: 1.5; }
  h1 { font-size: 22px; border-bottom: 2px solid #000; padding-bottom: 8px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ccc; vertical-align: top; }
  th { width: 38%; font-weight: normal; color: #555; }
  .meta { color: #555; font-size: 13px; }
  .sign { margin-top: 40px; display: flex; gap: 48px; }
  .sign div { flex: 1; border-top: 1px solid #000; padding-top: 6px; font-size: 13px; color: #555; }
  .disclaimer { margin-top: 32px; font-size: 12px; color: #555; border: 1px solid #999; padding: 12px; }
  ol { padding-left: 20px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <h1>${e(L.documentTitle)}</h1>
  <p class="meta">${e(L.packetIdLabel)}: ${e(packet.packetId)} &nbsp;·&nbsp; ${e(L.generatedLabel)}: ${e(packet.generatedAt)}</p>

  ${section(L.paymentTitle, [
    [L.receiptLabel, packet.payment.receiptId],
    [L.amountLabel, amount],
    [L.cardLabel, `•••• ${packet.payment.cardLast4}`],
    [L.paidOnLabel, packet.payment.paidAt],
    [L.providerLabel, packet.payment.provider],
  ])}

  ${section(L.partiesTitle, [
    [L.petitionerLabel, packet.parties.petitioner],
    [L.respondentLabel, packet.parties.respondent],
  ])}

  ${section(L.marriageTitle, [
    [L.marriageDateLabel, packet.marriage.date],
    [L.marriagePlaceLabel, packet.marriage.place],
  ])}

  ${section(L.filingTitle, [
    [L.stateLabel, packet.stateName],
    [L.countyLabel, packet.filing.county],
    [L.courtLabel, packet.filing.court],
  ])}

  ${section(L.attestationsTitle, [
    [L.residencyLabel, yn(packet.attestations.residency)],
    [L.uncontestedLabel, yn(packet.attestations.uncontested)],
    [L.noMinorChildrenLabel, yn(packet.attestations.noMinorChildren)],
    [L.propertySplitLabel, yn(packet.attestations.propertySplit)],
  ])}

  <section>
    <h2>${e(L.checklistTitle)}</h2>
    <ol>
      ${(packet.checklist || [])
        .map((item) => `<li><strong>${e(item.title)}</strong> — ${e(item.detail)}</li>`)
        .join('\n')}
    </ol>
  </section>

  <section>
    <h2>${e(L.signaturesTitle)}</h2>
    <div class="sign">
      <div>${e(L.petitionerSignatureLabel)}<br><br><br>${e(L.dateLabel)}: __________</div>
      <div>${e(L.respondentSignatureLabel)}<br><br><br>${e(L.dateLabel)}: __________</div>
    </div>
  </section>

  <div class="disclaimer">${e(packet.disclaimer)}</div>
</body>
</html>`;
}

/** English labels for the downloaded HTML document. */
export const DEFAULT_PACKET_LABELS = Object.freeze({
  documentTitle: 'Uncontested Divorce Packet',
  packetIdLabel: 'Packet ID',
  generatedLabel: 'Generated',
  paymentTitle: 'Payment',
  receiptLabel: 'Receipt',
  amountLabel: 'Amount paid',
  cardLabel: 'Card',
  paidOnLabel: 'Paid on',
  providerLabel: 'Provider',
  partiesTitle: 'Parties',
  petitionerLabel: 'Petitioner',
  respondentLabel: 'Respondent',
  marriageTitle: 'Marriage',
  marriageDateLabel: 'Date of marriage',
  marriagePlaceLabel: 'Place of marriage',
  filingTitle: 'Filing',
  stateLabel: 'State',
  countyLabel: 'County',
  courtLabel: 'Court',
  attestationsTitle: 'Attestations',
  residencyLabel: 'In-state residency (6+ months)',
  uncontestedLabel: 'Fully uncontested',
  noMinorChildrenLabel: 'No minor children together',
  propertySplitLabel: 'Property/debt split agreed',
  checklistTitle: 'Filing checklist',
  signaturesTitle: 'Signatures',
  petitionerSignatureLabel: 'Petitioner signature',
  respondentSignatureLabel: 'Respondent signature',
  dateLabel: 'Date',
  yes: 'Yes',
  no: 'No',
});

/**
 * Download the packet as a standalone printable HTML file.
 * Browser-only: throws outside a DOM environment.
 *
 * @param {object} packet — as returned by buildPacket
 */
export function downloadPacketHtml(packet) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new PacketError(
      PACKET_ERROR_CODES.PACKET_UNPAID,
      'packet: download requires a browser environment.'
    );
  }
  const html = packetToPrintableHtml(packet);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${packet.packetId || 'divorce-packet'}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
