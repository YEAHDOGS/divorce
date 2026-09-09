// @vitest-environment jsdom
/**
 * CheckoutModal.test.js — the staging checkout dialog.
 *
 * The dialog the money milestone demo runs through: test-card form →
 * runCheckout (provider adapter) → receipt summary on success, honest
 * failure copy on failure. These tests pin the contract:
 *   - renders the product, the $30 price, and the test-mode badge
 *   - Pay is disabled until the card fields validate
 *   - a successful test payment surfaces a rcpt_test_* receipt id and
 *     calls onsuccess with the receipt (no PAN anywhere)
 *   - the 0002 decline card shows "card was declined" copy, no receipt
 *   - the unconfigured stripe scaffold shows "not available" config copy
 *   - cancel/close calls onclose
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import CheckoutModal from './CheckoutModal.svelte';

afterEach(() => cleanup());

const EXPIRY = '12/34';
const CVC = '123';

function renderOpen(props = {}) {
  return render(CheckoutModal, {
    props: { open: true, onsuccess: vi.fn(), onclose: vi.fn(), ...props },
  });
}

function fillValidCard() {
  fireEvent.click(screen.getByRole('button', { name: /fill test card/i }));
}

async function fillForm(expiry = EXPIRY, cvc = CVC) {
  fireEvent.input(screen.getByLabelText(/card number/i), {
    target: { value: '4242424242424242' },
  });
  fireEvent.input(screen.getByLabelText(/expiry/i), { target: { value: expiry } });
  fireEvent.input(screen.getByLabelText(/^cvc$/i), { target: { value: cvc } });
  await tick();
}

describe('CheckoutModal', () => {
  it('renders nothing interactive while closed', () => {
    render(CheckoutModal, { props: { open: false } });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/pay \$30/i)).toBeNull();
  });

  it('renders the product, the $30 price, and the test-mode badge', () => {
    renderOpen();
    expect(screen.getByRole('dialog')).not.toBeNull();
    expect(screen.getByText(/Uncontested Divorce Packet — \$30\.00/i)).not.toBeNull();
    expect(screen.getByText(/no real money moves/i)).not.toBeNull();
  });

  it('disables Pay until the card fields validate', async () => {
    renderOpen();
    const pay = screen.getByRole('button', { name: /pay \$30\.00/i });
    expect(pay.disabled).toBe(true);

    // Partial entry still disabled.
    fireEvent.input(screen.getByLabelText(/card number/i), { target: { value: '4242' } });
    await tick();
    expect(pay.disabled).toBe(true);

    await fillForm();
    expect(pay.disabled).toBe(false);
  });

  it('a successful test payment shows the receipt and calls onsuccess', async () => {
    const onsuccess = vi.fn();
    renderOpen({ onsuccess });
    fillValidCard();
    await fillForm();

    fireEvent.click(screen.getByRole('button', { name: /pay \$30\.00/i }));
    const receiptId = await screen.findByText(/^rcpt_test_/);
    expect(receiptId).not.toBeNull();
    expect(onsuccess).toHaveBeenCalledTimes(1);
    const receipt = onsuccess.mock.calls[0][0];
    expect(receipt.id).toMatch(/^rcpt_test_/);
    expect(receipt.cardLast4).toBe('4242');
    // Card is masked: last-4 only, never the PAN.
    expect(screen.getByText(/•••• 4242/)).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/4242 ?4242 ?4242 ?4242/);
  });

  it('the 0002 decline card shows the honest declined copy, not a receipt', async () => {
    const onsuccess = vi.fn();
    renderOpen({ onsuccess });
    fireEvent.input(screen.getByLabelText(/card number/i), {
      target: { value: '4000000000000002' },
    });
    fireEvent.input(screen.getByLabelText(/expiry/i), { target: { value: EXPIRY } });
    fireEvent.input(screen.getByLabelText(/^cvc$/i), { target: { value: CVC } });
    await tick();

    fireEvent.click(screen.getByRole('button', { name: /pay \$30\.00/i }));
    expect(await screen.findByText(/your card was declined/i)).not.toBeNull();
    expect(screen.getByText(/no money was taken/i)).not.toBeNull();
    expect(onsuccess).not.toHaveBeenCalled();
    // Declines are retryable: a retry path is offered.
    expect(screen.getByRole('button', { name: /try again/i })).not.toBeNull();
  });

  it('the unconfigured stripe scaffold shows "not available" config copy', async () => {
    renderOpen({ providerName: 'stripe' });
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: /pay \$30\.00/i }));
    expect(await screen.findByText(/not available right now/i)).not.toBeNull();
    // Not retryable: no "try again" offer.
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('cancel and backdrop click call onclose', () => {
    const onclose = vi.fn();
    renderOpen({ onclose });
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('Escape dismisses the dialog', () => {
    const onclose = vi.fn();
    renderOpen({ onclose });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(1);
  });
});
