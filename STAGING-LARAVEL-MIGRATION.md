# Staging → Laravel Migration: Engineering Record

> Authoritative record of the Supabase→Laravel backend migration and the staging
> deployment, as of **2026-06-21**. Covers what changed, how the stack is wired,
> every gotcha hit (and fixed), the deploy pipeline, and what's still open.
> Sibling docs: `PRODUCTION-DEPLOY.md` (step-by-step prod runbook),
> `CLAUDE.md` (app architecture/tools).

---

## 1. Current state at a glance

| Env | Domain | Stack | Branch / commit | Status |
|-----|--------|-------|-----------------|--------|
| **Staging** | `staging-whiteboard.vp-associates.com` | Laravel 12 + MySQL + Breeze + Nuxt (`frontend/`) + Yjs WS relay | `develop` (deploys via GitHub Actions) | ✅ Live, fully off Supabase |
| **Production** | `whiteboard.vp-associates.com` | Old Nuxt + Supabase | `master` | ⏸️ Untouched — not migrated yet |
| **Droplet** | `165.245.141.179` (old `165.245.131.61` destroyed) | PHP 8.4 + composer-phar + MariaDB + PHP-FPM 8.4 + nginx + PM2 | — | Hosts staging, prod, + other sites |

- **Migration code** lives on `feat/autocad-tools` = `develop` (rebased, 7 migration
  commits + fixes). `master` is still the old Nuxt+Supabase app.
- **Data decision:** start fresh. Production Supabase held only empty test data
  (24 whiteboards, 0 with drawings), so production deploys with an empty MySQL DB.
- **Deploy policy:** **GitHub Actions only.** Push to `develop` →
  `.github/workflows/deploy-staging.yml` deploys. No manual SSH deploys.

---

## 2. Architecture (new stack)

```
Browser ──HTTPS──▶ nginx (staging-whiteboard.vp-associates.com)
                    │
                    ├─ /api/_nuxt_icon/* ─────────▶ Nuxt :3002  (icon endpoint)
                    ├─ /api/* , /sanctum/* ───────▶ Laravel (PHP-FPM 8.4, root public/)
                    ├─ /storage/* ────────────────▶ Laravel public/storage symlink (static)
                    ├─ /whiteboard:<id> (WSS) ────▶ Yjs WS relay :3003
                    └─ / (everything else) ───────▶ Nuxt SPA :3002

Laravel (repo root): app/ routes/ config/ database/ composer.json, artisan
Nuxt SPA:           frontend/  (moved out of root by migration phase 1)
Yjs relay:          frontend/server/ws-server.js  (standalone Node, PM2)
DB:                 MySQL `vp_whiteboard_staging` (user `vp_wb_staging`)
File storage:       storage/app/public/uploads/  → served at /storage/uploads/ via symlink
```

**Auth model:** Laravel Breeze (real email+password accounts) replacing the old
shared `AUTH_PASSWORD`. SPA-cookie auth via Sanctum (`/sanctum/csrf-cookie` +
session cookie). Frontend `$api` helper (`frontend/plugins/api.client.ts`) handles
CSRF (`X-XSRF-TOKEN` header) + `credentials: include` for all mutations.

**Real-time:** Yjs CRDT over a standalone WebSocket relay. Drawing elements, layers,
and scale live in the Yjs doc (synced via WS). Uploaded files (PDF/image) render as
"document layers" — also Yjs-synced in-memory, but **not** persisted to
`canvas_state` (see Open Items).

---

## 3. Work log (chronological)

### Phase 1 — Reconciliation & rebase
- Resolved a stuck in-flight rebase of `feat/autocad-tools`.
- Discovered two divergent tracks from `d267cced`: the Laravel migration
  (`feat/autocad-tools`) vs editor features (`develop`, 23 commits: modify-tools,
  dark chrome, ralph-loop).
- **Rebased the migration onto `develop`**: skipped superseded `fb7ee364` (its
  `cad` Tailwind palette is incompatible with develop's CSS-variable theme;
  develop already had the named fixes); salvaged its zero-length-line guard as
  `4d1e915c`; resolved file-location conflicts for develop's new tools; amended
  phase 9 to re-delete dead composables the rebase's rename+delete dropped.
  Verified with `vue-tsc` (clean). `feat/autocad-tools` = `develop` + 7 commits.

### Phase 2 — Initial staging deploy (manual; since superseded by CI)
- Bootstrapped Laravel on the droplet: created MySQL DB + user, `composer install`
  (via official `composer-phar`), wrote `.env`, `artisan key:generate`/`migrate`/
  `storage:link`, built the Nuxt frontend, rewrote the nginx vhost, re-pointed PM2.
- Smoke-tested end-to-end: register → login → create whiteboard (201) → list (200).

### Phase 3 — Hardening & UI
- Tightened WS relay auth (was an open relay): per-connection Sanctum session check.
- UI walkthrough (headless Playwright) found + fixed **broken icons**
  (`@iconify-json/mdi` not a declared dep + nginx `/api/_nuxt_icon/` exception).
- Wrote `PRODUCTION-DEPLOY.md` runbook.

### Phase 4 — Data decision
- Audited production Supabase: only empty test data (0 drawings). Decision: **start
  fresh**, no migration script needed (path documented for if real data appears).

### Phase 5 — Functional audit + upload debugging
- Audited persistence (sound), API wiring (clean — upload was the lone CSRF
  bypass), share/export/collab/layers/scale (client-side or Yjs-only, low risk).
- **Upload 419** → fixed: raw `$fetch` in `useFileUpload.ts` skipped the
  `X-XSRF-TOKEN` header; now mirrors `$api`.
- **Upload not rendering** → root cause was a **WS connect/disconnect loop** that
  reset the Yjs doc on every reconnect, wiping just-added layers. The loop had two
  causes, both fixed:
  1. Relay's `/api/user` check sent no `Origin`/`Referer` → Sanctum didn't treat it
     as stateful → 401 for logged-in users.
  2. Session cookie is named `laravel-session` (hyphen, from
     `Str::slug(APP_NAME).'-session'`), but the relay checked `laravel_session`.
- **Share-link real-time** → relay now also accepts a scoped `vp_share_token`
  (validated via `/api/sessions/:token`, room-scoped).
- **`/storage/…` 404** → `public/storage` symlink was committed from a dev machine
  (pointed at `/home/deck/…`); untracked + gitignored, recreated via `storage:link`.

### Phase 6 — CI deploy pipeline (now the only deploy path)
- `deploy-staging.yml` was broken (ran `npm install` at repo root; Nuxt moved to
  `frontend/`). Rewrote it for the real stack: `composer install` → `artisan
  migrate` → `storage:link` → `cd frontend && npm install && build` → PM2
  `delete+start` with correct paths + env. Fixed a double-prefix PM2 path bug.
- **Every push to `develop` now deploys staging correctly through GitHub Actions.**

---

## 4. Gotcha catalog (operational knowledge)

Each one bit us; all are now handled in code, config, or the workflow.

1. **System `composer` broken on PHP 8.4** — `/usr/bin/composer` (2.7.1) uses stale
   Symfony libs → utf8 error. Use the official `php /usr/local/bin/composer-phar`.
2. **`php8.4-mysql` not installed** — `migrate` fails "could not find driver".
   `apt install php8.4-mysql …` then `systemctl reload php8.4-fpm`.
3. **`.env` must be readable by `www-data`** — root-written `.env` is `600`; FPM
   can't read it → silently falls back to sqlite + "no APP_KEY" while artisan
   (root) works. Fix: `chown www-data:www-data .env; chmod 640 .env`. (The workflow
   enforces this every deploy.)
4. **nginx `try_files /index.php` inside `location ^~ /api/` escapes to Nuxt** —
   the internal redirect re-matches at server scope and hits `location /`. Must
   fastcgi_pass directly with `SCRIPT_FILENAME=$realpath_root/index.php`.
5. **`SESSION_DRIVER=database` needs the sessions table** — not in default scaffold;
   `php artisan session:table && migrate`.
6. **WS relay auth — three-part**:
   - forward `laravel_session` to `/api/user`;
   - **send `Origin`/`Referer`** so Sanctum treats it as stateful (else 401);
   - **use the real cookie name** (`laravel-session`, configurable via
     `SESSION_COOKIE` env = `Str::slug(APP_NAME).'-session'`).
7. **`public/storage` symlink must not be tracked in git** — it's env-specific;
   committing it ships a dangling symlink. Untracked + gitignored; created per-env
   by `php artisan storage:link` (the workflow runs this every deploy).
8. **Icons: declare `@iconify-json/mdi`** — `@nuxt/icon` local bundle mode needs the
   collection; without it every `mdi:*` icon 404s.
9. **nginx `/api/_nuxt_icon/` exception** — Nuxt's icon endpoint lives under
   `/api/`, which routes to Laravel; add a longest-prefix location to send it to
   Nuxt instead.
10. **Mutations must go through `$api`** (CSRF) — any raw `$fetch` POST/PATCH/DELETE
    bypasses the `X-XSRF-TOKEN` header → 419. (The upload was the one offender.)
11. **PM2 script paths are relative to `--cwd`** — `pm2 start frontend/X --cwd
    …/frontend` resolves to `frontend/frontend/X` (not found). Use paths relative
    to `--cwd`.
12. **`deploy-staging.yml` depends on the gitignored on-disk `.env`** for DB
    creds/APP_KEY — the workflow fails loudly if `.env` is missing rather than
    booting unconfigured.

---

## 5. Deploy process (GitHub Actions)

**Staging** — push to `develop` triggers `.github/workflows/deploy-staging.yml`:
SSH to droplet → `git reset --hard origin/develop` → Laravel `composer install` +
`migrate` + `storage:link` + perms → `frontend/` `npm install` + `build` → PM2
`delete+start` (`vp-whiteboard-staging` on :3002, `vp-ws-server-staging` on :3003
with `LARAVEL_URL` + `SESSION_COOKIE=laravel-session`). Concurrency group
`droplet-build` prevents overlap with production builds.

**Production** — `.github/workflows/deploy.yml` (triggers on `master`) is **still
the old Nuxt-at-root structure and will fail the same way.** It must be rewritten
to match `deploy-staging.yml` (different domain/DB/ports) before the production
deploy. See `PRODUCTION-DEPLOY.md`.

**Watch a run:** `gh run list --workflow=deploy-staging.yml --limit 3` then
`gh run watch <id> --exit-status`.

---

## 6. Open items / known issues

- **Uploaded files vanish on full page refresh** — document layers are Yjs-synced
  in-memory but **not** included in `exportState()`/`canvas_state`, and there's no
  `GET /api/files` to reload them on mount. Fix: persist `documentLayers` in
  `canvas_state` (layers are self-contained dataUrls), or add file reload on mount.
- **`deploy.yml` (production) is outdated** — rewrite to the Laravel+frontend
  structure (mirror `deploy-staging.yml`) before migrating production.
- **`SESSION_COOKIE=laravel-session` is `APP_NAME`-dependent** — fragile if
  `APP_NAME` changes. Consider setting `SESSION_COOKIE` explicitly in Laravel `.env`.
- **`GET /api/login` → 405** — a spurious GET to a POST-only route (login works
  via POST). Benign; worth tracing.
- **Anonymous share-link real-time** — implemented (scoped `vp_share_token`) but
  not yet end-to-end tested in a browser.
- **Autosave has no failure feedback** — silent if the PATCH fails
  (`pages/whiteboard/[id].vue:743`).
- **Production auth accounts** — shared `AUTH_PASSWORD` → Breeze accounts; seed
  real users before prod (see `UserSeeder` + `PRODUCTION-DEPLOY.md`).

---

## 7. Key facts

- **Branch tips:** `develop` = `feat/autocad-tools` = `25626812` (CI-fixed workflow).
  `master` = old Nuxt+Supabase (untouched).
- **Staging login (test):** `staging-test@vpdev.local` / `testpass123`.
- **Staging DB:** MySQL `vp_whiteboard_staging`, user `vp_wb_staging`; password at
  `/root/.vp_wb_staging_dbpass` on the droplet.
- **Droplet SSH:** `ssh -i ~/.ssh/id_ed25519_nopass root@165.245.141.179`.
- **Staging nginx vhost:** `/etc/nginx/sites-available/staging-whiteboard.vp-associates.com`.
- **Supabase (legacy, prod only):** project `qhoeiectyttqifzjabck`; staging no longer
  references it (verified 0 runtime calls).

### Commits this session (on `develop` / `feat/autocad-tools`)
Rebase resolution → migration-onto-develop rebase → `4d1e915c` zero-length guard →
`3445bf23` WS Sanctum auth → `baf29fa9` relay maxPayload → `33abc76d` icon dep →
`55e49a5c` prod runbook → `dac8493a` data start-fresh → `bb9d8391` upload XSRF →
`ede7d222` share-link WS → `d1db42cf` untrack storage symlink → `b036f3d1` WS
Origin/Referer → `7eb9703c` session cookie name → `3d17072b`/`25626812` CI workflow.
