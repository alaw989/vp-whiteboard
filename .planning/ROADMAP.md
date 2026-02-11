# Roadmap: VP Whiteboard

## Overview

VP Whiteboard transforms the existing collaborative canvas into a file-based markup tool for structural engineers and clients. The journey begins with secure file upload and session management, adds PDF rendering as canvas backgrounds, builds comprehensive markup tools, enables synchronized navigation, ensures real-time collaboration, provides professional export, adds measurement capabilities, and optimizes for performance and mobile devices.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Secure file upload, session management, and WebSocket resilience
- [ ] **Phase 2: Document Rendering** - PDF.js integration and document-as-background-layer pattern
- [ ] **Phase 3: Drawing Tools** - Complete markup toolkit (pen, highlighter, arrows, text, stamps, shapes, selection, styling)
- [ ] **Phase 4: Canvas Navigation** - Zoom, pan, and synchronized view state
- [ ] **Phase 5: Real-time Collaboration** - Multi-user cursors, presence, and instant sync
- [ ] **Phase 6: Export** - PNG and PDF export with annotations
- [ ] **Phase 7: Measurement Tools** - Scale-aware distance and area measurement
- [ ] **Phase 8: Performance & Mobile** - Optimization and touch gesture support

## Phase Details

### Phase 1: Foundation

**Goal**: Users can create shareable sessions and upload files securely

**Depends on**: Nothing (first phase)

**Requirements**: FILE-01, FILE-02, FILE-03, FILE-04, SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, PERF-05

**Success Criteria** (what must be TRUE):
1. User can create a new session and receive a unique shareable URL
2. User can join an existing session via shared link without authentication
3. User can upload PDF and image files (JPG, PNG, WebP) to the session
4. Session persists across browser refresh and can be revisited via the same URL
5. Session auto-saves every 30 seconds and uploads are validated for size and type

**Plans**: 5 plans in 2 waves

| Wave | Plans | Description |
|------|-------|-------------|
| 1 | 01-01, 01-03, 01-04, 01-05 | Session infrastructure, file upload progress, auto-save, offline detection |
| 2 | 01-02 | Session lookup and routing (depends on 01-01) |

Plans:
- [ ] 01-01-PLAN.md — Session infrastructure with short IDs (nanoid + session API)
- [ ] 01-02-PLAN.md — Session lookup API and short URL routing (/s/[id])
- [ ] 01-03-PLAN.md — File upload with real progress tracking (Axios)
- [ ] 01-04-PLAN.md — Auto-save composable with visual status indicator
- [ ] 01-05-PLAN.md — Offline detection banner and instant WebSocket retry

### Phase 2: Document Rendering

**Goal**: Users can view uploaded PDFs and images as canvas backgrounds

**Depends on**: Phase 1

**Requirements**: FILE-01, FILE-02

**Success Criteria** (what must be TRUE):
1. PDF files render as canvas backgrounds at correct scale
2. Image files (JPG, PNG, WebP) render as canvas backgrounds
3. Large PDF files load with progress indicator and don't crash the browser
4. Multiple files can be uploaded and managed within a session

**Plans**: 4 plans in 3 waves

Plans:
- [ ] 02-01-PLAN.md — PDF.js worker setup and usePDFRendering composable (Wave 1)
- [ ] 02-02-PLAN.md — Document-as-background-layer integration with Konva (Wave 2)
- [ ] 02-03-PLAN.md — Layer management for multiple documents (Wave 2)
- [ ] 02-04-PLAN.md — Lazy page loading and progress indicator (Wave 3)

### Phase 3: Drawing Tools

**Goal**: Users can mark up documents with comprehensive annotation tools

**Depends on**: Phase 2

**Requirements**: DRAW-01, DRAW-02, DRAW-03, DRAW-04, DRAW-05, DRAW-06, DRAW-07, DRAW-08, DRAW-09, STYLE-01, STYLE-02, STYLE-03, UNDO-01, UNDO-02, UNDO-03

**Success Criteria** (what must be TRUE):
1. User can draw freehand pen strokes and transparent highlighter marks
2. User can draw arrows with arrowheads pointing to specific elements
3. User can add text annotations with leader lines
4. User can place pre-defined stamps (APPROVED, REVISED, NOTE, FOR REVIEW)
5. User can draw shapes (rectangle, circle, ellipse)
6. User can erase drawings and select/move/resize existing markup elements
7. User can select drawing colors from preset palette and adjust stroke thickness
8. User can undo and redo actions with keyboard shortcuts

**Plans**: TBD

Plans:
- [ ] 03-01: Pen, highlighter, and eraser tools
- [ ] 03-02: Arrow and line tools
- [ ] 03-03: Text annotation with leader lines
- [ ] 03-04: Pre-defined stamp library
- [ ] 03-05: Shape tools (rectangle, circle, ellipse)
- [ ] 03-06: Element selection, move, and resize (Konva Transformer)
- [ ] 03-07: Styling controls (color palette, stroke thickness)
- [ ] 03-08: Undo/redo system

### Phase 4: Canvas Navigation

**Goal**: Users can navigate large drawings with synchronized view state

**Depends on**: Phase 3

**Requirements**: NAVI-01, NAVI-02, NAVI-03

**Success Criteria** (what must be TRUE):
1. User can zoom in/out with mouse wheel
2. User can pan canvas by dragging
3. Zoom level persists and syncs for all users in the session

**Plans**: TBD

Plans:
- [ ] 04-01: Mouse wheel zoom implementation
- [ ] 04-02: Pan-by-drag implementation
- [ ] 04-03: Zoom state synchronization across users

### Phase 5: Real-time Collaboration

**Goal**: Multiple users can collaborate with visible presence and instant sync

**Depends on**: Phase 4

**Requirements**: COLL-01, COLL-02, COLL-03, COLL-04

**Success Criteria** (what must be TRUE):
1. Multiple users can draw simultaneously without conflicts
2. Users see each other's cursors with names and colors
3. User list shows all participants in the session
4. Drawing changes broadcast instantly to all clients

**Plans**: TBD

Plans:
- [ ] 05-01: Multi-user cursor tracking and display
- [ ] 05-02: User presence list
- [ ] 05-03: Real-time drawing broadcast via Yjs
- [ ] 05-04: Cursor throttling and cleanup

### Phase 6: Export

**Goal**: Users can export marked-up documents as PNG or PDF

**Depends on**: Phase 5

**Requirements**: EXPR-01, EXPR-02, EXPR-03

**Success Criteria** (what must be TRUE):
1. User can export canvas as PNG image
2. User can export canvas as PDF with annotations
3. Export includes original file background plus all markups

**Plans**: TBD

Plans:
- [ ] 06-01: PNG export with composite rendering
- [ ] 06-02: PDF export with annotation overlays
- [ ] 06-03: Export dialog with quality controls

### Phase 7: Measurement Tools

**Goal**: Users can measure distances and areas on scaled drawings

**Depends on**: Phase 6

**Requirements**: MEAS-01, MEAS-02, MEAS-03, MEAS-04

**Success Criteria** (what must be TRUE):
1. User can set scale by defining a reference length (e.g., "this line = 10 feet")
2. User can measure distance between two points with units displayed
3. User can measure area of rectangles and circles

**Plans**: TBD

Plans:
- [ ] 07-01: Scale setting interface and coordinate system
- [ ] 07-02: Distance measurement tool
- [ ] 07-03: Area measurement tool
- [ ] 07-04: Measurement display and labeling

### Phase 8: Performance & Mobile

**Goal**: Application performs smoothly on desktop and mobile devices

**Depends on**: Phase 7

**Requirements**: PERF-01, PERF-02, PERF-03, PERF-04, MOBL-01, MOBL-02, MOBL-03

**Success Criteria** (what must be TRUE):
1. Canvas handles 500+ drawing elements without lag
2. WebSocket reconnection handles network interruptions gracefully
3. Large PDF files load with progress indicator
4. Touch gestures work for drawing on tablets/iPad
5. UI is responsive on mobile screens
6. Two-finger pan gesture works on touch devices

**Plans**: TBD

Plans:
- [ ] 08-01: Viewport clipping for large canvases
- [ ] 08-02: CRDT memory garbage collection
- [ ] 08-03: WebSocket reconnection with exponential backoff
- [ ] 08-04: Touch gesture support for drawing
- [ ] 08-05: Two-finger pan gesture
- [ ] 08-06: Responsive UI for mobile screens

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 5/5 | Complete | 2025-02-10 |
| 2. Document Rendering | 4/4 | Complete | 2025-02-10 |
| 3. Drawing Tools | 8/8 | Complete | 2025-02-10 |
| 4. Canvas Navigation | 0/3 | Not started | - |
| 5. Real-time Collaboration | 0/4 | Not started | - |
| 6. Export | 0/3 | Not started | - |
| 7. Measurement Tools | 0/4 | Not started | - |
| 8. Performance & Mobile | 0/6 | Not started | - |
