import { register, init, getLocaleFromNavigator } from 'svelte-i18n';

// Register English and Spanish locales.
// The JSON paths are relative to this file's location.
register('en', () => import('../messages/en.json'));
register('es', () => import('../messages/es.json'));

init({
  fallbackLocale: 'en',
  initialLocale: getLocaleFromNavigator(),
});
