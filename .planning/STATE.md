# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-10)

**Core value:** Engineers and clients can collaboratively mark up and discuss engineering drawings in real-time, with everyone seeing each other's cursors and annotations instantly.

**Current focus:** Phase 3: Drawing Tools

## Current Position

Phase: 3 of 8 (Drawing Tools)
Plan: 3 of 8 in current phase
Status: In progress
Last activity: 2026-02-11 — Completed Plan 02: Arrow and Line Drawing Tools

Progress: [█████████] 91%

## Performance Metrics

**Velocity:**
- Total plans completed: 15
- Average duration: 3 min
- Total execution time: 0.80 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 5/5 | 13 min | 3 min |
| 2 | 4/4 | 13 min | 3 min |
| 3 | 2/8 | 7 min | 4 min |
| 4 | 0/3 | - | - |
| 5 | 0/4 | - | - |
| 6 | 0/3 | - | - |
| 7 | 0/4 | - | - |
| 8 | 0/6 | - | - |

**Recent Trend:**
- Last 5 plans: 3 min
- Trend: Consistent velocity

*Updated after each plan completion*
| Phase 03-drawing-tools P03 | 5min | 3 tasks | 3 files |
| Phase 03-drawing-tools P01 | 2min | 3 tasks | 3 files |
| Phase 02-document-rendering P04 | 4min | 3 tasks | 3 files |
| Phase 01-foundation P01-05 | 4min | 3 tasks | 4 files |
| Phase 02-document-rendering P01 | 4min | 3 tasks | 5 files |
| Phase 02-document-rendering P02 | 4min | 3 tasks | 3 files |
| Phase 02-document-rendering P03 | 4min | 3 tasks | 2 files |
| Phase 02-document-rendering P04 | 1min | 3 tasks | 3 files |
| Phase 03 P03-02 | 3min | 3 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- **8-character short IDs** for shareable URLs (01-01)
- **URL-safe alphabet** without ambiguous characters 0OIl (01-01)
- **7-day session expiration** for balance between persistence and cleanup (01-01)
- **Mock mode fallback** for testing without Supabase (01-01)
- **Axios for file upload progress tracking** (01-03) - using onUploadProgress callback
- **Sequential file uploads** (01-03) - one at a time for better progress feedback
- **Client-side validation matching server-side** (01-03) - 10MB limit, same file types
- **30-second auto-save interval** (01-04) - balances persistence with server load
- **1-second debounce after changes** (01-04) - prevents excessive save requests
- **Last-write-wins for offline queue** (01-04) - simpler than conflict resolution
- **Instant retry with 100ms delay** (01-05) - no exponential backoff for WebSocket reconnection
- **VueUse useOnline for network detection** (01-05) - reliable Network Information API wrapper
- **30-second heartbeat for connection health** (01-05) - balance between detection and traffic
- **Vite-compatible worker URL using import.meta.url** (02-01) - prevents version mismatch, follows Vite best practices
- **Default scale 1.5 for PDF rendering** (02-01) - balance between quality and file size
- **Client-side only PDF.js plugin** (02-01) - avoids SSR hydration errors
- **Dynamic import of pdfjs-dist in composable** (02-01) - SSR compatibility
- **Document layer renders before main drawing layer** (02-02) - ensures proper z-ordering for documents behind drawings
- **listening(false) on document layer for performance** (02-02) - skip hit detection on non-interactive backgrounds
- **Image caching with Map<string, HTMLImageElement>** (02-02) - prevents redundant loading of document images
- **DocumentLayer type from ~/types used consistently** (02-02) - not local interfaces, maintains type consistency
- **PDF files rendered to dataURL images for Konva Image consumption** (02-03) - enables proper canvas export and layer management
- **Layer state managed separately from canvas elements** (02-03) - enables independent document tracking and layer panel UI
- **Supabase storage retained for file uploads** (02-03) - production-ready, no downgrade to local files needed
- **AbortSignal for cancellation** (02-04) - native browser API for cancellable async operations with event listener cleanup
- **Two-stage progress mapping** (02-04) - 0-50% for document load, 50-100% for render provides smooth user feedback
- **Backdrop blur overlay for loading indicator** (02-04) - prevents user interaction and focuses attention during long operations
- **perfect-freehand for smooth stroke rendering** (03-01) - creates natural variable-width strokes using pressure simulation
- **Filled polygon rendering for strokes** (03-01) - strokes rendered as closed polygons using perfect-freehand outline points
- **Eraser hit detection with getAllIntersections** (03-01) - uses Konva's hit detection to find and remove elements at cursor position
- **Konva.Arrow for automatic arrowhead rendering** (03-02) - built-in arrow shape with configurable pointerLength/pointerWidth
- **Dashed preview during drag for two-point shapes** (03-02) - dash: [5, 5] distinguishes preview from final shapes
- **Separate line and arrow tools** (03-02) - clearer UX than toggle for engineering drawings
- **Modal dialog for text input after shape placement** (03-03) - better UX than inline editing for leader line annotations
- **Leader line coordinates relative to group origin** (03-03) - proper positioning within v-group for text+line compound element

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

None yet.

## Session Continuity

Last session: 2026-02-11
Stopped at: Completed 03-02 (Arrow and Line Drawing Tools), ready for 03-04 (Rectangle Tool)
Resume file: None
