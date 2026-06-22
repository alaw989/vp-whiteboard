# Spec 009: Rewrite Production Deploy Workflow — Completion Log

**Date:** 2026-06-21
**Tries:** 1
**Status:** COMPLETE

## Summary

Rewrote `.github/workflows/deploy.yml` from the old Nuxt+Supabase structure to the new Laravel+frontend structure, mirroring `deploy-staging.yml` with production-specific values.

## Changes Made

- Dropped all Supabase references (`SUPABASE_*`, `NUXT_PUBLIC_SUPABASE_*`)
- Dropped legacy auth references (`AUTH_PASSWORD`, `AUTH_SECRET`)
- Added Laravel block: composer install, `config:clear`, `migrate --force`, `storage:link`, www-data perms
- Moved frontend build under `frontend/` directory
- Changed PM2 from `restart` to `delete+start` for both `vp-whiteboard` and `vp-ws-server`
- Added explicit env vars for both PM2 processes: `PORT`, `NUXT_PUBLIC_*`, `APP_ENV`, `WS_PORT`, `LARAVEL_URL`, `SESSION_COOKIE`
- Added concurrency group `droplet-build` (shared with staging)
- Added conditional UserSeeder seeding gated on `SEED_USERS_JSON` env var (ties to Spec 008)
- Added `.env`-exists guard for safety

## Production vs Staging Differences

- Branch: `master` (not `develop`)
- Path: `/var/www/vp-whiteboard` (not `/var/www/vp-whiteboard-staging`)
- URLs: `https://whiteboard.vp-associates.com` (not staging)
- PM2 names: `vp-whiteboard`, `vp-ws-server` (not `-staging` suffix)
- Ports: 3000, 3001 (not 3002, 3003)
- `APP_ENV=production` (not staging)

## Key Gotchas Preserved

- `SESSION_COOKIE=laravel-session` (= `Str::slug(APP_NAME).'-session'` with `APP_NAME=Laravel`)
- PM2 delete+start pattern (not restart) to avoid drifted saved config
- `.env` file persists on droplet; workflow never overwrites it

## Verification

All acceptance criteria verified:
- YAML parses successfully
- Triggers on `push: branches: [master]` + `workflow_dispatch`
- Has `concurrency: droplet-build` group
- Runs Laravel block with `artisan migrate`
- Builds frontend under `frontend/`
- Starts both PM2 processes with correct env
- No Supabase or legacy-auth references
- No hardcoded credentials
- Structure mirrors `deploy-staging.yml`
