# Iteration Notes

## Goal
Add a Playwright end-to-end spec proving live collaboration between two real browsers: an owner (logged in) and an anonymous share-link viewer both open the same whiteboard, an element drawn on one canvas renders on the other WITHOUT a page refresh (both directions), the share-token WS auth path is exercised through /s/{token}, the WS relay is added to playwright.config.ts webServer so the stack (Laravel :8002 + Nuxt :3000 + relay :3001) is complete, the existing smoke.spec still passes (fix it if the pending-approval registration flow broke it), and `npm run test:e2e` passes locally. Keep npm run typecheck + npm test green.

## State
(empty — first iteration will start the log)

## Context (from prior code review — read before changing code)

### Existing e2e setup
- `frontend/playwright.config.ts`: testDir `./e2e`, baseURL `http://localhost:3000`, headless, webServer starts `php artisan serve --port=8002` (cwd `..`) and `npm run dev` (port 3000). **It does NOT start the WS relay (:3001)** — the collab spec will hang/fail without it, so add a third webServer entry:
  - `command: 'LARAVEL_URL=http://localhost:8002 WS_PORT=3001 node server/ws-server.js'`, `port: 3001`, `cwd: '.'`, `reuseExistingServer: true`.
- `frontend/e2e/smoke.spec.ts`: registers a user via the `/register` page, creates a whiteboard, reloads, asserts a `<canvas>` is attached.
  - **Likely BROKEN since the owner-approval flow landed (Aug 4)**: `/register` now creates a `pending` user with NO auto-login — the test's `waitForURL(/\/(whiteboards?|$)/)` after submit will fail. Fix strategy: seed an APPROVED test user before the test (e.g. `php artisan tinker --execute="..."` or a small Node helper that calls `POST /api/whiteboards`... no — the user must already exist and be approved). Cleanest: in a Playwright global-setup or the spec's `test.beforeAll`, run a one-liner that upserts an approved user (e.g. `User::firstOrCreate(['email'=>'e2e-owner@test.local'], ['name'=>'E2E Owner','password'=>bcrypt('password'),'status'=>'approved','approved_at'=>now()])`). Then the test LOGS IN via the normal `/login` page instead of registering. Keep the smoke test's intent (create board, reload, canvas persists).

### What the collab spec must prove
1. **Owner + share viewer live sync, no refresh.** Two browser contexts:
   - Context A (owner): logged in, opens `/whiteboard/{id}`.
   - Context B (share viewer): no session, opens `/s/{token}` (which 302s to `/whiteboard/{id}?share={token}`, sets the httpOnly `vp_share_token` cookie, and the page stashes the token for the WS handshake).
2. Owner draws a stroke on the Konva canvas → the viewer's canvas shows it WITHOUT reload (poll/expect the element, e.g. via `page.evaluate` reading the Yjs-backed element count or a visible Konva node/group count, or a distinctive color stroke at known coordinates).
3. Reverse direction too: viewer draws → owner sees it without reload.
4. The WS relay must accept both (owner via `laravel-session` cookie, viewer via the `?share=` handshake token) — the live-wire 4001-reject path is already unit-tested; this spec covers the happy path over a real stack.

### How to simulate a draw (Konva)
- The canvas is a Konva `stage` inside `<canvas>`/`<div>` layers. A pen stroke = pointerdown + pointermove + pointerup on the stage element. In Playwright: `page.mouse.move(x,y); page.mouse.down(); page.mouse.move(x2,y2,{steps:5}); page.mouse.up()`. Pick coordinates inside the visible stage (e.g. center area). Select the pen tool first if needed (the toolbar). Inspect `WhiteboardCanvas.vue` for how tools are activated (pen is default tool? check the default `currentTool` in `frontend/pages/whiteboard/[id].vue` — currently `select` is default, so the spec may need to click the pen tool button).
- Robust assertion: after drawing, poll until both pages have the same number of rendered elements. A reliable read: `page.evaluate(() => { const stage = (window as any).__konvaStages?.[0] || document.querySelector('.konvajs-content') ... })`. Simpler: count canvas layers matching the stroke color, or expose a test hook. Use judgement; prefer something stable (e.g. the `elements` array length reachable via a global if exposed, else count Konva shape nodes with `node.className === 'Path'` or a group id prefix).

### Environment notes
- `frontend/.env`: `LARAVEL_URL=http://localhost:8002`, `NUXT_PUBLIC_WS_URL=ws://localhost:3001`, `NUXT_PUBLIC_LARAVEL_URL=http://localhost:8002`.
- Laravel local DB is SQLite. `php artisan serve --port=8002` uses the repo-root `.env` (`APP_URL=http://localhost`, session cookie `laravel_session`).
- The relay authenticates against `LARAVEL_URL` (set to `http://localhost:8002` in the webServer command) — `/api/user` for the owner session and `/api/shares/{token}` for the viewer.
- Share link creation: `POST /api/whiteboards/{id}/shares` (owner auth, `{role:'edit'}`) returns `data.url` = `/s/{rawToken}`. Do this from the owner context via `page.request` (Playwright APIRequestContext) using the owner's session, or via `$fetch`/curl with the session cookie. The `/s/{token}` route then resolves and sets the cookie.

### Verification (do end-to-end before DONE)
1. `cd frontend && npm run typecheck && npm test` green (currently 394 tests) — do NOT regress unit coverage.
2. `npm run test:e2e` passes locally: both `smoke.spec.ts` (fixed) and the new collab spec (both directions, no refresh).
3. The collab spec must actually exercise the WS (relay running on :3001, both clients in the same room). If it can't be made deterministic in headless CI, at minimum it must pass on the local machine with the dev stack — but prefer it passing as-is.
4. `php artisan test` if Laravel touched.

### Gotchas
- Playwright browsers must be installed (`npx playwright install chromium` may be needed; check `~/.cache/ms-playwright`).
- The pending-approval registration flow means NEW registrations can't log in — seed an approved user rather than registering.
- The WS relay is ESM; the `isEntryPoint()` guard binds only when launched as a script (direct `node server/ws-server.js` is fine).
- Do not commit to removing the smoke test — fix it.
- Do not touch the Goal section. Update the State section every iteration.

## Log
