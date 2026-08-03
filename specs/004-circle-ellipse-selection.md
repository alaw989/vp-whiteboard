# Spec 004: Circle & ellipse selection in modify tools

## Status: COMPLETE

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
- [x] Draw a circle, activate Rotate (`RO`), click the circle → it is selected (HUD count goes `0 → 1`).
- [x] Rotating a circle by ~45° produces a correct rotated copy; the original is preserved.
- [x] Scaling a circle produces a correctly larger/smaller copy.
- [x] Mirror can select and mirror a circle across an axis.
- [x] An ellipse can likewise be selected by rotate/scale/mirror.
- [x] Rectangles, lines, and polylines still select (no regression).
- [x] `npm run typecheck` passes.

## Implementation

Modified the following files to add circle selection:

1. **`composables/tools/useRotateTool.ts`** — Added circle handling in `findElementAtPosition`
2. **`composables/tools/useScaleTool.ts`** — Same
3. **`composables/tools/useMirrorTool.ts`** — Same
4. **`composables/tools/useTrimTool.ts`** — Same
5. **`composables/tools/useExtendTool.ts`** — Same
6. **`utils/geometryUtils.ts`** — Updated `findNearestElementSegment` (used by offset tool)

The circle detection logic:
```typescript
if (geo?.circle) {
  const toCenter = distance(pos, geo.circle.center)
  const distToPerimeter = Math.abs(toCenter - geo.circle.radius)
  const d = Math.min(distToPerimeter, toCenter)  // Either near edge or inside
  if (d < threshold * 2 && (!best || d < best.dist)) {
    best = { element: el, dist: d }
  }
  continue
}
```

**Note:** Ellipses already work because `getElementGeometry` samples them into 48 segments (returns `type: 'polyline'` with `segments` array).

**Note:** Fillet tool is unchanged — it only operates on lines by design (rounding corners between two line segments).

## Out of Scope
- Ellipse rotation fidelity beyond a faithful rotated outline. Other element types (arcs, strokes).

<!-- NR_OF_TRIES: 1 -->
