# Spec 003: Pivot marker + angle guide for rotate/scale

## Status: COMPLETE

## Overview
After setting the base point and during the angle/scale drag, there is no on-canvas pivot marker or guide line — only the HUD text and the dashed ghost preview. Add the marker + guide so the pivot and rotation/scale direction are visually obvious. The computeds already exist but were never rendered.

## Context
- `WhiteboardCanvas.vue` defines `transformBasepoint` (~line 1828) and `transformGuideEnd` (~line 1833) computeds for rotate/scale, plus `transformReadout`. They are computed but **no template node renders them**.
- Mirror already renders an analogous axis marker + amber dashed line (template ~lines 469–490) — follow that pattern for consistency.

## Requirements
- When rotate/scale `step` is `basepoint` or `angle`/`scale`, render a filled marker (circle) at `transformBasepoint`.
- During the `angle`/`scale` step, render an amber dashed guide line from `transformBasepoint` to `transformGuideEnd` (the cursor).
- Marker and guide disappear on commit (`reset()`) and on Esc.

## Acceptance Criteria
- [x] Rotate: after clicking the base point, a pivot marker renders at that point.
- [x] Rotate: during the drag, an amber dashed line runs from the pivot to the cursor.
- [x] Scale: the same marker + guide render during the scale drag.
- [x] On commit (final click) or Esc, the marker and guide disappear.
- [x] `npm run typecheck` passes; no conflict with the existing dashed ghost preview.

## Implementation

**Already implemented in commit `2327eaa` (Tier 2 Rotate & Scale tools)** — predates the Ralph loop.

The template already contains the rendering code (WhiteboardCanvas.vue ~lines 573-608):
- Pivot marker: `v-circle` with amber fill (#F59E0B) at `transformBasepoint`
- Guide line: `v-line` dashed amber from `transformBasepoint` to `transformGuideEnd`
- Readout text: `v-text` showing angle or scale factor at cursor

The computeds are correctly wired:
- `transformBasepoint` returns `rotateBasepoint.value` or `scaleBasepoint.value`
- `transformGuideEnd` returns `rotateCurrentCursor.value` or `scaleCurrentCursor.value`
- `transformReadout` returns the angle (°) or scale (×) text

## Out of Scope
- Selection highlight (Spec 001). The numeric readout already lives in the HUD.

<!-- NR_OF_TRIES: 1 -->
