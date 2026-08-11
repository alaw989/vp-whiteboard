# Iteration Notes

## Goal
Add coverage tooling + a threshold gate that ratchets up: install @vitest/coverage-v8 (pinned vitest ^2.1.9), add a `npm run coverage` script + vitest.config.mts coverage config (include composables/**, utils/**, server/**, exclude test files + e2e), and gate the CI `test` job on line/statement/branch thresholds; backend: enable pcov in the CI PHP setup (shivammathur/setup-php coverage: pcov) and gate `php artisan test --coverage-clover`/`--coverage-text` output (PHPUnit has no native min-coverage flag — small parse step). FIRST pass MEASURES the current coverage %, THEN sets realistic thresholds that ratchet up — not an arbitrary number that instantly fails CI. Keep npm run typecheck + npm test green and the existing e2e suite passing.

## State

### Iteration 14 (DONE) — usePDFRendering composable covered + thresholds ratcheted up

**Changed:**
- New unit test `frontend/composables/usePDFRendering.test.ts` (24 tests) covering the full pdfjs wrapper via `vi.mock('pdfjs-dist', () => ({ getDocument: getDocumentMock }))`: `DEFAULT_SCALE` = 1.5; `cleanupPDFDocument` (calls cleanup, null-safe); `loadPDFDocument` (ArrayBuffer → getDocument called with `{data, useWorkerFetch, isEvalSupported:false}`, initial + final progress states, onProgress forwarded through the task's `onProgress` with percent rounding + total-0 → 0%, AbortError when signal pre-aborted — getDocument never called, abort during a progress event destroys the task + throws AbortError without leaking the progress state, abort mid-load destroys the loading task then removes the listener on success, load-failure error message, AbortError-during-load → 'Loading cancelled', non-Error rejection → 'Failed to load PDF', no-callback no-op); `renderPageToImage` (default scale 1.5 via `DEFAULT_SCALE`, custom scale, 50→100 progress, canvas width/height from viewport, `render({canvasContext, viewport})` + toDataURL('image/png'), pre-aborted AbortError, missing 2d context error, abort mid-render cancels the render task, abort listener removed on completion, 'cancelled' render error → AbortError, other render errors rethrown); `loadAndRenderPage` (combined 0-100 progress mapping — load halved to 0-50, render mapped to 50-100, getPage(num), cleanup called, returns `{dataUrl, totalPages}`, defaults to page 1, propagates load failures). `usePDFRendering.ts` was the last 0% root-composable drag — now **100% stmts/lines/funcs, 97.91% branches** (uncovered: the `renderPageToImage` catch's removeEventListener at line 136).
- Mocking gotcha: `loadPDFDocument` is async and starts with `await import('pdfjs-dist')`, so the task's `onProgress`/abort-listener are NOT set synchronously — tests must `await vi.waitFor(() => expect(task.onProgress).toBeTypeOf('function'))` (or wait for the addEventListener spy) before driving the loading task. Also `document.createElement` is spied per-test to return a fake canvas (`getContext`/`toDataURL`) since happy-dom canvases are inert.
- `frontend/package.json` `coverage` script thresholds ratcheted up: lines/stmts 81→**82**, branches 84.2→**84.5**, functions 86.2→**86.5** (all at-or-below new measured 83.76/83.76/84.7/86.84).

**Measured** (after adding usePDFRendering tests): All files 83.76% stmts/lines (was 81.8), 84.7% branches (was 84.3), 86.84% funcs (was 86.61). Suite 53 files / 679 tests (was 52/655). The +1.96pp line jump came almost entirely from usePDFRendering's ~210-line body.

**Verification:**
- `npm run coverage` exit 0 with new thresholds; `npm run typecheck` exit 0; `npm test` 679/679 pass.
- Negative checks: `--coverage.thresholds.lines=84 --coverage.thresholds.statements=84 --coverage.thresholds.functions=86.9` → `ERROR: Coverage for lines/statements (83.76%) does not meet global threshold` + functions 86.84 < 86.9 → exit 1. Gate enforces.

**Next:**
1. Push to CI: confirm `backend-test` (pcov+clover, threshold 73) is green on PHP 8.4 — local measured 73.66% on 8.5; 0.66pp headroom should absorb it. Also confirm the frontend `test` check passes at the new 82/84.5/86.5 thresholds.
2. Ratchet frontend further (lines/stmts 82 → 83) once more composables get tested — remaining drags: `useExtendTool` 51.16%, `useTrimTool` 55.97%, `useMirrorTool` 58.29%, `useMeasureAreaTool` 61.66%, `useOffsetTool` 62.93%, `useFileUpload`'s `uploadFile`/`uploadFiles` body 31.89%. `useExtendTool`/`useTrimTool`/`useMirrorTool`/`useOffsetTool` (modify-tool patterns already ~52-63%, and their sibling tool-test files exist) are the next best candidates.
3. Ratchet backend 73 → 74 once more backend tests land.

### Iteration 13 (DONE) — useDocumentLayer composable covered + thresholds ratcheted up

**Changed:**
- New unit test `frontend/composables/useDocumentLayer.test.ts` (20 tests) covering the full `useDocumentLayer` surface: empty initial state without a Yjs map, `activeLayer` computed undefined when nothing active, `visibleLayers` filtering, `addImageLayer` success (fake-Image stub resolves with dimensions, appends + activates, calls `onAddLayer`) and failure (records error, rejects, no callback), `addPDFLayer` success (mocked `loadPDFDocument`/`renderPageToImage`/`cleanupPDFDocument`, builds pdf layer with viewport dims + pageNumber/totalPages, loading toggles, cleanup called, `onAddLayer` fires), `addPDFLayer` failure (Error message vs generic fallback for non-Error rejections, loading cleared in finally), `updateLayer` (existing + missing-id no-op, `onUpdateLayer` sync), `removeLayer` (active reassigned to first remaining / null when empty, `onRemoveLayer` sync), `setActiveLayer`, `clearLayers`, Yjs-map initial seed, remote-change observation, active-preserved/fallback-to-first on remote change, and both `onUnmounted` paths (observer cleanup stops future callbacks; no-op when no observer started — via a `vi.mock('vue')` importOriginal wrapper that captures the `onUnmounted` callback so the cleanup branch is actually exercised). `useDocumentLayer.ts` was a 0% root-composable drag — now **100% stmts/lines/funcs, 94.28% branches** (uncovered: active-fallback when remote array is empty at line 52, `addPDFLayer` Error-instance message branch at 188).
- `frontend/package.json` `coverage` script thresholds ratcheted up: lines/stmts 78→**81**, branches 84→**84.2**, functions 85.5→**86.2** (all at-or-below new measured 81.8/81.8/84.3/86.61).

**Measured** (after adding useDocumentLayer tests): All files 81.8% stmts/lines (was 79.51), 84.3% branches (was 84.02), 86.61% funcs (was 86.15). Suite 52 files / 655 tests (was 51/635). The +2.29pp line jump came from useDocumentLayer's ~260-line body.

**Verification:**
- `npm run coverage` exit 0 with new thresholds; `npm run typecheck` exit 0; `npm test` 655/655 pass.
- Negative checks: `--coverage.thresholds.lines=82` → exit 1 (81.8 < 82); `--coverage.thresholds.branches=84.4` → exit 1 (84.3 < 84.4); `--coverage.thresholds.functions=86.7` → exit 1 (86.61 < 86.7). Gate enforces on all four dimensions.
- Gotcha: `new Y.Map()` standalone throws "Invalid access: Add Yjs type to a document before reading data" on `values()` — use `new Y.Doc().getMap('documentLayers')`. Also `activeLayer.value` returns a different object identity than the resolved layer (reactive array proxy) — compare with `toEqual`, not `toBe`.

**Next:**
1. Push to CI: confirm `backend-test` (pcov+clover, threshold 73) is green on PHP 8.4 — local measured 73.66% on 8.5; 0.66pp headroom should absorb it. Also confirm the frontend `test` check passes at the new 81/84.2/86.2 thresholds.
2. Ratchet frontend further (lines/stmts 81 → 82) once more composables get tested — remaining drags: `usePDFRendering` 0% lines, `useExtendTool` 51%, `useTrimTool` 56%, `useFileUpload`'s `uploadFile`/`uploadFiles` body 31.89%. `usePDFRendering` (the pdfjs wrapper — mock `pdfjs-dist`'s dynamic import) and `useTrimTool`/`useExtendTool` (already ~51-56%, tool-test patterns exist) are the next best candidates.
3. Ratchet backend 73 → 74 once more backend tests land.

### Iteration 12 (DONE) — useViewport composable covered + thresholds ratcheted up

**Changed:**
- Expanded `frontend/composables/useViewport.test.ts` from 7 → 43 tests: the existing `computePinchViewport` tests now also cover min-zoom clamping, `getViewportBounds` (default padding, zoom scaling, custom padding), and the full `useViewport()` composable body against a fake Konva stage (`makeStage()` mock with `x`/`y`/`draggable`/`getPointerPosition`/`on`/`off`/`container` + a real happy-dom `<div>` container with `offsetWidth`/`offsetHeight` 800×600): initial identity state + derived `zoomPercent`/`canZoomIn`/`canZoomOut`, custom min/max bounds, `handleWheel` (zoom in/out toward pointer, pointer-anchored x/y math, no-stage + null-pointer no-ops, min/max clamping, `onViewportChange`), `enablePan` (draggable + grab cursor after nextTick, no-stage no-op), `disablePan` (captures stage position, clears cursor, no-stage no-op), `startPan`/`stopPan` delegation, the `watch(isPanning)` dragmove/dragstart/dragend listener lifecycle (registers while panning, updates viewport on dragmove, cursor grabbing/grab, removed when panning stops), `zoomIn`/`zoomOut` (center-anchored math, min/max no-ops, missing-container fallback), `resetZoom`, `setViewport` (partial updates, zoom clamp), `setViewportDirect` (no sync/notify), `applyRemoteViewport` (flag cleared on nextTick so subsequent edits sync), and the debounced `triggerSync` paths (no-userId no-sync, userId-without-sync no-op, significant-change syncs, sub-threshold skip, re-sync after significant change, debounce collapsing rapid changes into one trailing call). `useViewport.ts` was the biggest remaining root-composable drag at 9.75% — now **100% stmts/lines/funcs, 95.89% branches**.
- `frontend/package.json` `coverage` script thresholds ratcheted up: lines/stmts 73→**78**, branches 83→**84**, functions 84→**85.5** (all at-or-below new measured 79.51/79.51/84.02/86.15).

**Measured** (after adding useViewport tests): All files 79.51% stmts/lines (was 76.19), 84.02% branches (was 83.45), 86.15% funcs (was 85.4). Suite 51 files / 635 tests (was 51/597). The +3.32pp line jump came almost entirely from useViewport's ~440-line body.

**Verification:**
- `npm run coverage` exit 0 with new thresholds; `npm run typecheck` exit 0; `npm test` 635/635 pass.
- Negative checks: `--coverage.thresholds.lines=83` → exit 1 (79.51 < 83); `--coverage.thresholds.lines=79.6` → exit 1. Decimal thresholds verified to work (`79.5`/`85.5` accepted). Gate enforces.

**Next:**
1. Push to CI: confirm `backend-test` (pcov+clover, threshold 73) is green on PHP 8.4 — local measured 73.66% on 8.5; 0.66pp headroom should absorb it. Also confirm the frontend `test` check passes at the new 78/84/85.5 thresholds.
2. Ratchet frontend further (lines/stmts 78 → 79) once more composables get tested — remaining drags: `usePDFRendering` 0% lines, `useDocumentLayer` ~0%, `useExtendTool` 51%, `useTrimTool` 56%, `useFileUpload`'s `uploadFile`/`uploadFiles` body 31.89%. `useDocumentLayer` (Yjs-driven, likely mirrors `useLayers`/`useScale` patterns) and `usePDFRendering` are the next best candidates.
3. Ratchet backend 73 → 74 once more backend tests land.

### Iteration 11 (DONE) — useCursors composable covered + thresholds ratcheted up

**Changed:**
- New unit test `frontend/composables/useCursors.test.ts` (11 tests) covering the full `useCursors` surface against a mock awareness object (Yjs `getStates`/`setLocalState`/`on`/`off`/`emit`): current-user identity + deterministic palette color (same id → same color, always in the 6-color palette), no-awareness no-crash (works with `undefined` provider), initial load of existing awareness states into `remoteCursors` (user/cursor/tool/lastSeen), filtering out the local client id + states without `cursor` data, recompute on `change` events, `updateLocalCursor` publishing the debounced local state (user + cursor + tool, or tool undefined), no-op when `setLocalState` is unavailable, and `cleanup` unsubscribing the listener + clearing local state (no-op when awareness missing). `useCursors.ts` was a 0% root-composable drag — now 100% stmts/lines/funcs, 95% branches.
- `frontend/package.json` `coverage` script thresholds ratcheted up: lines/stmts 72→**73**, branches 82→**83**, functions 83→**84** (all at-or-below new measured 76.19/76.19/83.45/85.4).

**Measured** (after adding useCursors tests): All files 76.19% stmts/lines (was 75.16), 83.45% branches (was 83.24), 85.4% funcs (was 85.11). Suite 51 files / 597 tests (was 50/586).

**Verification:**
- `npm run coverage` exit 0 with new thresholds; `npm run typecheck` exit 0; `npm test` 597/597 pass.
- Negative check: `--coverage.thresholds.lines=77` → `ERROR: Coverage for lines (76.19%) does not meet global threshold (77%)` → vitest exit 1. Gate enforces.

**Next:**
1. Push to CI: confirm `backend-test` (pcov+clover, threshold 73) is green on PHP 8.4 — local measured 73.66% on 8.5; 0.66pp headroom should absorb it.
2. Ratchet frontend further (lines/stmts 73 → 74) once more composables get tested — biggest drags remain root composables (usePDFRendering 0% lines, useDocumentLayer ~0%, useViewport 9.75%, useExtendTool 51%, useTrimTool 56%, useFileUpload's `uploadFile`/`uploadFiles` body 31.89%). `useViewport` (already has a test file covering the pure fns; the 9.75% body is the pan/zoom/remote-sync logic — stage-mockable) and `usePDFRendering` are the next best candidates.
3. Ratchet backend 73 → 74 once more backend tests land.

### Iteration 10 (DONE) — useSnapping composable covered + thresholds ratcheted up

**Changed:**
- Rewrote `frontend/composables/useSnapping.test.ts` (6 → 32 tests) covering the full `useSnapping` surface: `getElementSnapPoints` per type (line endpoints+midpoint, rectangle 4 corners + 4 edge midpoints + center, circle center + 4 cardinals + radius-0 center-only, ellipse center-only, stroke first/last + empty, polyline endpoints + segment midpoints + closed-segment midpoint + empty, arc start/through/end, fillet-arc start/end angle-math + center, dimension start/end, revision-cloud vertices + empty, non-geometric type → `[]`), all three enhanced-snap passes (perpendicular foot on line/rectangle/stroke/polyline segments, tangent snap for a circle offset along a tangent line, nearest snap just inside a circle's boundary at a non-cardinal point), perpendicular fall-through edge cases (foot beyond segment end → null via nearest clamping, zero-length segment skipped → null), `isNearSnapPoint`, `findSnapPointThrottled` (debounce resolves to a snap point after the throttle window), and custom `threshold` (snaps only within 1px). `useSnapping.ts` was a 38.44% root-composable drag — now 89.93% stmts/lines, 100% funcs.
- `frontend/package.json` `coverage` script thresholds ratcheted up: lines/stmts 71→**72**, branches 81→**82**, functions 82→**83** (all at-or-below new measured 75.16/75.16/83.24/85.11).

**Measured** (after adding useSnapping tests): All files 75.16% stmts/lines (was 71.79), 83.24% branches (was 82.01), 85.11% funcs (was 82.89). Suite 50 files / 586 tests (was 50/560).

**Verification:**
- `npm run coverage` exit 0 with new thresholds; `npm run typecheck` exit 0; `npm test` 586/586 pass.
- Negative check: `--coverage.thresholds.lines=76` → `ERROR: Coverage for lines (75.16%) does not meet global threshold (76%)` → vitest exit 1. Gate enforces.

**Next:**
1. Push to CI: confirm `backend-test` (pcov+clover, threshold 73) is green on PHP 8.4 — local measured 73.66% on 8.5; 0.66pp headroom should absorb it.
2. Ratchet frontend further (lines/stmts 72 → 73) once more composables get tested — biggest drags remain root composables (useCursors/useDocumentLayer ~0%, usePDFRendering 0% lines, useViewport 9.75%, useExtendTool 51%, useTrimTool 56%, useFileUpload's `uploadFile`/`uploadFiles` body 31.89%). `useViewport` (pure math: `getViewportBounds`, `computePinchViewport` already tested) and `usePDFRendering` are the next best candidates.
3. Ratchet backend 73 → 74 once more backend tests land.

### Iteration 9 (DONE) — useMeasurements composable covered + real insert-arg bug fixed + thresholds ratcheted up

**Changed:**
- New unit test `frontend/composables/useMeasurements.test.ts` (44 tests) covering the full `useMeasurements` surface against a real `Y.Array`: measurement lifecycle (start/update-preview/complete/cancel, inches + feet conversion, null start returns null), distance formatting (`formatDistanceMeasurement` feet `'` vs inches `"`, `getMeasurementLabel` cached-value + computed fallback + non-distance empty), `previewLine` computed (null when idle, points/dash/label, feet unit), all `calculateArea` dispatch branches (rectangle 2×1in, circle πr², ellipse πab, polyline shoelace 4 sq in, revision-cloud ≥3 pts, arc triangle 1 sq in, stroke bbox 2.5 sq in, null for open/<3-pt polyline/unsupported line), `formatAreaMeasurement` (sq-inches default + sq-feet), `measureArea` (missing target false, unsupported-type warn + false, rectangle creates `measurement-area`), `findAreaMeasurementsFor`, `getShapeCenter` (rect/circle/ellipse/origin fallback), `getAreaLabel`, `isMeasurementStale` (non-measurement false, null ppi false, >1% flag, within-tolerance pass), `getStaleMeasurements`, `updateMeasurementEndpoint` (missing/non-distance no-op, end + start updates with recalculated value, replace-at-index via delete+insert), `updateMeasurementValue` (missing no-op, value replace), `getAreaLabelPosition` (missing target origin, rect center offset -20). `useMeasurements.ts` was a 0% root-composable drag — now 100% stmts/lines/funcs, 99.08% branches.
- **Product bug fixed (caught by the new tests):** `useMeasurements.ts:445` and `:463` called `yElements.insert([updatedElement], index)` — args reversed. `Y.Array.insert` is `insert(index, content)`, so every `updateMeasurementEndpoint`/`updateMeasurementValue` call threw `TypeError: content.forEach is not a function`. Both now `yElements.insert(index, [updatedElement])` (same correct pattern as `useCollaborativeCanvas.ts:646`). Endpoint/value editing of measurements was broken at runtime.
- `frontend/package.json` `coverage` script thresholds ratcheted up: lines/stmts 65→**71**, branches 80→**81**, functions 81→**82** (all at-or-below new measured 71.79/71.79/82.01/82.89).

**Measured** (after adding useMeasurements tests): All files 71.79% stmts/lines (was 66.58), 82.01% branches (was 80.48), 82.89% funcs (was 81.74). Suite 50 files / 560 tests (was 49/516).

**Verification:**
- `npm run coverage` exit 0 with new thresholds; `npm run typecheck` exit 0; `npm test` 560/560 pass.
- Negative check: `--coverage.thresholds.lines=72 --coverage.thresholds.statements=72 --coverage.thresholds.branches=82 --coverage.thresholds.functions=83` → `ERROR: Coverage for lines/statements (71.79%) does not meet global threshold (72%)`, functions 82.89<83 → exit 1. Gate enforces.

**Next:**
1. Push to CI: confirm `backend-test` (pcov+clover, threshold 73) is green on PHP 8.4 — local measured 73.66% on 8.5; 0.66pp headroom should absorb it.
2. Ratchet frontend further (lines/stmts 71 → 72) once more composables get tested — biggest drags remain root composables (useCursors/useDocumentLayer ~0%, usePDFRendering 0% lines, useViewport 9.75%, useSnapping 38%, useExtendTool 51%, useTrimTool 56%, useFileUpload's `uploadFile`/`uploadFiles` body 31.89%). `useSnapping`/`useViewport` (already have test files, mostly pure math) and `usePDFRendering` are the next best candidates.
3. Ratchet backend 73 → 74 once more backend tests land.


### Iteration 8 (DONE) — useLayers composable covered + thresholds ratcheted up

**Changed:**
- New unit test `frontend/composables/useLayers.test.ts` (23 tests) covering the full `useLayers` surface against a real `Y.Doc`: `observeLayers` seeds the default layer when nothing is stored and loads stored layers with active fallback to first, `addLayer` (auto/custom name, palette color cycling, order, sets active, syncs to yMeta), `removeLayer` (default refused, missing id no-op, active reassigned to first remaining), `renameLayer`, `toggleLayerVisibility`, `toggleLayerLock`, `setLayerColor`, `setActiveLayer` (missing id no-op), `reorderLayers` (order by position, unknown ids dropped), `getActiveLayer`, `isLayerVisible`/`isLayerLocked`/`getLayerColor` (undefined/missing/existing), `sortedLayers`, `hiddenLayerIds`, and the observer (remote key change updates layers, ignores non-`layers` keys, cleanup stops callbacks, active reassigned when a remote change drops it). `useLayers.ts` was a 0% root-composable drag — now 100% stmts/lines/funcs, 94.66% branches.
- `frontend/package.json` `coverage` script thresholds ratcheted up: lines/stmts 63→**65**, branches 79→**80**, functions 80→**81** (all at-or-below new measured 66.58/66.58/80.48/81.74).

**Measured** (after adding useLayers tests): All files 66.58% stmts/lines (was 64.14), 80.48% branches (was 79.53), 81.74% funcs (was 80.87). Suite 49 files / 516 tests (was 48/493).

**Verification:**
- `npm run coverage` exit 0 with new thresholds; `npm run typecheck` exit 0; `npm test` 516/516 pass.
- Negative check: `--coverage.thresholds.lines=67` → `ERROR: Coverage for lines (66.58%) does not meet global threshold (67%)` → exit 1. Gate enforces.

**Next:**
1. Push to CI: confirm `backend-test` (pcov+clover, threshold 73) is green on PHP 8.4 — local measured 73.66% on 8.5; 0.66pp headroom should absorb it.
2. Ratchet frontend further (lines/stmts 65 → 66) once more composables get tested — biggest drags remain root composables (useCursors/useMeasurements/useDocumentLayer ~0%, usePDFRendering 0% lines, useViewport 9.75%, useSnapping 38%, useExtendTool 51%, useTrimTool 56%, useFileUpload's `uploadFile`/`uploadFiles` body 31.89%). `useMeasurements` (Yjs array like `useScale`/`useLayers` were, mostly pure math + a Y.Array push) is the next best candidate; `useViewport`/`useSnapping` (already have test files at 9.75%/38%) are also easy wins.
3. Ratchet backend 73 → 74 once more backend tests land.

### Iteration 7 (DONE) — useCommandEngine/Registry covered + thresholds ratcheted up

**Changed:**
- New unit test `frontend/composables/useCommandEngine.test.ts` (25 tests) covering the full command system: `useCommandRegistry` (register by name + aliases case-insensitive, `getAll` dedupes by name, `getCompletions` prefix-matches name/aliases with dedupe, empty-result case) and `useCommandEngine` (`execute` by name/lowercase/alias, undo/redo/grid/gridsnap/ortho/osnap callbacks, POLAR with/without `togglePolarTracking`, empty-input no-op, unknown-command message, bare-number direct-distance while drawing with applied/not-applied branches, plain-distance fallback, fillet-radius set, pending-param flow via exposed `pendingCommand`/`isWaitingForParam` refs, `cancelPending`, history tracking, 100-line output cap, `getAll` full command set, completions, per-command tool callback, and a sweep that executes every registered command by name and by alias without throwing).
- `frontend/composables/useCommandEngine.ts` product fix (caught by the new tests): the registered-command `cmd.action({...})` invocation was missing `togglePolarTracking: options.togglePolarTracking` (only the pending-param path passed it), so the POLAR command could never invoke the option. Added it to the standard command path.
- `frontend/package.json` `coverage` script thresholds ratcheted up: lines/stmts 62→**63**, branches 78→**79**, functions 79→**80** (all at-or-below new measured 64.14/64.14/79.53/80.87).

**Measured** (after adding command tests): All files 64.14% stmts/lines (was 62.12), 79.53% branches (was 78.26), 80.87% funcs (was 79.03). Suite 48 files / 493 tests (was 47/468). `useCommandEngine.ts` 96.11/100/97.29/96.11, `useCommandRegistry.ts` 100% everywhere — both previously 0%.

**Verification:**
- `npm run coverage` exit 0 with new thresholds; `npm run typecheck` exit 0; `npm test` 493/493 pass.
- Negative check: thresholds 64/64/80/81 → `ERROR: Coverage for functions (80.87%) does not meet global threshold (81%)` + branches 80 → exit 1. Gate enforces.

**Next:**
1. Push to CI: confirm `backend-test` (pcov+clover, threshold 73) is green on PHP 8.4 — local measured 73.66% on 8.5; 0.66pp headroom should absorb it.
2. Ratchet frontend further (lines/stmts 63 → 64) once more composables get tested — biggest drags remain root composables (useCursors/useLayers/useMeasurements/usePDFRendering/useDocumentLayer ~0%, useSnapping 38%, useViewport 10%, useExtendTool 51%, useTrimTool 56%, useFileUpload's `uploadFile`/`uploadFiles` body 31.89%). `useCommandEngine`'s remaining uncovered bits are the parameter-driven paths (a registered command actually calling `prompt()`/`setActiveTool` through `isWaitingForParam`). `useLayers`/`useMeasurements` (Yjs maps like `useScale` was) or `useSnapping` (already 38%, mostly pure math) are the next best candidates.
3. Ratchet backend 73 → 74 once more backend tests land.

### Iteration 6 (DONE) — useFileUpload pure functions covered + thresholds ratcheted up

**Changed:**
- New unit test `frontend/composables/useFileUpload.test.ts` (11 tests) covering the pure module exports of `useFileUpload.ts`: `validateFile` (all 4 allowed types pass, disallowed type error lists pdf/jpeg/png/webp, empty mime rejected, >10MB rejected with `10.0MB` message, exactly-10MB accepted), `formatFileSize` (B/KB/MB boundaries + one-decimal rounding), `getFileIcon` (image→`mdi:image`, pdf→`mdi:file-pdf-box`, unknown/empty→`mdi:file`). `useFileUpload.ts` was a ~0% root-composable drag — now 31.89% stmts/lines, 100% branches.
- `frontend/package.json` `coverage` script thresholds ratcheted up: lines/stmts 60→**62** (at-or-below new measured 62.12). Branches kept at 78 (measured 78.26, only 0.26 headroom) and funcs kept at 79 (measured 79.03, 0.03 headroom — adding the 75%-funcs file actually *lowered* funcs from 79.12→79.03).

**Measured** (after adding useFileUpload tests): All files 62.12% stmts/lines (was 61.57), 78.26% branches, 79.03% funcs. Suite 47 files / 468 tests (was 46/457).

**Verification:**
- `npm run coverage` exit 0 with new thresholds; `npm run typecheck` exit 0; `npm test` 468/468 pass.
- Negative check: `--coverage.thresholds.lines=63` → `ERROR: Coverage for lines (62.12%) does not meet global threshold (63%)` → exit 1. Gate enforces.

**Next:**
1. Push to CI: confirm `backend-test` (pcov+clover, threshold 73) is green on PHP 8.4 — local measured 73.66% on 8.5; 0.66pp headroom should absorb it.
2. Ratchet frontend further (lines/stmts 62 → 63) once more composables get tested — biggest drags remain root composables (useCursors/useLayers/useMeasurements/usePDFRendering/useCommandEngine/useDocumentLayer ~0%, useSnapping 38%, useViewport 10%, useExtendTool 51%, useTrimTool 56%). `useFileUpload`'s remaining drag is the composable body (`uploadFile`/`uploadFiles` — needs `useApi` mock + happy-dom FormData); `useCommandEngine` (Registry is likely pure, and `execute()`/`output()`/`prompt()` are testable with a stub options object) are the next best candidates.
3. Ratchet backend 73 → 74 once more backend tests land.

### Iteration 5 (DONE) — useScale composable covered + thresholds ratcheted up

**Changed:**
- New unit test `frontend/composables/useScale.test.ts` (15 tests) covering the full `useScale` surface: default display format / ppi / null state, `setScale` feet+inches math (ppi = (96·drawing)/realWorldInches), `getScale` round-trip, `displayFormat`, `pixelsToInches` (scaled vs default 96), `inchesToFeet`, `formatMeasurement` precision, `formatFeetAndInches`, `formatScaledMeasurement` unit switch, `observeScale` (fires on remote userId, ignores own updates, ignores non-scale keys, cleanup unobserve), per-document `scale:{documentId}` key isolation, and `init()` reload across two instances sharing a `Y.Map`. `useScale.ts` was a 0% root-composable drag — now 95.83% stmts/lines, 100% branches.
- `frontend/package.json` `coverage` script thresholds ratcheted up: lines/stmts 59→**60**, branches 77→**78**, functions 78→**79** (all at-or-below new measured 61.57/61.57/78.05/79.12).

**Measured** (after adding useScale tests): All files 61.57% stmts/lines (was 59.85), 78.05% branches, 79.12% funcs. Suite 46 files / 457 tests (was 45/442).

**Verification:**
- `npm run coverage` exit 0 with new thresholds; `npm run typecheck` exit 0; `npm test` 457/457 pass.
- Negative check: `--coverage.thresholds.lines=62` → `ERROR: Coverage for lines (61.57%) does not meet global threshold (62%)` → non-zero. Gate enforces.

**Next:**
1. Push to CI: confirm `backend-test` (pcov+clover, threshold 73) is green on PHP 8.4 — local measured 73.66% on 8.5; 0.66pp headroom should absorb it.
2. Ratchet frontend further (lines/stmts 60 → 61) once more composables get tested — biggest drags remain root composables (useCursors/useFileUpload/useLayers/useMeasurements/usePDFRendering/useCommandEngine/useDocumentLayer ~0%, useSnapping 38%, useViewport 10%, useExtendTool 51%, useTrimTool 56%). `useScale` was the easiest pure-Yjs target; `useFileUpload` (validateFile/formatFileSize/getFileIcon are pure, upload path needs `useApi` mock) and `useCommandEngine` (Registry is likely pure) are the next best candidates.
3. Ratchet backend 73 → 74 once more backend tests land.

### Iteration 4 (DONE) — Frontend red-herrings cleaned + thresholds ratcheted up

**Changed:**
- New unit test `frontend/server/utils/session-id.test.ts` (4 tests) covering `generateSessionId` / `generateSessionIdWithPrefix` / `isValidSessionId` — the pure `session-id.ts` util was previously 0%. Now 100%.
- `frontend/vitest.config.mts` coverage `exclude`: added `server/routes/**` + `server/websocket/**` — Nitro glue (`defineEventHandler`/`defineWebSocketHandler`) is not unit-testable without a Nitro harness, same rationale as excluding components/`.vue`. The tested relay (`ws-server.js`) + `server/utils/**` stay in scope.
- `frontend/package.json` `coverage` script thresholds ratcheted up: lines/stmts 57→**59**, branches 76→**77**, functions 77→**78** (all at-or-below new measured 59.85/59.85/77.27/78.55).

**Measured** (after cleanup): All files 59.85% stmts/lines (was 57.46), 77.27% branches, 78.55% funcs. Suite 45 files / 442 tests (was 438).

**Verification:**
- `npm run coverage` exit 0; `npm run typecheck` exit 0; `npm test` 442/442 pass.
- Negative check: `--coverage.thresholds.lines=60` → `ERROR: Coverage for lines (59.85%) does not meet global threshold (60%)` → non-zero. Gate enforces.

**Next:**
1. Push to CI: confirm `backend-test` (pcov+clover, threshold 73) is green on PHP 8.4 — local measured 73.66% on 8.5; 0.66pp headroom should absorb it.
2. Ratchet frontend further (lines/stmts 59 → 60) once more composables get tested — biggest drags remain root composables (useCursors/useFileUpload/useLayers/useMeasurements/usePDFRendering/useScale/useCommandEngine/useDocumentLayer ~0%, useSnapping 38%, useViewport 10%, useExtendTool 51%, useTrimTool 56%).
3. Ratchet backend 73 → 74 once more backend tests land.

### Iteration 3 (DONE) — Backend coverage gate in CI (pcov + clover + threshold parse)

**Changed:**
- `.github/workflows/ci.yml` `backend-test` job: added `coverage: pcov` to `shivammathur/setup-php@v2`.
- Backend `Run Laravel tests` step now runs `php artisan test --coverage-clover=build/coverage.xml` (was plain `php artisan test`).
- New `Enforce backend coverage threshold` step: inline python3 heredoc parses the **project-level** `<metrics files="..." ...>` element from the clover XML (regex `<metrics files="[^"]+"[^>]*>`) and reads `statements`/`coveredstatements` → `pct = covered/statements*100`, exits 1 if `< 73.0`. Threshold 73 is at-or-below the measured 73.66% (344/467), so CI does NOT instantly fail — ratchets up from here.

**Verification:**
- Locally `php artisan test --coverage-clover=build/coverage.xml` → 48 passed; parse snippet reports `Backend coverage: 344/467 statements = 73.66% (threshold 73%)` → exit 0.
- Confirmed the gate ENFORCES: same snippet with threshold 74 → `FAIL: backend coverage 73.66% below threshold 74%` → exit 1.
- YAML validated (`yaml.safe_load`): jobs `test`/`backend-test`/`e2e`; backend-test steps now `Checkout → Setup PHP → Install dependencies → Run Laravel tests with coverage → Enforce backend coverage threshold`.
- `npm run typecheck` exit 0; `npm test` 438/438 pass; `php artisan test` 48 pass. `build/coverage.xml` is already gitignored.

**Next:**
1. Push to CI to confirm the pcov/clover run is green there (local is PHP 8.5, CI is 8.4 — coverage % could shift a hair; 0.66pp headroom should absorb it, but verify the `backend-test` check passes on the PR).
2. Ratchet frontend thresholds up (lines/stmts 57 → 58) once red-herring 0% files (server/routes, server/websocket, server/utils) are either tested or excluded from the include globs.
3. Ratchet backend threshold 73 → 74 once more backend tests land (each new covered statement raises the % ~0.2pp).

### Iteration 2 (DONE) — Frontend threshold gate enforced (CLI flags + CI)

**Changed:**
- `frontend/package.json` `coverage` script now passes threshold flags: `--coverage.thresholds.lines=57 --coverage.thresholds.statements=57 --coverage.thresholds.branches=76 --coverage.thresholds.functions=77` (at-or-below measured: 57.46/57.46/76.93/77.61). Thresholds live in CLI flags, NOT vitest.config — so `npm test` stays the fast green loop while `npm run coverage` is the gate.
- `.github/workflows/ci.yml` `test` job: `Test` step now runs `npm run coverage` (was `npm test`) — the `test` check (branch-protection required) now enforces the coverage thresholds on every PR/push to develop/master.

**Verification:** `npm run coverage` exit 0; confirmed the flags ARE enforced — `--coverage.thresholds.lines=58` exits 1 (57.46 < 58). `npm run typecheck` exit 0; `npm test` 438/438 pass.

**Next:**
1. CI backend gate: `coverage: pcov` in the `backend-test` (and `test`? it's frontend-only) setup-php + a clover-generate + parse step gating on project-level statements ≥ ~73 (use the project-level `<metrics files=...>` regex — the per-class sum is wrong).
2. Ratchet frontend thresholds up over subsequent iterations (start by raising lines/stmts 57 → 58 once red-herring 0% files like server/routes, server/websocket, server/utils are either tested or excluded from the include globs).

## Iteration 1 (DONE) — Measure-first pass: tooling installed, baselines captured

**Changed:**
- Installed `@vitest/coverage-v8@^2.1.9` (matches vitest ^2.1.9 major) in `frontend/`.
- Added `npm run coverage` script = `vitest run --coverage` (`frontend/package.json`).
- `frontend/vitest.config.mts`: added `test.coverage` block — provider `v8`, `include: ['composables/**/*.ts', 'utils/**/*.ts', 'server/**/*.{js,ts}']`, `exclude` for `*.test.ts`, `composables/**/__tests__/**`, `e2e/**`; reporters `['text', 'json-summary']`, `reportOnFailure: true`. NO thresholds yet (deliberate — measure first). `npm test` still plain `vitest run` (thresholds will go in the CLI script later so the fast loop stays green).
- `.gitignore`: ignored `build/coverage.xml` + `frontend/coverage/`.

**Measured frontend baseline** (`npm run coverage` → All files):
| Area | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| All files | 57.46 | 76.93 | 77.61 | 57.46 |
| composables (root) | 35.89 | 76.61 | 61.49 | 35.89 |
| composables/tools | 79.91 | 73.84 | 88.23 | 79.91 |
| server (ws-server.js) | 82.59 | 85.45 | 94.44 | 82.59 |
| utils (geometryUtils) | 88.50 | 82.45 | 96.87 | 88.50 |

Root-level composables drag the aggregate: useCursors/useFileUpload/useLayers/useMeasurements/usePDFRendering/useScale/useCommandEngine/useDocumentLayer are 0%. Server `routes/`, `websocket/[...].ts`, `utils/session-id.ts` are also 0% (Nitro glue, untested).

**Measured backend baseline** (`php artisan test --coverage-clover=build/coverage.xml` — pcov IS installed locally):
- Project-level clover `<metrics>` element: **statements 344/467 = 73.66%**, elements 372/526 = 70.72%. PHPUnit text report agrees (Lines 73.66% 344/467).
- **GOTCHA (critical):** the clover XML has BOTH per-class `<metrics>` elements AND a project-level `<metrics files=... loc=... classes=...>` aggregate. Summing per-class statements gives 2433 (WRONG → 42.42%). The gate MUST regex the project-level element (it has `files=`/`loc=`/`classes=` attrs). Validated parse snippet (python3): `re.search(r'<metrics files="[^"]+"[^>]*>', txt)` then read `statements`/`coveredstatements` → 73.66%.

**Verification:** `npm run coverage` exit 0; `npm run typecheck` exit 0; `npm test` 438/438 pass; `php artisan test` 48 pass.

**Next:**
1. Add frontend thresholds via CLI flags in the `coverage` script (lines/stmts 57, branch 76, funcs 77 — at-or-below measured so CI doesn't instantly fail).
2. CI `test` job: switch `npm test` → `npm run coverage` (or add a coverage step) as the gate.
3. CI backend: `coverage: pcov` in setup-php + a clover-generate + parse step gating on project-level statements ≥ ~73.
4. Ratchet thresholds up over subsequent iterations.

## Context (from prior code review — read before changing code)

### What exists today
- Frontend: vitest ^2.1.9 with NO coverage provider (`@vitest/coverage-v8` is NOT installed — `npx vitest run --coverage` fails with MISSING DEPENDENCY). 438 unit tests / 44 files (tools, composables, utils/geometryUtils, server/ws-server). `.vue` components have no unit tests (covered by the 67-test playwright suite).
- `vitest.config.mts`: `environment: 'happy-dom'`, `include: ['**/*.test.ts']`, setupFiles `test/setup.ts`, alias `~`. No `coverage` key.
- Backend: `php artisan test` (48 tests / 103 assertions) via phpunit.xml (APP_KEY + SQLite :memory:, `<source><include><directory>app</directory>`). No coverage driver configured; CI uses `shivammathur/setup-php@v2` WITHOUT `coverage:` (so no pcov/xdebug → `--coverage` would error).
- CI: `.github/workflows/ci.yml` has `test` (typecheck + `npm test`), `backend-test` (`php artisan test`), and now `e2e` (added in #68, informational, not required). Branch protection requires `test` + `backend-test`.

### What "measuring first" means
- Frontend: `npm i -D @vitest/coverage-v8@^2.1.9` (must match vitest major — v2). Then `npx vitest run --coverage` to see current % by area (composables vs tools vs server vs utils). The threshold you set must be BELOW or AT current numbers or CI instantly fails. Expect the aggregate line % to be low-ish because many top-level composables (useCursors, useFileUpload, useLayers, useMeasurements, usePDFRendering, useScale, useCommandEngine/Registry, useToast, useDocumentLayer) have NO direct tests, and the 25 tool files + ws-server + geometryUtils + the tested composables pull the average up. If a single overall threshold is impossible (e.g. one big untested file drags everything), consider per-directory `thresholds` or just set a realistic global line % and note the gap.
- Backend: enable pcov (`coverage: pcov` in setup-php) then `php artisan test --coverage-clover=build/clover.xml` locally to measure. Laravel's default test command shows a table; `--coverage-clover` writes machine-readable XML for the gate.

### The gate mechanics (CI)
- Frontend gate: simplest is vitest's native `coverage.thresholds` (lines/statements/functions/branches) — `npx vitest run --coverage` fails (exit non-zero) when below threshold, so the CI `test` job's existing `npm test` can be replaced by `npm run coverage` (script = `vitest run --coverage`) OR add a separate step. Keep typecheck separate. NOTE: coverage run is slower than a plain run — fine.
- Backend gate: PHPUnit has NO native min-coverage threshold. Plan: `php artisan test --coverage-clover=build/coverage.xml` then a tiny parse step that reads the `statements`/`lines` `coveredpercent` from the clover XML (`<metrics statements="..." coveredstatements="..." .../>`) and exits 1 if below threshold. This can be a small shell/awk/python snippet inline in the workflow, or a committed PHP script. Prefer inline + documented (no new composer dep). Local validation: run the same command + parse manually.
- IMPORTANT: coverage percentages are only meaningful/stable if the SAME command is used in CI and locally (phpunit default code coverage report vs clover can differ). Gate on the clover numbers consistently.

### Gotchas
- `@vitest/coverage-v8` MUST match vitest's major (^2.1.9 → @vitest/coverage-v8@^2). Installing a v3 would break.
- Coverage excludes: `include` globs must cover the real source and EXCLUDE `*.test.ts`, `e2e/`, `test/`, `*.spec.ts`. Vitest defaults to including `**/*` from root — configure explicitly so node_modules + e2e + tests aren't counted.
- `.vue` files: coverage-v8 instruments TS/Vue via the vite plugin; the 0-tested SFCs will show as 0% and drag the aggregate. Decide up front whether to include components (honest but low %) or restrict `include` to the TS logic files (composables/utils/server) — the backlog text says "include composables/utils/server, exclude tests", i.e. components NOT in the first-pass scope. Keep that scope.
- pcov needs `php artisan test` to be run with the extension active; `shivammathur/setup-php` `coverage: pcov` does this. Locally, pcov may not be installed — `--coverage` would error. Document that local backend coverage needs `extension=pcov` (or use the CI container). Do NOT require local pcov for the loop gate (gate is frontend typecheck + npm test).
- The CI `test` job currently calls `npm test`. If you add coverage thresholds to vitest.config, `npm test` will ALSO enforce them (vitest enforces thresholds on any run once configured) — so `npm test` may start failing if below threshold. Decide: thresholds in config (both `npm test` and coverage enforce) vs thresholds only via CLI flags in the `coverage` script (only `npm run coverage` enforces). The latter is gentler — `npm test` stays the fast green loop, CI runs `npm run coverage` as the gate. Recommend CLI-flag thresholds in the script unless the coverage run is also the default.
- Do not touch the e2e job or playwright config.

### Verification
- Loop gate: `cd frontend && npm run typecheck && npm test` (must stay green — if thresholds are in the config, this enforces them; keep them realistic).
- Backend: `php artisan test` must stay green (48).
- Frontend coverage: `cd frontend && npm run coverage` → exit 0 + report printed, thresholds ≤ measured.
- Backend coverage: run with pcov locally if available (`php -m | grep pcov`); if not, verify the clover gate command runs in CI only — validate the parse snippet against a locally generated clover.xml (generate with xdebug if pcov absent) or dry-run the awk/python against a known XML.
