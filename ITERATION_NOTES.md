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
