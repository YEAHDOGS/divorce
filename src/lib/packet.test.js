/**
 * packet.test.js — packet assembly + checkout-success flow tests.
 *
 * Pins the money-milestone deliverable: after a valid $30 payment, the
 * customer gets a printable packet carrying everything they told us.
 *
 *   - buildPacket assembles the full packet from a paid session.
 *   - No receipt / bad receipt → PACKET_UNPAID (packet stays locked).
 *   - Incomplete or ineligible questionnaire → QUESTIONNAIRE_INCOMPLETE.
 *   - The printable HTML contains every section and escapes user input
 *     (a hand-built packet must never smuggle markup into the download).
 *   - The StripeProvider scaffold can never unlock a packet.
 *   - No card PAN or secret-ish material appears in the packet or HTML.
 */
import { describe, it, expect } from 'vitest';
import { STEPS, createSession, checkEligibility } from './questionnaire.js';
import { getProvider, PRODUCT } from './payments/index.js';
import { STRIPE_PROVIDER } from './payments/stripe-provider.js';
import {
  PACKET_VERSION,
  PACKET_ERROR_CODES,
  PacketError,
  buildPacket,
  escapeHtml,
  packetToPrintableHtml,
  downloadPacketHtml,
} from './packet.js';

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

/** Run the full questionnaire; the session must be complete + eligible. */
function completeSession(answers = FIXTURE_ANSWERS) {
  const session = createSession();
  for (const step of STEPS) {
    const result = session.answer(answers[step.id]);
    expect(result.ok, `step ${step.id} accepts fixture value`).toBe(true);
  }
  expect(session.status).toBe('complete');
  expect(checkEligibility(session.answers).eligible).toBe(true);
  return session;
}

/** The exact money step the checkout modal performs, via the adapter. */
async function payForPacket() {
  const provider = getProvider();
  const receipt = await provider.createPayment(PRODUCT.amountCents, PRODUCT.currency, {
    productId: PRODUCT.id,
    cardLast4: '4242',
  });
  expect(provider.isValidReceipt(receipt)).toBe(true);
  return receipt;
}

/**
 * Mirror of QuestionnaireFlow.handleCheckoutSuccess: the modal hands back
 * a receipt; the flow validates through the adapter, then assembles the
 * packet. Returns the packet, or null when the receipt is rejected.
 */
async function checkoutSuccessFlow(receipt, answers) {
  const provider = getProvider();
  if (!provider.isValidReceipt(receipt)) return null;
  return buildPacket(provider, receipt, answers);
}

/* ── Packet assembly ─────────────────────────────────────────────── */

describe('buildPacket', () => {
  it('assembles the full paid packet after a valid $30 payment', async () => {
    const session = completeSession();
    const receipt = await payForPacket();
    const packet = buildPacket(getProvider(), receipt, session.answers);

    // Envelope
    expect(packet.version).toBe(PACKET_VERSION);
    expect(packet.packetId).toBe(`pkt_${receipt.id}`);
    expect(new Date(packet.generatedAt).toString()).not.toBe('Invalid Date');

    // Product + payment block (last4 + ids only)
    expect(packet.product.id).toBe(PRODUCT.id);
    expect(packet.payment.receiptId).toBe(receipt.id);
    expect(packet.payment.amountCents).toBe(PRODUCT.amountCents);
    expect(packet.payment.currency).toBe(PRODUCT.currency);
    expect(packet.payment.cardLast4).toBe('4242');
    expect(packet.payment.paidAt).toBe(receipt.paidAt);
    expect(packet.payment.provider).toBe('test');
    expect(packet.payment.testMode).toBe(true);

    // Organizer: nothing the user told us is dropped
    expect(packet.state).toBe('TX');
    expect(packet.stateName).toBe('Texas');
    expect(packet.parties.petitioner).toBe('Alex Rivera');
    expect(packet.parties.respondent).toBe('Jordan Rivera');
    expect(packet.marriage.date).toBe('2015-06-20');
    expect(packet.marriage.place).toBe('Dallas, Texas');
    expect(packet.filing.county).toBe('Tulsa');
    expect(packet.filing.court).toContain('Tulsa');
    expect(packet.attestations.residency).toBe(true);
    expect(packet.attestations.uncontested).toBe(true);
    expect(packet.attestations.noMinorChildren).toBe(true);
    expect(packet.attestations.propertySplit).toBe(true);
    expect(packet.eligibility.eligible).toBe(true);
    expect(packet.checklist.length).toBeGreaterThan(0);
    expect(packet.disclaimer).toBeTruthy();
  });

  it('refuses without a receipt: the packet stays locked', () => {
    const session = completeSession();
    expect(() => buildPacket(getProvider(), null, session.answers)).toThrowError(
      expect.objectContaining({ code: PACKET_ERROR_CODES.PACKET_UNPAID })
    );
    expect(() => buildPacket(getProvider(), undefined, session.answers)).toThrowError(PacketError);
  });

  it('refuses a forged/invalid receipt', async () => {
    const session = completeSession();
    await payForPacket(); // a real one exists, but we pass a forgery
    const forged = { id: 'rcpt_live_123', status: 'succeeded' };
    expect(() => buildPacket(getProvider(), forged, session.answers)).toThrowError(
      expect.objectContaining({ code: PACKET_ERROR_CODES.PACKET_UNPAID })
    );
  });

  it('refuses when the questionnaire is incomplete', async () => {
    const receipt = await payForPacket();
    const session = createSession();
    session.answer('TX'); // only the first step
    expect(() => buildPacket(getProvider(), receipt, session.answers)).toThrowError(
      expect.objectContaining({ code: 'QUESTIONNAIRE_INCOMPLETE' })
    );
  });

  it('refuses when the questionnaire is ineligible', async () => {
    const receipt = await payForPacket();
    const session = createSession();
    const answers = { ...FIXTURE_ANSWERS, minorChildren: true };
    for (const step of STEPS) session.answer(answers[step.id]);
    expect(session.status).toBe('ineligible');
    expect(() => buildPacket(getProvider(), receipt, session.answers)).toThrowError(
      expect.objectContaining({ code: 'QUESTIONNAIRE_INCOMPLETE' })
    );
  });

  it('the stripe scaffold can never unlock a packet', async () => {
    const session = completeSession();
    const receipt = await payForPacket();
    // The scaffold rejects every receipt — no endpoint, no live payment.
    expect(STRIPE_PROVIDER.isValidReceipt(receipt)).toBe(false);
    expect(() => buildPacket(STRIPE_PROVIDER, receipt, session.answers)).toThrowError(
      expect.objectContaining({ code: PACKET_ERROR_CODES.PACKET_UNPAID })
    );
  });

  it('carries nothing sensitive: last4 + test ids only', async () => {
    const session = completeSession();
    const receipt = await payForPacket();
    const packet = buildPacket(getProvider(), receipt, session.answers);
    const html = packetToPrintableHtml(packet);
    const dumped = JSON.stringify(packet) + html;
    expect(dumped).not.toMatch(/4242 ?4242/);
    expect(dumped).not.toMatch(/\b\d{16}\b/);
    expect(dumped).not.toMatch(/secret/i);
  });
});

/* ── Checkout-success flow ───────────────────────────────────────── */

describe('checkout-success → packet flow', () => {
  it('a valid receipt produces the packet the customer prints', async () => {
    const session = completeSession();
    const receipt = await payForPacket();
    const packet = await checkoutSuccessFlow(receipt, session.answers);
    expect(packet).not.toBeNull();
    expect(packet.payment.receiptId).toBe(receipt.id);
    expect(packet.parties.petitioner).toBe('Alex Rivera');
  });

  it('an invalid receipt keeps the packet locked (no crash, no packet)', async () => {
    const session = completeSession();
    const packet = await checkoutSuccessFlow({ id: 'bogus' }, session.answers);
    expect(packet).toBeNull();
  });
});

/* ── Printable HTML ──────────────────────────────────────────────── */

describe('packetToPrintableHtml', () => {
  it('renders every packet section as a standalone document', async () => {
    const session = completeSession();
    const receipt = await payForPacket();
    const packet = buildPacket(getProvider(), receipt, session.answers);
    const html = packetToPrintableHtml(packet);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain(packet.packetId);
    expect(html).toContain(receipt.id);
    expect(html).toContain('Alex Rivera');
    expect(html).toContain('Jordan Rivera');
    expect(html).toContain('2015-06-20');
    expect(html).toContain('Dallas, Texas');
    expect(html).toContain('Texas');
    expect(html).toContain('Tulsa');
    // Signature lines print on paper
    expect(html).toContain('Petitioner signature');
    expect(html).toContain('Respondent signature');
    // Checklist items render
    for (const item of packet.checklist) {
      expect(html).toContain(item.title);
    }
  });

  it('escapes user input: no markup smuggling in the download', () => {
    const packet = {
      version: PACKET_VERSION,
      packetId: 'pkt_test_xss',
      generatedAt: new Date().toISOString(),
      payment: {
        receiptId: 'rcpt_test_000001',
        amountCents: 3000,
        currency: 'usd',
        cardLast4: '4242',
        paidAt: new Date().toISOString(),
        provider: 'test',
        testMode: true,
      },
      stateName: 'Texas',
      parties: { petitioner: '<script>alert(1)</script>', respondent: '"><img src=x onerror=alert(2)>' },
      marriage: { date: '2015-06-20', place: 'Evil <b>Town</b>' },
      filing: { county: 'Tulsa', court: 'Tulsa County District Court' },
      attestations: { residency: true, uncontested: true, noMinorChildren: true, propertySplit: true },
      checklist: [{ id: 'x', title: 'Step <one>', detail: 'Do "the" thing' }],
      disclaimer: 'Not a court form.',
    };
    const html = packetToPrintableHtml(packet);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>Town</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;Town&lt;/b&gt;');
  });

  it('escapeHtml covers the dangerous characters', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('refuses to render a packet that was never assembled', () => {
    expect(() => packetToPrintableHtml(null)).toThrowError(
      expect.objectContaining({ code: PACKET_ERROR_CODES.PACKET_UNPAID })
    );
    expect(() => downloadPacketHtml(null)).toThrowError(PacketError);
  });
});
