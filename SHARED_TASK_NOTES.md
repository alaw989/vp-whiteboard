# VP Whiteboard - Continuous Work Notes

## Status: ALL PHASES COMPLETE (0-6)

## Verification (2026-06-06)
- `npm run typecheck` — passes cleanly
- `npm run dev:all` — both servers start without errors
- All phase files present and accounted for

## Remaining Known Issues
- **Icon collection warning**: `[Icon] Collection mdi is not found locally` — cosmetic, icons still load from CDN. Could install `@iconify-json/mdi` to resolve but adds significant package size.
- **General polish**: All 7 phases are implemented and functional. Remaining work would be polish/UX refinement based on user testing feedback.

## Architecture Notes
- Layer definitions are shared (synced via yMeta) — all users see same layers
- Element-to-layer binding via `layerId` field on CanvasElement (defaults to `'default'`)
- Layer panel toggles with K key, appears between toolbar and canvas
- `defineExpose` unwraps refs — access exposed booleans directly, not via `.value`
- All geometry utils use a shared Point interface from utils/geometryUtils.ts
- Grid composable is instantiated inside WhiteboardCanvas (not shared via Yjs) — grid visibility is per-user
- Grid snap is the lowest-priority constraint (after object snap, polar tracking, ortho)
- Shape tools (rectangle, circle, ellipse) bypass the constraint pipeline — they use raw cursor position
- Line/arrow/polyline tools DO use constraint pipeline (ortho/polar/grid snap)
