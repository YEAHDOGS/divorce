/**
 * checkout-unlock.test.js — end-to-end regression for the money milestone
 * unlock path, exactly as the staging flow runs it:
 *
 *   runCheckout (the one money step CheckoutModal calls)
 *     → provider-validated receipt
 *     → buildPacket(provider, receipt, answers)      // PACKET_UNPAID gate
 *     → packetToPrintableHtml(packet)                // pre-flight + output gates
 *
 * The older packet-smoke suite exercises buildOrganizer directly, so it
 * never touches the receipt gate. This suite proves the full unlock:
 * a real $30 staging checkout unlocks a complete printable packet, and
 * a decline, a forged receipt, or a wrong-amount receipt leaves the
 * packet locked with an honest PACKET_UNPAID error.
 */
import { describe, it, expect } from 'vitest';
import { runCheckout } from './checkout.js';
import { getProvider, ACTIVE_PROVIDER_NAME, PRODUCT } from './payments/index.js';
import {
  buildPacket,
  packetToPrintableHtml,
  assertPacketOutputComplete,
  validatePacketOutput,
  PacketError,
  PACKET_ERROR_CODES,
} from './packet.js';
import { createSession, STEPS } from './questionnaire.js';
import {
  assertDemoAnswersValid,
  STAGING_DEMO_ANSWERS,
} from './staging-demo-answers.js';

/** The answers a complete, eligible intake session hands to buildPacket. */
function sessionAnswers() {
  assertDemoAnswersValid();
  const session = createSession();
  for (const step of STEPS) {
    const result = session.answer(STAGING_DEMO_ANSWERS[step.id]);
    expect(result.ok, `step ${step.id} accepts staging fixture value`).toBe(true);
  }
  expect(session.status).toBe('complete');
  return session.answers;
}

/** The active staging provider — the one CheckoutModal pays through. */
function activeProvider() {
  const provider = getProvider(ACTIVE_PROVIDER_NAME);
  expect(typeof provider.isValidReceipt).toBe('function');
  return provider;
}

describe('staging checkout → packet unlock', () => {
  it('a $30 staging checkout unlocks a complete printable packet', async () => {
    const provider = activeProvider();
    const result = await runCheckout({ cardLast4: '4242' });
    expect(result.ok).toBe(true);
    const { receipt } = result;

    // The receipt the modal handed us must validate through the
    // provider's own gate — the same gate buildPacket enforces.
    expect(provider.isValidReceipt(receipt)).toBe(true);

    const packet = buildPacket(provider, receipt, sessionAnswers());
    expect(packet.packetId).toBe(`pkt_${receipt.id}`);
    expect(packet.payment.amountCents).toBe(PRODUCT.amountCents);
    expect(packet.payment.currency).toBe('usd');
    expect(packet.payment.cardLast4).toBe('4242');
    expect(packet.payment.receiptId).toBe(receipt.id);
    expect(packet.payment.testMode).toBe(true);

    // The downloaded document must print every required field —
    // nothing the user told us is dropped on the way to the clerk.
    const html = packetToPrintableHtml(packet);
    expect(validatePacketOutput(html, packet)).toEqual([]);
    expect(assertPacketOutputComplete(html, packet)).toBe(true);
    expect(html).toContain('$30.00 USD');
    expect(html).toContain('•••• 4242');
    expect(html).toContain('Jane Sample');
    expect(html).toContain('John Sample');
    expect(html).toContain('Tulsa');
    expect(html).toContain('Texas');
  });

  it('raw session answers and the demo fixture unlock identically', async () => {
    const provider = activeProvider();
    const checkout = await runCheckout({ cardLast4: '4242' });
    expect(checkout.ok).toBe(true);
    // The staging download button passes the demo answers directly.
    const packet = buildPacket(provider, checkout.receipt, STAGING_DEMO_ANSWERS);
    const html = packetToPrintableHtml(packet);
    expect(validatePacketOutput(html, packet)).toEqual([]);
    expect(html).toContain('John Sample');
  });

  it('a declined card can never produce a packet', async () => {
    const provider = activeProvider();
    const result = await runCheckout({ cardLast4: '0002' });
    expect(result.ok).toBe(false);
    expect(result.receipt).toBeUndefined();
    // No receipt, no unlock — the packet stays locked even with perfect
    // answers.
    expect(() => buildPacket(provider, result.receipt, sessionAnswers())).toThrowError(
      expect.objectContaining({ code: PACKET_ERROR_CODES.PACKET_UNPAID })
    );
  });

  it('a forged receipt can never produce a packet', async () => {
    const provider = activeProvider();
    const forged = {
      id: 'rcpt_forged_123',
      paymentIntentId: 'pi_forged_123',
      productId: PRODUCT.id,
      amount: PRODUCT.amountCents,
      currency: 'usd',
      cardLast4: '4242',
      status: 'succeeded',
      paidAt: new Date().toISOString(),
      testMode: true,
    };
    expect(provider.isValidReceipt(forged)).toBe(false);
    expect(() => buildPacket(provider, forged, sessionAnswers())).toThrowError(PacketError);
    try {
      buildPacket(provider, forged, sessionAnswers());
    } catch (e) {
      expect(e.code).toBe(PACKET_ERROR_CODES.PACKET_UNPAID);
    }
  });

  it('a receipt for the wrong amount or currency can never produce a packet', async () => {
    const provider = activeProvider();
    const checkout = await runCheckout({ cardLast4: '4242' });
    expect(checkout.ok).toBe(true);
    for (const tampered of [
      { ...checkout.receipt, amount: 9999 },
      { ...checkout.receipt, currency: 'eur' },
    ]) {
      expect(provider.isValidReceipt(tampered)).toBe(false);
      expect(() => buildPacket(provider, tampered, sessionAnswers())).toThrowError(
        expect.objectContaining({ code: PACKET_ERROR_CODES.PACKET_UNPAID })
      );
    }
  });

  it('the unlock path carries nothing sensitive: last4 + test ids only', async () => {
    const provider = activeProvider();
    const checkout = await runCheckout({ cardLast4: '4242' });
    expect(checkout.ok).toBe(true);
    const packet = buildPacket(provider, checkout.receipt, sessionAnswers());
    const html = packetToPrintableHtml(packet);
    const dumped = JSON.stringify({ receipt: checkout.receipt, packet, html });
    expect(dumped).not.toMatch(/\b\d{16}\b/);
    expect(dumped).not.toMatch(/sk_(test|live)_/);
    expect(dumped).not.toMatch(/whsec_/);
  });
});
