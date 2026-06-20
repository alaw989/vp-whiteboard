# Spec 001: Selection highlight for modify tools (rotate/scale/mirror)

## Status: Draft

## Overview
When using Rotate, Scale, or Mirror, clicking an element to select it gives **no visual feedback** — the user cannot tell their click registered (this was the original "nothing happened" complaint). The `transformHud` (commit f7337ee) shows a *count* but not *which* elements. Add a clear on-canvas highlight to selected elements during the select step.

## Context
- `useRotateTool.ts`, `useScaleTool.ts`, `useMirrorTool.ts` each expose `selectedIds` via their `.state`.
- `WhiteboardCanvas.vue` already destructures `rotateSelectedIds`, `scaleSelectedIds`, `mirrorSelectedIds` (~lines 1804–1815) but the template renders no highlight for them.
- Baseline includes the focus fix (f7337ee) — these tools already advance correctly once selection works.

## Requirements
- While rotate/scale/mirror is active and in its `select` step, every element whose id is in the active tool's `selectedIds` renders with a distinct highlight (e.g. a cyan/amber dashed bounding outline or tinted overlay) that does not permanently alter the element.
- Highlight appears the instant an element is added to the selection and disappears when removed.
- Esc and tool deactivation clear all highlights; no stale highlight survives a tool switch.

## Acceptance Criteria
- [ ] Activate Rotate (`RO`), click a rectangle → it shows a visible highlight distinct from unselected elements.
- [ ] Click a second shape → both shapes are highlighted.
- [ ] Click an already-selected shape → its highlight disappears (toggled out of the selection).
- [ ] Press Esc → all highlights clear.
- [ ] Switch to a different tool → no highlight remains on canvas.
- [ ] Behavior is identical for Scale (`SC`) and Mirror (`MI`).
- [ ] `npm run typecheck` passes; no regression to existing element rendering.

## Out of Scope
- Pivot marker / guide line (Spec 003). Auto-advance (Spec 002). Circle/ellipse selection (Spec 004).
