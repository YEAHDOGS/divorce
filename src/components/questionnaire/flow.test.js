import { describe, expect, it, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, screen } from '@testing-library/svelte';
import { render, cleanup } from '@testing-library/svelte';
import { locale } from 'svelte-i18n';
import '../../lib/i18n.js';
import QuestionnaireFlow from './QuestionnaireFlow.svelte';

afterEach(() => cleanup());

locale.set('en');

async function clickOption(label) {
  await fireEvent.click(await screen.findByText(label));
}

async function fillText(question, value) {
  const input = await screen.findByLabelText(question);
  await fireEvent.input(input, { target: { value } });
  await fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
}

describe('QuestionnaireFlow engine wiring', () => {
  it('advances through option steps and text steps', async () => {
    render(QuestionnaireFlow, { props: { onexit: () => {} } });

    await screen.findByText('Which state will you file in?');
    await clickOption('Texas');
    await screen.findByText('What is your full legal name?');

    // invalid name shows the localized validation error, stays on step
    await fillText('What is your full legal name?', 'X');
    await screen.findByRole('alert');

    // valid name advances
    await fillText('What is your full legal name?', 'Jane Doe');
    await screen.findByText('What is your spouse’s full legal name?');
  });

  it('rules the user out with a localized reason when contested', async () => {
    const onexit = vi.fn();
    render(QuestionnaireFlow, { props: { onexit } });

    await screen.findByText('Which state will you file in?');
    await clickOption('Texas');
    await fillText('What is your full legal name?', 'Jane Doe');
    await fillText('What is your spouse’s full legal name?', 'John Doe');
    await fillText('Which county will you file in?', 'Harris County');
    await fillText('When were you married?', '2015-06-01');
    await fillText('Where were you married? (city, state)', 'Houston, Texas');
    await screen.findByText('Has at least one spouse lived in the filing state for 6 months or more?');
    await clickOption('Yes');
    await screen.findByText('Do both spouses agree to the divorce and all of its terms?');
    await clickOption('No');

    // ineligible dead-end with the engine's localized reason
    await screen.findByText('This tool is not the right fit');
    await screen.findByText('Both spouses must agree to the divorce and all of its terms.');

    await fireEvent.click(await screen.findByRole('button', { name: 'Back to the homepage' }));
    expect(onexit).toHaveBeenCalledTimes(1);
  });

  it('completes the full flow and shows the printable organizer', async () => {
    render(QuestionnaireFlow, { props: { onexit: () => {} } });

    await screen.findByText('Which state will you file in?');
    await clickOption('Oklahoma');
    await fillText('What is your full legal name?', 'Jane Doe');
    await fillText('What is your spouse’s full legal name?', 'John Doe');
    await fillText('Which county will you file in?', 'Canadian County');
    await fillText('When were you married?', '2018-03-14');
    await fillText('Where were you married? (city, state)', 'El Reno, Oklahoma');
    await screen.findByText('Has at least one spouse lived in the filing state for 6 months or more?');
    await clickOption('Yes');
    await screen.findByText('Do both spouses agree to the divorce and all of its terms?');
    await clickOption('Yes');
    await screen.findByText('Do you have any minor children together?');
    await clickOption('No');
    await screen.findByText('Have you already agreed on how to divide all property and debts?');
    await clickOption('Yes');

    // complete: review screen with organizer sections and legal banner
    await screen.findByText('Your filing organizer');
    await screen.findByText('Jane Doe');
    await screen.findByText('Canadian County');
    await screen.findByText(/Oklahoma clerks can’t provide divorce forms/i);
  });

  it('runs the completion → test-checkout → printable packet pipeline', async () => {
    render(QuestionnaireFlow, { props: { onexit: () => {} } });

    await screen.findByText('Which state will you file in?');
    await clickOption('Texas');
    await fillText('What is your full legal name?', 'Jane Doe');
    await fillText('What is your spouse’s full legal name?', 'John Doe');
    await fillText('Which county will you file in?', 'Harris County');
    await fillText('When were you married?', '2015-06-01');
    await fillText('Where were you married? (city, state)', 'Houston, Texas');
    await screen.findByText('Has at least one spouse lived in the filing state for 6 months or more?');
    await clickOption('Yes');
    await screen.findByText('Do both spouses agree to the divorce and all of its terms?');
    await clickOption('Yes');
    await screen.findByText('Do you have any minor children together?');
    await clickOption('No');
    await screen.findByText('Have you already agreed on how to divide all property and debts?');
    await clickOption('Yes');

    // Every questionnaire answer lands in the packet — including the yes/no
    // statements section (regression: these used to be silently dropped).
    await screen.findByText('Your statements');
    await screen.findByText('Has at least one spouse lived in the filing state for 6 months or more?');
    await screen.findByText('Do you have any minor children together?');
    const yesValues = await screen.findAllByText('Yes');
    expect(yesValues.length).toBeGreaterThanOrEqual(3); // residency, uncontested, property split
    const noValues = await screen.findAllByText('No');
    expect(noValues.length).toBeGreaterThanOrEqual(1); // no minor children

    // Test-mode checkout assembles the paid packet page: fixtures only,
    // no network. Success jumps straight to the customer's packet.
    await fireEvent.click(await screen.findByRole('button', { name: 'Pay $30 to unlock your printable packet' }));
    await screen.findByText('Test mode — no real money moves');
    await fireEvent.click(await screen.findByRole('button', { name: /^Pay \$30 — test$/ }));
    await screen.findByText('Test payment succeeded', {}, { timeout: 8000 });
    await fireEvent.click(await screen.findByRole('button', { name: 'Continue to your packet' }));

    // Paid packet page: heading, test badge, receipt block, every section
    // the customer told us — all under test-mode ids.
    await screen.findByText('Your divorce packet');
    await screen.findByText('TEST MODE — no real charge');
    await screen.findByText('Jane Doe');
    await screen.findByText('Harris County');
    // Receipt id shows on the packet (receipt block + packet id line).
    const receiptLines = await screen.findAllByText(/rcpt_test_\d+/);
    expect(receiptLines.length).toBeGreaterThanOrEqual(1);
    await screen.findByText('Signatures');
    await screen.findByRole('button', { name: 'Print packet' });
    await screen.findByRole('button', { name: 'Download packet' });

    // Back to the organizer preview works; the packet page is reachable
    // again from the paid badge.
    await fireEvent.click(await screen.findByRole('button', { name: 'Back to organizer preview' }));
    await screen.findByText('Paid — test mode');
    await fireEvent.click(await screen.findByRole('button', { name: 'Continue to your packet' }));
    await screen.findByText('Your divorce packet');
  });
});
