// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';
import { resolveLocale } from './i18n.js';

/** svelte-i18n applies locale.set() only after the lazy dictionary loads. */
async function waitForLocale(value, timeoutMs = 5000) {
  const start = Date.now();
  while (get(locale) !== value) {
    if (Date.now() - start > timeoutMs) throw new Error(`locale never became '${value}'`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('resolveLocale (regression: unsupported browser locales)', () => {
  it('normalizes regional variants to their base language', () => {
    expect(resolveLocale('es-MX')).toBe('es');
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('en-GB')).toBe('en');
  });

  it('is case-insensitive', () => {
    expect(resolveLocale('ES')).toBe('es');
    expect(resolveLocale('En')).toBe('en');
  });

  it('falls back to en for unsupported or missing tags', () => {
    expect(resolveLocale('fr')).toBe('en');
    expect(resolveLocale('fr-CA')).toBe('en');
    expect(resolveLocale('pt-BR')).toBe('en');
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale(null)).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });
});

describe('<html lang> sync (regression: lang never updated for a11y)', () => {
  it('reflects the active locale on document.documentElement', async () => {
    locale.set('es');
    await waitForLocale('es');
    expect(document.documentElement.lang).toBe('es');
    locale.set('en');
    await waitForLocale('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('never leaves an unsupported value on <html lang>', () => {
    locale.set('fr');
    expect(document.documentElement.lang).toBe('en');
    locale.set('en');
  });
});
