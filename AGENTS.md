# Agent Memory

## Rules

- Do NOT commit, push, create PRs, or deploy unless explicitly instructed by the user.
- Development must always be test driven: write or update tests first, then implement to make them pass.

## CI/CD Protocol (STANDING PROCEDURE — always follow when shipping work)

Every change ships through this exact pipeline. Run tests locally before submitting; CI enforces them before merge.

1. **Local work** — branch off `develop` (e.g. `feat/...`, `fix/...`). Before pushing, run locally in `frontend/`:
   - `npm run typecheck` (must exit 0)
   - `npm test` (must pass — currently 320 tests)
   - And at the repo root: `php artisan test` (must pass — currently 31 tests, no `.env` needed since `phpunit.xml` sets `APP_KEY`)
2. **Open a PR** targeting **`develop`**.
3. **CI auto-runs** frontend typecheck + test and backend `php artisan test` (`.github/workflows/ci.yml`). Wait for the required `test` AND `backend-test` checks to pass — branch protection on `develop` and `master` blocks the merge until both are green.
4. **Merge into `develop`** → triggers `.github/workflows/deploy-staging.yml` → pushes to the **staging droplet** (`staging-whiteboard.vp-associates.com`). `develop` always equals the staging server.
5. **Monitor the deploy** (`gh run watch <id>` / `gh run list`).
6. **Verify it reached staging**: `git -C /var/www/vp-whiteboard-staging rev-parse --short HEAD` matches the merge commit; `pm2 list` shows `vp-whiteboard-staging` + `vp-ws-server-staging` online.
7. **Test on staging** — confirm the feature works and nothing is broken.
8. **If OK, repeat for production**: open a PR `develop` → **`master`** (or merge), CI runs, merge → `.github/workflows/deploy.yml` → **production droplet** (`whiteboard.vp-associates.com`). Verify there too.
9. Both `develop` and `master` have branch protection: required status checks `test` (typecheck + vitest) and `backend-test` (Laravel `php artisan test`) must pass before merge.

### Test/CI facts

- Test runner: vitest (`vitest.config.mts` inside `frontend/`, `@vitejs/plugin-vue` wired, `frontend/test/setup.ts` registers Nuxt-style Vue auto-imports).
- `npm test` = `vitest run` (320 tests, 39 files). `npm run typecheck` = `vue-tsc --noEmit`.
- Backend: `php artisan test` (31 tests). `phpunit.xml` sets `APP_KEY` + SQLite in-memory, so it runs without a `.env`.
- CI workflow: `.github/workflows/ci.yml` (jobs `test` + `backend-test`, on PR + push to develop/master). Both deploy workflows gate on their `test` job via `needs: test`, and that job now also runs the backend tests.

## Fixes applied July 13, 2026 — Persistence & Upload

### Problem: Drawings and file uploads lost on page reload

**Root causes:**
- Auto-save PATCH calls had no `.catch()` — errors silently swallowed
- Auto-save gated on WebSocket connection — if WS was down, saves silently skipped
- No save on page unload — `onUnmounted` only cleared the interval and called cleanup
- `exportState()`/`importState()` excluded `yDocumentLayers` — PDF/image overlays never persisted
- PDF `src` was a data URL (base64, megabytes) — too large for `canvas_state` JSON column

**Fixes:**
- `frontend/pages/whiteboard/[id].vue`: Added `await` + `.catch()` to auto-save PATCH; removed WS gate; `exportState()` now runs **synchronously** before Yjs doc cleanup in `onUnmounted`
- `frontend/composables/useCollaborativeCanvas.ts`: `exportState()` includes `yDocumentLayers`; PDF layers strip `src` and set `needsRender: true`; `importState()` restores `yDocumentLayers`
- `frontend/pages/whiteboard/[id].vue`: After `importState()`, a `watch(whiteboardData)` re-renders PDF layers by fetching from the `/api/files/{id}/serve` endpoint
- Moved whiteboard data fetch from top-level `await` to `onMounted` — fixes SSR 404 (no session cookie server-side)
- Moved `window.addEventListener` into `onMounted` — fixes SSR crash (no `window`)

### Problem: File uploads blocked by CORS

**Root cause:** `Storage::disk('public')->url()` returns a URL like `/storage/uploads/file.png`. The browser loaded this from `localhost:3000` (Nuxt), but the file only exists on `localhost:8002` (Laravel). CORS headers weren't sent for static files served by `php artisan serve`.

**Fixes:**
- `routes/api.php` + `app/Http/Controllers/Api/WhiteboardFileController.php`: Added `GET /api/files/{id}/serve` route that serves files through Laravel's middleware stack with `Access-Control-Allow-Origin` header
- `frontend/pages/whiteboard/[id].vue`: `handleUploadSuccess` and PDF re-render both use the serve URL instead of the storage URL
- `.env`: Set `APP_URL=http://localhost:8002` so `url()` generates correct full URLs
- Created `public/storage` symlink (`php artisan storage:link`)
- `frontend/package.json`: Set `LARAVEL_URL=http://localhost:8002` for the WS relay

### Problem: WebSocket relay disconnect loop

**Root cause:** WS server auth-checked connections against `http://localhost:8000` (default) but Laravel was on `:8002`. Auth always failed → WS closed → client reconnected → loop.

**Fixes:**
- `frontend/server/ws-server.js`: Skip auth for local dev (detectable via `HOST === '0.0.0.0'` and `LARAVEL_URL` containing `localhost`)
- `frontend/package.json`: `dev:ws` script passes `LARAVEL_URL=http://localhost:8002`

### New feature: Color wheel picker

- `frontend/components/whiteboard/ColorWheelPicker.vue`: Canvas-based hue/saturation wheel (104px), replaces 9-swatch grid
- Click/drag/touch to pick; hex text input; recent colors row
- Explicitly imported in `WhiteboardToolbar.vue`

### Problem: Share links show 404 after brief page flash

**Root cause:** `GET /api/whiteboards/{id}` required `auth:sanctum`, but share-link users aren't logged in. The 401 caused the frontend `onMounted` to throw a fatal 404 error, showing the page briefly before the error replaced it.

**Fix:**
- `routes/api.php`: Moved `GET /whiteboards/{id}` out of the `auth:sanctum` middleware group — public reads are safe (UUIDs are unguessable). Mutations (create, update, delete) remain auth-protected.

## Fixes applied Aug 3-4, 2026 — Production migration + sync/data-loss

### Production migrated to Laravel+MySQL (Aug 3)

- Merged `develop` → `master`: full Laravel 12 + MySQL + Breeze stack now live at `whiteboard.vp-associates.com`. Old Nuxt+Supabase stack decommissioned (keep-alive cron removed).
- Droplet prep: created `vp_whiteboard_production` DB + `vp_wb_prod` user (pw at `/root/.vp_wb_prod_dbpass`), wrote prod `.env` (APP_KEY, MySQL creds, `SESSION_COOKIE=laravel-session`, SANCTUM/FRONTEND URLs), rewrote prod nginx vhost mirroring staging (ports :3000/:3001, `/api/`+`/sanctum/` → PHP-FPM, `/api/_nuxt_icon/` → Nuxt, `/whiteboard:` → WS :3001).
- Fixed `deploy.yml` PM2 double-prefix bug (Gotcha 11): paths are relative to `--cwd`, do NOT prefix with `frontend/`.
- Rollback snapshot: nginx vhost backup `whiteboard.vp-associates.com.bak.1785794010`, old commit `dd613ff64261`, PM2 dump `dump.pm2.bak.1785794010`.
- Seeded account `vpassociates2025@vp-associates.com` was created for login testing, then **deleted on Aug 4** (see Current production state). Registration open via `/register`.

### New: Register page

- `frontend/pages/register.vue` + "Create one" link on login. `/register` made public in `auth.global.ts` middleware.
- `frontend/middleware/auth.global.ts` must whitelist `/register` alongside `/login`.

### Fix: refresh logs you out (Sanctum stateful check)

**Root cause:** SSR `auth.global.ts` checked `/api/user` with only the cookie. Sanctum's `EnsureFrontendRequestsAreStateful` only runs session auth when Origin/Referer matches `SANCTUM_STATEFUL_DOMAINS`. Server-side fetch had neither → 401 → redirect to `/login` on every hard refresh.

**Fix:** synthesize `origin` (from `new URL(laravelUrl).origin`) + `referer` (`${laravelUrl}/`) in the SSR `/api/user` fetch. Forwarding the browser's headers didn't work — nginx→Nuxt proxy drops them. Same fix pattern as the WS relay (`b036f3d`).

### Fix: drawings/PDFs wiped from DB (Yjs sync data loss)

**Root causes (3):**
1. **Echo storm:** `yElements`/`yMeta`/`yDocumentLayers` observers broadcast the FULL Yjs doc (`encodeStateAsUpdate(ydoc)`) on every change; peers re-broadcast it back → infinite loop, growing payloads, accumulating duplicates. The corrupted doc's auto-save PATCHed the DB with wiped `canvas_state` (drawings lost permanently).
2. **Peer clobbering:** a fresh tab's `sync-request` is answered by stale peers still in the room (rooms retain clients 60s). A stale peer's state (elements but no `documentLayers`) was `importState()`'d over the DB-restored PDF layer → "flash then gone". **Brave-only** due to timing (WS response lands after DB import).
3. **PDF drawImage race:** restored PDF layers have `src` stripped + `needsRender:true` until async re-render; `getLayerImage('')` produced a broken image that `drawImage()` threw on.

**Fixes (all in `frontend/composables/useCollaborativeCanvas.ts` + `WhiteboardCanvas.vue`):**
- Replaced the three full-state observers with a single `ydoc.on('update')` handler broadcasting only the incremental delta, tagged `REMOTE_ORIGIN` on peer-applied updates so they're never echoed back.
- Ignore peer `sync-state` entirely once local content exists (`yElements.length > 0 || yDocumentLayers.size > 0`) — DB is source of truth on load; live edits propagate via binary deltas.
- `getLayerImage(src)` returns `null` when `src` is empty (skips draw until PDF re-render populates it).

## Fixes applied Aug 4, 2026 — App audit + backend security + CI backend tests

### App-wide audit (tools + backend)

- Browser-tested on staging with real input: all draw tools (pen, highlighter, line, arrow, rectangle, circle, ellipse, polyline, arc, revision-cloud), annotate (stamp, text-annotation dialog, dimension), measure (distance), and eraser all create/persist elements with no console errors. Remaining modify tools (select, offset, mirror, rotate, scale, trim, extend, fillet) covered by the 320 unit tests.
- Backend found 3 real issues (all fixed below). WS relay + persistence confirmed sound.

### Fix: stored XSS via file upload (security)

**Root cause:** `WhiteboardFileController@store` validated only `required|file|max:51200` — no MIME allowlist — and `serve()` returned the **client-supplied** `Content-Type` (`getClientMimeType()`). An authenticated user could upload an HTML/SVG file that executed as `text/html` in the app origin (stored XSS against any viewer of that board).

**Fixes (in `app/Http/Controllers/Api/WhiteboardFileController.php`):**
- Upload validates `mimes:pdf,jpeg,jpg,png,webp` (matches the client's allowlist in `useFileUpload.ts`).
- `serve()` only ever returns an allowlisted content type (else `application/octet-stream`) + `X-Content-Type-Options: nosniff`.
- Upload limit aligned: server now `max:10240` (10MB) to match the client.

### Fix: no authorization on whiteboard mutations (security)

**Root cause:** `WhiteboardController@update`/`destroy` had no ownership check — any authenticated user could edit/delete any whiteboard by ID; `store` accepted a client-supplied `created_by`.

**Fixes (in `app/Http/Controllers/Api/WhiteboardController.php`):**
- `store()` now records the authenticated `user_id`.
- `update()`/`destroy()` return 403 for non-owners. Legacy boards without `user_id` remain editable (guest-created share boards).

### Test suite green + CI gates

- Fixed 30 real bugs (missing `import { ref } from 'vue'` in Extend/Fillet/Mirror tools, missing `getElementGeometry` in Scale tool, missing `deactivate()` in Measure-Distance tool — all masked by Nuxt auto-imports at runtime).
- Fixed 5 stale test expectations (text-annotation needs `onMouseMove` before `onMouseUp`; geometryUtils fp-noise `toEqual`→`toBeCloseTo`; pass `rotationDelta`).
- `vitest.config.ts` → `frontend/vitest.config.mts` + `@vitejs/plugin-vue` (ESM) + `frontend/test/setup.ts` (registers Nuxt-style Vue auto-imports) so SFCs parse in tests.
- Fixed 320 `vue-tsc` errors (all in `.test.ts` files). Result: 320/320 frontend tests, 0 typecheck errors.
- Added 5 backend tests (MIME rejection, safe serve content-type, ownership update/delete, owner update). Result: 31 backend tests.
- **New `.github/workflows/ci.yml`** — `test` (frontend typecheck + vitest) + `backend-test` (PHP 8.4 + `composer install` + `php artisan test`) on every PR/push to develop/master.
- Both deploy workflows gate the deploy job behind `needs: test`, and that `test` job now also runs the backend suite (PHP setup + composer + `php artisan test`), so a backend regression can't reach staging/prod.
- `phpunit.xml` sets `APP_KEY` + SQLite in-memory so `php artisan test` runs without a `.env` (key:generate needs `.env`, which doesn't exist in CI).
- Branch protection on `develop` + `master` requires BOTH `test` and `backend-test` checks. `strict: true` → when `master` has history `develop` lacks (merge commits from earlier promotions), merge `master` into `develop` first via a sync PR, then the promotion PR is CLEAN.
- `.phpunit.result.cache` untracked + gitignored.

### Current production state (Aug 4, 2026)

- **Users:** `prod-smoke@vpdev.local` (test), `alaw989@gmail.com` (Austin Law, **is_admin=true**). Seeded `vpassociates2025` account was deleted (strong pw was set, then removed entirely).
- **Whiteboards:** `test1`, `test2` left in place (user chose to keep them).
- **`gh` token** now has `workflow` scope (required to merge PRs that touch `.github/workflows/*`).

## Fixes applied Aug 4, 2026 (2nd session) — Owner-approval registration + per-link share links

### Registration is no longer open signup

- `/register` creates the user as `status = pending` — **no auto-login**. The frontend shows a "Request received" screen.
- A synchronous mail to the owner (config `mail.admin_email` / env `ADMIN_EMAIL`) includes signed approve/deny links.
- Links open `resources/views/approvals/confirm.blade.php` (a Laravel blade page at `/approvals/{id}/{action}`) which requires the owner to be signed in (`is_admin`) before the approve/deny POST executes.
- Login is gated in `LoginRequest::authenticate()` — pending/denied users get `auth.pending` ("Your account is pending approval…"). The `lang/en/auth.php` file defines the message.
- Users table gained `status` (pending|approved|denied), `approved_at`, `is_admin`. Backfill approved all pre-existing users. `UserFactory` defaults to approved; add `pending()` / `admin()` states.
- Admin API: `GET /api/approvals` (pending list), `POST /api/approvals/{id}/approve`, `POST /api/approvals/{id}/deny`. `ApprovalController` checks `$request->user()?->isAdmin()`.
- Owner identity = `users.is_admin`. Set the owner: `alaw989@gmail.com` is admin on prod; `staging-test@vpdev.local` is admin on staging.

### Per-link share links (anonymous real-time collaboration)

- New `whiteboard_shares` table: `token_hash` (sha256), `role` (view|edit), `label`, `expires_at`. `WhiteboardShare::make()` stores only the hash; the raw 40-char token is returned once.
- Share modal (`WhiteboardShareModal.vue`) creates/copies/revokes links: owner picks role (Can edit / View only), label, and expiry (never/7/30/90 days). Link URL = `/s/{rawToken}`.
- Share API (owner-only create/list/revoke): `GET/POST /api/whiteboards/{id}/shares`, `DELETE /api/whiteboards/{id}/shares/{shareId}`; public resolver `GET /api/shares/{token}` returns `{whiteboard_id, role, expires_at}`.
- `WhiteboardController@update` + `WhiteboardFileController@store` accept a share credential (cookie `vp_share_token`, header `X-Share-Token`, or `?share=` query) in place of auth. View-role shares can't rename. Public `GET /api/whiteboards/{id}` no longer leaks `share_token`.
- `/s/{token}` Nitro route resolves via `/api/shares/{token}` and sets an httpOnly `vp_share_token` cookie (7 days).
- WS relay (`frontend/server/ws-server.js`) checks the share token against `/api/shares/{token}` (expects `data.whiteboard_id`). **Auth is now ON by default** — the old `HOST === '0.0.0.0'` default silently disabled it in prod. Set `WS_ALLOW_ANON=1` to bypass (don't).
- **Deploy-time requirements:** add `proxy_set_header Cookie $http_cookie;` to the nginx `/whiteboard:` location (done on staging + prod). **Prod mail is configured + verified (Aug 7, 2026):** `MAIL_MAILER=smtp` → Brevo (`smtp-relay.brevo.com:587`), `MAIL_FROM_ADDRESS=no-reply@vp-associates.com`, `ADMIN_EMAIL=vphan@vp-associates.com,alaw989@gmail.com`. Confirmed working via `Mail::raw` send + a real pending-registration approval dispatch (no `Failed to send registration-approval email` in the log). Staging still uses `MAIL_MAILER=log`.

### Tests

- New: `tests/Feature/ApprovalApiTest.php` (6 tests), `tests/Feature/ShareApiTest.php` (7 tests). Registration test updated for pending flow. Backend suite now 43 assertions of tests / 92 assertions. Frontend 320 tests still green.
- Verified live on staging: pending register → login blocked → admin approve → login works; share create in UI; `/s/{token}` redirect; anonymous autosave persists (share token only); WS relay accepts valid token, rejects invalid with 4001.

## Loop-driven work (opencode-loop) — operational notes

- One goal per run: `~/.local/bin/opencode-loop 20 --goal "<goal>" --check "cd frontend && npm run typecheck && npm test"`. The loop makes one focused improvement per iteration, commits atomically, and halts after `STALL_LIMIT` (3) consecutive no-progress iterations.
- Branch off `develop`; the worktree must be clean at start; it refuses to run on `master`/`main`/`develop`.
- Launch **detached**: `setsid nohup ~/.local/bin/opencode-loop ... > logs/opencode-loop-run.out 2>&1 < /dev/null &`. A plain `&` job dies if the launching shell's process group is reaped (e.g. a monitoring command hitting its timeout). Never `pkill -f "opencode-loop"` or `pkill -f "server/ws-server.js"` broadly — the pattern matches the invoking shell itself.
- The `--check` runs from the repo root (harness fixed Aug 2026) and writes to `logs/opencode-loop-*/iter-N.check.log`. A failed check is a real gate — do NOT ship a stalled iteration without re-running the check yourself.
- The loop **re-seeds** `ITERATION_NOTES.md` (wiping any extra Context section) whenever the `--goal` arg doesn't byte-match the Goal section's first line — make them identical, or put critical context inside the goal string, or re-add the Context section after seeding.
- A stall does NOT mean the code is bad: it usually means the loop's own gate tripped on the environment. Re-verify (`npm run typecheck && npm test`) and ship manually if green.

## Backlog & session resume (the loop-driven continuous improvement program)

**Trigger phrase:** when the user says something like *"let's get to work on the next item in the backlog with the opencode-loop"* (or just "next item in the backlog"), DO THIS: pick the **next open item** in the backlog below, and run the standard loop workflow for it:

1. `git checkout develop && git pull origin develop`; create `fix/<slug>` or `feat/<slug>` branch off develop.
2. Write `ITERATION_NOTES.md` with the Goal (first line MUST byte-match the `--goal` string you will pass) + a Context section (root causes, repro, verification, gotchas). Commit it so the tree is clean.
3. Launch the loop detached: `setsid nohup ~/.local/bin/opencode-loop 20 --goal "<exact goal>" --check "cd frontend && npm run typecheck && npm test" > logs/opencode-loop-run.out 2>&1 < /dev/null &`.
4. Monitor; on ALL_DONE (or stall/halt), re-verify `npm run typecheck && npm test` + run `npm run test:e2e` yourself before shipping.
5. Ship per the CI/CD protocol: push branch → PR to `develop` → wait `test` + `backend-test` → merge → watch staging deploy → verify on staging (relay bound, WS works) → PR `develop`→`master` → merge → watch prod deploy → verify.
6. Mark the item done below (move to "Shipped") and continue to the next item when asked.

**Backlog (in priority order):**
1. **Fresh full-tool audit** — drive every tool (pen, highlighter, line, arrow, rectangle, circle, ellipse, polyline, arc, revision-cloud, stamp, text-annotation, dimension, measure distance/area, eraser, select, offset, mirror, rotate, scale, trim, extend, fillet, pan) through the e2e harness (mouse + touch) asserting each creates/persists an element; fix anything that doesn't. Reuses `frontend/e2e/helpers.ts`.
2. (Ideas for later) — PDF layer rendering perf, viewport-clipping correctness on zoom, admin approval email test on staging with real SMTP, onboarding/empty-state UX.

**Shipped (all merged to develop + master, deployed to staging + prod):**
- Live-sync collab fix (relay auth Origin forwarding + Yjs SYNC_FULL/SYNC_DELTA protocol) — PRs #42/#43.
- WS relay close-path hardening (lifecycle helpers, error-path leak, phantom-room leak, client presence) — #47/#48.
- Reconnect/resume hardening (4001-cancel backoff, empty-doc suppression, mocked-WS suite) — #49/#50.
- E2E collab guardrail (2-browser live sync) + auth-middleware dev refresh-logout fix — #51/#52.
- Prod approval email SMTP verified (Brevo) — no code change.
- Mobile/touch drawing hardening (pointercancel commit bug, toolbar, gestures, 17 touch e2e) — #53/#54.
- Admin approval UI (/approvals, useApprovals, admin nav link) — #55/#56.
- Export hardening (sanitized filenames, 18 unit + 3 e2e edge cases) — #57/#58.
- Share-link expiry/revoked UX — resolver distinguishes expired (410) vs not-found/revoked (404); `/s/{token}` and client-side nav land on a friendly `/share-invalid` page (whitelisted for anonymous viewers) instead of a silent home redirect; 3 e2e + 2 backend tests — #60/#61.

**Current health (Aug 11, 2026):** `npm run typecheck` clean, `npm test` 438/438 (44 files), `npm run test:e2e` 28 passed, `php artisan test` 48 passed. All branch-protection checks (`test`, `backend-test`) green. Local dev stack ports: Laravel :8002, Nuxt :3000, WS relay :3001. Droplets: staging+prod on `165.245.141.179` (relay :3003 staging / :3001 prod). e2e must run with Nuxt `TEST=1` (disables devtools overlay) and a clean stack — a stale Nuxt on :3000 makes a fresh one fall back to :3001 and collide with the WS relay.
