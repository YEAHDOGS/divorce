import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
//
// `base` is '/divorce/' for production builds (GitHub Pages project site
// lives at https://yeahdogs.github.io/divorce/) and '/' for `npm run dev`
// so local development keeps working at http://localhost:5173/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/divorce/' : '/',
  plugins: [
    tailwindcss(),
    svelte()
  ],
  // Component tests need the DOM build of svelte, not the SSR entry.
  // VITEST is only set when running under vitest, so the app build is untouched.
  resolve: process.env.VITEST ? { conditions: ['browser'] } : {},
  test: {
    environment: 'jsdom',
  },
}))
