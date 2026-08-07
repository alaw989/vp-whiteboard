# Iteration Notes

## Goal
Extract the WS relay connection close/error/cleanup logic in frontend/server/ws-server.js into exported, testable helpers and add regression tests: close removes the client from its room and decrements totalConnections, user-left broadcasts to remaining peers only, the 60s delayed empty-room cleanup deletes the room only if still empty when it fires, the error path must not leak (currently never decrements totalConnections, never broadcasts user-left, never schedules cleanup), and heartbeat-termination must drive the close path. Decide and implement whether the relay's user-joined/user-left presence broadcasts are consumed by the client (useCollaborativeCanvas.ts handleIncomingMessage ignores them today) or removed. Keep npm run typecheck + npm test green.

## State
Iteration complete: fixed the last remaining inline lifecycle leak — the connection handler's auth-reject path. The handler increments `totalConnectionsRef` BEFORE the auth check but its reject branch did `ws.close(4001); return` with NO lifecycle handlers registered, so every rejected connection permanently inflated the connection count (a leak exactly parallel to the old error-path leak already fixed). Extracted `rejectConnection(ws, totalConnectionsRef, code, reason)` and called it from the reject branch; it undoes the connect-time increment (guarded against going negative, mirroring `removeClientFromRoom`) and closes the socket.

### What changed
- `frontend/server/ws-server.js`:
  - New exported `rejectConnection(ws, totalConnectionsRef, code = 4001, reason = 'Authentication required')` — un-accounts the rejected socket (never in a room, so nothing to clean/broadcast) and calls `ws.close(code, reason)`.
  - Connection handler's `if (!authed)` branch now calls `rejectConnection(ws, totalConnectionsRef)` instead of the inline `ws.close(4001, 'Authentication required')`.
- `frontend/server/ws-server.test.ts`: 2 new tests in the lifecycle describe:
  - `rejectConnection` un-accounts the rejected socket and closes 4001 (regression: count leak) — counter 1→0, close called with (4001, 'Authentication required'), no room/broadcast side effects.
  - `rejectConnection` never drives the counter below zero and honors a custom code/reason (4401, 'Banned').

### Tests
- `npm run typecheck` 0 errors; `npm test` 383 passed (was 381; +2 relay tests, 47 total in ws-server.test.ts). Wire/banner spawn suites still green (real wire test unaffected). `php artisan test` untouched (47).

### What is next
- All lifecycle paths now converge on testable helpers: join (`announceJoin`), close/error (`handleClientClose`/`handleClientError`/`removeClientFromRoom`), empty-room cleanup (`scheduleEmptyRoomCleanup`), reject (`rejectConnection`). Remaining untested-over-the-wire items (60s empty-room cleanup, 4001 reject) are covered by fake-timer unit tests; a spawn-based reject test would need the relay to consult a local mock Laravel (low value).
- Presence broadcasts are consumed by the client via `applyPresenceMessage` (Iter 1) — decision implemented, not half-wired.
- Push branch off `develop`, open PR, run through CI (per AGENTS.md protocol) when asked.

### Gotchas
- The auth-reject socket never joins a room and never gets lifecycle handlers, so its accounting must happen at reject time (that was the leak) — do NOT try to fix it by registering handlers early (the roomId/identity aren't set yet, and a client closing during the async auth check would race the add-to-room).
- `fakeSocket` in the tests has no `close()` method by default — assign `a.close = closeSpy` before calling `rejectConnection`.

## Context (from prior code review — read before changing code)

## Context (from prior code review — read before changing code)

### What is untested
All of the WS relay's connection LIFECYCLE logic is buried inside the `wss.on('connection')` callback in `frontend/server/ws-server.js` (~lines 340-388) with zero unit coverage. Already-extracted+tested: `relayClientMessage` (message routing), `runHeartbeat`, `isAuthed`/`resolveStatefulOrigin`, `isEntryPoint`. NOT tested: the close handler, the error handler, the `user-joined` broadcast, and the delayed empty-room cleanup.

### Current close path (lines 358-381)
- `ws.on('close')`: decrements `totalConnections`; deletes ws from its room; broadcasts `{type:'user-left', userId, timestamp}` to the room (closer already removed, so no exclude needed); if `currentRoom.size === 0` schedules `setTimeout(60000)` that deletes the room from `rooms` ONLY if still empty.

### Known defects to fix + regression-test
1. **Error path leaks** (`ws.on('error')`, lines 383-387): removes ws from the room but does NOT decrement `totalConnections`, does NOT broadcast `user-left`, and does NOT schedule the empty-room cleanup. If an error fires without a following `close` (common: ws fires error then close, but not guaranteed), the room entry and connection count leak.
2. **Delayed cleanup untested**: needs a test that a room is NOT deleted if a client rejoined within the 60s window.
3. **Presence broadcasts appear dead**: relay sends `user-joined` (line 342) and `user-left` (line 365). The client's `handleIncomingMessage` in `frontend/composables/useCollaborativeCanvas.ts` only handles `sync-request`, `sync-state`, `ping` — every other JSON type is dropped. The presence UI (`UserPresenceList`, `connectedUsers`) is driven by the `yCursors` Yjs map, not these relay messages. DECISION REQUIRED: either wire the client to consume `user-joined`/`user-left` (and use them, e.g. for connectedUsers), or remove the broadcasts from the relay. Do NOT leave them half-wired.

### Suggested refactor shape (use judgement)
Extract helpers that the connection handler calls, keeping the handler thin:
- `handleClientClose(ws, rooms, totalConnectionsRef)` or pure-ish functions that take explicit deps (room, clients set, a send fn) so they're unit-testable without a real WebSocketServer.
- `scheduleEmptyRoomCleanup(roomId, rooms, delayMs)` returning the timer (or a cancelable handle) — test with a mocked/fake timer or short delay.
- `handleClientError(ws, ...)` reusing the same removal/accounting so error and close converge.
- Keep `broadcastToRoom`/`getRoom` as-is or make testable variants.
- Do NOT regress: heartbeat termination (`runHeartbeat` → `ws.terminate()` → close handler) must still clean the room; the 4001-reject path (auth) never adds to a room so close should be a no-op for it.

### Verification (do end-to-end before DONE)
1. `cd frontend && npm run typecheck && npm test` green (currently 361 tests).
2. Existing relay integration tests (spawn-based, `isEntryPoint`) still pass — do not break the pm2/entry-point behavior.
3. `php artisan test` if Laravel touched (shouldn't be).
4. New tests cover: close removes from room + decrements count + broadcasts user-left to remaining peers; user-left NOT sent when room becomes empty (nobody to receive); room deleted after 60s only if still empty; error path performs the same cleanup as close (no leak); heartbeat-terminated socket triggers close cleanup.
5. Presence decision documented in State: if broadcasts kept, add a client test in `frontend/composables/useCollaborativeCanvas.test.ts` proving `user-joined`/`user-left` are handled; if removed, note that client presence is purely Yjs-cursors based.

### Gotchas
- `ws-server.js` is ESM (`"type": "module"`). Node 22. Droplet node v22.23.1.
- The relay runs under pm2 via `ProcessContainerFork.js`; the `isEntryPoint()` guard controls `listen()` + heartbeat. Don't touch it.
- The `rooms` Map and `totalConnections` are module-level state; keep them but pass what tests need.
- Do not touch the Goal section. Update the State section every iteration.

## Log
- Iter 4 (2026-08-07): Fixed the auth-reject count leak — extracted `rejectConnection(ws, totalConnectionsRef, code, reason)` and wired the connection handler's reject branch to it (previously inline `ws.close(4001)` never decremented the pre-auth increment). +2 lifecycle tests. typecheck 0 errors, 383 tests green.
- Iter 3 (2026-08-07): Added live wire-integration test (spawned relay + 2 real WS clients, `WS_ALLOW_ANON=1`) covering the full lifecycle end-to-end: connected userCount, user-joined to peer only, binary Yjs verbatim relay, JSON cursor relay, user-left on close. Moved spawn helpers to module scope. typecheck 0 errors, 381 tests green.
- Iter 2 (2026-08-07): Exported `sendJson`/`broadcastToRoom`/`announceJoin`; made `broadcastToRoom` non-creating (phantom-room leak fix, injectable rooms map); extracted join block into testable `announceJoin`. +5 relay tests (44 total). typecheck 0 errors, 380 tests green.
- Iter 1 (2026-08-07): Extracted relay lifecycle (close/error/cleanup) into exported testable helpers; fixed error-path leak (now decrements + broadcasts user-left + schedules cleanup, converging with close); kept + client-consumed `user-joined`/`user-left` via new `applyPresenceMessage` (immediate leave via yCursors delete, join seed). Added 9 relay + 5 client tests. typecheck 0 errors, 375 tests green, php artisan test 47 green.
