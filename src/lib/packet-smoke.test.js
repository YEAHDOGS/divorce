/**
 * packet-smoke.test.js — end-to-end regression for the money milestone.
 *
 * Exercises the whole paid-packet pipeline headlessly, exactly as the
 * staging flow does it:
 *
 *   questionnaire session (all 10 steps) → test-mode $30 payment →
 *   receipt validation → printable packet generation
 *
 * Guards the invariants the $30 checkout exists to prove:
 *   1. Only a complete, eligible questionnaire can produce a packet.
 *   2. Only a valid test-mode receipt represents a paid packet.
 *   3. The generated packet contains every required section and field —
 *      nothing the user told us is silently dropped from the printable.
 *   4. No card PAN or secret-ish material ever appears in the receipt or
 *      packet (only last4, only pi_test_/rcpt_test_ ids).
 */
import { describe, it, expect } from 'vitest';
import {
  STEPS,
  checkEligibility,
  buildOrganizer,
  createSession,
} from './questionnaire.js';
import {
  PRODUCT,
  TEST_CARD,
  ERROR_CODES,
  createTestPaymentIntent,
  confirmTestPayment,
  isValidTestReceipt,
} from './stripe-test.js';

/* ── Fixture answers ─────────────────────────────────────────────── */

const FIXTURE_TX = Object.freeze({
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

const FIXTURE_OK = Object.freeze({
  ...FIXTURE_TX,
  state: 'OK',
  county: 'Oklahoma',
});

/** Answer every step in order; the session must reach 'complete'. */
function runFullSession(answers) {
  const session = createSession();
  for (const step of STEPS) {
    const result = session.answer(answers[step.id]);
    expect(result.ok, `step ${step.id} accepts fixture value`).toBe(true);
  }
  expect(session.status).toBe('complete');
  expect(checkEligibility(session.answers).eligible).toBe(true);
  return session;
}

/** The exact money step the checkout modal performs. */
function payForPacket() {
  const intent = createTestPaymentIntent(PRODUCT.amountCents);
  const receipt = confirmTestPayment(intent.id, { last4: TEST_CARD.last4 });
  expect(isValidTestReceipt(receipt)).toBe(true);
  return receipt;
}

/* ── End-to-end: questionnaire → payment → packet ────────────────── */

describe('paid packet end-to-end (smoke)', () => {
  for (const [label, fixture, stateName] of [
    ['Texas', FIXTURE_TX, 'Texas'],
    ['Oklahoma', FIXTURE_OK, 'Oklahoma'],
  ]) {
    it(`generates a complete, valid packet for ${label}`, () => {
      const session = runFullSession(fixture);
      const receipt = payForPacket();
      expect(receipt.productId).toBe(PRODUCT.id);
      expect(receipt.amount).toBe(PRODUCT.amountCents);

      const packet = buildOrganizer(session.answers);

      // Packet envelope
      expect(packet.version).toEqual(expect.any(Number));
      expect(() => new Date(packet.generatedAt)).not.toThrow();
      expect(new Date(packet.generatedAt).toString()).not.toBe('Invalid Date');
      expect(packet.state).toBe(fixture.state);
      expect(packet.stateName).toBe(stateName);

      // Parties — every name the user gave us, trimmed
      expect(packet.parties.petitioner).toBe('Alex Rivera');
      expect(packet.parties.respondent).toBe('Jordan Rivera');

      // Marriage facts
      expect(packet.marriage.date).toBe('2015-06-20');
      expect(packet.marriage.place).toBe('Dallas, Texas');

      // Filing target
      expect(packet.filing.county).toBe(fixture.county);
      expect(packet.filing.court).toContain(fixture.county);

      // Attestations — every yes/no answer becomes a packet statement
      expect(packet.attestations.residency).toBe(true);
      expect(packet.attestations.uncontested).toBe(true);
      expect(packet.attestations.noMinorChildren).toBe(true);
      expect(packet.attestations.propertySplit).toBe(true);

      // Eligibility record + per-state filing checklist
      expect(packet.eligibility.eligible).toBe(true);
      expect(packet.eligibility.reasons).toEqual([]);
      expect(Array.isArray(packet.checklist)).toBe(true);
      expect(packet.checklist.length).toBeGreaterThan(0);
      for (const item of packet.checklist) {
        expect(item.id).toBeTruthy();
        expect(item.title).toBeTruthy();
        expect(item.detail).toBeTruthy();
      }

      // Legal disclaimer pointer
      expect(packet.disclaimerKey).toBe('q.organizer.disclaimer');
      expect(packet.disclaimer).toBeTruthy();
    });
  }

  it('carries nothing sensitive: receipt holds only last4 + test ids', () => {
    const session = runFullSession(FIXTURE_TX);
    const receipt = payForPacket();
    const packet = buildOrganizer(session.answers);
    const dumped = JSON.stringify({ receipt, packet });
    // No full PAN anywhere, test ids only.
    expect(dumped).not.toMatch(/4242 ?4242/);
    expect(dumped).not.toMatch(/\b\d{16}\b/);
    expect(receipt.cardLast4).toBe('4242');
    expect(receipt.id).toMatch(/^rcpt_test_/);
    expect(receipt.paymentIntentId).toMatch(/^pi_test_/);
  });

  it('the declined test card can never produce a valid receipt', () => {
    const intent = createTestPaymentIntent();
    expect(() =>
      confirmTestPayment(intent.id, { last4: '0002' })
    ).toThrowError(expect.objectContaining({ code: ERROR_CODES.DECLINED }));
  });

  it('an incomplete questionnaire can never produce a packet', () => {
    const session = createSession();
    session.answer('TX'); // only the first step
    expect(session.status).not.toBe('complete');
    expect(() => buildOrganizer(session.answers)).toThrowError(
      expect.objectContaining({ code: 'QUESTIONNAIRE_INCOMPLETE' })
    );
  });

  it('an ineligible questionnaire can never produce a packet', () => {
    const session = createSession();
    const answers = { ...FIXTURE_TX, minorChildren: true };
    for (const step of STEPS) session.answer(answers[step.id]);
    // minorChildren: true rules the user out, so the packet stays locked.
    expect(session.status).toBe('ineligible');
    expect(() => buildOrganizer(session.answers)).toThrowError(
      expect.objectContaining({ code: 'QUESTIONNAIRE_INCOMPLETE' })
    );
  });
});
