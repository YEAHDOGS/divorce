import { describe, expect, it, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, screen } from '@testing-library/svelte';
import { render, cleanup } from '@testing-library/svelte';
import { locale } from 'svelte-i18n';
import '../../lib/i18n.js';
import QuestionStep from './QuestionStep.svelte';
import ProgressBar from './ProgressBar.svelte';
import EligibilityFail from './EligibilityFail.svelte';

afterEach(() => cleanup());

locale.set('en');

const SAMPLE_QUESTION = {
  title: 'Do you agree?',
  body: 'Sample explainer.',
  options: [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No', hint: 'Pick this to disagree' },
  ],
};

describe('questionnaire presentational components', () => {
  it('QuestionStep renders options and reports picks via onanswer', async () => {
    const onanswer = vi.fn();
    render(QuestionStep, {
      props: { question: SAMPLE_QUESTION, value: null, onanswer },
    });
    await screen.findByText('Do you agree?');
    await screen.findByText('Pick this to disagree');
    await fireEvent.click(screen.getByText('No'));
    expect(onanswer).toHaveBeenCalledWith('no');
  });

  it('QuestionStep marks the selected option', async () => {
    render(QuestionStep, {
      props: { question: SAMPLE_QUESTION, value: 'yes', onanswer: () => {} },
    });
    const yes = await screen.findByText('Yes');
    expect(yes.closest('[role="radio"]')).toHaveAttribute('aria-checked', 'true');
  });

  it('ProgressBar shows the localized step count', async () => {
    render(ProgressBar, { props: { current: 2, total: 8 } });
    await screen.findByText('Step 2 of 8');
  });

  it('EligibilityFail renders disclaimer copy and calls onhome', async () => {
    const onhome = vi.fn();
    render(EligibilityFail, { props: { reason: null, onhome } });
    await screen.findByText(/not the right fit/i);
    await fireEvent.click(screen.getByRole('button'));
    expect(onhome).toHaveBeenCalled();
  });
});
