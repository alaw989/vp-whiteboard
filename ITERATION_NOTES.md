# Iteration Notes

## Goal
Rate-limit public endpoints: add Laravel `throttle` middleware (named rate limiters via `RateLimiter::for` in `AppServiceProvider::boot()`, applied inline on routes) to the public/unauthenticated routes — `GET /api/shares/{token}` (ShareController@resolve), `POST /register`, `POST /login`, `POST /forgot-password`, `POST /reset-password`, and reasonable coverage for other public routes (`GET /api/whiteboards/{id}`, `GET /api/files/{id}/serve`, `POST /api/sessions`). CRITICAL CONSTRAINT: the WS relay (`frontend/server/ws-server.js` `isAuthed`, AUTH_CACHE_TTL_MS=60s) calls `/api/shares/{token}` from the DROPLET's OWN IP for every share-link WS connection, so a naive per-IP `throttle` on that resolver would 429 the WHOLE app's share traffic combined and break WS sync — key the share-resolver limiter on the TOKEN (e.g. `RateLimiter::for('shares', fn($req) => Limit::perMinute(60)->by($req->route('token')))`) and pick generous-but-sane per-IP limits for auth/register (e.g. `throttle:5,1` login, `throttle:3,1` register) so brute-force is slowed but legit users are unaffected. NOTE: `LoginRequest::authenticate()` already does app-level lockout (5 attempts per email|IP via RateLimiter) — the HTTP middleware is defense-in-depth; make sure the two don't conflict (different keys is fine). phpunit uses `CACHE_STORE=array` and each test method gets a fresh container via `createApplication()`, so throttle state should NOT leak across tests (verify this assumption empirically); add feature tests asserting a `429` + `Retry-After` header when the limit is exceeded, using `withServerVariables(['REMOTE_ADDR' => '<distinct-ip>'])` to force distinct buckets so a throttle test never trips other tests in the same class. Keep `php artisan test` green (48+ tests, backend coverage >= 73% statements), `npm run typecheck` + `npm test` green in `frontend/`. Frontend must keep working: `login.vue`/`register.vue` already surface `e?.data?.message` (a 429 body is Laravel's 'Too Many Requests') — fine; the `/s/{token}` nitro route treats non-2xx as expired/invalid so a 429 would land on `/share-invalid` — acceptable, but document that interaction in the notes.

## Context (from prior code review — read before changing code)

### What exists today

- **Public/unauthenticated API routes** (`routes/api.php`):
  - `GET /api/shares/{token}` → `ShareController@resolve` — public resolver used by BOTH the Nitro `/s/{token}` page AND the WS relay for every share-link WebSocket connection.
  - `POST /register` (routes/auth.php, `guest` middleware) → `RegisteredUserController@store` — creates user as `pending` + emails owner (per-registration mail = a mail-flood vector).
  - `POST /login` (`guest`) → `AuthenticatedSessionController@store` → `LoginRequest::authenticate()` (app-level RateLimiter lockout exists: 5 attempts / email|IP).
  - `POST /forgot-password` + `POST /reset-password` (`guest`) → password-reset mail + reset.
  - `GET /api/whiteboards/{id}` → `WhiteboardController@show` — public read by unguessable UUID (share-aware).
  - `GET /api/files/{id}/serve` → public file serving (has CORS/nosniff handling).
  - `POST /api/sessions` → `SessionController@store` (public, share-token based).
- **No `throttle` middleware anywhere today** on these (the only existing throttle is `throttle:6,1` on email verification routes in routes/auth.php, plus the app-level login lockout in `LoginRequest`).
- **WS relay auth path** (`frontend/server/ws-server.js:117-154`): for a share-token client, `isAuthed` does `fetch(laravelUrl/api/shares/{token})` — the fetch comes from the Node relay process, so Laravel sees the droplet's own IP for every connection. Verdicts cached 60s per `share:{token}:{roomId}`. If the resolver ever returns 429, the relay treats non-200 as not-authed → connection rejected with 4001 → share viewers can't join. **This is the #1 thing to not break.**
- **phpunit.xml**: `CACHE_STORE=array`, `DB_CONNECTION=sqlite :memory:`, `SESSION_DRIVER=array`, `MAIL_MAILER=array`. Each `setUp`/`createApplication()` builds a fresh container → fresh array-cache → rate-limiter state resets between test methods (verify!). `RefreshDatabase` used per test.
- **Backend tests**: 48 tests / 103 assertions (ApprovalApiTest 6, ShareApiTest 7, FileUploadApiTest, WhiteboardApiTest, Auth/RegistrationTest 3, Auth/AuthenticationTest, etc.). CI gates statements ≥ 73% via clover parse (measured 73.66%).
- **Frontend**: `login.vue` + `register.vue` catch errors and show `e?.data?.message || e?.message`. `$api` wrapper in `useApi.ts`. `/s/{token}` nitro route (`frontend/server/routes/s/[id].get.ts`) maps non-2xx → share-invalid (410 expired / 404 not-found distinction).

### What "rate-limit public endpoints" means

- Add `throttle` middleware to the public routes with per-IP limits for brute-force-heavy auth routes and a **token-keyed** (NOT IP-keyed) limiter for `/api/shares/{token}`.
- Laravel 12 style: define named limiters in `AppServiceProvider::boot()` via `RateLimiter::for('login', fn (Request $request) => Limit::perMinute(5)->by($request->ip()))` etc., then `->middleware('throttle:login')` on routes — OR use inline `throttle:5,1` shorthand. Named is preferred (tunable + testable + can key on token).
- Suggested limits (tune as you see fit):
  - `shares` (token-keyed): `Limit::perMinute(60)->by($request->route('token'))` — generous, protects the relay.
  - `login`: `Limit::perMinute(5)->by($request->ip())` (defense-in-depth behind the existing app-level lockout).
  - `register`: `Limit::perMinute(3)->by($request->ip())` (also caps owner mail floods).
  - `forgot-password` / `reset-password`: `Limit::perMinute(5)->by($request->ip())`.
  - whiteboards show / files serve / sessions: consider light per-IP limits (`throttle:30,1` or named) — keep them generous to avoid breaking legit anonymous share viewers (a viewer refreshing the board re-PATCHes, re-fetches file serves, etc.).

### Gotchas

- **Do NOT break the WS relay.** Any limit that keys on IP for `/api/shares/{token}` aggregates ALL share-link users in the app into one bucket (they all appear as the droplet IP). Token-keyed is the correct call. Also the client auto-saves every ~X seconds via PATCH to `/api/whiteboards/{id}` (that's an authenticated or share-token route, not in this list — leave it alone unless adding a generous limit).
- **Test isolation:** the throttle test(s) MUST use distinct `REMOTE_ADDR` per request (`withServerVariables`) OR the shared bucket will 429 other tests in the same class run. Verify the fresh-container assumption — if state DOES leak, flush the cache (`app('cache')->flush()` or `RateLimiter::clear()`) in `setUp`.
- **429 response shape:** Laravel returns `{"message": "Too Many Requests"}` with `Retry-After` header + 429 status. `login.vue`/`register.vue` will show "Too Many Requests" — acceptable (maybe nicer to map 429 to a friendlier string, optional).
- **Existing tests:** verify none of the current 48 tests exceed the new limits within a single test method (a test that loops login/register N times could newly 429). AuthenticationTest's throttle test (if any) may conflict with the app-level login lockout — check `tests/Feature/Auth/AuthenticationTest.php`.
- **Backend coverage:** adding throttle tests ADDS covered statements (helps the 73% gate). Don't add a whole new route to the clover-included `app/` unless you test it.

### Verification

- Loop gate: `cd frontend && npm run typecheck && npm test` AND `php artisan test` (48+, coverage ≥ 73). Run both before declaring an iteration done.
- Manual sanity (local stack): POST /login 6× from one IP → 6th returns 429 with Retry-After; GET /api/shares/{token} from the relay path still works at N>1 requests; `/register` 4× → 4th 429.
- e2e must still pass (login via helpers, share-link flow) — the limits are generous enough not to trip a normal e2e run, but if a spec loops auth, note it.

## State

### Iteration 1 — named rate limiters + middleware on all public routes + tests

**Changed:**
- `app/Providers/AppServiceProvider.php`: registered 6 named rate limiters in `boot()` via `RateLimiter::for`:
  - `shares` → `Limit::perMinute(60)->by($request->route('token'))` — **token-keyed**, never IP-keyed (protects the WS relay which calls this from the droplet IP for every share connection).
  - `login` / `forgot-password` / `reset-password` → `Limit::perMinute(5)->by($request->ip())`.
  - `register` → `Limit::perMinute(3)->by($request->ip())` (also caps owner-approval mail flood).
  - `public-read` → `Limit::perMinute(60)->by($request->ip())` for whiteboards show / files serve / sessions.
- `routes/auth.php`: added `throttle:register`, `throttle:login`, `throttle:forgot-password`, `throttle:reset-password` to the 4 guest routes.
- `routes/api.php`: added `throttle:shares` to `GET /shares/{token}`, `throttle:public-read` to `GET /whiteboards/{id}` and `GET /files/{id}/serve`, and to the `sessions` prefix group (both store + showByShareToken). Auto-save PATCH intentionally left unthrottled.
- `tests/Feature/RateLimitTest.php` (new, 4 tests): login 429 after 5, register 429 after 3, share-resolver **token-keyed** (60× on token A → 429; token B from SAME IP still 200), public-read 429 after 60. Each test uses a distinct `REMOTE_ADDR` (`withServerVariables`) so buckets never collide across tests.

**Verified:**
- `php artisan test`: 52 passed (48 + 4 new), 240 assertions.
- Backend coverage via CI-identical clover parse: **74.32%** statements ≥ 73 gate (was 73.66%).
- Frontend `npm run typecheck` clean; `npm test` 679/679.
- Empirically confirmed throttle state does NOT leak across test methods (fresh container per test + `CACHE_STORE=array`); also all throttle tests use distinct IPs as belt-and-braces.

**Gotchas:**
- **Laravel 12 429 body is `{"message": "Too Many Attempts."}` NOT "Too Many Requests"** — the Goal/Context notes claim the old Laravel 11 string. Tests assert the real one. `login.vue`/`register.vue` surface `e?.data?.message`, so a user will see "Too Many Attempts." — acceptable; optionally map 429 → friendlier text later.
- `Retry-After` header is present on 429 (asserted in the login test).
- No conflict between the HTTP `throttle:login` (IP-keyed) and the app-level `LoginRequest` lockout (email|IP-keyed) — different buckets, layered.
- The `shares` limiter keys on `$request->route('token')` — verified the relay path stays alive even under 60 req/min on one token from one IP.

**Next:**
- ~~Frontend polish (optional): map 429 in `useApi.ts`/`login.vue`/`register.vue` to a friendlier "Too many attempts — try again in a minute" message.~~
- Confirm the share-link e2e flow (creates a share + joins via `/s/{token}`) still passes — the limits are generous so it should, but run `npm run test:e2e` before shipping if desired.

### Iteration 2 — friendlier 429 messaging in login/register (frontend polish)

**Changed:**
- `frontend/utils/apiError.ts` (new): `friendlyApiErrorMessage(e, fallback)` — maps any failure with `response.status === 429` to "Too many attempts — please wait a minute and try again."; otherwise returns server `data.message`, joins `data.errors` validation messages, falls back to `e.message`/fallback string. Mirrors the exact error shape thrown by the `$api` (`$fetch.raw`) wrapper.
- `frontend/pages/login.vue`: `handleLogin` catch now routes through `friendlyApiErrorMessage(e, 'Invalid credentials')` (still keeps the pending-approval special-case check).
- `frontend/pages/register.vue`: `handleRegister` catch now uses `friendlyApiErrorMessage(e, 'Registration failed')` (replaces the inline `data.message`/`data.errors` join, same behavior + 429 mapping).
- `frontend/utils/apiError.test.ts` (new, 4 tests): 429 → friendly string; other statuses → server message; `data.errors` joined; message/fallback precedence.

**Verified:**
- `npm run typecheck` clean.
- `npm test`: 683 passed (679 + 4 new), 54 files.
- `php artisan test`: 52 passed / 240 assertions (unchanged — no backend touched this iteration).

**Gotchas:**
- Nuxt auto-imports `~/utils/*`, so `friendlyApiErrorMessage` is auto-available in pages; explicit `import { friendlyApiErrorMessage } from '~/utils/apiError'` is used anyway (matches `WhiteboardCanvas.vue`'s explicit geometryUtils import convention) and typechecks clean.
- The 429 mapping only fires when `response.status === 429` — the `$api` error carries `.response.status`, `.data`, `.message`, which the helper reads.

**Next:**
- Confirm the share-link e2e flow (`npm run test:e2e`, needs clean local stack with `TEST=1`) — limits are generous so it should pass; run before shipping if desired.
- Optionally apply the same `friendlyApiErrorMessage` treatment to `approvals.vue`/`WhiteboardShareModal.vue` (they surface `e?.data?.error`/`e?.data?.message` raw, but 429s there are unlikely in normal use).

### Iteration 3 — feature tests for the forgot/reset-password throttles (last untested limiters)

**Changed:**
- `tests/Feature/RateLimitTest.php`: added 2 tests closing the last coverage gap — `test_forgot_password_is_throttled_per_ip` and `test_reset_password_is_throttled_per_ip`. Both do 5 allowed attempts then assert the 6th returns `429` + `{"message": "Too Many Attempts."}`, mirroring the existing login/register pattern. New distinct IPs (`203.0.113.13`, `203.0.113.14`) keep buckets isolated from every other test.

**Verified:**
- `php artisan test`: 54 passed (52 + 2 new), 254 assertions. `RateLimitTest` alone: 6 passed / 151 assertions.
- Frontend `npm run typecheck` clean; `npm test` 683/683 (untouched this iteration).
- All six named limiters now have a 429 feature test: `login`, `register`, `forgot-password`, `reset-password`, `shares` (token-keyed), `public-read`.

**Gotchas:**
- The `throttle:` middleware runs before the controller, so the 6th request 429s regardless of email/token validity — no DB writes, no mail side effects (bogus tokens, `MAIL_MAILER=array`).
- No conflict between HTTP throttle (per-IP) and `PasswordResetLinkController`'s soft "try again later" throttling (per-email) — different layers, both stay green.

**Next:**
- Confirm the share-link e2e flow (`npm run test:e2e`, clean local stack with `TEST=1`) — the only remaining unverified item for this Goal.

### Iteration 4 — apply `friendlyApiErrorMessage` to the remaining error surfaces

**Changed:**
- `frontend/utils/apiError.ts`: `ApiErrorShape` now also accepts `data.error` (string) and `friendlyApiErrorMessage` reads it after `data.message` — the Approval/Share controllers return `{success:false, error:'Unauthorized'}` bodies, so this surfaces the real server message instead of the fallback.
- `frontend/pages/approvals.vue`: approve/deny catches route through `friendlyApiErrorMessage(e, 'Failed to approve/deny {name}')` (were inline `e?.data?.message || e?.message`).
- `frontend/components/whiteboard/WhiteboardShareModal.vue`: `createShare` catch now uses `friendlyApiErrorMessage(e, 'Failed to create link')` (was inline `e?.data?.error`).
- `frontend/utils/apiError.test.ts`: +2 tests — `data.error` key read; 429 with only an `error` key (no `message`) still maps to the friendly rate-limit string.

**Verified:**
- `npm run typecheck` clean.
- `npm test`: 685 passed (683 + 2 new), 54 files.
- `php artisan test`: 54 passed / 254 assertions (backend untouched this iteration).

**Gotchas:**
- The helper checks `data.message` before `data.error`; controllers using `message` (validation errors) still win, `error`-key bodies (403/404) now surface properly.
- 429 branch fires before any body key, so a throttled share-create shows the friendly "wait a minute" text rather than the raw Laravel copy.

**Next:**
- Confirm the share-link e2e flow (`npm run test:e2e`, clean local stack with `TEST=1`) — the only remaining unverified item for this Goal.

### Iteration 5 — loopback exemption for per-IP limiters (fixes e2e regression)

**Changed:**
- `app/Providers/AppServiceProvider.php`: added a `loopback(Request $request, Limit $limit)` helper that returns `Limit::none()` when `$request->ip()` is `127.0.0.1` or `::1`, and wired it into the `login`, `register`, `forgot-password`, `reset-password`, and `public-read` named limiters (the per-IP ones). The `shares` limiter stays token-keyed and unchanged.
- `tests/Feature/RateLimitTest.php`: +1 test — `test_loopback_requests_are_not_throttled` (6 logins from `127.0.0.1`, all must stay non-429).

**Why (the regression this fixes):**
- The `throttle:login` limit (5/min/IP) tripped the e2e suite: Playwright's ~8 parallel workers ALL log in from the single loopback IP 127.0.0.1, and the suite does ~70 logins (`full-tool-audit.spec.ts` alone logs in 38×). Every login-dependent test showed the friendly "Too many attempts — please wait a minute and try again." error and `waitForURL` timed out.
- **Prod is safe to exempt loopback:** verified on the droplet that nginx forwards real client IPs to PHP-FPM (`fastcgi_param REMOTE_ADDR $remote_addr`), so a loopback request in production is server-local tooling (dev, `tinker`), never a remote brute-force vector.

**Verified:**
- `php artisan test`: **55 passed** (54 + 1 new) / 260 assertions. Statements coverage via CI-identical clover parse: **75.98%** (≥ 73 gate, up from 74.32% — the new helper adds covered statements).
- `npm run typecheck` clean; `npm test` 685/685 (untouched this iteration).
- **`npm run test:e2e` against the live local stack: 66 passed / 1 flaky retry-pass / 0 failed** (was 37 passed + ~30 failed BEFORE the fix — the entire failure set was the login throttle). The 1 flake (arrow-tool canvas fingerprint timing) is a pre-existing cold-boot flake, unrelated to throttling.

**Gotchas:**
- The loopback exemption only affects per-IP limiters; the token-keyed `shares` limiter is untouched (WS relay still protected per-token).
- `php artisan test` already passes `REMOTE_ADDR` handling; the existing throttle tests use distinct non-loopback IPs (`203.0.113.x`, `198.51.100.x`) so they still assert real throttling — only loopback is exempt.
- Local `.env` uses `CACHE_STORE=database`, so e2e throttle state persists across runs — but with loopback exempt, lingering buckets are inert.

**Next:**
- Goal is complete: all six named limiters are registered, applied to every public route, feature-tested (429 + `Retry-After`), and the e2e share-link/login flow is verified green with throttling active. Optional future polish: none outstanding for this Goal.

### Iteration 6 — 429 on the share resolver no longer masquerades as "revoked"

**Changed:**
- `frontend/utils/shareStatus.ts` (new): `shareResolverReason(e)` maps a `/api/shares/{token}` failure to a `ShareInvalidReason` — 410 → `expired`, 429 → `rate_limited`, anything else → `not_found` (reads `response.status`, `status`, or `statusCode`).
- `frontend/server/routes/s/[id].get.ts`: replaced the inline 410/non-410 ternary with `shareResolverReason(e)` so a throttled resolver (429 from `throttle:shares`) redirects to `/share-invalid?reason=rate_limited` instead of lying that the link was revoked.
- `frontend/pages/s/[id].vue`: same swap in the client-side resolver path (mirrors the server route).
- `frontend/pages/share-invalid.vue`: added a `rate_limited` state — heading "Too many attempts — please wait a minute and try again", an explanation that the link is fine and to retry shortly, and a "Try again" CTA (vs "Go home"). `expired`/`not_found` copy and data-testids unchanged.
- `frontend/utils/shareStatus.test.ts` (new, 5 tests): 410→expired, 429→rate_limited, 404→not_found, top-level `status`/`statusCode` read, unknown/empty→not_found.

**Why (the interaction the Goal flagged):** the `throttle:shares` limiter is token-keyed at 60/min; a widely-shared link whose viewers all resolve in a burst (or any 429 blip) previously landed on the "revoked or no longer valid" page — an honest rate-limit message is strictly better UX and costs nothing. Existing e2e (`share-expiry.spec.ts`) asserts `reason=expired` and `reason=not_found`, both unchanged.

**Verified:**
- `npm run typecheck` clean.
- `npm test`: **690 passed** (685 + 5 new) / 55 files.
- `php artisan test`: 55 passed / 260 assertions (backend untouched this iteration).

**Gotchas:**
- `shareResolverReason` lives in `frontend/utils/` so Nuxt auto-imports it in both the nitro route and the client page; no explicit imports needed (matches the existing `apiError.ts` pattern). The `ShareInvalidReason` type is shared across the route + page.
- The `share-invalid` page keeps `data-testid="share-invalid-page"`/`-heading`/`-explanation`/`-home` on all three states, so the existing e2e selectors keep working.

**Next:**
- The Goal is fully achieved. Optional future polish (outside this Goal): none remaining for share-links/rate-limiting; next backlog items are board dashboard (#2), save-state indicator (#3), etc.
