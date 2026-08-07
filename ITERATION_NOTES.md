# Iteration Notes

## Goal
Extract the WS relay connection close/error/cleanup logic in frontend/server/ws-server.js into exported, testable helpers and add regression tests: close removes the client from its room and decrements totalConnections, user-left broadcasts to remaining peers only, the 60s delayed empty-room cleanup deletes the room only if still empty when it fires, the error path must not leak (currently never decrements totalConnections, never broadcasts user-left, never schedules cleanup), and heartbeat-termination must drive the close path. Decide and implement whether the relay's user-joined/user-left presence broadcasts are consumed by the client (useCollaborativeCanvas.ts handleIncomingMessage ignores them today) or removed. Keep npm run typecheck + npm test green.

## State
Iteration complete: unit-tested the relay's join-presence contract (the last untested lifecycle surface) and hardened `broadcastToRoom` against a phantom-room leak.

### What changed
- `frontend/server/ws-server.js`:
  - Exported `sendJson` and `broadcastToRoom` (the join-presence helpers that were previously module-private and only exercised via tests' recorder mimics).
  - `broadcastToRoom` now takes an injectable `roomsArg` (defaults to module state) AND uses a NON-creating lookup — previously it called `getRoom()`, which CREATED a phantom empty-room entry if a stale room id was ever broadcast to. Aligned with `removeClientFromRoom`'s no-create rule.
  - Extracted `announceJoin(ws, roomsArg, now)` — the connection handler's join block (send `connected` to self with userCount incl. self + broadcast `user-joined` to peers) is now an exported, deterministic-timestamp helper.
  - Connection handler calls `announceJoin(ws, rooms)`; `userCount` semantics unchanged (socket added to room before announcing).
- `frontend/server/ws-server.test.ts`: +5 tests → 44 relay tests. Cover: `sendJson` skips closed sockets; `broadcastToRoom` reaches other OPEN peers only (sender + closed excluded); broadcast to nonexistent room is a no-op that does NOT create a phantom room; `announceJoin` sends `connected` to joiner (userCount=3 incl. self) + `user-joined` to both peers only, with injectable timestamp; joiner in no room gets `connected` userCount=0 and broadcasts to nobody.

### Tests
- Full suite: `npm run typecheck` 0 errors; `npm test` 380 passed (was 375); `php artisan test` untouched (47).

### What is next
- Relay: the `WS_ALLOW_ANON` (skip-auth) path in the connection handler remains untested — it's only exercised by the spawn-based banner tests (which never actually open a WS connection). A spawn-based integration test that connects two clients over the wire and asserts `connected`/`user-joined`/relay traffic end-to-end would close the last relay gap.
- The connection handler's auth-reject path (`ws.close(4001)`) is still inline; if more coverage is wanted, extract it (but it's a one-liner — low value).
- Push branch off `develop`, open PR, run through CI (per AGENTS.md protocol) when asked.

### Gotchas
- `broadcastToRoom` now takes a 4th `roomsArg` param — when passed by reference (e.g. `registerLifecycleHandlers(ws, rooms, totalConnectionsRef, broadcastToRoom)`), the default applies module-level `rooms`, so behavior is unchanged.
- `broadcastToRoom` is NON-creating: do NOT reintroduce `getRoom()` inside it or broadcasting to a stale room id will resurrect a phantom empty-room entry (same rule as `removeClientFromRoom`).
- `announceJoin` must be called AFTER `room.add(ws)` — `userCount` includes the joiner itself, matching the original `room.size` semantics.
- `vi.useFakeTimers()` also fakes `Date.now()` — pass an explicit `now` to `runHeartbeat`/helpers where deterministic timestamps are asserted.

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
- Iter 2 (2026-08-07): Exported `sendJson`/`broadcastToRoom`/`announceJoin`; made `broadcastToRoom` non-creating (phantom-room leak fix, injectable rooms map); extracted join block into testable `announceJoin`. +5 relay tests (44 total). typecheck 0 errors, 380 tests green.
- Iter 1 (2026-08-07): Extracted relay lifecycle (close/error/cleanup) into exported testable helpers; fixed error-path leak (now decrements + broadcasts user-left + schedules cleanup, converging with close); kept + client-consumed `user-joined`/`user-left` via new `applyPresenceMessage` (immediate leave via yCursors delete, join seed). Added 9 relay + 5 client tests. typecheck 0 errors, 375 tests green, php artisan test 47 green.
