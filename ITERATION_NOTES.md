# Iteration Notes

## Goal
Fix the staging WS relay: after the collab fix deployed, the staging relay (vp-ws-server-staging) never listens on :3003 so nginx 502s every WebSocket upgrade to wss://staging-whiteboard.vp-associates.com/whiteboard:* and live sharing still requires a refresh. Root cause identified: the relay's `isMain` guard (frontend/server/ws-server.js) is false under pm2 because pm2 fork mode runs scripts via /usr/lib/node_modules/pm2/lib/ProcessContainerFork.js (so process.argv[1] is pm2's container, not our script). Fix isMain detection so the relay binds under BOTH direct node runs and pm2, add a regression test, keep typecheck + tests green, and verify the relay actually listens on :3003.

## State
(empty — first iteration will start the log)

## Context (seeded before loop start — do not delete)

### Symptom
- After merging the live-sync collab fix to develop and deploying to staging, the WS relay does not bind.
- Browser console on staging: `WebSocket connection to 'wss://staging-whiteboard.vp-associates.com/whiteboard:...' failed` (reconnect loop).
- `curl` a WS handshake to https://staging-whiteboard.vp-associates.com/whiteboard:test → `HTTP 502 Bad Gateway` (nginx upstream dead).
- nginx staging vhost (`/etc/nginx/sites-enabled/staging-whiteboard.vp-associates.com`) has `location /whiteboard: { proxy_pass http://localhost:3003; }` — correct.
- pm2 reports `vp-ws-server-staging` as **online**, but `ss -tlnp` shows **nothing listening on :3003**, no startup banner in the pm2 out log, and the process holds no socket. A direct run of the SAME script on the droplet binds fine.

### Root cause (confirmed with evidence)
- `frontend/server/ws-server.js` line ~405:
  `const isMain = process.argv[1] && import.meta.url === \`file://${process.argv[1]}\``
- pm2 fork mode spawns `node /usr/lib/node_modules/pm2/lib/ProcessContainerFork.js` and that container loads our script. So inside the pm2-managed process, `process.argv[1]` = `/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js`, while `import.meta.url` = `file:///var/www/vp-whiteboard-staging/frontend/server/ws-server.js`. They never match → `isMain` = false → the `if (isMain) { server.listen(...) }` block (and the heartbeat `setInterval`) never runs → process sits alive doing nothing.
- Proven on the droplet with an `argvprobe.mjs` started via pm2:
  `ARGV: ["/usr/bin/node","/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js"]`, `ISMAIN: false`.
- Direct `node server/ws-server.js` (relative or absolute) works because Node resolves argv[1] to the real script path and it matches import.meta.url. This is why local dev, unit tests, and manual droplet runs all bound fine while the pm2 deploy did not.

### Fix direction
- Make the entry-point detection robust to pm2's fork container. Suggested:
  - If `process.argv[1]` includes `ProcessContainerFork` → treat as main (this is the real pm2 runner; pm2 loads our script as the main entry, so listen should run).
  - Else compare real paths: `realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))`.
  - Fall back to false otherwise (so importing the module from a test still does NOT bind/listen/heartbeat).
- Keep the module import-safe for tests: under vitest, argv[1] is the test runner, so isMain stays false (no listen, no heartbeat hang). Verify `frontend/server/ws-server.test.ts` still passes.
- Add a regression test that locks the isMain decision: e.g. refactor the check into an exported pure function `isMainEntry(argv1, importMetaUrl)` (or similar) and test (a) direct-run argv1 path → true, (b) pm2 container argv1 → true, (c) test-runner argv1 → false. If you keep it inline, at least test the pm2-container case somehow.
- IMPORTANT: do NOT regress the existing behavior that direct `node server/ws-server.js` binds and that importing the module in vitest does not hang or listen.

### How to verify the fix (do this end-to-end before emitting DONE)
1. Locally: `cd frontend && npm run typecheck && npm test` green.
2. Direct run still binds: `WS_PORT=3999 node server/ws-server.js` → banner + port bound.
3. Simulate pm2: `node /usr/lib/node_modules/pm2/lib/ProcessContainerFork.js` is not available locally — instead verify via the pure `isMainEntry(argv1, importMetaUrl)` unit test with argv1 = `/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js` → true.
4. If possible, deploy to staging and confirm `ss -tlnp | grep 3003` on the droplet binds and a WS handshake no longer 502s. SSH access: `ssh -i /home/alaw989/.ssh/droplet-vp-nuxt -o StrictHostKeyChecking=no root@165.245.141.179` (staging droplet). The staging deploy runs automatically on push to develop (`.github/workflows/deploy-staging.yml`); it starts the relay via pm2 with `WS_PORT=3003`.

### Reproduction commands (on staging droplet 165.245.141.179)
- `pm2 list` → `vp-ws-server-staging` online but `ss -tlnp | grep 3003` empty.
- `pm2 logs vp-ws-server-staging --lines 20 --nostream` → no startup banner.
- nginx vhost: `/etc/nginx/sites-enabled/staging-whiteboard.vp-associates.com`, `location /whiteboard: { proxy_pass http://localhost:3003; }`.
- Deploy script: `.github/workflows/deploy-staging.yml` — `pm2 start server/ws-server.js --name vp-ws-server-staging --cwd /var/www/vp-whiteboard-staging/frontend` with `WS_PORT=3003 LARAVEL_URL=https://staging-whiteboard.vp-associates.com SESSION_COOKIE=laravel-session`.

### Gotchas
- The relay `ws-server.js` is ESM (`"type": "module"` in frontend/package.json). Node on the droplet is v22.23.1.
- The `isMain` guard exists solely so importing the module in vitest doesn't bind a port or leave a heartbeat interval running (that was iteration 2's fix). Keep that property.
- Do not touch the Goal section. Update the State section every iteration: what changed, what is next, gotchas.

## Log
