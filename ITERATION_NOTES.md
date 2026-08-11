# Iteration Notes

## Goal
Add a CI e2e job to .github/workflows/ci.yml that runs the full playwright suite at PR time (boot the Laravel+Nuxt+WS stack in the runner, install browsers, retries for warm-up) WITHOUT breaking the existing required test/backend-test checks, and root-cause + fix the recurring cold-boot login hydration flake so the 65-test suite is deterministic locally and in CI. Known culprit: smoke.spec.ts inlines its own login (fill + page.click with no hydration-safe toBeEnabled wait) instead of the shared helpers.login() that waits for the submit button to enable — and mobile-touch.spec.ts:42 flakes the same way. Fix the flake root cause (fill-before-hydration value drop) and make every spec use the robust login path. Keep npm run typecheck + npm test green and prove the full npx playwright test passes.

## State

(no iterations yet — first loop run starts here)

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
