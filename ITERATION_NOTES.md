# Iteration Notes

## Goal
Add a Playwright end-to-end spec proving live collaboration between two real browsers: an owner (logged in) and an anonymous share-link viewer both open the same whiteboard, an element drawn on one canvas renders on the other WITHOUT a page refresh (both directions), the share-token WS auth path is exercised through /s/{token}, the WS relay is added to playwright.config.ts webServer so the stack (Laravel :8002 + Nuxt :3000 + relay :3001) is complete, the existing smoke.spec still passes (fix it if the pending-approval registration flow broke it), and npm run test:e2e passes locally. Keep npm run typecheck + npm test green.

## State

Iteration 1 (smoke spec fixed for the pending-approval registration flow):

- **Changed:**
  - `frontend/e2e/global-setup.ts` (new) — Playwright `globalSetup` that seeds an approved owner (`e2e-owner@test.local` / `e2e-password`) via `php artisan tinker --execute` (`execFileSync`, `cwd: '..'`). Idempotent (`updateOrCreate`); pass the PLAINTEXT password (User model casts `password` to `hashed` — `bcrypt()` would double-hash).
  - `frontend/playwright.config.ts` — wired `globalSetup: './e2e/global-setup.ts'`.
  - `frontend/e2e/smoke.spec.ts` — registration is owner-approved now (register → `pending`, no auto-login), so it can no longer self-provision a session. Rewrote to login as the seeded owner via `#email`/`#password` (the login page uses `id`, not `name`), then create board + reload + verify canvas. Hardened two selectors that trip strict-mode once the DB has several boards: header `a[href="/whiteboard/new"]` (was `text=New Whiteboard`, matches board cards) and `.whiteboard-container canvas` (bare `canvas` also matches the toolbar color-wheel canvas).
  - `frontend/middleware/auth.global.ts` — **real bug fix** that blocked the smoke reload: the SSR `/api/user` Origin/Referer were synthesized from `laravelUrl` (`localhost:8002`), which does NOT match `SANCTUM_STATEFUL_DOMAINS=localhost:3000` locally → Sanctum skipped session auth → every SSR navigation of a non-exempt route (e.g. `/whiteboard/new`) 401'd → bounce to `/login`. Now synthesized from `config.public.siteUrl` (the FRONTEND origin — what the browser presents). Same-domain staging/prod unaffected; local dev fixed.
  - `frontend/.gitignore` — added `test-results` + `playwright-report`.
- **Verified:** `npm run test:e2e` passes (smoke only, 1 spec); `npm run typecheck` exit 0; `npm test` 394/394; `php artisan test` 47 passed. (Ran `npx playwright install chromium` once — the installed headless shell was a version behind and Playwright refused to launch.)
- **Next:** add the WS relay to `playwright.config.ts` webServer (`LARAVEL_URL=http://localhost:8002 WS_PORT=3001 node server/ws-server.js`, port 3001, `cwd: '.'`), then write the collab spec (owner + `/s/{token}` anonymous viewer on the same board; draw on one → renders on the other without refresh, both directions; create the share via owner `POST /api/whiteboards/{id}/shares` from the owner context's `request`).
- **Gotchas:** WS relay NOT yet in webServer → smoke logs `ERR_CONNECTION_REFUSED` on `ws://localhost:3001` (harmless; reconnect backoff capped, canvas still renders). Playwright starts webServer BEFORE globalSetup (tinker doesn't need servers). `e2e/` + `playwright.config.ts` are excluded from `vue-tsc` scope (`frontend/tsconfig.json`), so e2e TS isn't covered by `npm run typecheck`. The smoke test creates a `New Whiteboard` board on every run (left in the gitignored local DB).

## Context (from prior code review — read before changing code)

### Existing e2e setup
- `frontend/playwright.config.ts`: testDir `./e2e`, baseURL `http://localhost:3000`, headless, webServer starts `php artisan serve --port=8002` (cwd `..`) and `npm run dev` (port 3000). **It does NOT start the WS relay (:3001)** — the collab spec will hang/fail without it, so add a third webServer entry:
  - `command: 'LARAVEL_URL=http://localhost:8002 WS_PORT=3001 node server/ws-server.js'`, `port: 3001`, `cwd: '.'`, `reuseExistingServer: true`.
- `frontend/e2e/smoke.spec.ts`: registers a user via the `/register` page, creates a whiteboard, reloads, asserts a `<canvas>` is attached.
  - **Likely BROKEN since the owner-approval flow landed (Aug 4)**: `/register` now creates a `pending` user with NO auto-login — the test's `waitForURL(/\/(whiteboards?|$)/)` after submit will fail. Fix strategy: seed an APPROVED test user before the test (e.g. `php artisan tinker --execute="..."` upsets an approved user: `User::firstOrCreate(['email'=>'e2e-owner@test.local'], ['name'=>'E2E Owner','password'=>bcrypt('password'),'status'=>'approved','approved_at'=>now()])`). Then the test LOGS IN via the normal `/login` page instead of registering. Keep the smoke test's intent (create board, reload, canvas persists).

### What the collab spec must prove
1. **Owner + share viewer live sync, no refresh.** Two browser contexts:
   - Context A (owner): logged in, opens `/whiteboard/{id}`.
   - Context B (share viewer): no session, opens `/s/{token}` (302s to `/whiteboard/{id}?share={token}`, sets the httpOnly `vp_share_token` cookie, page stashes the token for the WS handshake).
2. Owner draws a stroke on the Konva canvas → the viewer's canvas shows it WITHOUT reload (poll until the element appears, e.g. via `page.evaluate` reading a rendered node count or a known marker).
3. Reverse direction too: viewer draws → owner sees it without reload.
4. The WS relay must accept both (owner via `laravel-session` cookie, viewer via `?share=` handshake token).

### How to simulate a draw (Konva)
- Pen stroke = pointerdown + pointermove + pointerup on the stage. In Playwright: `page.mouse.move(x,y); page.mouse.down(); page.mouse.move(x2,y2,{steps:5}); page.mouse.up()`. Pick coordinates inside the visible stage. The default tool in `frontend/pages/whiteboard/[id].vue` is `select` — the spec may need to click the pen tool button first.
- Robust assertion: after drawing, poll until both pages have the same rendered element count (e.g. Konva shape nodes with a stroke-class/group, or an exposed element array). Use judgement; prefer something stable.

### Environment notes
- `frontend/.env`: `LARAVEL_URL=http://localhost:8002`, `NUXT_PUBLIC_WS_URL=ws://localhost:3001`, `NUXT_PUBLIC_LARAVEL_URL=http://localhost:8002`.
- Laravel local DB is SQLite. Session cookie name `laravel_session`.
- Relay authenticates via `LARAVEL_URL=http://localhost:8002`: `/api/user` (owner) and `/api/shares/{token}` (viewer).
- Share creation: `POST /api/whiteboards/{id}/shares` (owner auth, `{role:'edit'}`) returns `data.url` = `/s/{rawToken}`. Do it from the owner context's `page.request` (Playwright APIRequestContext) using the owner session cookie.

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
