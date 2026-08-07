# Iteration Notes

## Goal
Extract the WS relay connection close/error/cleanup logic in frontend/server/ws-server.js into exported, testable helpers and add regression tests: close removes the client from its room and decrements totalConnections, user-left broadcasts to remaining peers only, the 60s delayed empty-room cleanup deletes the room only if still empty when it fires, the error path must not leak (currently never decrements totalConnections, never broadcasts user-left, never schedules cleanup), and heartbeat-termination must drive the close path. Decide and implement whether the relay's user-joined/user-left presence broadcasts are consumed by the client (useCollaborativeCanvas.ts handleIncomingMessage ignores them today) or removed. Keep npm run typecheck + npm test green.

## State
Iteration complete: extracted the relay's connection lifecycle into exported, testable helpers; fixed the error-path leak; wired the client to consume the presence broadcasts.

### What changed
- `frontend/server/ws-server.js`:
  - Replaced `let totalConnections` with `const totalConnectionsRef = { value: 0 }` so helpers can mutate the shared counter via explicit deps.
  - Extracted `removeClientFromRoom(ws, rooms, totalConnectionsRef, broadcastToRoomFn, now)` — deletes the ws from its room, decrements the counter (guarded ≥ 0), broadcasts `user-left` to REMAINING peers ONLY (skips when the room just emptied), returns `{roomId, roomSize, broadcastUserLeft}`.
  - Extracted `scheduleEmptyRoomCleanup(roomId, rooms, delayMs)` (exported `EMPTY_ROOM_CLEANUP_DELAY_MS = 60_000`): deletes the room only if STILL empty when the timer fires (rejoin-safe).
  - `handleClientClose(...)` = remove + log + schedule cleanup when empty; `handleClientError(error, ...)` now CONVERGES with close (decrement + user-left + cleanup) instead of leaking all three; `registerLifecycleHandlers(ws, ...)` wires `close` AND `error` to the same teardown.
  - Connection handler now calls `registerLifecycleHandlers(ws, rooms, totalConnectionsRef, broadcastToRoom)`; also removed a subtle phantom-room leak (old close handler used `getRoom(ws.roomId || roomId)` which CREATED a room entry for auth-rejected sockets).
  - `user-joined`/`user-left` broadcasts KEPT (required by the error-path convergence + tests).
- `frontend/composables/useCollaborativeCanvas.ts` (presence DECISION: keep broadcasts AND consume them client-side):
  - New exported `applyPresenceMessage(users, message, now)`: `user-joined` seeds an immediate entry (accurate "N users online" before the peer's first cursor frame), `user-left` removes immediately.
  - `handleIncomingMessage` now branches on `user-joined`/`user-left`: applies to `connectedUsers`, and on `user-left` also `yCursors.delete(peerId)` (for non-self) so the yCursors observer doesn't resurrect a leaver for the 30s expiry window.

### Tests
- `frontend/server/ws-server.test.ts`: +9 tests → 39 relay tests. Cover: close removes from room + decrements + broadcasts user-left to remaining open peers only (closer excluded, no broadcast when room empties); 60s cleanup deletes room only if still empty (rejoin survives); error path performs the SAME cleanup (decrement + user-left + scheduled cleanup, solo-client room deleted after timer); heartbeat termination → `terminate()` → close path cleans up (no leak); auth-reject/no-room socket is a no-op for rooms but still un-accounted; double-close is idempotent; injectable clock gives deterministic timestamps. Uses `vi.useFakeTimers()` (describe-scoped) for the 60s delay.
- `frontend/composables/useCollaborativeCanvas.test.ts`: +5 tests proving `user-joined`/`user-left` are handled (seed, idempotent join, immediate leave, no-userId/unknown-type ignored, other users untouched).
- Full suite: `npm run typecheck` 0 errors; `npm test` 375 passed (was 361); `php artisan test` 47 passed (untouched).

### What is next
- Relay: consider exporting `broadcastToRoom`/`getRoom` so the user-joined broadcast could be unit-tested too (currently only exercised indirectly via the lifecycle tests' recorder mimic). The `connected`/`user-joined` sent-to-self message and the `WS_ALLOW_ANON` path remain untested.
- Client: the `user-joined` seed is best-effort (the yCursors observer rebuild can wipe it before the peer's real presence lands). If precise join counts matter, make the observer merge instead of rebuild, or drop the seed and rely purely on yCursors.
- Push branch off `develop`, open PR, run through CI (per AGENTS.md protocol) when asked.

### Gotchas
- `vi.useFakeTimers()` also fakes `Date.now()` — pass an explicit `now` to `runHeartbeat`/helpers where deterministic timestamps are asserted.
- `removeClientFromRoom` uses `rooms.get(roomId)` (no creation) — do NOT switch it back to `getRoom()` or auth-rejected sockets resurrect phantom rooms.
- `handleClientError` takes `error` FIRST (matches the `ws.on('error')` handler). Tests exercise it via `registerLifecycleHandlers` + `emit('error', ...)`.
- Presence decision (documented): broadcasts KEPT and now consumed by the client — presence is still primarily yCursors-derived; relay frames supplement it (immediate leave + join seed).

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
- Iter 1 (2026-08-07): Extracted relay lifecycle (close/error/cleanup) into exported testable helpers; fixed error-path leak (now decrements + broadcasts user-left + schedules cleanup, converging with close); kept + client-consumed `user-joined`/`user-left` via new `applyPresenceMessage` (immediate leave via yCursors delete, join seed). Added 9 relay + 5 client tests. typecheck 0 errors, 375 tests green, php artisan test 47 green.
