import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

// Nuxt maps `~` to the frontend root; mirror that so tests can import
// `~/utils/...`, `~/types`, etc. exactly as the app does.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['**/*.test.ts'],
    root: fileURLToPath(new URL('./frontend', import.meta.url)),
    setupFiles: [fileURLToPath(new URL('./frontend/test/setup.ts', import.meta.url))],
  },
  plugins: [vue()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./frontend', import.meta.url)),
    },
  },
})
