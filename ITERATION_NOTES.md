# Iteration Notes

## Goal
Add a Playwright end-to-end spec proving live collaboration between two real browsers: an owner (logged in) and an anonymous share-link viewer both open the same whiteboard, an element drawn on one canvas renders on the other WITHOUT a page refresh (both directions), the share-token WS auth path is exercised through /s/{token}, the WS relay is added to playwright.config.ts webServer so the stack (Laravel :8002 + Nuxt :3000 + relay :3001) is complete, the existing smoke.spec still passes (fix it if the pending-approval registration flow broke it), and npm run test:e2e passes locally. Keep npm run typecheck + npm test green.

## State

Iteration 2 (collab spec proving live two-browser sync via the share-token WS path):

- **Changed:**
  - `frontend/playwright.config.ts` — added the Yjs WS relay as a third webServer entry: `LARAVEL_URL=http://localhost:8002 WS_PORT=3001 node server/ws-server.js`, port 3001, `cwd: '.'`, `reuseExistingServer: true`. The stack (Laravel :8002 + Nuxt :3000 + relay :3001) is now complete for e2e.
  - `frontend/e2e/collab.spec.ts` (new) — proves live collaboration end-to-end with two real browsers:
    1. Owner logs in (seeded `e2e-owner@test.local`), creates a fresh whiteboard, waits for the WS badge to read **connected** (owner's laravel_session-cookie auth path).
    2. Owner creates an edit-role share via `POST /api/whiteboards/{id}/shares` from the owner context's APIRequestContext — passes the session cookie, `origin/referer: localhost:3000` (Sanctum stateful domain), and the `X-XSRF-TOKEN` header (fetched `/sanctum/csrf-cookie` first, like the app does). Returns the raw `/s/{token}`.
    3. Anonymous viewer context (no session) opens `/s/{token}` → 302 to the board, `vp_share_token` cookie set, WS accepts via the **share-token** auth path (badge reads connected).
    4. Owner draws a pen stroke → polls the viewer's canvas pixels until they change WITHOUT a refresh, then re-checks after a settle window (committed element, not a transient active-stroke preview).
    5. Viewer draws → owner's canvas changes (reverse direction).
    6. Both badges still read connected at the end.
- **Debug findings (worth preserving):**
  - Headless Chromium serves a **stale surface to `canvas.drawImage()`** when the source is the Konva canvas — a freshly drawn stroke is invisible to a drawImage-based fingerprint, while `getImageData` (which forces a readback flush) sees it. The fingerprint helper therefore block-averages luma straight from `getImageData` (24-wide grid, FNV-1a). Don't "simplify" it back to drawImage.
  - `/whiteboard/new` must be excluded when extracting the board id: `waitForURL(/\/whiteboard\//)` matches the creation page itself (last segment `new`). The spec waits for `/whiteboard/{id}` (not ending `/new`) before reading the UUID.
  - The share API returns an absolute URL built from the LARAVEL origin (`http://localhost:8002/s/{token}`), but `/s/` is a Nuxt route — normalize to the FRONTEND origin before `viewer.goto`.
  - The e2e canvas has TWO same-sized canvases (main layer + transparent transformer layer); the fingerprint's `reduce(max-area)` picks the main one. Grid lines (default grid on) are why the empty-board fingerprint isn't a solid color.
  - Sanity-verified the actual sync path with probes: pen stroke events reach the stage, `yElements` grows, the Konva Line node renders in the elements group — the only broken link was the fingerprint readback, not the app.
- **Verified:** `npm run test:e2e` passes — **2/2** (`smoke.spec.ts` still green, `collab.spec.ts` green), run with 2 parallel workers (no interference). `npm run typecheck` exit 0; `npm test` 394/394; `php artisan test` 47 passed.
- **Next:** the Goal's remaining box is ticked — WS relay in webServer, collab spec both directions, share-token path via `/s/{token}`, smoke still passing, `test:e2e` green. If a further hardening iteration is wanted: make `drawStroke` robust to non-default viewports (it currently relies on the default zoom/pan), or assert the owner AND viewer converge to the SAME element count after both draws (currently implied by pixels). Otherwise the Goal is fully achieved.
- **Gotchas:** `e2e/` + `playwright.config.ts` are excluded from `vue-tsc` scope, so the spec's TS isn't type-checked by `npm run typecheck`. Playwright starts webServers BEFORE globalSetup (tinker doesn't need servers). Keep using `{ steps: 8 }` in `mouse.move` — separate `mouse.move` calls also work but are slower; both create the element. Test leaves a `New Whiteboard` + one share row per run in the gitignored local SQLite DB.

## Context (from prior code review — read before changing code)

### Existing e2e setup
- `frontend/playwright.config.ts`: testDir `./e2e`, baseURL `http://localhost:3000`, headless, webServer starts `php artisan serve --port=8002` (cwd `..`), `npm run dev` (port 3000), and now the Yjs WS relay on :3001 (`LARAVEL_URL=http://localhost:8002 WS_PORT=3001 node server/ws-server.js`, `cwd: '.'`, `reuseExistingServer: true`).
- `frontend/e2e/global-setup.ts`: seeds the approved `e2e-owner@test.local` / `e2e-password` via artisan tinker (plaintext password; User model casts `password` to hashed).
- `frontend/e2e/smoke.spec.ts`: logs in as the seeded owner, creates a board, reloads, verifies canvas persistence.
- `frontend/e2e/collab.spec.ts`: owner + `/s/{token}` anonymous viewer live-sync spec (both directions, no refresh, share-token WS auth).

### What the collab spec proves
1. **Owner + share viewer live sync, no refresh.** Two browser contexts:
   - Context A (owner): logged in, opens `/whiteboard/{id}`.
   - Context B (share viewer): no session, opens `/s/{token}` (302s to `/whiteboard/{id}?share={token}`, sets the httpOnly `vp_share_token` cookie, page stashes the token for the WS handshake).
2. Owner draws a stroke on the Konva canvas → the viewer's canvas shows it WITHOUT reload (poll the canvas-pixel fingerprint).
3. Reverse direction too: viewer draws → owner sees it without reload.
4. The WS relay accepts both (owner via `laravel_session` cookie, viewer via `?share=` handshake token).

### How to simulate a draw (Konva)
- Pen stroke = pointerdown + pointermove + pointerup on the stage. In Playwright: `page.mouse.move(x,y); page.mouse.down(); page.mouse.move(x2,y2,{steps:8}); page.mouse.up()`. Pick coordinates inside the visible stage (draw relative to the `.whiteboard-container canvas` boundingBox so layout changes don't break it). The default tool in `frontend/pages/whiteboard/[id].vue` is `select` — the spec clicks the pen tool button first (`getByRole('button', { name: 'Pen tool, press P', exact: true })`, desktop-only aria-label) and asserts `aria-pressed=true`.
- Robust assertion (what collab.spec.ts does): canvas-pixel fingerprint polling. Hash a 24-wide grid of block-averaged luma read straight from `getImageData` (see State: headless `drawImage` returns a stale surface for Konva canvases), poll the OTHER page until it differs from baseline, then re-check after a settle window. This proves a COMMITTED element rendered without reload and tolerates the transient remote active-stroke preview (which clears on settle).

### Environment notes
- `frontend/.env`: `LARAVEL_URL=http://localhost:8002`, `NUXT_PUBLIC_WS_URL=ws://localhost:3001`, `NUXT_PUBLIC_LARAVEL_URL=http://localhost:8002`.
- Laravel local DB is SQLite. Session cookie name `laravel_session`.
- Relay authenticates via `LARAVEL_URL=http://localhost:8002`: `/api/user` (owner) and `/api/shares/{token}` (viewer).
- Share creation: `POST /api/whiteboards/{id}/shares` (owner auth, `{role:'edit'}`) returns `data.url` — an ABSOLUTE URL with the LARAVEL origin (`http://localhost:8002/s/{rawToken}`), so the spec normalizes it to the FRONTEND origin before opening it. The request is made from the owner `context.request` with the session cookie header + `origin/referer: localhost:3000` (Sanctum stateful) + `X-XSRF-TOKEN` (decode the cookie; hit `/sanctum/csrf-cookie` first like the app's `ensureCsrf`).

### Verification (do end-to-end before DONE)
1. `cd frontend && npm run typecheck && npm test` green (currently 394 tests) — do NOT regress unit coverage.
2. `npm run test:e2e` passes locally: both `smoke.spec.ts` (fixed) and the new collab spec (both directions, no refresh).
3. The collab spec must actually exercise the WS (relay on :3001, both clients in the same room).
4. `php artisan test` if Laravel touched.

### Gotchas
- Playwright browsers must be installed (`npx playwright install chromium` if needed).
- Pending-approval registration means NEW registrations can't log in — seed an approved user rather than registering.
- The relay is ESM; `isEntryPoint()` binds only when launched as a script.
- Do not remove the smoke test — fix it.
- Do not touch the Goal section. Update the State section every iteration.

## Log

- **2026-08-07 (iter 1):** Fixed smoke.spec for the owner-approval flow. Added `frontend/e2e/global-setup.ts` (seeds approved `e2e-owner@test.local` via artisan tinker), wired it into playwright.config, switched smoke to login + hardened selectors, fixed the SSR auth Origin/Referer synthesis bug (was 8002, must be the frontend origin so Sanctum stateful auth runs locally), gitignored Playwright artifacts. `npm run test:e2e` green (smoke), typecheck + 394 unit tests + 47 backend tests green.
- **2026-08-07 (iter 2):** Added the Yjs WS relay to `playwright.config.ts` webServer (:3001) so the e2e stack is Laravel :8002 + Nuxt :3000 + relay :3001. Wrote `frontend/e2e/collab.spec.ts`: owner (session-cookie WS auth) + anonymous `/s/{token}` viewer (share-token WS auth) on the same board; owner draws → viewer's canvas pixels change without refresh; viewer draws → owner's changes; both badges stay `connected`. Debugged a subtle headless bug: `canvas.drawImage()` returns a STALE surface for Konva canvases (stroke invisible to a drawImage-based fingerprint) while `getImageData` reads it correctly — the fingerprint block-averages luma from `getImageData`. Also fixed `/whiteboard/new` URL-match (was extracting `new` as the board id) and normalized the share URL from the Laravel origin to the frontend origin. `npm run test:e2e` green 2/2 (smoke + collab, 2 workers), typecheck exit 0, 394 unit tests, 47 backend tests.
