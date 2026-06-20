# Spec 002: Auto-advance selection on empty click (modify tools)

## Status: COMPLETE

## Overview
Rotate/Scale/Mirror require pressing **Enter** to confirm a selection before placing the base point — a non-obvious, undocumented-in-the-UI step that feels broken (the user's literal complaint: "click a point on the rectangle and then click a point elsewhere but nothing happened"). Let an empty-canvas click confirm the selection instead.

## Context
- In the `select` step, each tool's `onMouseDown` calls `findElementAtPosition(pos)` and `return`s early when nothing is hit (`if (!el) return`).
- The natural user gesture is "click the shape, then click elsewhere to continue" — currently a no-op.

## Requirements
- In the `select` step, if `selectedIds.length > 0` and the user clicks a point with **no element under it**, advance `step` to `basepoint` (treat the empty click as "done selecting").
- If `selectedIds.length === 0`, an empty click still does nothing (at least one element must be selected first).
- Clicking **on** an element still toggles it in/out of the selection (multi-select preserved).
- Enter remains a valid confirm (backwards-compatible).

## Acceptance Criteria
- [x] `RO` → click a rect → click empty canvas → tool advances to the basepoint step with **no Enter** required (HUD shows "click the base point").
- [x] `RO` → click empty canvas with nothing selected → nothing happens (no advance, no error).
- [x] `RO` → click rect A → click rect B (on the element) → both selected (multi-select unchanged).
- [x] Enter still confirms the selection (existing flow still works).
- [x] Identical behavior for Scale (`SC`) and Mirror (`MI`).
- [x] `npm run typecheck` passes.

## Implementation
Modified three tool files:
- `composables/tools/useRotateTool.ts` — empty click in `select` step advances to `basepoint` when elements selected
- `composables/tools/useScaleTool.ts` — same behavior, advances to `basepoint`
- `composables/tools/useMirrorTool.ts` — same behavior, advances to `axis-first`

The change is minimal: when `findElementAtPosition(pos)` returns null and `selectedIds.length > 0`, set `step.value` to the next step instead of just returning.

## Out of Scope
- Selection highlight (Spec 001). Pivot marker (Spec 003).

<!-- NR_OF_TRIES: 1 -->
