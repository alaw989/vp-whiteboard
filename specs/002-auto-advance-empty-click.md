# Spec 002: Auto-advance selection on empty click (modify tools)

## Status: Draft

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
- [ ] `RO` → click a rect → click empty canvas → tool advances to the basepoint step with **no Enter** required (HUD shows "click the base point").
- [ ] `RO` → click empty canvas with nothing selected → nothing happens (no advance, no error).
- [ ] `RO` → click rect A → click rect B (on the element) → both selected (multi-select unchanged).
- [ ] Enter still confirms the selection (existing flow still works).
- [ ] Identical behavior for Scale (`SC`) and Mirror (`MI`).
- [ ] `npm run typecheck` passes.

## Out of Scope
- Selection highlight (Spec 001). Pivot marker (Spec 003).
