# Spec 008: Seed production auth accounts via UserSeeder (wired + tested)

## Status: Draft

Verify: php artisan test

## Overview

Production still authenticates with the shared legacy `AUTH_PASSWORD`; the Laravel migration
replaces that with real per-user Breeze (Sanctum SPA-cookie) accounts. A `UserSeeder` already
exists and is well-written (idempotent, reads accounts from `SEED_USERS_JSON`, never clobbers an
existing user's password) — but it is **not wired into `DatabaseSeeder`** and has **no test**, so
`php artisan db:seed` (no `--class`) won't create the accounts and there's no guard against
regressions. Before production can migrate, seeding real accounts must be a one-command, tested
step.

Goal: make `php artisan db:seed` reliably create the configured accounts (idempotently), with a
PHPUnit test proving create + no-duplicate + no-clobber behavior.

## Context

- `database/seeders/UserSeeder.php` (currently untracked) — reads accounts from
  `config('users.seed_json')` or env `SEED_USERS_JSON` (a JSON array of `{name, email, password?}`).
  Creates missing users (random 20-char password if none given, printed once), updates only the
  `name` of existing users (never the password), marks all email-verified. No-op + warning when
  unconfigured.
- `database/seeders/DatabaseSeeder.php` — still the Breeze-default factory stub
  (`User::factory()->create(['email' => 'test@example.com'])`); does NOT call `UserSeeder`.
- `config/users.php` — ABSENT. `UserSeeder::accounts()` falls back to `env('SEED_USERS_JSON')`
  when missing, so it works via env today. A `config/users.php` wrapper is optional but makes the
  source explicit + `config:cache`-friendly; if added, it should `return ['seed_json' => env('SEED_USERS_JSON')]`.
- `app/Models/User.php` — Breeze model; `password` is cast `hashed`, so seeders pass plaintext.
- Test DB: `phpunit.xml` present; Breeze ships `tests/Feature/Auth/*Test.php` using
  `RefreshDatabase`. New test should use `RefreshDatabase` + the existing sqlite test config so
  `php artisan test` needs no live MySQL. (If `vendor/` is absent on the runner, `composer install`
  is a precondition — not part of the acceptance.)

## Requirements

- `DatabaseSeeder::run()` MUST call `UserSeeder`, but ONLY when accounts are configured (so an
  empty/unset `SEED_USERS_JSON` is a no-op). Rationale: `php artisan db:seed` in local/test/CI
  must not create random production accounts or pollute the test DB. The existing `test@example.com`
  factory stub may stay or go — keep local dev working either way.
- (Optional but recommended) Add `config/users.php` → `['seed_json' => env('SEED_USERS_JSON')]` so
  the source is explicit and prod-`config:cache`-safe; keep the env fallback in `UserSeeder`.
- A PHPUnit test (e.g. `tests/Feature/UserSeederTest.php`) MUST prove, via `RefreshDatabase` and
  `SEED_USERS_JSON` set per-test (`Config::set('users.seed_json', ...)` or `putenv`):
  - A 2-account JSON creates exactly 2 users, both email-verified.
  - Re-running the seeder is idempotent: no duplicate users; the password hash of an existing
    account is unchanged across runs (assert `password` didn't change).
  - When `SEED_USERS_JSON` is unset/empty, the seeder is a no-op (0 users, no throw).
- `php artisan test` passes (new test + existing Breeze tests, no regressions).

## Acceptance Criteria

- [ ] `php artisan db:seed` (no `--class`) invokes `UserSeeder` when `SEED_USERS_JSON` is set and
      is a no-op when it is not.
- [ ] `php artisan test` passes, including the new `UserSeederTest` (create / idempotent re-run /
      no-password-clobber / empty-config no-op).
- [ ] Existing Breeze auth tests still pass (no regression).
- [ ] `UserSeeder.php` is tracked in git (currently untracked) — add it in the spec's commit.

## Out of Scope

- The actual real emails/passwords for prod — `SEED_USERS_JSON` lives on the droplet / CI secret,
  never in git.
- Migrating production itself (that's `deploy.yml` — Spec 009 — + `PRODUCTION-DEPLOY.md`).
- Role/permission system — Breeze single-role accounts only.
- Removing the legacy `AUTH_PASSWORD` (tracked separately in the prod migration).

<!-- NR_OF_TRIES: 0 -->
