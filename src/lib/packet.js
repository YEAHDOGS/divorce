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
import { assertPacketPreflight } from './preflight.js';

/* ── Hoisted constants ───────────────────────────────────────────── */

export const PACKET_VERSION = 1;

/**
 * PRINT_CSS — the print stylesheet baked into the downloaded standalone
 * packet HTML. Drill-ready on paper:
 *   - @page margins sized for a clerk's filing cabinet (letter, 3/4")
 *   - sections and table rows never split across a page boundary
 *   - headings never strand at the bottom of a page (orphaned)
 *   - pure black-on-white, zero backgrounds — ink-friendly for a laser
 *     printer, no color-dependent meaning
 * Exported so regression tests can pin every rule.
 */
export const PRINT_CSS = `
  @page { size: letter; margin: 0.75in; }
  body { font-family: Georgia, "Times New Roman", serif; color: #000; background: #fff; margin: 32px; line-height: 1.5; }
  h1 { font-size: 22px; border-bottom: 2px solid #000; padding-bottom: 8px; break-after: avoid; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 8px; break-after: avoid; }
  section { break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; }
  tr { break-inside: avoid; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ccc; vertical-align: top; }
  th { width: 38%; font-weight: normal; color: #333; }
  .meta { color: #333; font-size: 13px; }
  .sign { margin-top: 40px; display: flex; gap: 48px; break-inside: avoid; }
  .sign div { flex: 1; border-top: 1px solid #000; padding-top: 6px; font-size: 13px; color: #333; }
  .disclaimer { margin-top: 32px; font-size: 12px; color: #000; border: 1px solid #000; padding: 12px; break-inside: avoid; }
  ol { padding-left: 20px; }
  ol li { break-inside: avoid; }
  @media print { body { margin: 0; } }
`;

export const PACKET_ERROR_CODES = Object.freeze({
  PACKET_UNPAID: 'PACKET_UNPAID',
  PACKET_OUTPUT_INCOMPLETE: 'PACKET_OUTPUT_INCOMPLETE',
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

/* ── Printable-output completeness gate ──────────────────────────── */

/**
 * Thrown when the rendered packet HTML is missing a required field of the
 * standard uncontested flow. Carries every finding, each naming the field
 * that failed to render, so a dropped template line fails loudly instead
 * of shipping a half-filled legal document.
 */
export class PacketOutputError extends Error {
  /**
   * @param {Array<{ field: string, message: string }>} findings
   */
  constructor(findings) {
    const count = findings.length;
    const lines = findings.map((f, i) => `${i + 1}) ${f.message}`);
    super(
      `The printable packet is missing ${count} required field${count === 1 ? '' : 's'}:\n${lines.join('\n')}`
    );
    this.name = 'PacketOutputError';
    this.code = PACKET_ERROR_CODES.PACKET_OUTPUT_INCOMPLETE;
    this.findings = findings;
  }
}

/**
 * Required fields of the standard uncontested flow, as they must appear in
 * the rendered packet HTML. `render` maps a packet to the exact text the
 * template is expected to emit (compared after HTML escaping).
 */
export const PACKET_OUTPUT_FIELDS = Object.freeze([
  { field: 'packetId', render: (p) => p.packetId },
  { field: 'generatedAt', render: (p) => p.generatedAt },
  { field: 'payment.receiptId', render: (p) => p.payment && p.payment.receiptId },
  {
    field: 'payment.amountCents',
    render: (p) =>
      p.payment &&
      `$${(p.payment.amountCents / 100).toFixed(2)} ${String(p.payment.currency).toUpperCase()}`,
  },
  { field: 'payment.cardLast4', render: (p) => p.payment && p.payment.cardLast4 },
  { field: 'payment.paidAt', render: (p) => p.payment && p.payment.paidAt },
  { field: 'payment.provider', render: (p) => p.payment && p.payment.provider },
  { field: 'parties.petitioner', render: (p) => p.parties && p.parties.petitioner },
  { field: 'parties.respondent', render: (p) => p.parties && p.parties.respondent },
  { field: 'marriage.date', render: (p) => p.marriage && p.marriage.date },
  { field: 'marriage.place', render: (p) => p.marriage && p.marriage.place },
  { field: 'stateName', render: (p) => p.stateName },
  { field: 'filing.county', render: (p) => p.filing && p.filing.county },
  { field: 'filing.court', render: (p) => p.filing && p.filing.court },
  { field: 'disclaimer', render: (p) => p.disclaimer },
]);

/** The four attestation row labels that must print on the packet. */
const OUTPUT_ATTESTATION_LABELS = Object.freeze({
  residency: 'residencyLabel',
  uncontested: 'uncontestedLabel',
  noMinorChildren: 'noMinorChildrenLabel',
  propertySplit: 'propertySplitLabel',
});

function isBlankOutput(value) {
  return value === undefined || value === null || value === false || String(value).trim() === '';
}

function makeOutputFinding(field, message) {
  return { field, message };
}

/**
 * Verify that every required uncontested-flow field is present, non-empty,
 * and actually rendered in the packet HTML. Catches template regressions
 * (a refactored template dropping a row) that the pre-flight gate —
 * which validates the packet object, not the document — cannot see.
 *
 * @param {string} html — the rendered packet document
 * @param {object} packet — the packet it was rendered from
 * @returns {Array<{ field: string, message: string }>} empty when complete
 */
export function validatePacketOutput(html, packet) {
  const findings = [];
  const doc = typeof html === 'string' ? html : '';

  for (const { field, render } of PACKET_OUTPUT_FIELDS) {
    const value = render(packet || {});
    if (isBlankOutput(value)) {
      findings.push(
        makeOutputFinding(
          field,
          `Required field "${field}" is missing from the packet data — the printable document cannot be complete. Rebuild the packet from a completed questionnaire.`
        )
      );
      continue;
    }
    if (!doc.includes(escapeHtml(value))) {
      findings.push(
        makeOutputFinding(
          field,
          `Required field "${field}" did not render in the printable packet HTML — the template dropped a line.`
        )
      );
    }
  }

  // Attestations: each of the four filing statements must be affirmed AND
  // its row must print on the document.
  const attestations = (packet && packet.attestations) || {};
  for (const [key, labelKey] of Object.entries(OUTPUT_ATTESTATION_LABELS)) {
    if (attestations[key] !== true) {
      findings.push(
        makeOutputFinding(
          `attestations.${key}`,
          `Required field "attestations.${key}" is not affirmed — both parties must initial it before the packet can print.`
        )
      );
    }
    const label = DEFAULT_PACKET_LABELS[labelKey];
    if (!doc.includes(escapeHtml(label))) {
      findings.push(
        makeOutputFinding(
          `attestations.${key}`,
          `The "${label}" attestation row did not render in the printable packet HTML — the template dropped a line.`
        )
      );
    }
  }

  // Checklist: every filing-checklist item title must print.
  const items = (packet && Array.isArray(packet.checklist) ? packet.checklist : []);
  if (items.length === 0) {
    findings.push(
      makeOutputFinding(
        'checklist',
        'Required field "checklist" is empty — the packet must print its filing checklist.'
      )
    );
  } else {
    for (const item of items) {
      if (isBlankOutput(item && item.title) || !doc.includes(escapeHtml(item.title))) {
        findings.push(
          makeOutputFinding(
            'checklist',
            `Checklist item "${item && item.title}" did not render in the printable packet HTML — the template dropped a line.`
          )
        );
      }
    }
  }

  return findings;
}

/**
 * Throw a PacketOutputError naming every missing field, or return true
 * when the rendered document is complete.
 *
 * @param {string} html — the rendered packet document
 * @param {object} packet — the packet it was rendered from
 * @returns {true}
 * @throws {PacketOutputError} with `findings` when a required field is missing
 */
export function assertPacketOutputComplete(html, packet) {
  const findings = validatePacketOutput(html, packet);
  if (findings.length > 0) throw new PacketOutputError(findings);
  return true;
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

  const packet = {
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

  // Pre-flight: the paid packet can never go out with a missing name,
  // venue, unconfirmed filing statement, or a wrong price-paid line.
  assertPacketPreflight(packet);
  return packet;
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
 * @throws {PreflightError} when the packet fails the pre-flight gate
 * @throws {PacketOutputError} when a required field fails to render
 */
export function packetToPrintableHtml(packet, labels = {}) {
  if (!packet || typeof packet !== 'object') {
    throw new PacketError(
      PACKET_ERROR_CODES.PACKET_UNPAID,
      'packet: cannot render a packet that was never assembled.'
    );
  }
  // Pre-flight BEFORE any HTML is emitted: fail loudly with the full list
  // of what's wrong instead of rendering a half-filled legal document.
  assertPacketPreflight(packet);
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(L.documentTitle)} — ${e(packet.packetId)}</title>
<style>
  ${PRINT_CSS}
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
  // Output completeness: the render path re-verifies that every required
  // uncontested-flow field actually made it into the emitted document —
  // a template regression that drops a row fails loudly here.
  assertPacketOutputComplete(html, packet);
  return html;
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
