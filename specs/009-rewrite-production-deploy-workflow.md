# Spec 009: Rewrite production deploy.yml for the Laravel+frontend stack

## Status: COMPLETE

Verify: python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))" && grep -q "artisan migrate" .github/workflows/deploy.yml && ! grep -qi "SUPABASE\|AUTH_PASSWORD" .github/workflows/deploy.yml

## Overview

`.github/workflows/deploy.yml` (production, triggers on `push` to `master`) is still the OLD
Nuxt+Supabase flow: it writes a `.env` full of `NUXT_PUBLIC_SUPABASE_*` + `AUTH_PASSWORD` +
`AUTH_SECRET`, runs `npm install && npm run build` at repo root, and restarts `vp-whiteboard` /
`vp-ws-server`. That structure no longer matches the app — production is migrating to the same
Laravel (repo root) + Nuxt (`frontend/`) layout staging already runs. Until `deploy.yml` is
rewritten, the production deploy breaks the moment `master` carries the migrated code. Staging's
`deploy-staging.yml` is the proven template to mirror.

Goal: rewrite `deploy.yml` to mirror `deploy-staging.yml`'s Laravel+frontend structure, pointed at
production paths/URLs, dropping all Supabase/legacy-auth references, so a push to `master` deploys
the migrated stack correctly.

## Context

- `.github/workflows/deploy.yml` (current, old) — triggers on `push: branches: [master]` +
  `workflow_dispatch`; SSHes to the droplet, `git reset --hard origin/master`, writes `.env` with
  Supabase + AUTH_PASSWORD/AUTH_SECRET, `npm install`, `NODE_OPTIONS=... npm run build`,
  `pm2 restart vp-whiteboard` + `pm2 restart vp-ws-server`. No Laravel steps at all.
- `.github/workflows/deploy-staging.yml` (the template to mirror) — the proven staging flow:
  - `concurrency: { group: droplet-build, cancel-in-progress: false }` — **shared with deploy.yml**
    so staging + prod builds never overlap on the droplet (each peaks ~2GB).
  - `set -e`; `git fetch/checkout/reset --hard`; a `.env`-exists guard
    (`if [ ! -f .env ]; then exit 1`).
  - Laravel block: composer install `--no-dev --optimize-autoloader`, `config:clear`,
    `migrate --force`, `storage:link`, `chown -R www-data:www-data storage bootstrap/cache`,
    `chown www-data:www-data .env && chmod 640 .env`.
  - Frontend block: `cd frontend; npm install --no-audit --no-fund; NODE_OPTIONS=... npm run build`.
  - PM2 delete+start (not restart) for BOTH the Nuxt server and the WS relay, with explicit env
    (PORT, NUXT_PUBLIC_LARAVEL_URL/SITE_URL/WS_URL, and `SESSION_COOKIE=laravel-session` for the
    WS relay); then `pm2 save`.
- Production specifics to swap in: branch `master`; droplet path `/var/www/vp-whiteboard` (staging
  is `/var/www/vp-whiteboard-staging`); prod URLs `https://whiteboard.vp-associates.com`; PM2 names
  `vp-whiteboard` + `vp-ws-server` (staging suffixes `-staging`); ports 3000 (Nuxt) / 3001 (WS)
  per CLAUDE.md; `APP_ENV=production`.
- Secrets: `DO_HOST`, `DO_USER`, `DO_SSH_KEY`, `DO_PORT` already exist as GitHub Actions secrets.
  Prod DB creds + `APP_KEY` live in the droplet's on-disk `.env` (gitignored, persists) — do NOT
  write them into the workflow.
- Optional: after migrate, run `php artisan db:seed --class=UserSeeder` IF `SEED_USERS_JSON` is
  present in the droplet `.env` (ties to Spec 008) — guard it so it's a no-op when unset.
- Safety: this workflow only fires on `push` to `master`. Per the constitution, NEVER run the loop
  on `master`/`develop`/`main` — do this work on a `feat/*` branch. The rewritten file is inert
  until a human reviews + merges to `master`.

## Requirements

- Rewrite `.github/workflows/deploy.yml` to mirror `deploy-staging.yml`: same job shape, `set -e`,
  the `.env`-exists guard, the full Laravel block (composer → config:clear → migrate --force →
  storage:link → chown/chmod), the frontend build under `frontend/`, and PM2 delete+start for BOTH
  the Nuxt server and the WS relay with explicit env.
- Point everything at production: `branches: [master]`, droplet path `/var/www/vp-whiteboard`,
  prod URLs, PM2 names `vp-whiteboard` + `vp-ws-server`, ports 3000/3001, `APP_ENV=production`.
- Keep the shared `concurrency: droplet-build` group verbatim from staging.
- The WS relay MUST get `SESSION_COOKIE=laravel-session` (= `Str::slug(APP_NAME).'-session'` with
  `APP_NAME=Laravel`) and the prod `LARAVEL_URL` — same gotcha as staging (constitution +
  STAGING-LARAVEL-MIGRATION.md gotcha catalog).
- DROP every Supabase + legacy-auth reference: no `SUPABASE_*`, no `AUTH_PASSWORD`, no
  `AUTH_SECRET`, no `NUXT_PUBLIC_SUPABASE_*`, no `.env` heredoc writing them.
- Do NOT bake DB creds, `APP_KEY`, or `SEED_USERS_JSON` into the workflow file — they live in the
  droplet `.env`. If seeding is added, gate it on the env var being set.
- The file must be valid YAML and parse cleanly.

## Acceptance Criteria

- [ ] `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))"` succeeds.
- [ ] Triggers on `push: branches: [master]` + `workflow_dispatch`; keeps `concurrency: droplet-build`.
- [ ] Runs the Laravel block (composer install, `artisan migrate`, `storage:link`, www-data perms)
      — `grep -q "artisan migrate"` confirms.
- [ ] Builds the frontend under `frontend/` and starts BOTH `vp-whiteboard` and `vp-ws-server` via
      PM2 delete+start with `SESSION_COOKIE=laravel-session`.
- [ ] No Supabase or legacy-auth references remain —
      `! grep -qi "SUPABASE\|AUTH_PASSWORD" .github/workflows/deploy.yml`.
- [ ] No secrets/credentials hardcoded in the workflow file.
- [ ] Structure mirrors `deploy-staging.yml` (diff the two — only path/URL/name/port/env differ).

## Out of Scope

- Actually deploying production / merging to `master` — human review + `PRODUCTION-DEPLOY.md`
  governs that. This spec only rewrites the workflow file on a feature branch.
- Changing `deploy-staging.yml` — it's the reference; leave it untouched.
- Production data migration (Supabase → MySQL) — separate item in STAGING-LARAVEL-MIGRATION.md.
- Setting the real `SEED_USERS_JSON` value — droplet/CI secret, not in git.

<!-- NR_OF_TRIES: 0 -->
