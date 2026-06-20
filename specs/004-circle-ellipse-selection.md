# Spec 004: Circle & ellipse selection in modify tools

## Status: Draft

## Overview
Rotate/Scale/Mirror/Offset/Trim/Extend/Fillet **cannot select circles or ellipses**. `findElementAtPosition` iterates `getElementGeometry(el).segments`, but circles/ellipses return a `circle`/ellipse def with **no `segments`**, so they are skipped entirely (the known gap noted in the rotate test plan).

## Context
- `getElementGeometry` (`utils/geometryUtils.ts`) returns `{ circle: { center, radius } }` for circles (and a sampled-segment or radius form for ellipse) — no `segments` array.
- `findElementAtPosition` (duplicated in `useRotateTool`, `useScaleTool`, `useMirrorTool`, `useOffsetTool`, `useTrimTool`, `useExtendTool`, `useFilletTool`) only tests `geo.segments`.
- Selection success is observable via the HUD selection count (f7337ee) even before Spec 001's highlight lands.

## Requirements
- `findElementAtPosition` selects a circle when the click lands **on or inside** the circle (within the existing `8 / zoom` threshold of its perimeter, or inside its area).
- Same handling for ellipses.
- The fix applies to every modify tool that shares the `findElementAtPosition` pattern (rotate, scale, mirror, offset, trim, extend, fillet).

## Acceptance Criteria
- [ ] Draw a circle, activate Rotate (`RO`), click the circle → it is selected (HUD count goes `0 → 1`).
- [ ] Rotating a circle by ~45° produces a correct rotated copy; the original is preserved.
- [ ] Scaling a circle produces a correctly larger/smaller copy.
- [ ] Mirror can select and mirror a circle across an axis.
- [ ] An ellipse can likewise be selected by rotate/scale/mirror.
- [ ] Rectangles, lines, and polylines still select (no regression).
- [ ] `npm run typecheck` passes.

## Out of Scope
- Ellipse rotation fidelity beyond a faithful rotated outline. Other element types (arcs, strokes).
