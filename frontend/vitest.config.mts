import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

// Nuxt maps `~` to the frontend root; mirror that so tests can import
// `~/utils/...`, `~/types`, etc. exactly as the app does.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['**/*.test.ts'],
    root: fileURLToPath(new URL('./', import.meta.url)),
    setupFiles: [fileURLToPath(new URL('./test/setup.ts', import.meta.url))],
    coverage: {
      provider: 'v8',
      // Measure only the TS logic that unit tests exercise: composables
      // (incl. tools/), utils, and the server relay. Components/`.vue` and
      // e2e specs are covered by the playwright suite — out of scope here.
      include: ['composables/**/*.ts', 'utils/**/*.ts', 'server/**/*.{js,ts}'],
      exclude: [
        'composables/**/*.test.ts',
        'composables/**/__tests__/**',
        'utils/**/*.test.ts',
        'server/**/*.test.ts',
        'e2e/**',
      ],
      reporter: ['text', 'json-summary'],
      reportOnFailure: true,
    },
  },
  plugins: [vue() as any],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
})
