# Iteration Notes

## Goal
Extract the WS relay connection close/error/cleanup logic in frontend/server/ws-server.js into exported, testable helpers and add regression tests: close removes the client from its room and decrements totalConnections, user-left broadcasts to remaining peers only, the 60s delayed empty-room cleanup deletes the room only if still empty when it fires, the error path must not leak (currently never decrements totalConnections, never broadcasts user-left, never schedules cleanup), and heartbeat-termination must drive the close path. Decide and implement whether the relay's user-joined/user-left presence broadcasts are consumed by the client (useCollaborativeCanvas.ts handleIncomingMessage ignores them today) or removed. Keep npm run typecheck + npm test green.

## State
Iteration complete: made teardown idempotent across the error→close double-fire. A real `ws` socket that errors ALWAYS also emits `close` afterwards, so both lifecycle handlers ran `removeClientFromRoom` twice for one departure — the second pass double-decremented `totalConnections` and re-broadcast `user-left` to remaining peers (and, had the first pass emptied the room, would have scheduled a duplicate cleanup timer). `removeClientFromRoom` now guards on `ws.lifecycleHandled`: the first pass un-accounts + broadcasts + (if empty) schedules cleanup; repeat passes return the real room size with `alreadyHandled: true` and no decrement/broadcast. `handleClientClose` skips `scheduleEmptyRoomCleanup` on a repeat pass so a live peer's room can never be erroneously deleted by a redundant timer.

### What changed
- `frontend/server/ws-server.js`:
  - `removeClientFromRoom(ws, rooms, totalConnectionsRef, broadcastToRoomFn, now)` — added `ws.lifecycleHandled` idempotency guard. Repeat pass: returns `{ roomId, roomSize, broadcastUserLeft: false, alreadyHandled: true }` WITHOUT decrementing the counter or broadcasting. Return type now includes `alreadyHandled: boolean`.
  - `handleClientClose(...)` — schedules `scheduleEmptyRoomCleanup` only when `roomSize === 0 && !alreadyHandled` (a repeat error-then-close pass no longer schedules a second timer).
  - `registerLifecycleHandlers` JSDoc now documents the double-fire contract (error → close) and the guard.
- `frontend/server/ws-server.test.ts`: 3 new regression tests in the lifecycle describe:
  - `error then close (real ws fires both) teardowns ONCE` — counter 2→1 (not 0), user-left broadcast once (not twice), b receives one frame, and the still-occupied room survives the cleanup delay (no erroneous deletion).
  - `error then close on a solo client schedules the empty-room cleanup exactly once` — error empties room + schedules one timer; the follow-up close pass schedules no second timer; room still deleted once when it fires.
  - `close fired twice (duplicate close event) is idempotent` — no double-decrement, no re-broadcast to the remaining peer.

### Tests
- `npm run typecheck` 0 errors; `npm test` 386 passed (was 383; +3 relay lifecycle tests, 50 total in ws-server.test.ts). Wire/banner spawn suites still green.

### What is next
- All lifecycle paths now converge on testable, idempotent helpers: join (`announceJoin`), close/error double-fire (`handleClientClose`/`handleClientError`/`removeClientFromRoom`, guarded), empty-room cleanup (`scheduleEmptyRoomCleanup`), reject (`rejectConnection`). A spawn-based 4001-reject test would need the relay to consult a local mock Laravel (low value; covered by unit tests).
- Presence broadcasts are consumed by the client via `applyPresenceMessage` (Iter 1) — decision implemented, not half-wired.
- Push branch off `develop`, open PR, run through CI (per AGENTS.md protocol) when asked.

### Gotchas
- The auth-reject socket never joins a room and never gets lifecycle handlers, so its accounting must happen at reject time — do NOT fix it by registering handlers early (the roomId/identity aren't set yet).
- `removeClientFromRoom`'s idempotency is per-socket (`ws.lifecycleHandled`), NOT a counter-floor check — a floor alone stops negative counts but still lets a second pass decrement a positive counter and re-broadcast. Keep the flag.
- Repeat passes still return the REAL `roomSize` (not 0) so `handleClientClose`'s log and the `alreadyHandled` check see reality — returning a fake 0 there would re-trigger cleanup.
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
- Iter 5 (2026-08-07): Made lifecycle teardown idempotent across the error→close double-fire (a real ws socket that errors always also emits close). `removeClientFromRoom` now guards on `ws.lifecycleHandled`; repeat passes skip decrement/broadcast and return `alreadyHandled` so `handleClientClose` never double-schedules empty-room cleanup. +3 lifecycle tests (error→close once, solo error→close single cleanup, duplicate close idempotent). typecheck 0 errors, 386 tests green.
- Iter 4 (2026-08-07): Fixed the auth-reject count leak — extracted `rejectConnection(ws, totalConnectionsRef, code, reason)` and wired the connection handler's reject branch to it (previously inline `ws.close(4001)` never decremented the pre-auth increment). +2 lifecycle tests. typecheck 0 errors, 383 tests green.
- Iter 3 (2026-08-07): Added live wire-integration test (spawned relay + 2 real WS clients, `WS_ALLOW_ANON=1`) covering the full lifecycle end-to-end: connected userCount, user-joined to peer only, binary Yjs verbatim relay, JSON cursor relay, user-left on close. Moved spawn helpers to module scope. typecheck 0 errors, 381 tests green.
- Iter 2 (2026-08-07): Exported `sendJson`/`broadcastToRoom`/`announceJoin`; made `broadcastToRoom` non-creating (phantom-room leak fix, injectable rooms map); extracted join block into testable `announceJoin`. +5 relay tests (44 total). typecheck 0 errors, 380 tests green.
- Iter 1 (2026-08-07): Extracted relay lifecycle (close/error/cleanup) into exported testable helpers; fixed error-path leak (now decrements + broadcasts user-left + schedules cleanup, converging with close); kept + client-consumed `user-joined`/`user-left` via new `applyPresenceMessage` (immediate leave via yCursors delete, join seed). Added 9 relay + 5 client tests. typecheck 0 errors, 375 tests green, php artisan test 47 green.
