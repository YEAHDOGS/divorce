/**
 * preflight.test.js — the packet pre-flight validation gate.
 *
 * Pins the money-pipeline's weakest non-blocked link: NO packet HTML is
 * ever emitted when a required line is missing or invalid. The gate must
 * fail LOUDLY — one thrown PreflightError carrying every finding, each
 * with a user-facing message that says what to do next.
 *
 *   - A real buildPacket packet passes cleanly (assertPacketPreflight → true).
 *   - The full paid pipeline (buildPacket → packetToPrintableHtml) still works.
 *   - packetToPrintableHtml throws PreflightError (not a cryptic TypeError)
 *     when names / jurisdiction / county / attestations / the $30.00 USD
 *     price-paid line are missing or invalid.
 *   - validatePacketPreflight collects ALL findings at once.
 */
import { describe, it, expect } from 'vitest';
import { STEPS, createSession, checkEligibility } from './questionnaire.js';
import { getProvider, PRODUCT } from './payments/index.js';
import {
  PREFLIGHT_VERSION,
  PREFLIGHT_CODES,
  PreflightError,
  validatePacketPreflight,
  assertPacketPreflight,
} from './preflight.js';
import { buildPacket, packetToPrintableHtml } from './packet.js';

/* ── Fixtures ────────────────────────────────────────────────────── */

const FIXTURE_ANSWERS = Object.freeze({
  state: 'TX',
  petitionerName: 'Alex Rivera',
  respondentName: 'Jordan Rivera',
  county: 'Tulsa',
  marriageDate: '2015-06-20',
  marriagePlace: 'Dallas, Texas',
  residency: true,
  uncontested: true,
  minorChildren: false,
  propertySplit: true,
});

async function validPaidPacket() {
  const session = createSession();
  for (const step of STEPS) session.answer(FIXTURE_ANSWERS[step.id]);
  expect(checkEligibility(session.answers).eligible).toBe(true);
  const provider = getProvider();
  const receipt = await provider.createPayment(PRODUCT.amountCents, PRODUCT.currency, {
    productId: PRODUCT.id,
    cardLast4: '4242',
  });
  return buildPacket(provider, receipt, session.answers);
}

function brokenPacket(mutator) {
  // A structurally complete packet skeleton the gate can poke holes in.
  const packet = {
    version: PREFLIGHT_VERSION,
    packetId: 'pkt_test_preflight',
    generatedAt: new Date().toISOString(),
    payment: { receiptId: 'rcpt_test_000001', amountCents: 3000, currency: 'usd', cardLast4: '4242', paidAt: new Date().toISOString(), provider: 'test', testMode: true },
    stateName: 'Texas',
    parties: { petitioner: 'Alex Rivera', respondent: 'Jordan Rivera' },
    marriage: { date: '2015-06-20', place: 'Dallas, Texas' },
    filing: { county: 'Tulsa', court: 'Tulsa County District Court' },
    attestations: { residency: true, uncontested: true, noMinorChildren: true, propertySplit: true },
    checklist: [],
    disclaimer: 'Not a court form.',
  };
  mutator(packet);
  return packet;
}

/* ── The clean path ──────────────────────────────────────────────── */

describe('pre-flight gate: clean packets pass', () => {
  it('a real paid buildPacket packet has zero findings', async () => {
    const packet = await validPaidPacket();
    expect(validatePacketPreflight(packet)).toEqual([]);
    expect(assertPacketPreflight(packet)).toBe(true);
  });

  it('the full paid pipeline still renders after the gate is wired in', async () => {
    const packet = await validPaidPacket();
    const html = packetToPrintableHtml(packet);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('$30.00 USD');
    expect(html).toContain('Alex Rivera');
    expect(html).toContain('Tulsa');
  });
});

/* ── Names ───────────────────────────────────────────────────────── */

describe('pre-flight gate: parties', () => {
  it('fails loudly on a missing petitioner name', () => {
    const packet = brokenPacket((p) => {
      p.parties.petitioner = '   ';
    });
    const findings = validatePacketPreflight(packet);
    expect(findings).toEqual([
      expect.objectContaining({ code: PREFLIGHT_CODES.PARTY_NAME_MISSING, field: 'parties.petitioner' }),
    ]);
    expect(() => assertPacketPreflight(packet)).toThrowError(PreflightError);
    expect(() => packetToPrintableHtml(packet)).toThrowError(PreflightError);
  });

  it('fails loudly on an implausibly short respondent name', () => {
    const packet = brokenPacket((p) => {
      p.parties.respondent = 'X';
    });
    expect(validatePacketPreflight(packet)).toEqual([
      expect.objectContaining({ code: PREFLIGHT_CODES.PARTY_NAME_INVALID, field: 'parties.respondent' }),
    ]);
  });
});

/* ── Jurisdiction + venue ────────────────────────────────────────── */

describe('pre-flight gate: jurisdiction and venue', () => {
  it('rejects an unsupported filing state', () => {
    const packet = brokenPacket((p) => {
      p.stateName = 'Nevada';
    });
    expect(validatePacketPreflight(packet)).toEqual([
      expect.objectContaining({ code: PREFLIGHT_CODES.JURISDICTION_UNSUPPORTED, field: 'stateName' }),
    ]);
  });

  it('rejects a missing county and missing court', () => {
    const packet = brokenPacket((p) => {
      p.filing.county = '';
      p.filing.court = null;
    });
    const findings = validatePacketPreflight(packet);
    expect(findings.map((f) => f.code).sort()).toEqual(
      [PREFLIGHT_CODES.COUNTY_MISSING, PREFLIGHT_CODES.COURT_MISSING].sort()
    );
  });
});

/* ── Filing grounds + initials ───────────────────────────────────── */

describe('pre-flight gate: filing grounds and initials', () => {
  it('requires every attestation affirmed true — the digital initials', () => {
    const packet = brokenPacket((p) => {
      p.attestations.uncontested = false;
      p.attestations.propertySplit = false;
    });
    const findings = validatePacketPreflight(packet);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toEqual(
      expect.objectContaining({ code: PREFLIGHT_CODES.ATTESTATION_UNCONFIRMED, field: 'attestations.uncontested' })
    );
    expect(findings[1].message).toContain('property/debt split');
  });

  it('fails when the attestations block is absent entirely', () => {
    const packet = brokenPacket((p) => {
      delete p.attestations;
    });
    expect(validatePacketPreflight(packet)).toEqual([
      expect.objectContaining({ code: PREFLIGHT_CODES.ATTESTATIONS_MISSING }),
    ]);
  });
});

/* ── Price-paid line ─────────────────────────────────────────────── */

describe('pre-flight gate: the $30.00 USD price-paid line', () => {
  it('rejects the wrong amount', () => {
    const packet = brokenPacket((p) => {
      p.payment.amountCents = 2999;
    });
    expect(validatePacketPreflight(packet)).toEqual([
      expect.objectContaining({ code: PREFLIGHT_CODES.PAYMENT_AMOUNT_WRONG, field: 'payment.amountCents' }),
    ]);
    expect(() => packetToPrintableHtml(packet)).toThrowError(PreflightError);
  });

  it('rejects the wrong currency', () => {
    const packet = brokenPacket((p) => {
      p.payment.currency = 'eur';
    });
    expect(validatePacketPreflight(packet)).toEqual([
      expect.objectContaining({ code: PREFLIGHT_CODES.PAYMENT_CURRENCY_WRONG }),
    ]);
  });

  it('rejects a missing payment block', () => {
    const packet = brokenPacket((p) => {
      delete p.payment;
    });
    expect(validatePacketPreflight(packet)).toEqual([
      expect.objectContaining({ code: PREFLIGHT_CODES.PAYMENT_BLOCK_MISSING }),
    ]);
  });
});

/* ── Fail-loudly behavior ────────────────────────────────────────── */

describe('PreflightError: loud, actionable, complete', () => {
  it('collects every finding at once — no whack-a-mole', () => {
    const packet = brokenPacket((p) => {
      p.parties.petitioner = '';
      p.stateName = 'Nevada';
      p.filing.county = ' ';
      p.attestations.residency = false;
      p.payment.amountCents = 5000;
    });
    const findings = validatePacketPreflight(packet);
    expect(findings.length).toBeGreaterThanOrEqual(5);

    let caught = null;
    try {
      packetToPrintableHtml(packet);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PreflightError);
    expect(caught.code).toBe('PACKET_PREFLIGHT_FAILED');
    expect(caught.findings).toEqual(findings);
    // The message is user-facing: every issue numbered, each with a next step.
    expect(caught.message).toContain('not ready to print');
    expect(caught.message).toContain('5 issues');
    expect(caught.message).toMatch(/1\).*questionnaire/);
  });

  it('a missing packet fails with a single clear instruction', () => {
    expect(validatePacketPreflight(null)).toEqual([
      expect.objectContaining({ code: PREFLIGHT_CODES.PACKET_MISSING }),
    ]);
    expect(() => assertPacketPreflight(undefined)).toThrowError(PreflightError);
  });

  it('findings carry codes, fields, and actionable messages', () => {
    const packet = brokenPacket((p) => {
      p.parties.respondent = '';
    });
    const [finding] = validatePacketPreflight(packet);
    expect(finding.code).toBe(PREFLIGHT_CODES.PARTY_NAME_MISSING);
    expect(finding.field).toBe('parties.respondent');
    expect(finding.message).toContain('legal name');
    expect(finding.message).toContain('questionnaire');
  });
});
