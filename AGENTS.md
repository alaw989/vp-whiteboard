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
