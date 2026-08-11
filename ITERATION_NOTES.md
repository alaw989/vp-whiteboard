# Iteration Notes

## Goal
Add a CI e2e job to .github/workflows/ci.yml that runs the full playwright suite at PR time (boot the Laravel+Nuxt+WS stack in the runner, install browsers, retries for warm-up) WITHOUT breaking the existing required test/backend-test checks, and root-cause + fix the recurring cold-boot login hydration flake so the 65-test suite is deterministic locally and in CI. Known culprit: smoke.spec.ts inlines its own login (fill + page.click with no hydration-safe toBeEnabled wait) instead of the shared helpers.login() that waits for the submit button to enable — and mobile-touch.spec.ts:42 flakes the same way. Fix the flake root cause (fill-before-hydration value drop) and make every spec use the robust login path. Keep npm run typecheck + npm test green and prove the full npx playwright test passes.

## State

### Iteration 1 (DONE) — login hydration flake: self-healing login core + smoke uses shared helper
**Changed:**
- `frontend/e2e/helpers.ts`: extracted a shared `fillLoginForm()` used by both `login()` and `loginSubmit()`. Fixes the cold-boot fill-before-hydration value drop via a SELF-HEALING retry loop (fill → `toHaveValue` assert → re-fill on failure, up to 5 attempts) instead of the old one-shot fill + `toBeEnabled` (which only *detected* the race by 10s timeout). Final `toBeEnabled(10s)` retained as last line of defense. NOTE: tried a `#__nuxt[data-v-app]` hydration sentinel first — empirically VERIFIED ABSENT on Nuxt 3.15 (`data-v-app` never appears; `__vue_app__` is set BEFORE hydration completes, so neither is a usable sentinel). Reverted to the version-agnostic retry loop.
- `frontend/e2e/smoke.spec.ts`: the known inline-login culprit now calls the shared `login(page, {email, password})` instead of inlining fill/click with no enabled-wait. The only inline login left in the suite.
- Audited: the only other inline `page.fill('#email'`s were the two in helpers.ts itself (now `fillLoginForm`); every other spec already used `login()`/`loginSubmit()`.

**Verified (all green):**
- `npm run typecheck` (0 errors), `npm test` (438/438, 44 files).
- Full `npx playwright test`: **67 passed, 0 failed, 0 flaky** (1.5m) — suite grew to 67, not 65. Covers smoke (formerly flaky), approvals (loginSubmit), share-expiry, export, collab, mobile-touch, full-tool-audit.
- Re-booted Nuxt cold between runs and immediately ran smoke+approvals+share-expiry+export (10 tests) — all passed, no hydration flake.

### Iteration 3 (DONE) — CI-fresh-DB determinism proven + login NAVIGATION timeout hardened
**Changed:**
- **Proved the suite is deterministic against CI's exact DB state:** CI runs the 67-test suite against a FRESH migrated database (0 boards, 0 users; global-setup seeds the 4 test users). The local dev DB had 1085 boards, so "deterministic locally" wasn't yet proven against CI's empty DB. Simulated it: swapped in a fresh migrated SQLite (backed up + restored the dev DB), ran the full suite — **67 passed, 0 failed, 0 flaky** after the fix below (the first fresh-DB run surfaced 2 flakes, see root-cause).
- **`frontend/e2e/helpers.ts` `fillLoginForm()`:** the cold-boot flake has a SECOND phase beyond the value-drop fixed in Iteration 1 — the initial `page.goto('/login')` itself used Playwright's default navigation budget, which the 30s test timeout capped. On the fresh-DB/cold-boot run, mobile-touch.spec.ts:307 died with `page.goto: Test timeout of 30000ms exceeded` at helpers.ts:26 — the first `/login` SSR compile on a re-warmed Nuxt exceeds 30s, killing the test before a single fill ran. Fix: `page.goto('/login', { timeout: 60000 })` (navigation gets its own generous budget; the self-healing fill loop handles the value-drop).
- **`frontend/playwright.config.ts`:** test `timeout: 30000` → `60000` (a test whose first goto now allows 60s must not be re-capped by the test-level timeout). Commented. Still fails fast on real bugs.
- The collab flake on the first fresh-DB run (viewer canvas poll 20s) was warm-up only — passed on retry and in all subsequent runs. No product-code bug.

**Verified (all green):**
- `npm run typecheck` (0 errors), `npm test` (438/438, 44 files).
- Full `npx playwright test` twice consecutively against the restored dev DB: **67 passed, 0 flaky both runs** (~1.5m each).
- Fresh-DB (CI-equivalent) run: **67 passed** after the timeout fix (first run was 65 passed + 2 flaky that retry-passed; the mobile-touch flake was the navigation timeout this iteration fixed).

**Next:** the CI e2e job (Iteration 2) still has never actually run on GitHub Actions — push the branch (e.g. `feat/ci-e2e` PR to `develop`) and let the `e2e` job run once. Watch (a) cold-boot webServer timing in the runner, (b) the `retries: 1` + now-60s login nav absorbing any remaining warm-up flake. If green for a few PRs, promote `e2e` to a required check (separate task).

**Gotchas:**
- CI's empty DB ≠ the dev DB: never assume "the suite passes" means it passes on a fresh DB. This iteration proved it does (the only divergence was the nav timeout, now fixed).
- `page.goto` uses the TEST timeout as its ceiling, not the config's navigation timeout — so a generous goto timeout REQUIRES raising the test timeout too, or the test still dies at the old cap.
- Dev servers were left running (laravel :8002, nuxt :3000 TEST=1, ws :3001) — playwright `reuseExistingServer: true` reuses them.

### Iteration 2 (DONE) — CI e2e job added to ci.yml
**Changed:**
- `.github/workflows/ci.yml`: new `e2e` job (runs-on ubuntu-latest, timeout-minutes 25) added BELOW the existing `test` + `backend-test` jobs — those two required checks are untouched. Job: PHP 8.4 + composer install → provision Laravel (cp `.env.example` → `.env`, sed APP_URL=:8002 + MAIL_MAILER=array, `touch database/database.sqlite`, `php artisan key:generate`, `php artisan migrate --force`) → write `frontend/.env` (LARAVEL_URL/NUXT_PUBLIC_LARAVEL_URL=:8002, WS_PORT=3001, NUXT_PUBLIC_WS_URL, NUXT_PUBLIC_SITE_URL; the local one is gitignored, so CI needs it to tell Nuxt where Laravel lives) → Node 22 + npm ci → `npx playwright install --with-deps chromium` → `npx playwright test` → upload `frontend/test-results/` artifact on failure.
- `frontend/playwright.config.ts`: added explicit `timeout:` to all three webServer entries (Laravel 180s, Nuxt dev 300s, WS relay 180s). Playwright's default webServer timeout is 60s — a cold Nuxt dev boot on a fresh CI runner routinely exceeds that and would kill the job in the boot phase before a single test ran.
- **NOT added to branch protection** (per recipe): the existing required checks remain `test` + `backend-test`; the e2e job is informational until proven stable over a few green runs, then promote separately.

**Verified (all green):**
- `npm run typecheck` (0 errors), `npm test` (438/438, 44 files).
- Full `npx playwright test`: **67 passed** (1.5m) against the running local stack (reused via `reuseExistingServer: true`).
- Provisioning sequence exercised in-place with a temp SQLite DB + temp `.env` (backed up + restored the real `.env`): `key:generate` + `migrate --force` complete all 8 migrations cleanly. NOTE: a bare `php artisan migrate` with a missing DB file still succeeds but warns "does not exist" (would be a confusing failure later) — the job's `touch database/database.sqlite` prevents that.
- YAML parses (`python3 yaml.safe_load`), job + step names as intended.

**Next:** push the branch and let CI actually run the e2e job once (cannot be proven locally — GitHub Actions only runs on push). Watch for (a) cold-boot webServer timing, (b) any Nuxt dev quirk in the runner, (c) flaky spec counts. If green for a few PRs, promote `e2e` to a required check (separate task).

**Gotchas:**
- The suite count is **67** (not 65 as the Goal text says) — don't hardcode 65.
- CI needs BOTH `.env` (repo root, for Laravel serve + global-setup tinker) AND `frontend/.env` (for Nuxt dev runtimeConfig). Missing the latter silently points Nuxt at `http://localhost:8000` (default) and every API call 404s — the job writes both.
- `.env.example` has `APP_URL=http://localhost` and `MAIL_MAILER=log` — the sed overrides fix both. `SESSION_DRIVER=database` + `SANCTUM_STATEFUL_DOMAINS=localhost:3000` are already correct in `.env.example`.
- The e2e job shares the workflow's `concurrency` group (`ci-${{ github.ref }}`, cancel-in-progress) — fine, but note a second push cancels the in-flight e2e run.
- Local dev servers were left running (laravel :8002, nuxt :3000 TEST=1, ws :3001) from verification — playwright `reuseExistingServer: true` reuses them; restart if a later iteration needs a genuinely cold boot.
- `pkill -f "vite"` hung the shell (matched the invoking shell) — use targeted pids or `pkill -f "nuxt dev"` only, per AGENTS.md warning.

## Context (from prior code review — read before changing code)

### The flake (root-cause leads)
- **`frontend/e2e/smoke.spec.ts:10-15`** inlines its own login: `page.fill('#email', …)`, `page.fill('#password', …)`, `page.click('button[type="submit"]')` — NO wait for the submit button to become enabled. The submit button is `:disabled="loading || !email || !password"` (login.vue:46). On a COLD boot, Nuxt SSR renders the page, Playwright fills the inputs, then **Nuxt hydration replaces the input elements and drops the typed values** → `email`/`password` are empty → button stays disabled → `page.click` times out on "element is not enabled" (the exact error seen in the logs, smoke.spec.ts:14). This is the smoke flake.
- **`frontend/e2e/helpers.ts` `login()` (line 15) and `loginSubmit()` (line 6)** already mitigate this: they fill, then `await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 10000 })` BEFORE clicking. The comment says "wait until the button actually enables (v-model updated) before clicking, so a hydration race fails fast instead of a 30s disabled-button timeout." But mobile-touch.spec.ts:42 still flakes occasionally even using `login(page)` — so the fill-then-hydration race can ALSO bite the shared helper when the value is dropped AFTER the enabled check or between enable and click. A more robust login: fill → assert the input VALUE stuck (`toHaveValue`) → wait enabled → click (re-fill if hydration dropped it). Investigate whether a hydration sentinel (e.g. wait for Nuxt's hydration to finish before filling) is more reliable.
- **Every spec should use the shared `login()`** (helpers.ts) — audit for other inline logins: smoke.spec.ts is the known one; grep for `page.fill('#email'` across e2e/. `loginSubmit` is a thin variant used by approvals.spec.ts (different creds) — it should inherit the same robustness fix.

### CI e2e job — what it must do (all in .github/workflows/ci.yml)
The suite's playwright.config.ts `webServer` auto-boots the WHOLE stack, and `global-setup.ts` seeds 4 users via `php artisan tinker` (cwd `..`). So the e2e job needs a real bootable Laravel:
1. Setup PHP 8.4 + composer (same as backend-test job).
2. `composer install`.
3. Provision a working Laravel env for the runner — **there is NO .env in CI** (phpunit.xml only covers `php artisan test`). The e2e needs: an APP_KEY, a PERSISTENT (file) SQLite DB at `database/database.sqlite` (NOT `:memory:` — `php artisan serve` + `php artisan tinker` are separate processes and must share the same DB), `php artisan migrate --force`, `SESSION_DRIVER=database` (or file), `SANCTUM_STATEFUL_DOMAINS=localhost:3000` (the frontend origin), `SESSION_DOMAIN`/cookies consistent with localhost, `MAIL_MAILER=array`, `APP_URL=http://localhost:8002`. Create `.env` in the job (e.g. a generated APP_KEY via `php artisan key:generate` after writing the non-secret env, or set env vars directly on the steps — `php artisan key:generate` needs a `.env` to exist).
4. Setup Node 22 + `npm ci` + `npx playwright install --with-deps chromium`.
5. Run `npx playwright test` (playwright config boots php artisan serve :8002 / nuxt dev TEST=1 :3000 / ws relay :3001 automatically).
6. `timeout-minutes` generous (dev Nuxt cold-boot is slow; ~15-20m). Upload `test-results/` on failure (artifacts) so flakes are diagnosable.
7. **Do NOT add it to branch protection yet** — get it green first. The existing required checks are `test` + `backend-test`; the new job must not block merges until it's proven stable (flakes would block every PR). If it's stable after a few runs, THEN consider promoting it to a required check (separate task).
- **Nuxt dev vs production build in CI:** dev-mode (`npm run dev`) is what runs locally and reproduces the hydration flake; a production build (`npm run build` + `node .output/server/index.mjs`) is what prod runs and is faster/more representative but may NOT reproduce the dev hydration race. Prefer keeping the dev-mode boot (webServer as-is) so CI exercises the same path that flakes locally — the flake fix is the point of this item. (If dev boot proves too flaky/slow in the runner, document the tradeoff.)
- **Parallelism/sharding:** the suite is 65 tests ~1.7m locally after warm-up; CI cold-boot dominates. Keep `workers` default (config has no explicit workers) unless CI resource contention shows up — don't over-engineer in the first pass.

### Verification
- Loop gate: `cd frontend && npm run typecheck && npm test` (438 tests, 44 files).
- Flake fix proof: run `cd frontend && npx playwright test` — expect 65 passed, 0 flaky (cold boot is fine; the hydration flake is what must be gone). The playwright webServer boots the stack (~60-90s cold). FIRST run warms Nuxt; if a test still flakes on the very first cold boot, re-run to separate warm-up flake from the fixed race.
- CI job: can't run GitHub Actions locally — verify the workflow YAML is valid (actionlint if available, or careful review) and that all commands work locally in sequence. The job only truly runs on push.
- Backend untouched by this goal except the CI workflow — `php artisan test` must stay green.
