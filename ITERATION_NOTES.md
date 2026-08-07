# Iteration Notes

## Goal
Add regression tests for the collaborative canvas sync protocol across WebSocket reconnects, and fix any bugs they surface: a client whose WS drops and reconnects mid-session must re-converge with its peers (SYNC_FULL full-state exchange + dedupe) without duplicating or losing elements; out-of-order or duplicate SYNC_FULL frames and stale-peer states must not corrupt the doc; the Yjs doc must not be reset or lose content on reconnect; and the reconnect path (scheduleReconnect -> initWebSocket -> sendSyncMessage + sendFullStateSync) must be exercised deterministically with a mocked WebSocket. Keep npm run typecheck + npm test green.

## State
- **Iteration 1 (done):** Added the first mocked-WebSocket reconnect-resume regression test to `frontend/composables/useCollaborativeCanvas.test.ts`. It drives TWO `useCollaborativeCanvas('board-1', ...)` instances through a `FakeWebSocket` (`vi.stubGlobal('WebSocket', ...)` + `vi.stubGlobal('useRuntimeConfig', ...)` + `vi.useFakeTimers()`): both clients connect and converge on [A1,B1]; A's socket closes (1006) → `scheduleReconnect` → `initWebSocket` creates a new socket; A draws A2 while offline (dropped by `sendBinary`, asserted `sent` stays empty); on reopen A sends `sync-request` + `SYNC_FULL([A1,B1,A2])`; the peer's `SYNC_FULL` reply is a strict SUBSET, so the test proves A2 is NOT lost; both docs converge on the union {A1,B1,A2} with no duplicate ids; then post-reconnect deltas (A3, B2) flow both ways again. Covers goal items 1, 2, 3, 4 (subset/duplicate SYNC_FULL cannot wipe newer content) and part of 5.
- **Next:** Add the remaining reconnect-timer hygiene test (repeated close/reopen cycles → no leaked timers, no duplicate handlers across socket instances) and possibly a stale-peer + out-of-order SYNC_FULL helper-level test. Also consider asserting exactly one reconnect socket is created per close and that a close during backoff doesn't double-schedule.
- **Gotchas:** The composable's return object does NOT expose `getElements()` (uses `c.yElements.toArray()`); `noUncheckedIndexedAccess` makes `FakeWebSocket.instances[i]` possibly-undefined so use `!`. `onMounted` fires outside a component instance in tests → harmless Vue warning (no-op). `useRuntimeConfig` is not in `test/setup.ts`, so it MUST be stubbed before calling the composable.

## Context (from prior code review — read before changing code)

### Where the sync protocol lives
- `frontend/composables/useCollaborativeCanvas.ts` — client WS + Yjs sync.
- Protocol: binary frames prefixed with a type byte — `SYNC_FULL` (0x01, `encodeStateAsUpdate(ydoc)`, sent after DB import / on open / in reply to a peer's `sync-request`) and `SYNC_DELTA` (0x02, incremental `ydoc.on('update')` deltas). Receiver applies via `applyRemoteSyncFrame` and dedupes by element id after full frames. Frame codecs: `encodeSyncFrame` / `decodeSyncFrame` / `applyRemoteSyncFrame` / `deduplicateYjsElements` (all exported).
- Full-state announce/reconcile exists precisely because every client re-imports the same DB `canvas_state`, creating divergent CRDT structs; incremental deltas alone would silently drop. After a full exchange + dedupe, deltas flow both ways.

### The reconnect path today (what to test/fix)
- `initWebSocket()` builds the WS URL, sets `ws.onopen/onclose/onerror/onmessage`, and on `open` calls `sendSyncMessage()` (JSON `{type:'sync-request'}`) then `sendFullStateSync()`.
- `onclose`: if `shouldReconnectOnClose(code)` (not 4001), `scheduleReconnect()` → exponential backoff → `initWebSocket()` again. The SAME `ydoc` instance persists across reconnects (content is NOT lost locally).
- A peer receiving `sync-request` replies with `sendFullStateSync()` (SYNC_FULL). So a reconnecting client may receive MULTIPLE SYNC_FULL frames (one per peer) plus the local doc it already has — dedupe must converge them.
- `sendBinary` drops frames while the socket isn't OPEN (so pre-reconnect edits are never broadcast; the SYNC_FULL on reconnect reconciles them).

### Behaviors to lock with mocked-WebSocket tests (frontend/composables/useCollaborativeCanvas.test.ts)
1. **Reconnect re-convergence**: doc A and doc B converge; A's socket closes then reopens; A gets a SYNC_FULL from B; A must end up with exactly the union (no duplicate ids, no lost elements), and subsequent SYNC_DELTA edits flow both directions.
2. **No local reset on reconnect**: local-only edits made while disconnected (socket not OPEN) must survive the reconnect and reach peers via the SYNC_FULL announce (never silently lost).
3. **Duplicate / out-of-order SYNC_FULL**: receiving the same full state twice (or a full state after a delta that already applied) must not duplicate elements — dedupe-by-id handles it.
4. **Stale peer**: a peer's full state that is a SUBSET (e.g. peer missed recent edits) must not wipe the receiver's newer content — dedupe + CRDT merge should preserve the union; verify no data loss.
5. **Reconnect timer hygiene**: repeated close/reopen cycles must not leak reconnect timers or create duplicate `ws.onmessage` handlers (each `initWebSocket` call attaches new handlers to a NEW socket object; confirm no cross-socket bleed).
6. If any of the above FAIL, fix the composable (e.g. guard `scheduleReconnect`, dedupe handling, or how SYNC_FULL is sent on reconnect) — implement the smallest correct fix and keep behavior backward-compatible with the existing live sync.

### How to mock the WebSocket
- The composable uses `new WebSocket(url)`. Inject a fake via `vi.stubGlobal('WebSocket', FakeWebSocket)` (vitest) in `useCollaborativeCanvas.test.ts`. The existing tests import exported helpers only — a `useCollaborativeCanvas(...)` integration test that drives open/close/message/error events on the fake will be the highest-value addition. Be mindful: `initWebSocket()` reads `useRuntimeConfig()` and `sessionStorage` — stub those if needed.
- Follow the existing test style in that file (imports from the composable, `describe/it/expect`).

### Verification (do end-to-end before DONE)
1. `cd frontend && npm run typecheck && npm test` green (currently 387 tests).
2. New reconnect/resume regression tests pass (mocked WS).
3. If you changed the composable, the existing live-sync tests (bidirectional delta propagation etc.) must still pass — do NOT regress the sync-protocol behavior that was just fixed.
4. `php artisan test` only if Laravel touched (shouldn't be).
5. Prefer keeping changes minimal and inside `useCollaborativeCanvas.ts` + its test file.

### Gotchas
- `REMOTE_ORIGIN = 'remote'` tags peer-applied updates so they are never echoed back. Dedupe deletes run in a REMOTE_ORIGIN transaction so positional deletes are never broadcast.
- `sendSyncMessage` sends JSON `{type:'sync-request'}`; the relay forwards it to peers; peers reply with SYNC_FULL binary directly.
- 4001 close (auth rejection) must NOT reconnect (`shouldReconnectOnClose`).
- Do not touch the Goal section. Update the State section every iteration.

## Log
- Iteration 1: added mocked-WebSocket reconnect/resume integration test (388 tests, typecheck green).
