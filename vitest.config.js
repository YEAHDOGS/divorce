import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

// Mirrors vite.config.js (dev/build) but adds test-only settings:
//  - jsdom so component tests get a DOM
//  - the `browser` condition so the `svelte` package resolves to its
//    client build (without it, mount() resolves to index-server.js and
//    @testing-library/svelte cannot render components)
export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte()
  ],
  resolve: {
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
  },
})
