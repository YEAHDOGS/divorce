// @vitest-environment jsdom
/**
 * PacketReceiptStub.test.js — the printable paid-receipt / packet stub page.
 *
 * Pins the post-checkout contract: payment id, date, $30.00 amount, the
 * placeholder packet sections, and TEST-MODE copy on every render path.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import PacketReceiptStub from './PacketReceiptStub.svelte';

afterEach(() => cleanup());

const RECEIPT = {
  id: 'rcpt_test_abc123',
  paymentIntentId: 'pi_test_abc123',
  amount: 3000,
  currency: 'usd',
  cardLast4: '4242',
  paidAt: '2026-09-09T14:00:00.000Z',
  productId: 'uncontested_packet',
};

describe('PacketReceiptStub', () => {
  it('renders the payment id, amount, and date', () => {
    render(PacketReceiptStub, { props: { receipt: RECEIPT } });
    expect(screen.getByText(RECEIPT.id)).not.toBeNull();
    expect(screen.getByText(RECEIPT.paymentIntentId)).not.toBeNull();
    expect(screen.getByText('$30.00')).not.toBeNull();
    expect(screen.getAllByText(/TEST MODE/i).length).toBeGreaterThanOrEqual(2);
  });

  it('lists the placeholder packet sections', () => {
    render(PacketReceiptStub, { props: { receipt: RECEIPT } });
    expect(screen.getByText(/Petition for divorce/)).not.toBeNull();
    expect(screen.getByText(/Filing instructions/)).not.toBeNull();
    expect(screen.getAllByText(/placeholder/)).not.toHaveLength(0);
  });

  it('shows the honest no-receipt copy when nothing was paid', () => {
    render(PacketReceiptStub, { props: { receipt: null } });
    expect(screen.getByText(/No receipt to show yet/)).not.toBeNull();
  });

  it('Print button calls window.print; Back calls onback', () => {
    const onback = vi.fn();
    render(PacketReceiptStub, { props: { receipt: RECEIPT, onback } });
    const printSpy = vi.fn();
    window.print = printSpy;
    fireEvent.click(screen.getByRole('button', { name: /print receipt/i }));
    expect(printSpy).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onback).toHaveBeenCalled();
  });
});
