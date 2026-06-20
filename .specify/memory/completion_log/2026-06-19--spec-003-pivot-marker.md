# Spec 003 — Pivot marker + angle guide for rotate/scale

Completed: 2026-06-19
Tries: 1

## Finding

This spec was already implemented. The pivot marker and guide line rendering was added in commit `2327eaa` (feat(autocad-tools): Tier 2 Rotate & Scale tools), which predates the Ralph loop specs.

## Verification

The template (WhiteboardCanvas.vue ~lines 573-608) already contains:
- Pivot marker: amber filled circle at `transformBasepoint`
- Guide line: dashed amber line from pivot to cursor
- Readout text: angle/scale value display

The computeds are correctly wired to the tool states. Typecheck passes.

## Lessons

Specs can become stale if written based on outdated code state. The Ralph loop should verify spec assumptions before implementation — in this case, the template inspection revealed the rendering already existed.
