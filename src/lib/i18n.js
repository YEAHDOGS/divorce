import { register, init, getLocaleFromNavigator } from 'svelte-i18n';

// Register English and Spanish locales.
// The JSON paths are relative to this file's location.
register('en', () => import('../messages/en.json'));
register('es', () => import('../messages/es.json'));

// Normalize the browser locale to its base language (e.g. "es-MX" -> "es")
// so regional variants still match a registered dictionary.
const BROWSER_LOCALE = (getLocaleFromNavigator() || 'en').split('-')[0];

init({
  fallbackLocale: 'en',
  initialLocale: BROWSER_LOCALE,
});
