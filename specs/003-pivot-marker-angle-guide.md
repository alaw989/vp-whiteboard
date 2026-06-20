# Spec 003: Pivot marker + angle guide for rotate/scale

## Status: Draft

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
- [ ] Rotate: after clicking the base point, a pivot marker renders at that point.
- [ ] Rotate: during the drag, an amber dashed line runs from the pivot to the cursor.
- [ ] Scale: the same marker + guide render during the scale drag.
- [ ] On commit (final click) or Esc, the marker and guide disappear.
- [ ] `npm run typecheck` passes; no conflict with the existing dashed ghost preview.

## Out of Scope
- Selection highlight (Spec 001). The numeric readout already lives in the HUD.
