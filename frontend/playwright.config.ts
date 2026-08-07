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
    },
    {
      command: 'npm run dev',
      port: 3000,
      reuseExistingServer: true,
    },
    {
      // Yjs WS relay — the collab spec's live-sync assertions depend on it.
      // Auth is ON (share token / session cookie), so the relay reaches Laravel
      // at :8002 to validate every connection.
      command: 'LARAVEL_URL=http://localhost:8002 WS_PORT=3001 node server/ws-server.js',
      port: 3001,
      cwd: '.',
      reuseExistingServer: true,
    },
  ],
})
