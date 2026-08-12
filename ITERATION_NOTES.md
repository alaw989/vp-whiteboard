# Iteration Notes

## Goal
Board dashboard (backlog #1): add search, sort (recent/alphabetical), thumbnails, and archive to the whiteboard dashboard (frontend/pages/index.vue) with backend support. Backend (app/Http/Controllers/Api/WhiteboardController.php@index): add `?search=` (LIKE on name) and `?sort=recent|alpha` (default recent = updated_at desc; alpha = name asc); add an `archived_at` nullable timestamp via a new migration + model scope so archived boards are hidden from the default index (delete exists, archive doesn't) and add `POST /api/whiteboards/{id}/archive` + `/unarchive` (owner-only, same ownership rule as update/destroy: 403 non-owner). Frontend index.vue: add a search input, a Recent/Alphabetical sort control, an Archive action in the card overflow menu (moves the card out of the default list), and thumbnails — render a small canvas preview CLIENT-side from `whiteboard.canvas_state.elements` (no new DB column / no server image storage; fall back to the current icon when canvas_state is empty). Preserve existing rename + delete flows and the card menu (data-testids / button roles). Tests: backend feature tests for search + sort + archive-hide + archive/unarchive round-trip + non-owner 403; frontend unit tests for new search/sort/thumbnail-parse logic (pure functions where possible); keep `php artisan test` (58) green + backend coverage ≥73% statements, `npm test` (690) + `npm run typecheck` green + frontend coverage gate green (82/82/84.5/86.5). Do NOT break e2e: helpers.createWhiteboard waits for /whiteboard/{uuid} after /whiteboard/new, and the login helper waits for /(whiteboards|$)/ — keep index.vue's URL and the new-board flow intact. Loop gotcha (from rate-limit run): this item touches pages + API controllers only, NO `server/routes/*` Nitro routes, so the ~/utils auto-import trap does not apply — but if any helper is added under `server/` it needs explicit imports.

## Context (from prior code review — read before changing code)

### What exists today

- **Dashboard** `frontend/pages/index.vue` (356 lines): header (Approvals link, New Whiteboard, Sign Out), loading/error/empty states, a responsive card grid (`md:grid-cols-2 lg:grid-cols-3`), each card shows name + created date + updated-relative date, an overflow menu (Ren명/Delete — rename inline via input, delete via confirm modal), a `useApi` fetch of `/api/whiteboards`. NO search, NO sort UI, NO thumbnails, NO archive.
- **Backend** `app/Http/Controllers/Api/WhiteboardController.php@index`: `Whiteboard::query()->orderBy('updated_at','desc')` with optional `project_id`, `created_by`, `limit` query params. Returns `{success, data: [...]}` — the full Whiteboard model serialized INCLUDING `canvas_state` (big JSON column). Auth: the index route is behind `auth:sanctum` (`routes/api.php` lines 30-34: `GET /whiteboards`, `POST /whiteboards`, `DELETE /whiteboards/{id}` all in the auth group).
- **Model** `app/Models/Whiteboard.php`: `HasUuids`, `$fillable = [user_id, name, project_id, created_by, share_token, canvas_state]`, `$casts = ['canvas_state' => 'array']`. No `archived_at`. Migration `2026_06_14_175642_create_whiteboards_table.php`: `user_id` nullable FK, `name`, `project_id`, `created_by` default 'guest', `share_token` unique nullable, `canvas_state` json nullable, timestamps.
- **Types** `frontend/types/index.ts`: `Whiteboard { id, project_id?, name, created_by, created_at, updated_at, canvas_state? }`. `CanvasState { version, elements: CanvasElement[], ... }` exists at line 43+ — the loop can read element geometry (x/y/width/height/points) for client-side thumbnails.
- **Ownership rule** (already used by update/destroy/ShareController): `user_id` match, OR legacy guest boards (`created_by === user->id` or `user->isAdmin()`). Reuse this exact rule for archive/unarchive (probably via a shared private method or the same pattern — see `WhiteboardController@update`/`destroy` and `ShareController@ownsBoard`).

### What the feature needs (backlog #1)

1. **Backend index params**: `?search=` → `where('name','like','%search%')`; `?sort=recent|alpha` → `recent` (default) = `orderBy('updated_at','desc')`, `alpha` = `orderBy('name','asc')`. Keep the existing project_id/created_by/limit params working. Archive: exclude `archived_at IS NOT NULL` from the DEFAULT index.
2. **Archive column + endpoints**: migration adding `archived_at` (nullable timestamp). `POST /api/whiteboards/{id}/archive` sets `archived_at = now()`, `/unarchive` sets null. Both owner-only (403 otherwise). Consider whether the dashboard needs a way to SEE archived boards (e.g. `?include_archived=1` or a toggle) — the backlog says "archive on index.vue (delete exists, no archive)" so the minimal bar is: archive hides the card. An unarchive path in the UI is nice-to-have; at minimum the API endpoint should exist and be tested.
3. **Frontend index.vue**: search input (client-side filter over the fetched list OR server-side `?search=` refetch — server-side keeps consistency with sort; decide + test), sort control (Recent/Alphabetical), Archive menu item calling the new endpoint, client-side canvas thumbnail from `canvas_state.elements` (small preview; keep it cheap — one tiny canvas per card, drawn from element bounds; skip when empty).
4. **Tests**:
   - Backend: `tests/Feature/WhiteboardApiTest.php` additions (or a new test file) — search matches, sort orders, archived hidden by default, archive hides, unarchive restores, non-owner 403 on archive/unarchive, unknown id 404.
   - Frontend: pure-function unit tests for whatever search/sort/thumbnail-parse logic is extracted (e.g. `utils/dashboard.ts` or a composable) so it's testable without mounting index.vue. Keep `npm run coverage` ≥ 82/82/84.5/86.5.
   - e2e: the existing suite has NO dashboard-specific spec (helpers.createWhiteboard creates boards but tests go straight to the board page). Adding a small `dashboard.spec.ts` (search filters, archive hides card, sort works) is valuable but optional — verify e2e still passes if added.

### Gotchas

- **Don't break the e2e login/board flow**: `helpers.login` waits for URL `/\/\/(whiteboards?|$)/` (line 64) — index.vue must keep its `/` URL. `helpers.createWhiteboard` (line 92+) goes `/whiteboard/new` → waits for `/whiteboard/{uuid}` — the new-board flow must stay intact.
- **canvas_state is huge**: index already returns it for every board. A thumbnail must be derived client-side from the ALREADY-fetched data — do NOT add server-side image storage or a thumbnail column (that would bloat DB + API).
- **`?search=` vs client filter**: server-side `?search=` + `?sort=` keeps the API the single source of truth and is trivially testable; a client-side filter over the fetched list is simpler but sorts/filters only what's loaded. Either is acceptable — pick one, implement consistently, test it. If server-side, debounce the input (e.g. 250ms) so typing doesn't hammer the API (note: index is NOT throttled — only `public-read` throttles show/PATCH/files/serve/sessions, and the index route is auth+not in the throttle list; still, debounce is polite).
- **RefreshDatabase + new migration**: tests run migrations fresh in-memory, so a new migration just works — but if you add a column, existing `Whiteboard::factory()` / `create()` calls are unaffected (column is nullable).
- **Backend coverage gate**: new controller methods + tests INCREASE covered statements (fine, gate is ≥73 and measured ~77.14). Don't add dead branches.
- **Archive visibility**: decide whether archived boards should be recoverable in the UI. Backlog is minimal (archive = hide). If you add an "Archived" toggle, whitelist the copy — keep it simple. The delete modal already covers permanent removal; archive is the soft delete.
- **Thumbnail rendering**: canvas_state.elements may be empty/malformed — the thumbnail must never throw (try/catch, fall back to the current `mdi:clipboard-text` icon). Element geometries vary by tool (pen has points[], rect has x/y/width/height, circle has radius, etc.) — a minimal approach: compute overall bounding box of element bounds and draw simple outlines; don't try to replicate the Konva renderer.
- **Nitro server routes NOT touched**: no `~/utils` auto-import trap this time. If the loop DOES touch `server/`, it needs explicit imports.

### Verification

- Loop gate: `cd frontend && npm run typecheck && npm test && cd .. && php artisan test` (690 frontend + 58 backend must stay green). Frontend coverage via `npm run coverage` (≥ 82/82/84.5/86.5). Backend coverage via clover parse (≥ 73).
- e2e: run `npm run test:e2e` before shipping (clean stack, TEST=1). Existing 65-67 specs must stay green; new dashboard.spec.ts (if added) too.
- Manual smoke (local stack): create 2 boards, verify dashboard shows both; search filters; sort flips order; archive hides a card; unarchive brings it back; non-owner 403 via a second user.

## State

### Iteration 1 (this session) — Backend archive support (part 1 of backlog #1)

**Changed:**
- New migration `database/migrations/2026_08_11_000000_add_archived_at_to_whiteboards_table.php` — nullable `archived_at` timestamp on `whiteboards`.
- `app/Models/Whiteboard.php`: `archived_at` added to `$fillable` + cast `datetime`; new `scopeActive()` (`whereNull('archived_at')`).
- `app/Http/Controllers/Api/WhiteboardController.php`: `index()` now uses `Whiteboard::active()` (archived boards hidden from default list, existing project_id/created_by/limit params preserved). Added `archive()` / `unarchive()` (delegating to a private `setArchived()`) + a private `ownsBoard()` helper (owner OR legacy guest-board creator with string-cast compare — admin bypass). Returns 404 unknown id, 403 non-owner.
- `routes/api.php`: `POST /whiteboards/{id}/archive` + `/unarchive` added inside the existing `auth:sanctum` whiteboards group.
- `tests/Feature/WhiteboardApiTest.php`: +9 tests — owner archive, owner unarchive, round-trip, archived-hidden-from-index, unauthenticated 401, non-owner 403 (archive + unarchive), legacy creator can archive, nonexistent 404.

**Verification (green):** `php artisan test` 67 passed (419 assertions); `npm run typecheck` clean; `npm test` 690/690. Backend coverage measured 78.14% statements (clover parse) vs 73% gate. Migration applies fresh in-memory via RefreshDatabase (no factory changes needed — column nullable).

**Gotchas:**
- The ownership rule's `created_by === $user->id` strict compare was a pre-existing bug (string `created_by` vs int `$user->id` never matches). Fixed in the new `ownsBoard()` with `(string)` casts on both sides — mirrors how `user_id` is already string-cast in `update()`. The old inline check in `update()`/`destroy()` was left untouched to keep this diff focused.
- No `server/` (Nitro) routes touched, so no `~/utils` import trap.

**Next (still open):** (1) ✅ DONE in Iteration 2 — backend `?search=` + `?sort=` + tests; (2) frontend `index.vue`: search input + Recent/Alphabetical sort control + Archive menu item calling `/archive` + unarchive path; (3) client-side canvas thumbnails from `canvas_state.elements` in a pure helper + unit tests; (4) optional `dashboard.spec.ts` e2e. See Goal for full spec.

### Iteration 2 (this session) — Backend search + sort on `index()`

**Changed:**
- `app/Http/Controllers/Api/WhiteboardController.php@index()`: now reads `?sort=` (default `recent` → `orderBy('updated_at','desc')`; `alpha` → `orderBy('name','asc')`, any other value falls back to recent) and `?search=` (LIKE `%search%` on `name`). Both compose with the existing `project_id`/`created_by`/`limit` params and the `active()` (archived-hidden) scope.
- `tests/Feature/WhiteboardApiTest.php`: +6 tests — search filters by name (case-insensitive LIKE), search empty result, recent default order (updated_at desc), alpha order (name asc), unknown sort falls back to recent, search excludes archived boards.

**Verification (green):** `php artisan test --filter=WhiteboardApiTest` 29 passed (65 assertions). Full `php artisan test` run pending the loop gate.

**Gotchas:**
- Sort validation is lenient by design: anything other than `alpha` is treated as `recent`, matching the Goal ("recent = updated_at desc; alpha = name asc"). Test pins the fallback behavior.
- `?search=` uses raw LIKE with no escaping of `%`/`_` in the needle — acceptable for this feature (dashboard search, auth-protected route); flag if a wildcard-injection concern arises.

**Next (still open):** frontend `index.vue` — search input (debounced server-side `?search=` refetch to stay consistent with sort) + Recent/Alphabetical sort control + Archive menu item calling `POST /archive` + an unarchive path (likely an "Archived" toggle or restore from a filtered view); then client-side canvas thumbnails from `canvas_state.elements` in a pure helper (`utils/dashboard.ts`) + unit tests; optional `dashboard.spec.ts` e2e.

### Iteration 3 (this session) — Frontend pure-logic layer for the dashboard (`utils/dashboard.ts`)

**Changed:**
- New `frontend/utils/dashboard.ts` — pure, unit-testable helpers for the index page (no `.vue` mounting needed):
  - `buildIndexQuery({ search, sort })` — builds the `/api/whiteboards` query string (defaults to the plain URL; `sort: 'recent'` is the API default so it's omitted; search is trimmed + URL-encoded). Pairs with the backend `?search=`/`?sort=` from iteration 2.
  - `getElementBounds(el)` — per-element bounding box from `canvas_state.elements`, handling every tool type: rect/circle/ellipse (rotation-aware via sampled boundary), line/arrow/stroke/polyline/arc/revision-cloud/fillet-arc/dimension (via `getElementGeometry`), image/stamp (x/y/w/h), text (origin + font-metric width), text-annotation (origin + leader end), measurement-distance (start/end). Returns `null` for measurement-area, malformed data, or empty geometry — never throws.
  - `getCanvasBounds(elements)` — union bounds across the board, or `null` when nothing is drawable. Drives the "show thumbnail vs fallback icon" decision.
  - `drawThumbnail(canvas, elements, opts)` — cheap canvas preview: computes fit-transform, centers + scales the content, strokes simplified outlines (circles via arc, closed shapes via closePath, image/stamp via strokeRect, text as dot+baseline, segments-only fallback). Returns `false` and draws nothing when there's nothing drawable / no 2d context / zero-size canvas / any exception — never throws.
- New `frontend/utils/dashboard.test.ts` — 43 tests: query building (defaults, encoding, trimming), per-type bounds, malformed/empty guards, canvas-bounds union, and drawThumbnail against a fake 2d context (fake canvas so happy-dom's non-2d `HTMLCanvasElement` isn't a factor). Covers the fit-transform math, closePath/arc/segments drawing paths, and the exception-swallow path.

**Verification (green):** `npm run typecheck` clean; `npm test` 733/733 (56 files; +43); `npm run coverage` passes gates (lines 84.39 ≥82, branches 84.75 ≥84.5, functions 87.06 ≥86.5 — `dashboard.ts` itself 99.04/82/100); `php artisan test` 73 passed (436 assertions).

**Gotchas:**
- happy-dom's `HTMLCanvasElement` has no usable 2d context, so `drawThumbnail` tests inject a fake canvas + plain-object ctx (vi.fn methods); the util only touches ctx methods/properties so the fake works.
- Coverage gate tightened: branch threshold is exactly 84.5 and the new file's branches initially dragged it to 84.45 → added tests for the uncovered branches (text-annotation missing-coords null, measurement-distance missing-data null, draw of measurement-distance + mixed [area, rect] to exercise the measurement-area skip, and text draw). Watch branch % when adding more logic.
- `ellipse` bounds are computed from `getElementGeometry`'s 48 sampled boundary points, so rotated ellipses get a correct (rotation-aware) box for free — no per-type rotation math needed.

**Next (still open):** wire `index.vue`: search input (debounced ~250ms server-side `?search=` refetch), Recent/Alphabetical sort control (server-side `?sort=`), Archive menu item calling `POST /api/whiteboards/{id}/archive` (+ unarchive path — likely an Archived toggle restoring from a filtered view), and a per-card `<canvas>` using `getCanvasBounds` + `drawThumbnail` (fallback to the `mdi:clipboard-text` icon when bounds are null). Optional `dashboard.spec.ts` e2e. Then run the manual smoke from the Goal's Verification section.

### Iteration 4 (this session) — Wire the dashboard UI in `index.vue`

**Changed:**
- `app/Http/Controllers/Api/WhiteboardController.php@index()`: added `?include_archived=1` (boolean) — bypasses the `active()` scope so the Archived view can list + restore archived boards. Composes with search/sort/project_id/created_by/limit.
- `tests/Feature/WhiteboardApiTest.php`: +2 tests — `include_archived=1` returns archived boards (deterministic updated_at ordering), and respects search+sort together.
- `frontend/utils/dashboard.ts`: `buildIndexQuery` gained an `includeArchived` option → emits `include_archived=1`; still omits it (byte-identical URL) for the default view.
- `frontend/utils/dashboard.test.ts`: +3 tests (includeArchived alone, false/default omission, combined with search+sort).
- `frontend/types/index.ts`: `Whiteboard` type gained `archived_at?: string | null`.
- NEW `frontend/components/whiteboard/WhiteboardThumbnail.vue`: client-side canvas preview — sizes the canvas to its CSS box × devicePixelRatio, calls `drawThumbnail`, shows the `mdi:clipboard-text` icon fallback when nothing is drawable. SSR-safe (renders in `onMounted`/`nextTick`, guards `window`).
- `frontend/pages/index.vue`: wired the whole feature — debounced (250ms) search input (`data-testid="board-search"`), Recent/A–Z sort control (`data-testid="sort-recent"`/`sort-alpha`), Archived/Active toggle (`data-testid="archived-toggle-off/on"`), Archive menu item (active view) / Unarchive menu item (archived view), per-card `<WhiteboardThumbnail>`, and a search-aware empty state ("No Matching Whiteboards" / "Nothing has been archived yet."). `refresh()` now uses `buildIndexQuery({ search, sort, includeArchived })`. Rename + delete flows and the card menu untouched.

**Verification (green):** `npm run typecheck` clean; `npm test` 736/736 (56 files; +3); `npm run coverage` exit 0 (dashboard.ts 99.05/82.17/100, overall thresholds 82/82/84.5/86.5 pass); `php artisan test` 75 passed (443 assertions; +2); backend statements 78.48% ≥ 73 gate; `npm run build` completes. No `server/` (Nitro) routes touched → no `~/utils` import trap.

**Gotchas:**
- Vue `v-if`/`v-else-if`/`v-else` chain pitfall: the initial edit put the toolbar between the error block and the empty/list blocks with its own `v-if`, which silently BROKE the chain (empty state would only render while `pending||error`). Fixed by wrapping toolbar + empty + grid in a `<template v-else>`.
- The Archived toggle deliberately reuses the same `refresh()` + `buildIndexQuery` path; toggling to Archived changes the query to `include_archived=1` but keeps search/sort so a user can find a specific archived board.
- `mdi:archive-restore` does NOT exist in the bundled icon set — used `mdi:archive-arrow-up` (archive) / `mdi:archive-arrow-down` (unarchive) instead.

**Next (still open):** optional `dashboard.spec.ts` e2e (search filters, sort flips order, archive hides card, unarchive restores) — valuable but optional; verify existing e2e stays green first (login helper waits for `/(whiteboards?|$)/` and `createWhiteboard` uses `/whiteboard/new` — both untouched). Then run the manual smoke from the Goal's Verification section (2 boards, search, sort, archive, unarchive, non-owner 403).
