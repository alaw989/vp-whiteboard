import { execFileSync } from 'node:child_process'

export const E2E_OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'e2e-owner@test.local'
export const E2E_OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || 'e2e-password'
export const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'e2e-admin@test.local'
export const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'e2e-password'
export const E2E_PENDING_EMAIL = process.env.E2E_PENDING_EMAIL || 'e2e-pending@test.local'
export const E2E_PENDING_PASSWORD = process.env.E2E_PENDING_PASSWORD || 'e2e-password'
export const E2E_DENY_EMAIL = process.env.E2E_DENY_EMAIL || 'e2e-deny@test.local'
export const E2E_DENY_PASSWORD = process.env.E2E_DENY_PASSWORD || 'e2e-password'

/**
 * Seed (idempotently) the accounts the e2e suite uses:
 *
 * - the approved, NON-admin owner the existing specs log in with
 *   (smoke/collab/mobile-touch). Kept non-admin so the "Admins Only" guard
 *   spec has a real non-admin session to assert against.
 * - an approved ADMIN (is_admin => true) for the approvals spec.
 * - a PENDING user for the approvals spec. `updateOrCreate` resets `status`
 *   to pending on every run, so the approve flow is re-runnable even though a
 *   previous run already approved (and thereby emptied) the list.
 *
 * Registration is owner-approved: new users register as `status = pending` and
 * cannot sign in until an admin approves them, so a test can no longer
 * self-provision a session through the /register UI. There is no admin account
 * in the test database to approve through the API, so we create these directly
 * via Laravel's tinker (deterministic across runs and checked in with the suite).
 *
 * Runs AFTER Playwright starts the webServers but before any test, so the
 * seeded users are present for every spec. `updateOrCreate` keeps it idempotent.
 */
export default async function globalSetup() {
  const php = `
App\\Models\\User::updateOrCreate(
  ['email' => '${E2E_OWNER_EMAIL}'],
  ['name' => 'E2E Owner', 'password' => '${E2E_OWNER_PASSWORD}', 'status' => 'approved', 'approved_at' => now(), 'is_admin' => false]
);
App\\Models\\User::updateOrCreate(
  ['email' => '${E2E_ADMIN_EMAIL}'],
  ['name' => 'E2E Admin', 'password' => '${E2E_ADMIN_PASSWORD}', 'status' => 'approved', 'approved_at' => now(), 'is_admin' => true]
);
App\\Models\\User::updateOrCreate(
  ['email' => '${E2E_PENDING_EMAIL}'],
  ['name' => 'E2E Pending', 'password' => '${E2E_PENDING_PASSWORD}', 'status' => 'pending', 'is_admin' => false]
);
App\\Models\\User::updateOrCreate(
  ['email' => '${E2E_DENY_EMAIL}'],
  ['name' => 'E2E Deny', 'password' => '${E2E_DENY_PASSWORD}', 'status' => 'pending', 'is_admin' => false]
);
echo 'seeded owner ' . App\\Models\\User::where('email', '${E2E_OWNER_EMAIL}')->value('status')
  . ' admin ' . var_export(App\\Models\\User::where('email', '${E2E_ADMIN_EMAIL}')->value('is_admin'), true)
  . ' pending ' . App\\Models\\User::where('email', '${E2E_PENDING_EMAIL}')->value('status')
  . ' deny ' . App\\Models\\User::where('email', '${E2E_DENY_EMAIL}')->value('status');
`.trim()

  // Laravel's User model casts `password` to `hashed`, so passing the plaintext
  // password makes the cast hash it (bcrypt() here would double-hash).
  execFileSync('php', ['artisan', 'tinker', '--execute', php], {
    cwd: '..',
    stdio: 'inherit',
    encoding: 'utf8',
  })
}
