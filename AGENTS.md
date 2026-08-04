# Agent Memory

## Rules

- Do NOT commit, push, create PRs, or deploy unless explicitly instructed by the user.

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
- Seeded account: `vpassociates2025@vp-associates.com` / `password` (weak — user aware). Registration open via `/register`.

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
