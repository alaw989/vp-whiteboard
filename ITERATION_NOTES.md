# Iteration Notes

## Goal
Fix live whiteboard sharing: changes by one collaborator (logged-in owner or anonymous share viewer) are not reflected in other open browsers without a refresh. Diagnose the Yjs/WebSocket real-time path (frontend/composables/useCollaborativeCanvas.ts + frontend/server/ws-server.js), fix it, add a regression test that proves delta propagation both ways, and keep npm run typecheck + npm test green.

## State
(empty — first iteration will start the log)

## Context (seeded before loop start — do not delete)

### Symptom
- In a shared whiteboard, edits by one collaborator don't appear live in another open browser. A full page refresh shows them.
- Refresh works because auto-save PATCHes `canvas_state` to the Laravel DB and reload re-imports it. So the live Yjs/WebSocket path is broken in one or both directions.

### Architecture (how live sync SHOULD work)
- Custom WS relay: `frontend/server/ws-server.js` (port 3001). Rooms keyed by whiteboard UUID. Path `/whiteboard:{id}`.
- Client: `frontend/composables/useCollaborativeCanvas.ts` (called from `frontend/pages/whiteboard/[id].vue` onMounted).
- Join sync: client sends JSON `{type:'sync-request'}`; a peer replies with `{type:'sync-state', state}` (full `exportState()`). Receiver imports ONLY if it has no local content (`yElements.length > 0 || yDocumentLayers.size > 0`).
- Live edits: every `ydoc.transact(..., <non-'remote'> origin)` fires `ydoc.on('update')` -> `sendBinary(update)` (incremental binary Yjs delta). Relay forwards binary frames to all other clients in the room. Receiver applies with `Y.applyUpdate(ydoc, data, REMOTE_ORIGIN)` where `REMOTE_ORIGIN = 'remote'`, so it is never echoed back. `yElements.observe` -> `elements.value` -> canvas re-renders.
- Relay auth: logged-in session cookie OR share token (httpOnly `vp_share_token` cookie OR `?share=` query param on handshake). Token must resolve at `GET {LARAVEL_URL}/api/shares/{token}` to `data.data.whiteboard_id === roomId`. Rejection closes with code 4001; client sees `authRejected=true` and stops reconnecting (`shouldReconnectOnClose` in useCollaborativeCanvas.ts).
- Share flow: `/s/{token}` Nitro route (`frontend/server/routes/s/[id].get.ts`) sets the httpOnly cookie, redirects to `/whiteboard/{id}?share={token}`; the page stashes token in sessionStorage, scrubs the URL, and `initWebSocket()` appends `?share=` to the handshake.
- Client heartbeat: sends `{type:'ping'}` every 25s; relay pings every 30s and terminates after 60s without a pong.

### Candidate root causes (rule each in/out with evidence)
1. **Deployed relay stale / rejecting share viewers (4001).** Verify relay logs for `🚫 Rejected`, and `WS_ALLOW_ANON`. Confirm the `?share=` handshake token resolves and matches the room. Check nginx `/whiteboard:` location forwards the upgrade + Cookie header on the live servers.
2. **Binary frames misclassified as JSON and dropped.** Relay does `JSON.parse(data.toString('utf8'))` and if `json.type` is set it treats the frame as a control message and does NOT relay it as binary (`ws-server.js` message handler ~line 216). A Yjs binary update could theoretically parse as JSON with a `.type` — verify the relay actually logs `📨 Binary` for live edits.
3. **Room-ID mismatch.** Owner opens `/whiteboard/{uuid}`; share viewer redirects to `/whiteboard/{uuid}`. Both roomId = uuid. Verify the relay logs show both clients in the same room (`Room {id} now has N clients`).
4. **Client delta-broadcast/observer bug.** Check `ydoc.on('update')` origin gating (anything not exactly `'remote'` broadcasts), `sendBinary` `ws.readyState` gate, `yElements.observe` re-populating `elements.value`, and that `WhiteboardCanvas` `:elements` prop is reactive.
5. **Heartbeat killing idle connections.** Confirm pongs keep `lastPong` fresh; look for `💔 Heartbeat timeout` in relay logs.
6. **Both directions or only one?** Reproduce owner<->owner AND owner<->share-viewer to know the scope.

### Reproduction (local full stack — do this in the first iteration)
1. Backend: `php artisan serve --port=8002` (SQLite local DB, `.env` present).
2. Frontend dev server: `cd frontend && npm run dev` (port 3000). `frontend/.env` sets `LARAVEL_URL=http://localhost:8002`, `NUXT_PUBLIC_WS_URL=ws://localhost:3001`.
3. WS relay: `cd frontend && npm run dev:ws` (starts `node server/ws-server.js` with `LARAVEL_URL=http://localhost:8002`, port 3001).
4. Create a whiteboard + a share link via the API as a logged-in user:
   - `POST /api/whiteboards` (auth) -> `{id}`
   - `POST /api/whiteboards/{id}/shares` (auth, `{role:'edit'}`) -> `data.url` contains the raw `/s/{token}` link.
5. Use the Playwright browser MCP to open TWO browser contexts:
   - Context A: logged-in owner on `/whiteboard/{id}`.
   - Context B: anonymous share viewer on `/s/{token}` (no session).
6. Draw with the pen tool in A; assert the stroke element appears in B **without refresh** (wait for element count / element id on B's canvas). Then draw in B and assert it appears in A. Also repeat the A<->B test with two logged-in users (owner + second account).
7. Watch the relay stdout for: `✅ Connection`, `Room {id} now has 2 clients`, `📨 Binary`, `🚫 Rejected`, `💔 Heartbeat timeout`. Capture the evidence (file paths/line refs) in the State section.

### Verification/acceptance
- With the local stack running, live edits propagate both directions between owner and share viewer WITHOUT a refresh.
- A regression test exists (e.g. extend `frontend/composables/useCollaborativeCanvas.test.ts`) that exercises delta broadcast/apply both ways with a mocked WebSocket, and it passes.
- `cd frontend && npm run typecheck && npm test` all green (backend `php artisan test` too if you touched Laravel).

### Gotchas / prior context (AGENTS.md summary)
- Prior echo-storm fix replaced full-state observers with `ydoc.on('update')` broadcasting only incremental deltas, tagged `REMOTE_ORIGIN` so peer-applied updates are never echoed back.
- Peer `sync-state` is intentionally IGNORED once local content exists (DB is source of truth on load).
- `exportState()` calls `deduplicateYElements()` which does `yElements.delete(i, 1)` — an implicit transaction with origin `null`, which DOES broadcast a binary delta. In-place `roundElementCoords(el)` mutates elements but triggers no ydoc update.
- The just-merged PR #41 (commit 5554b0c / merge 2350eaa) added the `?share=` handshake for anon share viewers; make sure you are reasoning about the CURRENT code (branch already contains it).
- Do not touch the Goal section. Update the State section every iteration: what changed, what is next, gotchas.

## Log
