# Spec 008: Seed Production Auth Accounts — Completion Log

**Date:** 2026-06-21
**Commit:** 87a92c31
**Status:** COMPLETE

## Summary

Wired `UserSeeder` into `DatabaseSeeder` and added comprehensive PHPUnit tests to ensure `php artisan db:seed` reliably creates production accounts when `SEED_USERS_JSON` is configured, while remaining a no-op when unset.

## Changes Made

1. **config/users.php** — Created new config file that explicitly defines `SEED_USERS_JSON` as the seed source, making it config-cache-friendly for production.

2. **database/seeders/DatabaseSeeder.php** — Modified to:
   - Call `UserSeeder` only when `SEED_USERS_JSON` is configured
   - Removed the Breeze factory stub (it now lives only in git history)
   - Ensures `php artisan db:seed` is a true no-op when unset

3. **database/seeders/UserSeeder.php** — Previously untracked; now committed to git. The seeder:
   - Reads accounts from `config('users.seed_json')` with env fallback
   - Idempotent: updates name-only for existing users, never clobbers passwords
   - Marks all seeded accounts as email-verified
   - Generates random 20-char passwords when not provided (printed once to console)

4. **tests/Feature/UserSeederTest.php** — Created 6 PHPUnit tests:
   - Creates two users from JSON, both email-verified
   - Re-running is idempotent (no duplicates, password hash unchanged)
   - No-op when `SEED_USERS_JSON` unset/empty
   - Generates random password when not provided
   - Updates name-only for existing users (never password)

## Test Results

All 16 tests pass (38 assertions):
- 1 existing Unit test
- 9 existing Auth tests (Authentication, EmailVerification, PasswordReset, Registration)
- 1 existing Feature test
- 6 new UserSeeder tests

## Lessons Learned

- The existing tests use PHPUnit, not Pest — had to rewrite from Pest syntax to standard PHPUnit format.
- `config()` vs `env()` precedence: the seeder checks `config('users.seed_json')` first, then falls back to `env('SEED_USERS_JSON')`, so adding `config/users.php` is backward-compatible.
- No-op behavior matters: the original factory stub would have polluted local/test/CI when `SEED_USERS_JSON` was unset; removing it ensures clean environments.

## Next Steps

Spec 009 (rewrite production deploy workflow) is the next incomplete spec.
