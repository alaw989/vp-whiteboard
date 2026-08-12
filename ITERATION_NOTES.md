# Iteration Notes

## Goal
Save-state indicator (backlog #1): add a subtle Saving…/Saved/Offline–retrying badge to the whiteboard page that surfaces the API/WS outage mode behind the past data-loss incident. In frontend/pages/whiteboard/[id].vue, track the auto-save lifecycle (saveCanvasState at line ~846, the 2s debounced elements watcher, the 30s interval, and the keepalive onUnmounted flush) and expose a small state machine: idle/clean → 'saved', dirty + debounce pending or save in-flight → 'saving', PATCH failure → 'offline' with a retry counter/timestamp and automatic retry on the next tick (don't just swallow the error like the current catch at line ~861 — surface it). Render a compact pill next to the existing Connection Status pill (header, ~line 41-63) showing the current state with distinct icons/colors and an aria-live='polite' role=status for a11y. Extract the state machine into a pure, unit-testable composable (e.g. frontend/composables/useSaveState.ts) with tests covering: initial idle, mark-dirty → saving, in-flight guard, success → saved, failure → offline (+retry count), recovery → saved, debounce cooldown, and idle-timeout back to saved (state machine never gets stuck in 'saving'). Wire it into [id].vue's existing save flow without changing the save cadence or PATCH body. Keep npm run typecheck + npm test green (744) + frontend coverage gate green (82/82/84.5/86.5) and php artisan test green (77) — no backend changes expected. Do NOT break e2e: the header layout is asserted in some specs (connected users / connection status), so keep existing data-testids/classes on the Connection pill and add a NEW testid for the save pill; the save badge must not change the save cadence (30s interval + 2s debounce + keepalive flush) or the PATCH payload. Backend untouched. No server/routes/* Nitro routes — if any helper is added under server/ it needs explicit imports (rate-limit loop lesson).

## Context (from prior code review — read before changing code)

### What exists today

- **Auto-save flow** in `frontend/pages/whiteboard/[id].vue`:
  - `saveInterval` 30s tick → `saveCanvasState()` (line ~842-866): guarded by `saveInProgress`, skips when `!dirty`, calls `instance.exportState()` then `$api PATCH /api/whiteboards/{id}` with `{ canvas_state: state }`, sets `dirty = false` on success, **swallows errors** in `catch` (only `console.warn`).
  - A `watch` on `canvasInstance.value?.elements` (deep) sets `dirty = true` and fires a **2s debounced** `saveCanvasState()` — this catches quick draw+reload edits.
  - Document-layer observer (`yDocumentLayers`) sets `dirty = true` on change.
  - `onUnmounted` (line ~894-927): clears the interval, does a **keepalive fetch PATCH** of the final state synchronously before Yjs cleanup (fire-and-forget, no state feedback).
- **Header / Connection pill** (line ~41-63): a green/amber pill showing `isConnected` + `connectionStatus` from the WS instance (`useCollaborativeCanvas` / WhiteboardCanvas). This is WS health, NOT save persistence — the two can diverge (WS up but API down = autosave failing silently; WS down but saves queued = data safe). The save badge is complementary and must not be confused with it.
- **Page size**: `[id].vue` is ~1264 lines, large. Keep changes minimal and localized; prefer a new composable for the state machine.
- **Types**: no existing save-state type. `dirty`, `saveInProgress` are plain module-scope lets inside `<script setup>`.

### What the feature needs (backlog #1)

1. **State machine** (pure, testable): states `saved` | `saving` | `offline`. Transitions:
   - edit event (dirty=true / debounce fired) → `saving` (once save actually starts)
   - save in-flight → stay `saving` (guard `saveInProgress`)
   - PATCH resolves → `saved`
   - PATCH rejects → `offline` (+ increment retry count, record last-failed timestamp)
   - next successful save (auto retry on 30s tick) → `saved` (retry count resets)
   - a `saved` state that's been clean for a while can stay `saved` (or fade). Must never get stuck in `saving`.
2. **Composable** `frontend/composables/useSaveState.ts`: exposes e.g. `{ state, retryCount, lastFailedAt, markDirty, onSaveStart, onSaveSuccess, onSaveFailure, idleTimeoutMs }`. Unit tests in `useSaveState.test.ts` (happy-dom). Aim for 100% coverage of the composable (it's small).
3. **Badge UI** in `[id].vue` header: compact pill next to the Connection pill. Copy: `Saving…` / `Saved` / `Offline – retrying (N)` (or `Not saving right now` when not dirty). Distinct colors (e.g. blue saving / green saved / amber-red offline). `data-testid="save-state-badge"`, `role="status"`, `aria-live="polite"`.
4. **Wire into the save flow**: call `markDirty()` in the elements watcher + docLayers observer; `onSaveStart()` before the PATCH; `onSaveSuccess()` on resolve; `onSaveFailure()` in the catch (replacing the bare `console.warn` — keep the warn, add state). The 30s interval, 2s debounce, PATCH body, and keepalive flush must be UNCHANGED.

### Gotchas

- **Never change the save cadence or PATCH body** — e2e persistence tests (smoke: create → reload → verify persists) depend on the exact 30s interval + 2s debounce + keepalive flush behavior. The badge is read-only feedback on the existing flow.
- **Header a11y/e2e assertions**: existing specs may assert the connection pill or `connectedUsers` copy — keep all existing classes/testids on the Connection pill, only ADD new ones for the save pill. If a spec asserts header text, make sure new text doesn't break a `.toHaveText` exact match (prefer adding rather than replacing).
- **`dirty`/`saveInProgress` are module lets** — the composable is a separate module; pass signals in via the functions above rather than trying to reach into the page's closure.
- **State must not get stuck**: the 30s interval keeps calling `saveCanvasState` even when dirty=false (it early-returns), so after a successful save the next tick no-ops — the badge should flip to `saved` on success and stay there (idle timeout optional; don't introduce a timer that keeps the UI busy). If `offline`, the next 30s tick retries naturally — ensure `saveInProgress` isn't left true after a failure (the `finally` handles it).
- **SSR safety**: badge state lives client-side only; guard any `document`/`window` access. The composable should be SSR-safe (plain refs, no lifecycle hooks needed beyond what the page already has).
- **coverage gate**: the new composable + tests ADD covered lines (fine, gate is ≥82 lines/stmts, 84.5 branches, 86.5 funcs — keep the composable fully tested). Do NOT add untested branches.
- **Backend untouched** — this is purely frontend. `php artisan test` (77) should stay green with zero changes.

### Verification

- Loop gate: `cd frontend && npm run typecheck && npm test && cd .. && php artisan test` (744 frontend + 77 backend must stay green).
- Frontend coverage: `cd frontend && npm run coverage` (≥ 82/82/84.5/86.5).
- e2e: run `npm run test:e2e` before shipping (clean stack, TEST=1). Existing specs (smoke persistence, collab, mobile-touch) must stay green; optionally add a save-badge e2e if cheap (draw → badge shows Saving→Saved; kill API → badge shows Offline) — but do NOT make it flaky (the 30s cadence makes a "saved" assertion timing-sensitive; prefer asserting the badge exists + changes on a forced save, or skip e2e for the badge and rely on unit tests).
- Manual smoke (local stack): open a board, draw → badge flips Saving…→Saved; stop Laravel (php artisan serve down) → next save → badge shows Offline–retrying; restart → recovers to Saved. Confirm Connection pill is unchanged.
