# Spec 007: Autosave failure feedback (no more silent save failures)

## Status: Draft

Verify: cd frontend && npm run typecheck && npm test

## Overview

When the 30s autosave PATCH fails (network blip, 419 CSRF expiry, 5xx), the user gets zero
feedback — the save silently fails and they keep editing, believing their work is persisted. The
PATCH at `frontend/pages/whiteboard/[id].vue` (`onMounted` setInterval, ~`:735`) has no `.catch()`
and no retry, so any failure is swallowed. Users can lose work without knowing.

Goal: surface autosave status — show when a save is in-flight, when it last succeeded, and visibly
flag when it has failed (with a retry). The status logic must be unit-testable; only the small
visual indicator is left for browser verification.

## Context

- `frontend/pages/whiteboard/[id].vue` — the autosave block (fire-and-forget, no `.catch()`):
  ```ts
  saveInterval.value = setInterval(() => {
    const instance = canvasInstance.value
    if (instance && (instance.isConnected as any).value) {
      const state = instance.exportState()
      $api(`/api/whiteboards/${whiteboardId}`, { method: 'PATCH', body: { canvas_state: state } })
    }
  }, 30000)
  ```
- `$api` — `frontend/plugins/api.client.ts` (axios, `credentials: 'include'` + CSRF); returns a
  promise that rejects on non-2xx.
- No toast/notification system exists today (grep for toast/notify/useToast finds none). Don't add
  a heavy dependency — a reactive status + a small badge is enough.
- A connection-status pill already exists in the top nav (see Spec 005); an autosave indicator can
  sit beside it for consistency, using the dark `chrome` tokens from Spec 005.
- Real-time collaboration (`useCollaborativeCanvas`) is independent of autosave — do not couple.

## Requirements

- Extract autosave into a composable, e.g. `frontend/composables/useAutosave.ts`, exposing a
  reactive `status: 'idle' | 'saving' | 'saved' | 'error'`, a `lastSavedAt` timestamp, and a
  `retry()`. The composable owns the interval, the `$api` PATCH, and status transitions.
- The state machine MUST be unit-testable with an **injected save function** (dependency
  injection) so tests need no real timers/network: `idle` → `saving` on send → `saved` on resolve
  (set `lastSavedAt`) → `error` on reject (stay `error` until next success or retry).
  `retry()` re-runs immediately and flips back to `saving`.
- The `error` state MUST be visible: a small badge in the top nav next to the connection status —
  e.g. "⚠ Save failed — retry" (clickable → `retry()`) when `error`; a brief muted "Saved" when
  `saved`; hidden otherwise. Use the `chrome` tokens (`text-chrome-fg-muted`, etc.).
- The PATCH MUST still send `{ canvas_state: instance.exportState() }` exactly as today, so Spec
  006's document-layer persistence flows through unchanged.
- A Vitest MUST cover the transitions via the injected fake: resolve → `saved`; reject → `error`;
  `retry()` → `saving`→`saved`. Deterministic, no real timers.
- `npm run typecheck` passes; no regression to real-time sync, canvas, or the 30s cadence.

## Acceptance Criteria

- [ ] A `useAutosave` composable (or equivalent) exists with a unit-tested status state machine.
- [ ] `cd frontend && npm test` passes for the transitions (resolve / reject / retry).
- [ ] The autosave PATCH in `[id].vue` goes through the composable and has a `.catch()` path (no
      silent fire-and-forget) — grep confirms no bare PATCH remains for autosave.
- [ ] A visible `error` badge renders in the top nav on failure, with a retry action.
- [ ] `cd frontend && npm run typecheck` passes.
- [ ] (Human/browser, post-merge) DevTools → Network offline → after the next 30s tick the
      "Save failed — retry" badge appears; restore network + click retry → "Saved".

## Out of Scope

- A full toast/notification system (keep it to the autosave badge).
- Retry-with-backoff / queueing missed saves — a single immediate retry button is enough.
- Changing the autosave cadence (stay 30s) or the PATCH payload.
- A manual "Save now" button (candidate for a later spec).

<!-- NR_OF_TRIES: 0 -->
