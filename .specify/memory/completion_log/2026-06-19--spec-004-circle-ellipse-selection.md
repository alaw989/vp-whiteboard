# Spec 004 — Circle & ellipse selection in modify tools

Completed: 2026-06-19
Tries: 1

## Problem

Modify tools (Rotate/Scale/Mirror/Offset/Trim/Extend) could not select circles or ellipses. The `findElementAtPosition` function in each tool checked `if (!geo?.segments) continue`, but circles return `{ circle: { center, radius } }` without segments, so they were always skipped.

## Solution

Added circle handling before the segments check in:
- `useRotateTool.ts`
- `useScaleTool.ts`
- `useMirrorTool.ts`
- `useTrimTool.ts`
- `useExtendTool.ts`
- `geometryUtils.ts` (findNearestElementSegment — used by Offset tool)

The detection logic checks if the click is near the circle's perimeter OR inside the circle:
```typescript
if (geo?.circle) {
  const toCenter = distance(pos, geo.circle.center)
  const distToPerimeter = Math.abs(toCenter - geo.circle.radius)
  const d = Math.min(distToPerimeter, toCenter)
  // ... match if within threshold
}
```

## Notes

- **Ellipses already worked** — `getElementGeometry` samples them into 48 segments, so the existing segment-based detection worked.
- **Fillet tool unchanged** — it only operates on lines by design (corner rounding between two line segments).

## Lessons

Geometry abstraction wasn't consistent: circles used a different representation (center+radius) than other shapes (segments). The fix required checking multiple geometry representations in the hit-detection logic.
