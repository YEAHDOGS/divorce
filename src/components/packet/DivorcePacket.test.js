/**
 * DivorcePacket.test.js — component regression for the printable packet.
 *
 * Pins what the customer actually sees after the $30 test payment:
 *   - every packet section is present (payment, parties, marriage,
 *     filing, attestations, checklist, signatures, disclaimer)
 *   - the price-paid line reads exactly "$30.00 USD"
 *   - receipt id, card last4, and provider render in the payment block
 *   - the TEST MODE badge shows for test receipts
 *   - print/download/back buttons behave (print defaults to window.print)
 *   - nothing renders without a packet (the paid packet can't be faked
 *     by rendering the component with empty props)
 */
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, render, cleanup } from '@testing-library/svelte';
import { locale } from 'svelte-i18n';
import '../../lib/i18n.js';
import DivorcePacket from './DivorcePacket.svelte';
import { STEPS, createSession, checkEligibility } from '../../lib/questionnaire.js';
import { getProvider, PRODUCT } from '../../lib/payments/index.js';
import { buildPacket } from '../../lib/packet.js';

afterEach(() => cleanup());
beforeEach(() => locale.set('en'));

/* ── Fixtures: the exact pipeline the checkout modal performs ────── */

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

async function paidPacket() {
  const session = createSession();
  for (const step of STEPS) session.answer(FIXTURE_ANSWERS[step.id]);
  if (session.status !== 'complete' || !checkEligibility(session.answers).eligible) {
    throw new Error('fixture session did not reach complete+eligible');
  }
  const provider = getProvider();
  const receipt = await provider.createPayment(PRODUCT.amountCents, PRODUCT.currency, {
    productId: PRODUCT.id,
    cardLast4: '4242',
  });
  return buildPacket(provider, receipt, session.answers);
}

function stubWindowPrint() {
  const print = vi.fn();
  Object.defineProperty(window, 'print', { value: print, configurable: true });
  return print;
}

/* ── Section presence + data completeness ────────────────────────── */

describe('DivorcePacket rendering', () => {
  it('renders every packet section', async () => {
    const packet = await paidPacket();
    render(DivorcePacket, { props: { packet } });
    for (const heading of [
      'Payment',
      'Parties',
      'Marriage',
      'Filing',
      'Attestations',
      'Filing checklist',
      'Signatures',
    ]) {
      expect(await screen.findByText(heading)).toBeInTheDocument();
    }
  });

  it('shows the price-paid line as $30.00 USD', async () => {
    const packet = await paidPacket();
    render(DivorcePacket, { props: { packet } });
    expect(await screen.findByText('$30.00 USD')).toBeInTheDocument();
  });

  it('shows receipt id, card last4, paid date, and provider in the payment block', async () => {
    const packet = await paidPacket();
    render(DivorcePacket, { props: { packet } });
    expect(await screen.findByText(packet.payment.receiptId)).toBeInTheDocument();
    expect(screen.getByText('•••• 4242')).toBeInTheDocument();
    expect(screen.getByText(packet.payment.provider)).toBeInTheDocument();
    // A real localized date, never a raw ISO string or "Invalid Date".
    expect(
      screen.getByText(new Date(packet.payment.paidAt).toLocaleDateString())
    ).toBeInTheDocument();
  });

  it('renders everything the user told us: parties, marriage, filing', async () => {
    const packet = await paidPacket();
    render(DivorcePacket, { props: { packet } });
    expect(await screen.findByText('Alex Rivera')).toBeInTheDocument();
    expect(screen.getByText('Jordan Rivera')).toBeInTheDocument();
    expect(screen.getByText('2015-06-20')).toBeInTheDocument();
    expect(screen.getByText('Dallas, Texas')).toBeInTheDocument();
    expect(screen.getByText('Texas')).toBeInTheDocument();
    expect(screen.getByText('Tulsa')).toBeInTheDocument();
    // Attestations resolve yes/no labels through i18n.
    expect(screen.getAllByText('Yes').length).toBeGreaterThanOrEqual(4);
  });

  it('renders every checklist item and both signature lines', async () => {
    const packet = await paidPacket();
    render(DivorcePacket, { props: { packet } });
    expect(screen.getAllByRole('listitem')).toHaveLength(packet.checklist.length);
    expect(
      await screen.findByText('File the Original Petition for Divorce')
    ).toBeInTheDocument();
    expect(screen.getByText('Petitioner signature')).toBeInTheDocument();
    expect(screen.getByText('Respondent signature')).toBeInTheDocument();
  });

  it('shows the TEST MODE badge for test receipts', async () => {
    const packet = await paidPacket();
    expect(packet.payment.testMode).toBe(true);
    render(DivorcePacket, { props: { packet } });
    expect(
      await screen.findByText('TEST MODE — no real charge')
    ).toBeInTheDocument();
  });

  it('prints the clerk-verification disclaimer with the packet', async () => {
    const packet = await paidPacket();
    render(DivorcePacket, { props: { packet } });
    expect(
      await screen.findByText(/Before filing, confirm with your county clerk/)
    ).toBeInTheDocument();
  });

  it('renders nothing without a packet', () => {
    const { container } = render(DivorcePacket, { props: { packet: null } });
    expect(container.textContent.trim()).toBe('');
    expect(container.querySelector('button')).toBeNull();
  });
});

/* ── Actions ─────────────────────────────────────────────────────── */

describe('DivorcePacket actions', () => {
  it('the print button calls window.print by default', async () => {
    const print = stubWindowPrint();
    const packet = await paidPacket();
    render(DivorcePacket, { props: { packet } });
    await fireEvent.click(await screen.findByText('Print packet'));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('the print button prefers an onprint override', async () => {
    stubWindowPrint();
    const onprint = vi.fn();
    const packet = await paidPacket();
    render(DivorcePacket, { props: { packet, onprint } });
    await fireEvent.click(await screen.findByText('Print packet'));
    expect(onprint).toHaveBeenCalledTimes(1);
    expect(window.print).not.toHaveBeenCalled();
  });

  it('the download button calls ondownload', async () => {
    const ondownload = vi.fn();
    const packet = await paidPacket();
    render(DivorcePacket, { props: { packet, ondownload } });
    await fireEvent.click(await screen.findByText('Download packet'));
    expect(ondownload).toHaveBeenCalledTimes(1);
  });

  it('shows the back-to-review button only when onback is provided', async () => {
    const packet = await paidPacket();
    const { unmount } = render(DivorcePacket, { props: { packet } });
    expect(
      screen.queryByText('Back to organizer preview')
    ).not.toBeInTheDocument();
    unmount();

    const onback = vi.fn();
    render(DivorcePacket, { props: { packet, onback } });
    const back = await screen.findByText('Back to organizer preview');
    await fireEvent.click(back);
    expect(onback).toHaveBeenCalledTimes(1);
  });
});
