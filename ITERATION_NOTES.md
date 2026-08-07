# Iteration Notes

## Goal
Fix the staging WS relay: after the collab fix deployed, the staging relay (vp-ws-server-staging) never listens on :3003 so nginx 502s every WebSocket upgrade to wss://staging-whiteboard.vp-associates.com/whiteboard:* and live sharing still requires a refresh. Root cause identified: the relay's isMain guard (frontend/server/ws-server.js) is false under pm2 because pm2 fork mode runs scripts via /usr/lib/node_modules/pm2/lib/ProcessContainerFork.js (so process.argv[1] is pm2's container, not our script). Fix isMain detection so the relay binds under BOTH direct node runs and pm2, add a regression test, keep typecheck + tests green, and verify the relay actually listens on :3003.

## State
**Current:** Fixed the isMain guard so the relay binds under BOTH launch modes. `frontend/server/ws-server.js` now exports `isEntryPoint(argv1?, pmId?)` which returns true for a direct `node server/ws-server.js` run (compares `import.meta.url` to `pathToFileURL(argv[1]).href`, replacing the fragile `file://${process.argv[1]}` string concat) OR when pm2-managed. pm2 detection is now belt-and-suspenders: it returns true when `argv[1]` contains `ProcessContainerFork` (pm2's fork loader — the primary signal, works even if pm2 omits `pm_id`, e.g. older majors) AND when `process.env.pm_id` is set (fallback covering any other pm2 loader path). `const isMain = isEntryPoint()` gates the listen + heartbeat as before, so importing for tests still binds nothing.

The pm2 launch path now also has an end-to-end regression test (iteration 3): `ws-server.test.ts` spawns the relay through a simulated pm2 fork loader — a temp file *named* `ProcessContainerFork.js` that dynamically imports `ws-server.js` — and asserts it serves its HTTP banner. Verified with a negative control: a loader named `plain-loader.js` importing the same module does NOT bind (curl → `000`), proving the bind is driven by the argv[1] signal, not unconditional.

Iteration 4 hardened the **direct-run** leg of `isEntryPoint`: the string/URL compare (`pathToFileURL(argv[1]).href === import.meta.url`) was swapped for a realpath compare (`realpathSync(argv[1]) === realpathSync(fileURLToPath(import.meta.url))`), so a relay launched via a *symlink* (e.g. `node /usr/local/bin/ws-relay` → ws-server.js) also binds. `realpathSync` throws on nonexistent paths (a bare pm2 loader path on a machine without pm2), which falls through to the `ProcessContainerFork`/`pm_id` checks unchanged. New regression test proves `isEntryPoint(symlinkToServer, undefined) === true`; also sanity-verified live by symlink-spawning the relay and curling the banner off it. 361/361 tests, typecheck clean.

**Next:** Deploy to staging and verify live (per AGENTS.md CI/CD protocol): merge to `develop` → deploy-staging → `pm2 list` shows `vp-ws-server-staging` online → confirm it listens on :3003 (`ss -tlnp | grep 3003` on the droplet) → open a share link in an incognito tab and confirm live edits propagate without a refresh. The root fix ships in `ws-server.js`, so the deploy workflow needs no change — but if the relay still won't bind, check whether the droplet's pm2 actually passes a `pm_id` env (older pm2 majors) and broaden the pm2 check accordingly. This iteration's symlink hardening matters only if someone later launches the relay through a symlinked path — the pm2 launch path (the actual staging bug) was already covered.

**Gotchas:**
- The pm2 detection no longer relies solely on `process.env.pm_id` (which older pm2 majors may omit): `argv[1]` containing `ProcessContainerFork` now flips the decision by itself. If `npm test` ever runs *under* pm2, `isEntryPoint()` would be true during vitest import and a relay would bind on :3001 — CI runs on GitHub Actions, not pm2, so this is currently moot, but note it if someone adds a pm2-run test job.
- The `# actually listens` describe block now has TWO spawn-based tests on random free ports (no connections, `WS_ALLOW_ANON=1`): one direct `node server/ws-server.js`, one via the simulated pm2 fork loader (temp dir `os.tmpdir()/pm2-fork-*`, cleaned up in `finally`). Both poll the HTTP banner then SIGTERM. The simulated loader relies on Node resolving the dynamic `import(file://…ws-server.js)` as ESM via `frontend/package.json` `"type": "module"` — the loader itself lives outside `frontend/` (default CJS), where `import()` is still valid.
- **This branch (`fix/staging-ws-pm2`) is NOT yet merged to `develop`** — the relay is still broken on staging until the two committed fix iterations ship through the CI/CD pipeline (deploy gates on the `test` job, which runs the frontend suite that now includes the new test).

## Context (diagnosis from prior investigation — read before changing code)

### Symptom
- After merging the live-sync collab fix to develop and deploying to staging, the WS relay does not bind.
- Browser console on staging: `WebSocket connection to 'wss://staging-whiteboard.vp-associates.com/whiteboard:...' failed` (reconnect loop).
- `curl` a WS handshake to https://staging-whiteboard.vp-associates.com/whiteboard:test → `HTTP 502 Bad Gateway` (nginx upstream dead).
- nginx staging vhost (`/etc/nginx/sites-enabled/staging-whiteboard.vp-associates.com`): `location /whiteboard: { proxy_pass http://localhost:3003; }` — correct.
- pm2 reports `vp-ws-server-staging` as **online**, but `ss -tlnp` shows **nothing listening on :3003**, no startup banner in the pm2 out log, and the process holds no socket. A direct run of the SAME script on the droplet binds fine.

### Root cause (confirmed with evidence)
- `frontend/server/ws-server.js` line ~405: `const isMain = process.argv[1] && import.meta.url === \`file://${process.argv[1]}\``
- pm2 fork mode spawns `node /usr/lib/node_modules/pm2/lib/ProcessContainerFork.js` and that container loads our script. So inside the pm2-managed process, `process.argv[1]` = `/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js`, while `import.meta.url` = `file:///var/www/vp-whiteboard-staging/frontend/server/ws-server.js`. They never match → `isMain` = false → the `if (isMain) { server.listen(...) }` block (and the heartbeat `setInterval`) never runs → process sits alive doing nothing.
- Proven on the droplet with an `argvprobe.mjs` started via pm2: `ARGV: ["/usr/bin/node","/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js"]`, `ISMAIN: false`.
- Direct `node server/ws-server.js` (relative or absolute) works because Node resolves argv[1] to the real script path and it matches import.meta.url.

### Fix direction
- Make entry-point detection robust to pm2's fork container. Suggested:
  - If `process.argv[1]` includes `ProcessContainerFork` → treat as main.
  - Else compare real paths: `realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))`.
  - Otherwise false (importing from a test must NOT bind/listen/heartbeat).
- Keep the module import-safe for tests: under vitest argv[1] is the test runner, so isMain stays false. `frontend/server/ws-server.test.ts` must still pass.
- Add a regression test locking the isMain decision, e.g. refactor into an exported pure `isMainEntry(argv1, importMetaUrl)` and test (a) direct-run argv1 → true, (b) pm2 container argv1 → true, (c) test-runner argv1 → false.

### Verify end-to-end before DONE
1. `cd frontend && npm run typecheck && npm test` green.
2. Direct run still binds: `WS_PORT=3999 node server/ws-server.js` → banner + bound.
3. pm2 case covered by the pure-function unit test (argv1 = `/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js` → true).
4. If possible verify on staging: SSH `ssh -i /home/alaw989/.ssh/droplet-vp-nuxt -o StrictHostKeyChecking=no root@165.245.141.179`; after deploy confirm `ss -tlnp | grep 3003` binds. Deploy auto-runs on push to develop (`.github/workflows/deploy-staging.yml`), relay started via pm2 with `WS_PORT=3003`.

### Gotchas
- The relay is ESM (`"type": "module"` in frontend/package.json). Droplet node is v22.23.1.
- The `isMain` guard exists solely so importing the module in vitest doesn't bind a port or leave a heartbeat interval running (iteration 2 of the prior loop). Keep that property.
- Do not touch the Goal section. Update the State section every iteration.

## Log
- **Iteration 1:** Replaced the one-line `isMain` guard (false under pm2 fork mode → relay never bound → nginx 502 on every WS upgrade → live sharing needed a refresh). Extracted `isEntryPoint()` (exported, testable) that accepts direct node runs AND pm2-managed processes; uses `pathToFileURL` for a correct path→URL comparison. Added 5 regression tests in `frontend/server/ws-server.test.ts`: 4 unit tests for `isEntryPoint` (direct run / pm2 fork / pm_id-only / module import) + 1 spawn-based integration test proving `node server/ws-server.js` actually listens and serves its banner. Verified: `npm run typecheck` clean, `npm test` 358/358 green.
- **Iteration 2:** Broadened the pm2 signal in `isEntryPoint` to be belt-and-suspenders — it now also returns true when `argv[1]` contains `ProcessContainerFork` (pm2's fork loader) even with no `pm_id` set, covering older pm2 majors that don't populate the env var (the documented "broaden the pm2 check" risk). Added 1 regression test (`PM2_FORK_LOADER` with `pmId=undefined` → true). Verified: `npm run typecheck` clean, `npm test` 359/359 green.
- **Iteration 3:** Closed the remaining verification gap — the pm2 launch path was only proven by the `isEntryPoint` pure-function unit tests, while the `# actually listens` integration test only covered direct `node` runs. Added an end-to-end test that spawns the relay through a *simulated* pm2 fork loader (temp file named `ProcessContainerFork.js` in `os.tmpdir()/pm2-fork-*` that `import()`s `ws-server.js`), asserting the HTTP banner appears — proving the argv[1] signal alone drives the bind with no `pm_id`. Negative control verified manually: a `plain-loader.js` importing the same module does not bind (curl → `000`). Verified: `npm run typecheck` clean, `npm test` 360/360 green.
- **Iteration 4:** Hardened the direct-run leg of `isEntryPoint` against symlinked entry points — replaced `pathToFileURL(argv[1]).href === import.meta.url` with `realpathSync(argv[1]) === realpathSync(fileURLToPath(import.meta.url))`, so relative invocations and symlinks both resolve to the real file (the raw-string compare broke on `node /usr/local/bin/ws-relay` → symlink). `realpathSync` throwing on a nonexistent argv[1] falls through to the unchanged `ProcessContainerFork`/`pm_id` checks. Added a regression test asserting `isEntryPoint(symlinkToServer) === true`; manually verified by symlink-spawning the relay and curling its banner. Verified: `npm run typecheck` clean, `npm test` 361/361 green.
