# Spec 04: Measure Area — support polyline, arc, stroke types

## Status: INCOMPLETE

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
