import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    headless: true,
  },
  webServer: [
    {
      command: 'php artisan serve --port=8002',
      port: 8002,
      cwd: '..',
      reuseExistingServer: true,
      // CI cold-boot is slow (fresh runner, no warm cache); give Laravel a
      // generous startup window so the job doesn't die in the webServer phase.
      timeout: 180000,
    },
    {
      command: 'npm run dev',
      port: 3000,
      reuseExistingServer: true,
      // TEST=1 makes @nuxt/devtools bail in its module setup, so the dev-only
      // floating widget can't sit on top of the mobile toolbar and swallow
      // clicks during e2e (it is absent in production).
      env: { TEST: '1' },
      // Nuxt's dev cold-start compiles the whole app; on a fresh CI runner that
      // routinely exceeds the 60s Playwright default.
      timeout: 300000,
    },
    {
      // Yjs WS relay — the collab spec's live-sync assertions depend on it.
      // Auth is ON (share token / session cookie), so the relay reaches Laravel
      // at :8002 to validate every connection.
      command: 'LARAVEL_URL=http://localhost:8002 WS_PORT=3001 node server/ws-server.js',
      port: 3001,
      cwd: '.',
      reuseExistingServer: true,
      timeout: 180000,
    },
  ],
})
