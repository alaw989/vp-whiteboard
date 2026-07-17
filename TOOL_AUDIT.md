# Tool Audit Log

**Date:** July 16, 2026
**Scope:** All 24 drawing/modify/annotate/measure/nav tools
**Standard:** AutoCAD behavior as industry benchmark

## Legend

✓ = Works correctly / Fixed
⚠️ = Minor issue / gap from CAD standard
✗ = Broken / critical bug
— = Not applicable

---

## Fixed This Session (July 13–16)

| Tool | Fix |
|------|-----|
| Persistence | Auto-save `.catch()`, WS gate removed, `exportState()` in `onUnmounted`, Yjs dedup |
| CORS / Upload | `/api/files/{id}/serve` route, `APP_URL=:8002`, storage symlink |
| WS relay | Skip auth for local dev (`HOST=0.0.0.0`), `LARAVEL_URL=:8002` |
| Share links | `GET /whiteboards/{id}` moved out of `auth:sanctum` group |
| Color wheel | Canvas-based hue/saturation wheel replacing 9-swatch grid |
| Arrow | Added zero-length guard (was creating elements on click) |
| Rectangle | Added `constrainPoint` call — now supports Ortho/Polar/Grid |
| Circle | Added `constrainPoint` call — now supports Ortho/Polar/Grid |
| Ellipse | Added `constrainPoint` call — now supports Ortho/Polar/Grid |
| Rotate | **P0**: now deletes originals after creating rotated copies |
| Scale | **P0**: now deletes originals after creating scaled copies |
| Trim | **Critical**: `emitElementUpdate` never reached Yjs doc |
| Fillet | `emitElementUpdate` fix + OSnap |
| Extend | `emitElementUpdate` fix + OSnap |
| Offset | Added OSnap |
| Dimension | Added zero-length guard, feet unit support |
| Measure Distance | Added zero-length guard + state tracking |
| Arc | Added OSnap on all 3 clicks, zero-length guard |
| Polyline | Added OSnap on every vertex |
| Revision Cloud | Added OSnap on every vertex |
| Scale | Added OSnap for basepoint selection |
| Rotate | Added OSnap for basepoint selection |
| Mirror | Added OSnap for both axis points |
| Select tool | Multi-select drag — all selected elements move together |
| Stamp OSnap | Added `findSnapPoint` for precision placement |
| Text Annotation OSnap | Added `findSnapPoint` to leader line start and end |
| Arc collinear guard | Keep first 2 points on collinear rejection, user retries 3rd |
| Measure Area types | Added arc and stroke area calculation; measureArea returns boolean; silent failures now show error toast |
| Error boundaries | `try/catch` in tool dispatch layer for all 25 tools |
| TS errors | 0 type errors (fixed 12 via `useApi` composable) |
| Deploy pipeline | `deploy.yml` rewritten for Laravel+Nuxt stack |
| Double-event dispatch | Removed `@mousedown`/`@mousemove`/`@mouseup` (duplicate with pointer events) |
| Document layer filter | Fixed `.name` → `.name()` in eraser + measure-area |
| Eraser drag-to-erase | Added missing `ctx.isDrawing.value = true` |
| Measurement preview | Labels now respect `measurementUnit` (feet) |
| Selection on shift-deselect | `selectedId` picks first remaining element |
| Share token validator | PHP + TypeScript regex now accept full alphanumeric |

---

## Remaining Gaps by Priority

### P1 — No remaining OSnap gaps

### P2 — No remaining feature gaps

### P3 — Polish
| Issue | Details |
|-------|---------|
| Scale tool sensitivity | Extreme scale jump when clicking near centroid |

---

## Automation

Run the continuous quality scanner:

```bash
./scripts/tool-loop.sh 25
```

Each iteration scans tools/ for the most impactful fixable issue, implements it, verifies with the full test suite, and commits. The loop terminates when no fixable issues remain.

---

## Per-Tool Status

### PHASE 1: DRAW

| Tool | Status | Key Gaps |
|------|--------|----------|
| Pen (P) | ✓ | Freehand — pressure sensitivity, stroke broadcast |
| Highlighter (B) | ✓ | Translucent freehand — same as pen with tool tag |
| Line (L) | ✓ | Zero-length guard ✓, OSnap ✓, Constraint ✓ |
| Arrow (A) | ✓ | Zero-length guard ✓, Constraint ✓, OSnap ✓ |
| Rectangle (R) | ✓ | Min size ✓, Constraint ✓, OSnap ✓ |
| Circle (C) | ✓ | Min radius ✓, Constraint ✓, OSnap ✓ |
| Ellipse (E) | ✓ | Min size ✓, Constraint ✓, OSnap ✓ |
| Polyline (PL) | ✓ | Multi-click, Constraint ✓, OSnap ✓ |
| Arc (ARC) | ✓ | Collinear guard ✓ |
| Revision Cloud (RC) | ✓ | Multi-click, Constraint ✓, OSnap ✓ |

### PHASE 2: MODIFY

| Tool | Status | Key Gaps |
|------|--------|----------|
| Offset (OFF) | ✓ | Only line/polyline/rect |
| Mirror (MI) | ✓ | Type coverage limited |
| Rotate (RO) | ✓ | — |
| Scale (SC) | ⚠️ | Extreme sensitivity near centroid (spec 05) |
| Trim (TR) | ✓ | Only line/polyline |
| Extend (EX) | ✓ | Only line/polyline |
| Fillet (F) | ✓ | Only lines |
| Eraser (X) | ✓ | — |

### PHASE 3: ANNOTATE

| Tool | Status | Key Gaps |
|------|--------|----------|
| Text Annotation (T) | ✓ | OSnap ✓ |
| Dimension (DIM) | ✓ | — |
| Stamp (S) | ✓ | OSnap ✓ |

### PHASE 4: MEASURE

| Tool | Status | Key Gaps |
|------|--------|----------|
| Measure Distance (M) | ✓ | — |
| Measure Area (Shift+M) | ✓ | Arc and stroke added |

### PHASE 5: NAV

| Tool | Status | Key Gaps |
|------|--------|----------|
| Select (V) | ✓ | Multi-select drag ✓ |
| Pan (H) | ✓ | Cursor change ✓ |
