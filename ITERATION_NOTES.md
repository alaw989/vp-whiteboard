# Iteration Notes

## Goal
Add coverage tooling + a threshold gate that ratchets up: install @vitest/coverage-v8 (pinned vitest ^2.1.9), add a `npm run coverage` script + vitest.config.mts coverage config (include composables/**, utils/**, server/**, exclude test files + e2e), and gate the CI `test` job on line/statement/branch thresholds; backend: enable pcov in the CI PHP setup (shivammathur/setup-php coverage: pcov) and gate `php artisan test --coverage-clover`/`--coverage-text` output (PHPUnit has no native min-coverage flag — small parse step). FIRST pass MEASURES the current coverage %, THEN sets realistic thresholds that ratchet up — not an arbitrary number that instantly fails CI. Keep npm run typecheck + npm test green and the existing e2e suite passing.

## State

(no iterations yet — first loop run starts here)

## Context (from prior code review — read before changing code)

### What exists today
- Frontend: vitest ^2.1.9 with NO coverage provider (`@vitest/coverage-v8` is NOT installed — `npx vitest run --coverage` fails with MISSING DEPENDENCY). 438 unit tests / 44 files (tools, composables, utils/geometryUtils, server/ws-server). `.vue` components have no unit tests (covered by the 67-test playwright suite).
- `vitest.config.mts`: `environment: 'happy-dom'`, `include: ['**/*.test.ts']`, setupFiles `test/setup.ts`, alias `~`. No `coverage` key.
- Backend: `php artisan test` (48 tests / 103 assertions) via phpunit.xml (APP_KEY + SQLite :memory:, `<source><include><directory>app</directory>`). No coverage driver configured; CI uses `shivammathur/setup-php@v2` WITHOUT `coverage:` (so no pcov/xdebug → `--coverage` would error).
- CI: `.github/workflows/ci.yml` has `test` (typecheck + `npm test`), `backend-test` (`php artisan test`), and now `e2e` (added in #68, informational, not required). Branch protection requires `test` + `backend-test`.

### What "measuring first" means
- Frontend: `npm i -D @vitest/coverage-v8@^2.1.9` (must match vitest major — v2). Then `npx vitest run --coverage` to see current % by area (composables vs tools vs server vs utils). The threshold you set must be BELOW or AT current numbers or CI instantly fails. Expect the aggregate line % to be low-ish because many top-level composables (useCursors, useFileUpload, useLayers, useMeasurements, usePDFRendering, useScale, useCommandEngine/Registry, useToast, useDocumentLayer) have NO direct tests, and the 25 tool files + ws-server + geometryUtils + the tested composables pull the average up. If a single overall threshold is impossible (e.g. one big untested file drags everything), consider per-directory `thresholds` or just set a realistic global line % and note the gap.
- Backend: enable pcov (`coverage: pcov` in setup-php) then `php artisan test --coverage-clover=build/clover.xml` locally to measure. Laravel's default test command shows a table; `--coverage-clover` writes machine-readable XML for the gate.

### The gate mechanics (CI)
- Frontend gate: simplest is vitest's native `coverage.thresholds` (lines/statements/functions/branches) — `npx vitest run --coverage` fails (exit non-zero) when below threshold, so the CI `test` job's existing `npm test` can be replaced by `npm run coverage` (script = `vitest run --coverage`) OR add a separate step. Keep typecheck separate. NOTE: coverage run is slower than a plain run — fine.
- Backend gate: PHPUnit has NO native min-coverage threshold. Plan: `php artisan test --coverage-clover=build/coverage.xml` then a tiny parse step that reads the `statements`/`lines` `coveredpercent` from the clover XML (`<metrics statements="..." coveredstatements="..." .../>`) and exits 1 if below threshold. This can be a small shell/awk/python snippet inline in the workflow, or a committed PHP script. Prefer inline + documented (no new composer dep). Local validation: run the same command + parse manually.
- IMPORTANT: coverage percentages are only meaningful/stable if the SAME command is used in CI and locally (phpunit default code coverage report vs clover can differ). Gate on the clover numbers consistently.

### Gotchas
- `@vitest/coverage-v8` MUST match vitest's major (^2.1.9 → @vitest/coverage-v8@^2). Installing a v3 would break.
- Coverage excludes: `include` globs must cover the real source and EXCLUDE `*.test.ts`, `e2e/`, `test/`, `*.spec.ts`. Vitest defaults to including `**/*` from root — configure explicitly so node_modules + e2e + tests aren't counted.
- `.vue` files: coverage-v8 instruments TS/Vue via the vite plugin; the 0-tested SFCs will show as 0% and drag the aggregate. Decide up front whether to include components (honest but low %) or restrict `include` to the TS logic files (composables/utils/server) — the backlog text says "include composables/utils/server, exclude tests", i.e. components NOT in the first-pass scope. Keep that scope.
- pcov needs `php artisan test` to be run with the extension active; `shivammathur/setup-php` `coverage: pcov` does this. Locally, pcov may not be installed — `--coverage` would error. Document that local backend coverage needs `extension=pcov` (or use the CI container). Do NOT require local pcov for the loop gate (gate is frontend typecheck + npm test).
- The CI `test` job currently calls `npm test`. If you add coverage thresholds to vitest.config, `npm test` will ALSO enforce them (vitest enforces thresholds on any run once configured) — so `npm test` may start failing if below threshold. Decide: thresholds in config (both `npm test` and coverage enforce) vs thresholds only via CLI flags in the `coverage` script (only `npm run coverage` enforces). The latter is gentler — `npm test` stays the fast green loop, CI runs `npm run coverage` as the gate. Recommend CLI-flag thresholds in the script unless the coverage run is also the default.
- Do not touch the e2e job or playwright config.

### Verification
- Loop gate: `cd frontend && npm run typecheck && npm test` (must stay green — if thresholds are in the config, this enforces them; keep them realistic).
- Backend: `php artisan test` must stay green (48).
- Frontend coverage: `cd frontend && npm run coverage` → exit 0 + report printed, thresholds ≤ measured.
- Backend coverage: run with pcov locally if available (`php -m | grep pcov`); if not, verify the clover gate command runs in CI only — validate the parse snippet against a locally generated clover.xml (generate with xdebug if pcov absent) or dry-run the awk/python against a known XML.
