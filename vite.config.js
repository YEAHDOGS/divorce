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
}))
