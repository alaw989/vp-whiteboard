---
phase: 08-performance-mobile
plan: 02
subsystem: memory
tags: [crdt, garbage-collection, yjs, memory-management, compaction]

title: CRDT Garbage Collection
summary: Periodic document compaction with undo history clearing to prevent unbounded memory growth
completed: 2026-02-12

---

# Plan 08-02: CRDT Garbage Collection - Summary

## Implementation

Added CRDT garbage collection to `useCollaborativeCanvas.ts` to prevent unbounded memory growth during long sessions.

### Functions Added

1. **`compactDocument()`** (lines 212-227)
   - Clears undo manager history to release tombstone references
   - Logs compaction event for debugging
   - Does NOT delete elements from yElements (preserves collaborative state)

2. **`startGarbageCollection(intervalMs)`** (lines 237-257)
   - Default interval: 10 minutes
   - Returns cleanup function to stop GC
   - Logs start/stop events

3. **Auto-start on mount** (line 319)
   - GC starts automatically when composable is used
   - Cleanup called in main cleanup() function (lines 452-455)

### Exports

Both functions are exported from the composable:
- `compactDocument` - Manual triggering
- `startGarbageCollection` - Custom interval

### Design Decisions

**Why only clear undo history?**
- Preserves collaborative context for other users
- Active users may have references to old elements
- Tombstones cleared by undoManager.clear() are the primary memory concern
- Element storage itself has minimal memory impact

**Trade-offs:**
- Memory: Bounded growth (undo history is primary consumer)
- UX: Undo history cleared on compaction (users lose redo ability)

## Verification

The implementation matches all requirements from the plan:

- [x] compactDocument function clears undo manager history
- [x] startGarbageCollection runs periodically with configurable interval
- [x] GC is automatically started on mount (10-minute default)
- [x] GC cleanup is called in main cleanup function
- [x] Functions are exported for manual triggering
- [x] Collaborative context is preserved after compaction

## Testing Notes

Requires DevTools Memory profiling:
1. Take heap snapshot
2. Draw/delete many elements
3. Wait for GC interval or manually trigger compactDocument
4. Verify memory reduction in second snapshot
5. Confirm undo/redo is empty after compaction
6. Verify collaborative state preserved (other users see elements)
