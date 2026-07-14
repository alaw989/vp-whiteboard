# Tool Audit Log

**Date:** July 13, 2026
**Scope:** All 24 drawing/modify/annotate/measure/nav tools
**Standard:** AutoCAD behavior as industry benchmark

## Legend

✓ = Works correctly / Fixed
⚠️ = Minor issue / gap from CAD standard
✗ = Broken / critical bug
— = Not applicable

---

## Fixed This Session

| Tool | Fix |
|------|-----|
| Arrow | Added zero-length guard (was creating elements on click) |
| Rectangle | Added `constrainPoint` call — now supports Ortho/Polar/Grid |
| Circle | Added `constrainPoint` call — now supports Ortho/Polar/Grid |
| Ellipse | Added `constrainPoint` call — now supports Ortho/Polar/Grid |
| Rotate | **P0**: now deletes originals after creating rotated copies |
| Scale | **P0**: now deletes originals after creating scaled copies |
| Trim | **Critical**: `emitElementUpdate` never reached Yjs doc — added `@element-update` handler + OSnap + multi-element fallback |
| Fillet | `emitElementUpdate` fix + OSnap |
| Extend | `emitElementUpdate` fix + OSnap |
| Offset | Added OSnap |
| Dimension | Added zero-length guard |
| Measure Distance | Added zero-length guard + state tracking |
| Arc | Added OSnap on all 3 clicks, zero-length guard |
| Polyline | Added OSnap on every vertex |
| Revision Cloud | Added OSnap on every vertex |
| Scale | Added OSnap for basepoint selection |
| Rotate | Added OSnap for basepoint selection |
| Mirror | Added OSnap for both axis points |
| Share links | Moved `GET /api/whiteboards/{id}` out of auth group |

---

## Remaining Gaps by Priority

### P1 — Missing OSnap (lower priority, element-based selection)
| Tool | Reason |
|------|--------|
| Stamp | Uses click-to-place, OSnap would help precision |
| Text Annotation | Leader line start/end would benefit from OSnap |
| Eraser | Uses Konva hit-testing, N/A for OSnap |

### P2 — Feature Gaps
| Issue | Details |
|-------|---------|
| Select tool | No multi-select (Shift+click), no drag-select, no move/transform |
| Units toggle | Dimension, Measure Distance, Measure Area hardcoded to inches |
| Arc collinear check | 3 collinear points create degenerate arc — no guard |
| Measure Area types | Only rectangle/circle/ellipse — missing polyline, arc, stroke |

### P3 — Polish
| Issue | Details |
|-------|---------|
| Error handling | No try/catch on any tool — geometry errors propagate unhandled |
| CAD parity gaps | See per-tool notes below |

---

## Per-Tool Status

### PHASE 1: DRAW

| Tool | Status | Key Gaps |
|------|--------|----------|
| Pen (P) | ✓ | Freehand — pressure sensitivity, stroke broadcast |
| Highlighter (B) | ✓ | Translucent freehand — same as pen with tool tag |
| Line (L) | ✓ | Zero-length guard ✓, OSnap ✓, Constraint ✓ |
| Arrow (A) | ✓ | Zero-length guard **FIXED**, Constraint ✓, OSnap ✓ |
| Rectangle (R) | ✓ | Min size ✓, Constraint **FIXED**, OSnap ✓ |
| Circle (C) | ✓ | Min radius ✓, Constraint **FIXED**, OSnap ✓ |
| Ellipse (E) | ✓ | Min size ✓, Constraint **FIXED**, OSnap ✓ |
| Polyline (PL) | ✓ | Multi-click, Constraint ✓, OSnap **FIXED**, no OSnap during drawing |
| Arc (ARC) | ✓ | 3-click, OSnap **FIXED**, zero-length **FIXED**, no collinear check |
| Revision Cloud (RC) | ✓ | Multi-click, Constraint ✓, OSnap **FIXED** |

### PHASE 2: MODIFY

| Tool | Status | Key Gaps |
|------|--------|----------|
| Offset (OFF) | ✓ | **element-update FIXED**, OSnap added, only line/polyline/rect |
| Mirror (MI) | ✓ | OSnap **FIXED**, type coverage limited |
| Rotate (RO) | ✓ | OSnap **FIXED**, **P0 duplicate bug FIXED** |
| Scale (SC) | ✓ | OSnap **FIXED**, **P0 duplicate bug FIXED** |
| Trim (TR) | ✓ | **element-update FIXED**, OSnap added, only line/polyline |
| Extend (EX) | ✓ | **element-update FIXED**, OSnap added, only line/polyline |
| Fillet (F) | ✓ | **element-update FIXED**, OSnap added, only lines |
| Eraser (X) | ✓ | Click/drag delete, filters document layers |

### PHASE 3: ANNOTATE

| Tool | Status | Key Gaps |
|------|--------|----------|
| Text Annotation (T) | ✓ | Empty text guard ✓, no font/color selection |
| Dimension (DIM) | ✓ | Zero-length **FIXED**, OSnap ✓, hardcoded inches |
| Stamp (S) | ✓ | 4 types, no custom text, no rotation |

### PHASE 4: MEASURE

| Tool | Status | Key Gaps |
|------|--------|----------|
| Measure Distance (M) | ✓ | Zero-length **FIXED**, OSnap ✓, hardcoded inches |
| Measure Area (Shift+M) | ✓ | Only rect/circle/ellipse |

### PHASE 5: NAV

| Tool | Status | Key Gaps |
|------|--------|----------|
| Select (V) | ⚠️ | No multi-select, no drag-select, no move |
| Pan (H) | ✓ | Cursor change ✓ |
