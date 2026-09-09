/**
 * preflight.js — the packet pre-flight validation gate.
 *
 * A packet may only be printed or downloaded when every line on it is
 * real. buildPacket assembles packets from intake answers, but the render
 * paths (packetToPrintableHtml, DivorcePacket.svelte, downloads) can be
 * handed any packet-shaped object. This gate runs BEFORE any packet HTML
 * is emitted and FAILS LOUDLY — one thrown PreflightError carrying every
 * finding, each with a user-facing message that says what to do next.
 *
 * The gate checks the five things a clerk (and a paying customer) need:
 *   1. parties' names — present, plausible, and trimmed
 *   2. jurisdiction — a supported state (Texas/Oklahoma)
 *   3. county / court — the filing venue
 *   4. filing grounds + both parties' initials — the four intake
 *      attestations affirmed true. These answers, confirmed by the paid
 *      receipt, are the customer's digital initials on the filing;
 *      wet-ink signature lines still print on the packet itself.
 *   5. the price-paid line — exactly $30.00 USD on the payment block
 *
 * Pure vanilla JS: no DOM, no dependencies, Node-testable. Guard clauses
 * first, main path last.
 */

/* ── Hoisted constants ───────────────────────────────────────────── */

export const PREFLIGHT_VERSION = 1;

const EXPECTED_AMOUNT_CENTS = 3000;
const EXPECTED_CURRENCY = 'usd';
const MIN_NAME_LENGTH = 2;
const SUPPORTED_STATE_NAMES = Object.freeze(['Texas', 'Oklahoma']);

/** Per-finding codes: every gate failure is machine-readable. */
export const PREFLIGHT_CODES = Object.freeze({
  PACKET_MISSING: 'PACKET_MISSING',
  PACKET_VERSION_MISSING: 'PACKET_VERSION_MISSING',
  PACKET_ID_MISSING: 'PACKET_ID_MISSING',
  PARTY_NAME_MISSING: 'PARTY_NAME_MISSING',
  PARTY_NAME_INVALID: 'PARTY_NAME_INVALID',
  JURISDICTION_MISSING: 'JURISDICTION_MISSING',
  JURISDICTION_UNSUPPORTED: 'JURISDICTION_UNSUPPORTED',
  COUNTY_MISSING: 'COUNTY_MISSING',
  COURT_MISSING: 'COURT_MISSING',
  ATTESTATIONS_MISSING: 'ATTESTATIONS_MISSING',
  ATTESTATION_UNCONFIRMED: 'ATTESTATION_UNCONFIRMED',
  PAYMENT_BLOCK_MISSING: 'PAYMENT_BLOCK_MISSING',
  PAYMENT_AMOUNT_WRONG: 'PAYMENT_AMOUNT_WRONG',
  PAYMENT_CURRENCY_WRONG: 'PAYMENT_CURRENCY_WRONG',
});

/* The four filing statements both parties must initial (attest true) at
   intake. Label strings are user-facing: they surface in the thrown error. */
const ATTESTATION_STATEMENTS = Object.freeze({
  residency: 'in-state residency (6+ months)',
  uncontested: 'a fully uncontested divorce',
  noMinorChildren: 'no minor children together',
  propertySplit: 'an agreed property/debt split',
});

/* ── Error class ─────────────────────────────────────────────────── */

/**
 * Thrown when a packet fails pre-flight. Carries every finding so the UI
 * can show one complete, actionable list instead of a game of whack-a-mole.
 */
export class PreflightError extends Error {
  /**
   * @param {Array<{ code: string, field: string, message: string }>} findings
   */
  constructor(findings) {
    const count = findings.length;
    const lines = findings.map((f, i) => `${i + 1}) ${f.message}`);
    super(
      `The packet is not ready to print (${count} issue${count === 1 ? '' : 's'}):\n${lines.join('\n')}`
    );
    this.name = 'PreflightError';
    this.code = 'PACKET_PREFLIGHT_FAILED';
    this.findings = findings;
  }
}

/* ── Field helpers ───────────────────────────────────────────────── */

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function makeFinding(code, field, message) {
  return { code, field, message };
}

/* ── The gate ────────────────────────────────────────────────────── */

/**
 * Run every pre-flight check against a packet and collect findings.
 *
 * @param {object} packet — as returned by buildPacket (or any packet-shaped object)
 * @returns {Array<{ code: string, field: string, message: string }>} empty when the packet is ready
 */
export function validatePacketPreflight(packet) {
  const findings = [];

  // ── 0. Structure ──────────────────────────────────────────────
  if (!packet || typeof packet !== 'object') {
    return [makeFinding(PREFLIGHT_CODES.PACKET_MISSING, 'packet', 'No packet was assembled — go back and complete the questionnaire first.')];
  }
  if (packet.version === undefined || packet.version === null) {
    findings.push(makeFinding(PREFLIGHT_CODES.PACKET_VERSION_MISSING, 'version', 'The packet is missing its version stamp — rebuild it from the questionnaire.'));
  }
  if (isBlank(packet.packetId)) {
    findings.push(makeFinding(PREFLIGHT_CODES.PACKET_ID_MISSING, 'packetId', 'The packet is missing its ID — rebuild it from the questionnaire.'));
  }

  // ── 1. Parties' names ─────────────────────────────────────────
  const parties = packet.parties || {};
  for (const [key, label] of [
    ['petitioner', 'Petitioner'],
    ['respondent', 'Respondent'],
  ]) {
    const value = parties[key];
    if (isBlank(value)) {
      findings.push(
        makeFinding(
          PREFLIGHT_CODES.PARTY_NAME_MISSING,
          `parties.${key}`,
          `The ${label.toLowerCase()}'s name is missing. Return to the questionnaire and enter the full legal name.`
        )
      );
      continue;
    }
    if (String(value).trim().length < MIN_NAME_LENGTH) {
      findings.push(
        makeFinding(
          PREFLIGHT_CODES.PARTY_NAME_INVALID,
          `parties.${key}`,
          `The ${label.toLowerCase()}'s name ("${String(value).trim()}") looks incomplete. Return to the questionnaire and enter the full legal name.`
        )
      );
    }
  }

  // ── 2. Jurisdiction ───────────────────────────────────────────
  if (isBlank(packet.stateName)) {
    findings.push(makeFinding(PREFLIGHT_CODES.JURISDICTION_MISSING, 'stateName', 'The filing state is missing. Return to the questionnaire and choose Texas or Oklahoma.'));
  } else if (!SUPPORTED_STATE_NAMES.includes(String(packet.stateName).trim())) {
    findings.push(
      makeFinding(
        PREFLIGHT_CODES.JURISDICTION_UNSUPPORTED,
        'stateName',
        `This packet only supports Texas or Oklahoma filings (found "${String(packet.stateName).trim()}"). The questionnaire limits states at intake — rebuild the packet from a completed questionnaire.`
      )
    );
  }

  // ── 3. County / court (the filing venue) ──────────────────────
  const filing = packet.filing || {};
  if (isBlank(filing.county)) {
    findings.push(makeFinding(PREFLIGHT_CODES.COUNTY_MISSING, 'filing.county', 'The filing county is missing. Return to the questionnaire and enter the county where you will file.'));
  }
  if (isBlank(filing.court)) {
    findings.push(makeFinding(PREFLIGHT_CODES.COURT_MISSING, 'filing.court', 'The filing court is missing — rebuild the packet from the questionnaire so the county court is derived.'));
  }

  // ── 4. Filing grounds + both parties' initials ─────────────────
  // The four intake attestations, affirmed true and confirmed by the paid
  // receipt, are the customer's digital initials on the filing statements.
  const attestations = packet.attestations;
  if (!attestations || typeof attestations !== 'object') {
    findings.push(
      makeFinding(
        PREFLIGHT_CODES.ATTESTATIONS_MISSING,
        'attestations',
        'Both parties must initial the four filing statements (residency, uncontested, no minor children, property split). Return to the questionnaire to confirm them.'
      )
    );
  } else {
    for (const [key, statement] of Object.entries(ATTESTATION_STATEMENTS)) {
      if (attestations[key] !== true) {
        findings.push(
          makeFinding(
            PREFLIGHT_CODES.ATTESTATION_UNCONFIRMED,
            `attestations.${key}`,
            `Both parties must initial this filing statement before the packet can print: ${statement}. Return to the questionnaire to confirm it.`
          )
        );
      }
    }
  }

  // ── 5. Price-paid line: exactly $30.00 USD ─────────────────────
  const payment = packet.payment;
  if (!payment || typeof payment !== 'object') {
    findings.push(makeFinding(PREFLIGHT_CODES.PAYMENT_BLOCK_MISSING, 'payment', 'The payment block is missing — the packet stays locked until the $30 payment succeeds.'));
  } else {
    if (payment.amountCents !== EXPECTED_AMOUNT_CENTS) {
      findings.push(
        makeFinding(
          PREFLIGHT_CODES.PAYMENT_AMOUNT_WRONG,
          'payment.amountCents',
          `The packet must show exactly $30.00 paid (found ${payment.amountCents}). Rebuild the packet from a completed $30 checkout.`
        )
      );
    }
    if (String(payment.currency || '').toLowerCase() !== EXPECTED_CURRENCY) {
      findings.push(
        makeFinding(
          PREFLIGHT_CODES.PAYMENT_CURRENCY_WRONG,
          'payment.currency',
          `The packet must show payment in USD (found "${payment.currency}"). Rebuild the packet from a completed $30 checkout.`
        )
      );
    }
  }

  return findings;
}

/**
 * Throw a PreflightError listing every issue, or return true when the
 * packet is ready to print/download.
 *
 * @param {object} packet — as returned by buildPacket
 * @returns {true}
 * @throws {PreflightError} with `findings` when anything is missing/invalid
 */
export function assertPacketPreflight(packet) {
  const findings = validatePacketPreflight(packet);
  if (findings.length > 0) throw new PreflightError(findings);
  return true;
}
