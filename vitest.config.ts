import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Nuxt maps `~` to the frontend root; mirror that so tests can import
// `~/utils/...`, `~/types`, etc. exactly as the app does.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['**/*.test.ts'],
    root: fileURLToPath(new URL('./frontend', import.meta.url)),
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./frontend', import.meta.url)),
    },
  },
})
