# Spec 02: Text Annotation tool — add OSnap support

## Status: INCOMPLETE

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
