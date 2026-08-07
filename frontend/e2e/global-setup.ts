import { execFileSync } from 'node:child_process'

export const E2E_OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'e2e-owner@test.local'
export const E2E_OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || 'e2e-password'

/**
 * Seed (idempotently) the approved owner account the e2e suite logs in with.
 *
 * Registration is owner-approved: new users register as `status = pending` and
 * cannot sign in until an admin approves them, so a test can no longer
 * self-provision a session through the /register UI. There is no admin account
 * in the test database to approve through the API, so we create the owner
 * directly via Laravel's tinker (the same user `php artisan db:seed` produces,
 * but deterministic across runs and checked in with the suite).
 *
 * Runs AFTER Playwright starts the webServers but before any test, so the
 * seeded user is present for every spec. `updateOrCreate` keeps it idempotent.
 */
export default async function globalSetup() {
  const php = `
App\\Models\\User::updateOrCreate(
  ['email' => '${E2E_OWNER_EMAIL}'],
  ['name' => 'E2E Owner', 'password' => '${E2E_OWNER_PASSWORD}', 'status' => 'approved', 'approved_at' => now()]
);
echo 'seeded owner ' . App\\Models\\User::where('email', '${E2E_OWNER_EMAIL}')->value('status');
`.trim()

  // Laravel's User model casts `password` to `hashed`, so passing the plaintext
  // password makes the cast hash it (bcrypt() here would double-hash).
  execFileSync('php', ['artisan', 'tinker', '--execute', php], {
    cwd: '..',
    stdio: 'inherit',
    encoding: 'utf8',
  })
}
