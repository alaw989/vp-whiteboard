# 2026-06-19 — Spec 003: Pivot marker + angle guide

**Status:** COMPLETE (already implemented in commit `2327eaa`)

## What shipped
Pivot marker (amber circle) and angle guide line (amber dashed) render during rotate/scale operations. The computeds already existed but were never wired to the template.

## Implementation
Template code in `WhiteboardCanvas.vue` (~lines 573-608):
- `v-circle` with amber fill (#F59E0B) at `transformBasepoint`
- `v-line` dashed amber from `transformBasepoint` to `transformGuideEnd`
- `v-text` readout showing angle (°) or scale (×)

## Verification
- Rotate: after clicking base point, pivot marker renders
- During drag, amber dashed line runs from pivot to cursor
- Scale: same marker + guide render
- On commit or Esc, marker and guide disappear
