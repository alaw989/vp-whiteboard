# Spec 006: Persist document layers (PDF/image uploads) across page refresh

## Status: Draft

Verify: cd frontend && npm run typecheck && npm test

## Overview

Uploaded PDFs and images vanish when the page is fully refreshed. A user uploads a PDF
(UploadModal → `useDocumentLayer`); it renders as a document layer and is Yjs-synced to
collaborators live — but on a hard refresh the layer is gone. Autosave writes `canvas_state`
to the DB every 30s and reloads it on mount, yet uploaded document layers are never part of
that serialized state, so they cannot be restored. This is data loss from the user's
perspective: work placed on the board silently disappears.

Goal: include document layers in the serialized `canvas_state` (export + import) so an upload
survives a full page refresh, without breaking real-time Yjs sync or the layer panel.

## Context

- `frontend/composables/useCollaborativeCanvas.ts:490` — `exportState()` returns
  `{ version, elements, layers }`. `layers` here is `yMeta.get('layers')` — the **layer-panel**
  layers (`useLayers`), NOT the document/PDF layers. The "includes layers if present" comment
  is misleading.
- `frontend/composables/useCollaborativeCanvas.ts:256` — `yDocumentLayers = ydoc.getMap('documentLayers')`
  is the synced store for PDF/image layers. Observed (`:595`); mutated via
  `addDocumentLayer`/`updateDocumentLayer`/`removeDocumentLayer` (`:658-681`).
- `frontend/composables/useCollaborativeCanvas.ts:688` — `getDocumentLayers()` returns
  `Array.from(yDocumentLayers.values())` — already exists, ready to serialize.
- `frontend/composables/useCollaborativeCanvas.ts:500` — `importState(state)` restores `elements`
  + meta `layers` inside a `ydoc.transact(...)` but does NOT restore document layers.
- `frontend/pages/whiteboard/[id].vue:675` — on mount, `canvasInstance.value.importState(whiteboard.value.canvas_state)`
  is the restore path that currently drops document layers.
- `frontend/pages/whiteboard/[id].vue` (`onMounted` setInterval, ~`:735`) — the 30s autosave calls
  `instance.exportState()` then PATCHes `/api/whiteboards/:id` with `{ canvas_state: state }`.
  Once `exportState` includes document layers, autosave persists them for free.
- `DocumentLayer` (in `~/types`) is self-contained: each carries its `dataUrl` (the rendered
  image data), so it can live in `canvas_state` with no separate file endpoint.
- Test infra: `cd frontend && npm test` (vitest, happy-dom, `~` aliased to project root via
  `frontend/vitest.config.ts`). Yjs constructs fine under happy-dom (`new Y.Doc()`).

## Requirements

- Extract the document-layer serialize/restore into a **pure, exported helper** under
  `frontend/utils/` (e.g. `canvasState.ts`) — e.g. `serializeDocumentLayers(yMap) -> DocumentLayer[]`
  and `mergeDocumentLayers(yMap, layers)` — so it is unit-testable without standing up the full
  collaborative canvas (WS, awareness, intervals). Have `exportState`/`importState` call these.
- `exportState()` MUST include the current document layers under a `documentLayers` key,
  alongside `elements` and meta `layers`. The value MUST be plain JSON-serializable (deep-copy /
  `.toJSON()` — no Yjs internals leaking, since this is PATCHed to MySQL as JSON).
- `importState(state)` MUST restore document layers when `state.documentLayers` is present,
  repopulating `yDocumentLayers` inside the existing `ydoc.transact(...)` block — set each by id,
  and leave `yDocumentLayers` untouched when the serialized state has none (back-compat with
  boards saved before this change).
- Restore MUST be idempotent by layer id — never insert a layer id that already exists in the
  live doc (avoids conflicts with layers arriving via real-time sync).
- No change to live collaboration: add/remove still propagates via Yjs in real time.
  Serialization is additive — it only affects what gets saved/reloaded.
- A round-trip Vitest MUST exist and pass: seed a `Y.Doc` + `Y.Map('documentLayers')` with ≥1
  layer, `serializeDocumentLayers(...)`, then `mergeDocumentLayers(...)` into a fresh map, and
  assert the layer(s) survive (same id, dataUrl, position). Also assert the serialized array
  survives `JSON.parse(JSON.stringify(...))`.
- `npm run typecheck` passes; no regression to elements, layer panel, or collaboration.

## Acceptance Criteria

- [ ] `exportState()` output includes a `documentLayers` entry (be consistent with how `layers`
      is conditionally included).
- [ ] `importState()` repopulates `yDocumentLayers` from `state.documentLayers` when present.
- [ ] Round-trip Vitest passes (`cd frontend && npm test`): serialize → fresh merge → layers
      survive; output is JSON-stable.
- [ ] Re-importing state whose layers already exist (by id) in the live doc creates no duplicates.
- [ ] `cd frontend && npm run typecheck` passes.
- [ ] (Human/browser, post-merge) Upload a PDF on `/whiteboard/[id]`, hard-refresh: the PDF layer
      is still there.

## Out of Scope

- A `GET /api/files` endpoint — not needed; layers are self-contained dataUrls in `canvas_state`
  (the alternative fix noted in STAGING-LARAVEL-MIGRATION.md §6).
- Changing how the layer-panel `layers` meta is serialized (already serialized; leave as-is).
- Changing the 30s autosave cadence or the PATCH endpoint.
- Re-rasterizing the PDF on load — the stored `dataUrl` renders as-is.

<!-- NR_OF_TRIES: 0 -->
