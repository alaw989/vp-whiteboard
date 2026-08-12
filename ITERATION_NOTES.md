# Iteration Notes

## Goal
Vector/SVG export (backlog #1): add a vector layer to PDF export so shapes stay crisp at any zoom, alongside the existing raster PNG. In frontend/composables/useExport.ts, PDF export currently rasterizes the whole stage via stage.toDataURL() (2x pixelRatio) and embeds a single PNG — sharp on screen but blurred when the PDF is zoomed or printed. Emit shapes from the element data (CanvasElement.data in frontend/types: stroke/line/rectangle/circle/ellipse/polyline/arc/fillet-arc/dimension/arrow/stamp/text etc.) as vector graphics on top of the raster image — e.g. draw each element with jsPDF vector path/text primitives so geometry stays crisp. Keep the raster PNG as the background so image/document layers (not vectorizable) still render. Preserve the ExportOptions/ExportFormat API ('png'|'pdf'), filename generation, progress/toast/error behavior, and the e2e contract (frontend/e2e/export.spec.ts asserts %PDF magic + non-trivial size + no taint toast). Add unit tests for a new pure vector-drawing module (element → jsPDF draw commands; stroke point→path smoothing, line, rectangle, circle, ellipse, polyline, arc, fillet, dimension text; unknown-type fallback). Keep npm run typecheck + npm test green (755) + frontend coverage gate green (82/82/84.5/86.5) and php artisan test green (77) — backend untouched. Do NOT break e2e: keep export-format-png/pdf data-testids, the download still fires, %PDF magic still present. No server/routes/* Nitro routes.

## Context

### What exists today

- **Export path** (`frontend/composables/useExport.ts`): `exportAsPDF(stage)` calls `stage.toDataURL({ pixelRatio: 2 })` → embeds the single raster PNG via `pdf.addImage(dataUrl, 'PNG', 0, 0, width, height)`. `exportAsPNG` is the same raster at 1x. Both live behind the export dialog and `generateFilename()` (sanitized slug + ISO timestamp). `progress` (0→25→75→90→100), `error`/`toastError` (tainted-image special case) are asserted in `frontend/composables/useExport.test.ts`.
- **Element model** (`frontend/types/index.ts`): `CanvasElement` = discriminated union on `type` ('stroke' | 'line' | 'rectangle' | 'circle' | 'ellipse' | 'image' | 'text' | 'arrow' | 'stamp' | 'text-annotation' | 'measurement-distance' | 'measurement-area' | 'polyline' | 'arc' | 'fillet-arc' | 'dimension' | 'revision-cloud') with per-type `data` (StrokeElement.points:[x,y,pressure][], RectangleElement.x/y/width/height/stroke/strokeWidth/fill?, CircleElement.cx/cy/radius, EllipseElement radiusX/radiusY/rotation, PolylineElement points+closed, ArcElement start/through/end, FilletArcElement center/radius/startAngle/endAngle, DimensionElement start/end/offset/pixelsPerInch/unit/precision/style/value, StampElement rect+text+colors, etc.).
- **Stage access**: `useExport()` receives the Konva `Stage` from the whiteboard page; the element array is available as `stage` children / via `canvasInstance.elements` on the page. The pure vector module should take **element data** (not Konva nodes) so it is unit-testable without Konva — the page/composable maps `elements` → module.
- **e2e contract** (`frontend/e2e/export.spec.ts`, 3 tests): empty canvas + uploaded-image layer + drawn pen stroke all assert: `%PDF` magic, size > 100, PNG magic for png, and NO cross-origin taint toast. The PDF must remain a valid PDF regardless of how the vector layer is added.
- **jsPDF**: already a dependency (imported in useExport.ts). It supports vector primitives (line/rect/circle/ellipse/path/polyline/text) — no new dependency expected. Note jsPDF `circle()`/`ellipse()` exist; arcs can be done via `path()` or `ellipse` with angles.

### Design direction

- New pure module e.g. `frontend/utils/vectorExport.ts` exporting `drawElementsToPdf(pdf, elements, width, height)` (and/or per-type draw fns). Zero Konva imports → trivially testable.
- In `exportAsPDF`, after `addImage(raster)`, call the vector layer on top. Image/text-annotation/document layers stay raster-only (already in the PNG); vectorize the geometry types.
- Keep progress steps and error/toast behavior identical; tainted-canvas still caught by the existing try/catch.

### Verification

- `npm run typecheck` + `npm test` (755) + `npm run coverage` (gates 82/82/84.5/86.5) in `frontend/`.
- `php artisan test` (77) at repo root — backend untouched.
- e2e after loop: `npm run test:e2e` (Nuxt `TEST=1`, clean stack).

### Gotchas

- Loop re-seeds `ITERATION_NOTES.md` if the `--goal` arg doesn't byte-match the Goal's first line — they are identical here.
- No `server/routes/*` changes — if any helper is added under `server/` it needs explicit imports (rate-limit loop lesson).
- Do NOT change `ExportFormat`/`ExportOptions` shape, `generateFilename`, or the dialog testids (`export-format-pdf`, `export-submit`).
- jsPDF coordinate system: unit 'px', origin top-left (same as Konva) — no scale flip needed.

## State

### Iteration 4 (Aug 12, 2026)

**Changed — closed the last coverage gap: `vectorExport.ts` is now 100/100/100.**
- **New `frontend/utils/vectorExport.degenerate.test.ts`** (1 test): `vi.mock('perfect-freehand')` to return `[]`, then asserts `drawElementToPdf` skips a stroke whose perfect-freehand outline has < 2 points (the `outline.length < 2` guard on line 171 — unreachable with real getStroke on ≥2 points, so it needs the module mock). Asserts `moveTo`/`lineTo`/`fillStroke` are all untouched. Separate file so the real-`getStroke` behavior in `vectorExport.test.ts` (63 tests) and `vectorExport.smoke.test.ts` is unaffected.

**Verification:** `npm run typecheck` clean; `npm test` 807/807 (was 806; +1); `npm run coverage` exit 0 — `vectorExport.ts` **100 stmts / 100 branches / 100 funcs** (previously 99.11 branches), All files 85.46 lines / 85.92 branches / 87.97 funcs ≥ gates 82/82/84.5/86.5. Backend untouched.

**Next:** The module is complete and fully covered. Final gate remains the post-loop e2e run (`npm run test:e2e` on a clean stack with Nuxt `TEST=1`) to confirm `frontend/e2e/export.spec.ts` (empty + image-layer + pen-stroke cases) still passes with the vector layer drawing real content on top of the raster.

**Gotchas:**
- The `outline.length < 2` guard can only be exercised by mocking `perfect-freehand` (real `getStroke` returns ≥2 points on ≥2 input points). Put the mock in its own test file with `vi.mock` BEFORE the `import { drawElementToPdf }` so hoisting applies cleanly; keep the mock's `getStroke` signature `(): number[][]` typed so typecheck stays green.
- Per-element try/catch in `drawElementsToPdf` means any real renderer throw is silently skipped — a malformed stroke never aborts the export (why the pre-fix `setGState` bug was invisible to the e2e `%PDF` magic + size assertions).

### Iteration 3 (Aug 12, 2026)

**Changed — fixed a real bug: strokes were silently dropped from the vector PDF layer.**
- **Root cause:** `drawStroke` called `pdf.setGState({ opacity: ... })` with a **plain object**. jsPDF 4.1.0's `setGState` requires a `GState` instance (`t.equals is not a function` throws at runtime). Every pen/highlighter stroke threw inside the per-element try/catch in `drawElementsToPdf` and was silently skipped — the vector layer emitted NOTHING for strokes, so exported PDFs fell back to the raster for pen marks (still a valid PDF, which is why the e2e `%PDF` magic + size assertions and the original smoke test stayed green).
- **Fix (`frontend/utils/vectorExport.ts`):** `import { GState } from 'jspdf'`; `drawStroke` now calls `pdf.setGState(new GState({ opacity: tool === 'highlighter' ? 0.5 : 1 }))` and resets with `new GState({ opacity: 1 })`.
- **Regression test (`frontend/utils/vectorExport.smoke.test.ts`):** new test "actually renders a pen and highlighter stroke into the PDF content stream" — draws both with a REAL jsPDF, decompresses the FlateDecode content streams (`inflateSync`), and asserts: a fill+stroke path op (`\bB\b`) is emitted, the ExtGState dict contains `/ca 0.5`, and the content stream references it via a `gs` operator. **Verified it fails against the old code** (reverted call → test red) and passes with the fix. Also added `pdfRawText`/`pdfStreamText` helpers (raw output for object dicts; zlib-decompressed streams for operators).
- **Tests updated:** the two `setGState` mock assertions in `vectorExport.test.ts` now use `expect.objectContaining({ opacity: ... })` since the arg is a `GState` instance (which carries extra `id`/`objectNumber` fields).

**Verification:** `npm run typecheck` clean; `npm test` 806/806 (was 805; +1 smoke test); `npm run coverage` exit 0 (All files 85.46 lines / 85.86 branches / 87.97 funcs ≥ gates 82/82/84.5/86.5); `vectorExport.ts` still 100 stmts / 99.11 branches / 100 funcs. `php artisan test` 77 passed — backend untouched.

**Next:** The only remaining uncovered line is `outline.length < 2` (line 171, unreachable with real perfect-freehand on ≥2 points). Final gate: run `npm run test:e2e` on a clean stack (Nuxt `TEST=1`) to confirm `frontend/e2e/export.spec.ts` still passes — the vector layer now actually draws strokes, so the pen-stroke case produces a PDF with both raster + vector content.

**Gotchas:**
- jsPDF 4.1.0 `setGState` needs `new GState({...})`, NOT a plain object — a plain object throws at runtime and the element is silently skipped (masked by `drawElementsToPdf`'s per-element try/catch). The old smoke test only asserted `%PDF` magic + size, so it couldn't catch missing strokes.
- jsPDF maps `GState({ opacity })` → `/ca` (fill+stroke alpha) in an ExtGState object dict and references it with a `gs` operator in the content stream — assert `/ca 0.5` against raw output and `gs` against the DECOMPRESSED stream (`compress: true` FlateDecodes content).
- jsPDF emits `B` for `fillStroke()` (what strokes use), not `f`.

### Iteration 2 (Aug 12, 2026)

**Changed:**
- **`frontend/utils/vectorExport.test.ts`** +17 tests (46 → 63 in that file): added branch-coverage tests for the previously-uncovered paths — rotated+filled ellipse (bezier `fillStroke` path), unrotated+filled ellipse (native `FD`), fillet-arc shortest-sweep wrap (both directions + zero-sweep no-op), arrow multi-segment shaft / degenerate single-point skip / zero pointer-length defaults, revision-cloud closed + open, dimension zero-length line / negative offset / feet unit / cached value / label angle wrap (>90° and <-90°), measurement-distance feet label, and single-point polyline (path guard still strokes).

**Verification:** vectorExport.ts coverage jumped from 91.7 stmts / 79.38 branches / 93.1 funcs → **100 / 99.11 / 100** (only `outline.length < 2` on line 170 remains, unreachable with real perfect-freehand on ≥2 points). `npm run typecheck` clean; `npm test` 805/805 (was 787; +18); `npm run coverage` green: All files 85.46 lines / 85.86 branches / 87.97 funcs ≥ gates 82/82/84.5/86.5. Backend untouched.

**Next:** Run the full e2e suite on a clean stack (`npm run test:e2e`, Nuxt `TEST=1`) to confirm `frontend/e2e/export.spec.ts` (empty + image-layer + pen-stroke cases) still passes — the vector layer only adds drawing commands after `addImage`. That is the final gate for the vector/SVG export goal.

**Gotchas:**
- jsPDF 4.1.0: `polyline()` and `context2d.ellipse` DON'T exist (only `context2d.arc`); use `moveTo/lineTo/curveTo` + manual bezier for rotated ellipses/arcs. `ellipse(x,y,rx,ry,style)` has no rotation arg.
- jsPDF `setGState({opacity})` works for the highlighter translucency; `text(text,x,y,{baseline:'middle'})` is valid.
- The Konva stroke is a filled perfect-freehand outline — the vector layer must reuse `getStroke`, not just connect points, or strokes look thin/wrong next to the raster.
- Keep the `drawElementsToPdf` call gated on `elements.length > 0` so the existing exportAsPDF tests (no elements arg) stay behavior-identical.

### Iteration 1 (Aug 12, 2026)

**Changed:**
- **New `frontend/utils/vectorExport.ts`** — pure, Konva-free module (`drawElementsToPdf(pdf, elements)` + `drawElementToPdf(pdf, element)` + exported `arcToCubics`/`ellipseToCubics`). Draws every vectorizable element type as jsPDF primitives on top of the raster: line, rectangle (neg-width normalized, S/FD), circle (S/FD), ellipse (native when unrotated; bezier path when rotated), polyline (closed via `close()`), arc (via existing `arcToPolylinePoints`), fillet-arc (shortest-sweep bezier matching the canvas), revision-cloud (via existing `revisionCloudPath`), arrow (shaft + filled `triangle` head), dimension (dim/extension lines + ticks + rotated `courier` text), stamp (`roundedRect` FD + centered bold text), text, text-annotation (leader line + text), measurement-distance (line + 2 anchor circles + label). Strokes use `perfect-freehand`'s `getStroke` (same as the canvas) filled as a polygon; highlighter draws at `setGState({opacity:0.5})`. `image`/`measurement-area`/unknown types fall through (already in the raster). Malformed elements are skipped via per-element try/catch so one bad element can't abort the export.
- **`frontend/composables/useExport.ts`** — `exportAsPDF(stage, options, elements = [])` gains an optional 3rd `elements` param; after `pdf.addImage` it calls `drawElementsToPdf` when `elements.length > 0`. Progress/toast/error/filename behavior unchanged. `ExportFormat`/`ExportOptions` untouched.
- **`frontend/pages/whiteboard/[id].vue`** — `confirmExport` passes `elements.value` to `exportAsPDF`.
- **Tests:** `frontend/utils/vectorExport.test.ts` (29 tests, mock jsPDF) covering all types + unknown fallback + malformed-skip + bezier math; `frontend/utils/vectorExport.smoke.test.ts` (1 test) proves a real jsPDF instance + vector layer still yields `%PDF` magic with size > 100 (e2e contract); `useExport.test.ts` +2 (vector layer called with pdf+elements; skipped when no elements).

**Verification:** `npm run typecheck` clean; `npm test` 787/787 (was 755; +29 vector, +1 smoke, +2 useExport); `npm run coverage` exit 0 (All files 85.01 lines / 84.66 branches / 87.62 funcs ≥ gates). Backend untouched (still 77). e2e `%PDF` magic contract verified via the real-jsPDF smoke test; full `npm run test:e2e` still needs the clean Nuxt `TEST=1` stack per the loop's post-run verification.

**Next:** Run the full e2e suite on a clean stack to confirm `frontend/e2e/export.spec.ts` (empty + image-layer + pen-stroke cases) still passes — the vector layer only adds drawing commands after `addImage`, so the PDF stays valid, but e2e is the final gate. Optionally bump vectorExport branch coverage (79.6) toward the overall gate.

**Gotchas:**
- jsPDF 4.1.0: `polyline()` and `context2d.ellipse` DON'T exist (only `context2d.arc`); use `moveTo/lineTo/curveTo` + manual bezier for rotated ellipses/arcs. `ellipse(x,y,rx,ry,style)` has no rotation arg.
- jsPDF `setGState({opacity})` works for the highlighter translucency; `text(text,x,y,{baseline:'middle'})` is valid.
- The Konva stroke is a filled perfect-freehand outline — the vector layer must reuse `getStroke`, not just connect points, or strokes look thin/wrong next to the raster.
- Keep the `drawElementsToPdf` call gated on `elements.length > 0` so the existing exportAsPDF tests (no elements arg) stay behavior-identical.
