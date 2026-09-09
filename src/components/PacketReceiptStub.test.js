// @vitest-environment jsdom
/**
 * PacketReceiptStub.test.js — the printable paid-receipt / packet stub page.
 *
 * Pins the post-checkout contract: payment id, date, $30.00 amount, the
 * placeholder packet sections, and TEST-MODE copy on every render path.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
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
  status: 'succeeded',
  testMode: true,
};

describe('PacketReceiptStub', () => {
  it('renders the payment id, amount, and date', () => {
    render(PacketReceiptStub, { props: { receipt: RECEIPT } });
    expect(screen.getByText(RECEIPT.id)).not.toBeNull();
    expect(screen.getByText(RECEIPT.paymentIntentId)).not.toBeNull();
    expect(screen.getByText('$30.00')).not.toBeNull();
    expect(screen.getAllByText(/TEST MODE/i).length).toBeGreaterThanOrEqual(2);
  });

  it('lists the packet sections and says they come from staging demo answers', () => {
    render(PacketReceiptStub, { props: { receipt: RECEIPT } });
    expect(screen.getByText(/Petition for divorce/)).not.toBeNull();
    expect(screen.getByText(/Filing instructions/)).not.toBeNull();
    expect(screen.getByText(/staging demo answers/i)).not.toBeNull();
    expect(screen.queryAllByText(/placeholder/).length).toBe(0);
  });

  it('Download button builds the packet and triggers a file download', () => {
    const createObjectURL = vi.fn(() => 'blob:fake-packet');
    const revokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, 'appendChild');

    render(PacketReceiptStub, { props: { receipt: RECEIPT } });
    fireEvent.click(screen.getByRole('button', { name: /download printable packet/i }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    // The anchor downloads as the packet id, derived from the receipt id.
    const anchor = appendSpy.mock.calls
      .map((args) => args[0])
      .find((el) => el instanceof HTMLAnchorElement && el.download);
    expect(anchor && anchor.download).toBe('pkt_rcpt_test_abc123.html');

    clickSpy.mockRestore();
    appendSpy.mockRestore();
  });

  it('shows an honest error when the receipt cannot unlock the packet', async () => {
    render(
      PacketReceiptStub,
      { props: { receipt: { ...RECEIPT, id: 'rcpt_not_real', testMode: false } } }
    );
    fireEvent.click(screen.getByRole('button', { name: /download printable packet/i }));
    await tick();
    expect(screen.getByRole('alert').textContent).toMatch(/could not be built/i);
    expect(screen.getByRole('alert').textContent).toMatch(/PACKET_UNPAID/);
  });

  it('offers no packet download without a receipt', () => {
    render(PacketReceiptStub, { props: { receipt: null } });
    expect(
      screen.queryByRole('button', { name: /download printable packet/i })
    ).toBeNull();
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
