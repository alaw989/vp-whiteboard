# Spec 05: Scale tool — reduce sensitivity near centroid

## Status: INCOMPLETE

Verify: npm run typecheck && npm run test:all && php artisan test

## Overview
The Scale tool computes the scale factor as `distance(basepoint, cursor) / referenceDist` where `referenceDist` is the distance from the basepoint click to the selection centroid. When `referenceDist` is small (user clicks near the centroid), it's clamped to a minimum of 1 pixel, which makes any tiny mouse movement produce a 1×–2× scale jump. Replace the raw clamping with a more stable normalization, such as bounding-box diagonal or a minimum percentage of the selection size.

## Acceptance Criteria
- [ ] Scaling near the centroid produces smooth, proportional movement
- [ ] Scale factor = 1 when cursor is at the basepoint
- [ ] Scale factor matches the cursor's distance relative to a meaningful reference (bounding-box diagonal of the selected elements)
- [ ] `npm run typecheck` passes
- [ ] `npm run test:all` passes
- [ ] `php artisan test` passes

## Context
- `frontend/composables/tools/useScaleTool.ts` — lines 152–153 (`referenceDist` clamping)
- `useSelection.ts` exposes a `selectionRect` computed ref with `{x, y, width, height}` of the rubber-band/selection bounding box
- Alternative: `referenceDist = max(1, bboxDiagonal * 0.1)` where `bboxDiagonal = sqrt(width² + height²)` of the selection bounding box
