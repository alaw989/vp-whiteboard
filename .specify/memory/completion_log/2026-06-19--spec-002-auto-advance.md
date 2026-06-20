# Spec 002 — Auto-advance selection on empty click

Completed: 2026-06-19
Tries: 1

## Changes

Modified three modify tool files to allow empty-canvas click to confirm selection:

1. `composables/tools/useRotateTool.ts`
2. `composables/tools/useScaleTool.ts`
3. `composables/tools/useMirrorTool.ts`

## Implementation Detail

In each tool's `onMouseDown` handler, within the `select` step:

```typescript
if (!el) {
  // Empty click confirms selection if elements are selected
  if (selectedIds.value.length > 0) {
    step.value = 'basepoint'  // or 'axis-first' for Mirror
  }
  return
}
```

This preserves:
- Multi-select (clicking elements still toggles them)
- No-op when nothing selected
- Enter key confirm (backwards compatible)

## Lessons

Simple UX fix with minimal code change. The key insight was that users expected clicking empty space to mean "I'm done selecting" — a natural mental model that wasn't reflected in the original implementation which required an explicit Enter press.
