# Spec 03: Arc tool — collinear point guard

## Status: INCOMPLETE

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
