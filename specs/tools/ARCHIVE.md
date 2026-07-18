# Spec 01: Stamp tool — add OSnap support

## Status: COMPLETE

Commit: `c4a5c52` — `snapPosition()` calls `ctx.findSnapPoint()` on both `onMouseDown` and `onMouseMove`.

Verify: npm run typecheck && npm run test:all && php artisan test

## Overview
The Stamp tool (click-to-place an APPROVED/REJECTED/etc. stamp) has no object snap. Other tools (Arc, Polyline, Line, Dimension) use `ctx.findSnapPoint` to snap to endpoints, midpoints, centers, and intersections. The Stamp tool should use the same mechanism.

## Acceptance Criteria
- [ ] When Stamp tool is active and user clicks to place, the position snaps to nearby endpoints, midpoints, centers, and intersections
- [ ] When no snap target is nearby (within threshold), stamp places at the raw click position (same as current behavior)
- [ ] `npm run typecheck` passes
- [ ] `npm run test:all` passes
- [ ] `php artisan test` passes

## Context
- `frontend/composables/tools/useStampTool.ts` — the tool implementation
- Snapping example in `useDimensionTool.ts` step `'end'`:`const snap = ctx.findSnapPoint(pos, ctx.elements)`
- `ToolContext.findSnapPoint` is already available on the context
# Spec 02: Text Annotation tool — add OSnap support

## Status: COMPLETE

Commit: `19787b5` — `ctx.findSnapPoint()` called on both `onMouseDown` (annotation target) and `onMouseUp` (text label position).

Verify: npm run typecheck && npm run test:all && php artisan test

## Overview
The Text Annotation tool creates a text label with a leader line pointing to a specific location. The user clicks once for the annotation point (where the line points) and again for the text position. Neither click snaps to geometry. Add `ctx.findSnapPoint` to both steps.

## Acceptance Criteria
- [ ] First click (annotation target) snaps to endpoints, midpoints, centers, intersections
- [ ] Second click (text label position) snaps to endpoints, midpoints, centers, intersections
- [ ] When no snap target is nearby, positions fall back to raw click position
- [ ] `npm run typecheck` passes
- [ ] `npm run test:all` passes
- [ ] `php artisan test` passes

## Context
- `frontend/composables/tools/useTextAnnotationTool.ts` — the tool implementation (2-click: target, then text position)
- `ctx.findSnapPoint(pos, ctx.elements)` — the snap function
# Spec 03: Arc tool — collinear point guard

## Status: COMPLETE

Commit: `3682345` — cross-product collinear check rejects degenerate arcs and keeps first 2 points for retry.

Verify: npm run typecheck && npm run test:all && php artisan test

## Overview
The Arc tool creates a 3-point arc (start, through, end). When all 3 points are collinear, the arc is degenerate (infinite radius, zero curvature) and causes geometry calculation errors downstream. Add a guard that detects collinear points and rejects the third click with a visual or console indication.

## Acceptance Criteria
- [ ] When the 3rd click is collinear with the first 2 points (within threshold), the tool does NOT create an element
- [ ] The tool resets to step 2 (end point) so the user can try a different 3rd point
- [ ] Existing non-collinear arcs work unchanged
- [ ] `npm run typecheck` passes
- [ ] `npm run test:all` passes
- [ ] `php artisan test` passes

## Context
- `frontend/composables/tools/useArcTool.ts` — the 3-click arc tool
- Collinearity check: cross product of vectors (start→through) and (start→end) near zero = collinear
- Similar zero-length guards already exist in `useLineTool.ts` and `useArrowTool.ts` — follow the same pattern
# Spec 04: Measure Area — support polyline, arc, stroke types

## Status: COMPLETE

Commit: `298999e` — `calculateArea()` handles polyline (Shoelace), arc (triangle area), stroke (bounding-box). `measureArea()` returns `false` on null so the toast fires for unsupported types.

Verify: npm run typecheck && npm run test:all && php artisan test

## Overview
The Measure Area tool only calculates area for rectangles, circles, and ellipses. Clicking a polyline, arc, or revision cloud does nothing (silent failure — `measured` is set to true but `calculateArea` returns null). Add area calculation for polylines (using the Shoelace formula, which already exists for closed polylines), arcs (approximate via triangle area of start/through/end), and strokes (approximate via the convex hull of stroke points).

## Acceptance Criteria
- [ ] Clicking a closed polyline measures its area using the Shoelace formula (already works for closed polylines — fix the tool's `measured` flag to respect `null` returns)
- [ ] Clicking a stroke calculates an approximate area (convex hull or bounding box)
- [ ] Clicking an arc calculates the triangular area of start→through→end
- [ ] Non-measurable types (line, text, etc.) show the existing error toast instead of silently failing
- [ ] `npm run typecheck` passes
- [ ] `npm run test:all` passes
- [ ] `php artisan test` passes

## Context
- `frontend/composables/tools/useMeasureAreaTool.ts` — the tool (fix the `measured` flag logic)
- `frontend/composables/useMeasurements.ts` — `calculateArea()` function (add arc and stroke cases)
- `calculatePolylineArea()` at line 190 already returns `null` for non-closed polylines
# Spec 05: Scale tool — reduce sensitivity near centroid

## Status: COMPLETE

Commit: `a40bdbe` — `referenceDist` uses bounding-box diagonal × 5% as minimum, preventing extreme scale jumps when clicking near centroid.

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
