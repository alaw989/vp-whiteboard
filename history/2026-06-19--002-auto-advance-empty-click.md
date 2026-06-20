# 2026-06-19 — Spec 002: Auto-advance selection on empty click

**Status:** COMPLETE

## What shipped
Rotate/Scale/Mirror tools now advance from `select` to `basepoint` step when the user clicks on empty canvas with elements selected — no Enter required.

## Implementation
Modified three tool files (`useRotateTool.ts`, `useScaleTool.ts`, `useMirrorTool.ts`):
- In `select` step, when `findElementAtPosition(pos)` returns null and `selectedIds.length > 0`, advance to next step instead of returning
- Multi-select preserved: clicking on an element still toggles it
- Enter still works for backwards compatibility

## Verification
- `RO` → click rect → click empty → advances to basepoint (no Enter)
- `RO` → click empty with nothing selected → nothing happens
- Clicking multiple elements toggles them in/out of selection
