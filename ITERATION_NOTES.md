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
