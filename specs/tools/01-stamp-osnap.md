# Spec 01: Stamp tool — add OSnap support

## Status: INCOMPLETE

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
