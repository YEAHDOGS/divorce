import { register, init, getLocaleFromNavigator, locale } from 'svelte-i18n';

// Register English and Spanish locales.
// The JSON paths are relative to this file's location.
register('en', () => import('../messages/en.json'));
register('es', () => import('../messages/es.json'));

const SUPPORTED_LOCALES = ['en', 'es'];
const FALLBACK_LOCALE = 'en';

/**
 * Normalize any BCP-47 language tag (e.g. "es-MX") to a supported dictionary
 * locale. Unknown or missing tags fall back to English so the locale store
 * never holds a value with no dictionary behind it.
 *
 * @param {*} tag language tag from the browser or the locale store
 * @returns {'en'|'es'}
 */
export function resolveLocale(tag) {
  const base = String(tag || '').split('-')[0].trim().toLowerCase();
  return SUPPORTED_LOCALES.includes(base) ? base : FALLBACK_LOCALE;
}

init({
  fallbackLocale: FALLBACK_LOCALE,
  initialLocale: resolveLocale(getLocaleFromNavigator()),
});

// Keep <html lang> in sync with the active locale so screen readers and
// search engines see the real content language.
if (typeof document !== 'undefined') {
  locale.subscribe((value) => {
    document.documentElement.lang = resolveLocale(value);
  });
}
