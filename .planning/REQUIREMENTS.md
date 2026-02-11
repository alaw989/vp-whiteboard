# Requirements: VP Whiteboard

**Defined:** 2026-02-10
**Core Value:** Engineers and clients can collaboratively mark up and discuss engineering drawings in real-time

## v1 Requirements

Requirements for file-based markup tool. Each maps to roadmap phases.

### File Handling

- [ ] **FILE-01**: User can upload PDF file and render it as canvas background (single page for MVP)
- [ ] **FILE-02**: User can upload image files (JPG, PNG, WebP) as canvas background
- [ ] **FILE-03**: Uploaded file is saved with session state
- [ ] **FILE-04**: Multiple files can be uploaded to a session

### Drawing Tools

- [ ] **DRAW-01**: User can draw freehand pen strokes on canvas
- [ ] **DRAW-02**: User can draw highlighter strokes (transparent)
- [ ] **DRAW-03**: User can draw lines with arrowheads pointing to elements
- [ ] **DRAW-04**: User can add text annotations with leader lines
- [ ] **DRAW-05**: User can place pre-defined stamps (APPROVED, REVISED, NOTE, FOR REVIEW)
- [ ] **DRAW-06**: User can draw shapes (rectangle, circle, ellipse)
- [ ] **DRAW-07**: User can erase drawings
- [ ] **DRAW-08**: User can select and move existing markup elements
- [ ] **DRAW-09**: User can resize existing markup elements

### Canvas Navigation

- [ ] **NAVI-01**: User can zoom in/out with mouse wheel
- [ ] **NAVI-02**: User can pan canvas by dragging
- [ ] **NAVI-03**: Zoom level persists for all users in session

### Styling Controls

- [ ] **STYLE-01**: User can select drawing color from preset palette
- [ ] **STYLE-02**: User can adjust stroke thickness
- [ ] **STYLE-03**: Style selections persist during session

### Real-time Collaboration

- [ ] **COLL-01**: Multiple users can draw simultaneously with real-time sync
- [ ] **COLL-02**: Users see each other's cursors with names/colors
- [ ] **COLL-03**: User list shows all participants in session
- [ ] **COLL-04**: Drawing changes broadcast instantly to all clients

### Session Management

- [ ] **SESS-01**: Engineer can create new session with unique URL
- [ ] **SESS-02**: Client can join session via shared link (no auth)
- [ ] **SESS-03**: Session auto-saves every 30 seconds
- [ ] **SESS-04**: Session persists across browser refresh
- [ ] **SESS-05**: Session can be revisited via same URL

### Measurement Tools

- [ ] **MEAS-01**: User can set scale (e.g., "this line = 10 feet")
- [ ] **MEAS-02**: User can measure distance between two points
- [ ] **MEAS-03**: Measurement displays with units on canvas
- [ ] **MEAS-04**: User can measure area (rectangle/circle)

### Undo/Redo

- [ ] **UNDO-01**: User can undo last action (keyboard shortcut)
- [ ] **UNDO-02**: User can redo undone action
- [ ] **UNDO-03**: Undo history persists across session

### Export

- [ ] **EXPR-01**: User can export canvas as PNG image
- [ ] **EXPR-02**: User can export canvas as PDF with annotations
- [ ] **EXPR-03**: Export includes original file background + markups

### Performance & Reliability

- [ ] **PERF-01**: Canvas handles 500+ drawing elements without lag
- [ ] **PERF-02**: WebSocket reconnection handles network interruptions gracefully
- [ ] **PERF-03**: Large PDF files (>20MB) load with progress indicator
- [ ] **PERF-04**: CRDT memory garbage collection prevents unbounded growth
- [ ] **PERF-05**: File upload validates size and type before processing

### Mobile Support

- [ ] **MOBL-01**: Touch gestures work for drawing on tablets/iPad
- [ ] **MOBL-02**: UI is responsive on mobile screens
- [ ] **MOBL-03**: Two-finger pan gesture works on touch devices

## v2 Requirements

Deferred to future release.

### Advanced Features

- **COMM-01**: Threaded comments on markup elements
- **COMM-02**: Email notifications for new comments
- **MULT-01**: Multi-page PDF navigation with thumbnails
- **SYMB-01**: Structural engineering symbol library (beams, loads, rebar)
- **VERS-01**: Version comparison between drawing revisions
- **STAT-01**: Markup status tracking (open/resolved checkboxes)

### Security

- **SECU-01**: Optional PIN protection for shared links
- **SECU-02**: Session expiration after N days
- **SECU-03**: Link revocation by session owner

## Out of Scope

| Feature | Reason |
|---------|--------|
| User accounts/authentication | Defeats phone-based workflow; adds client friction |
| Video/audio chat | Clients talk on phone separately |
| CAD file support (DWG/DXF) | Massive complexity; PDF export is sufficient |
| Version history timeline | Overkill for 2-3 person sessions; undo/redo is enough |
| Enterprise integrations (Procore, etc.) | Not target customer; small firm focus |
| AI-assisted markups | Wrong suggestions worse than none; use symbol library |
| 3D model markups | Different product category; focus on 2D drawings |
| Complex permissions | Single room model; anyone can draw |
| Offline mode | Sync complexity; assume connectivity |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FILE-01 | Phase 1, 2 | Pending |
| FILE-02 | Phase 1, 2 | Pending |
| FILE-03 | Phase 1 | Pending |
| FILE-04 | Phase 1, 2 | Pending |
| DRAW-01 | Phase 3 | Pending |
| DRAW-02 | Phase 3 | Pending |
| DRAW-03 | Phase 3 | Pending |
| DRAW-04 | Phase 3 | Pending |
| DRAW-05 | Phase 3 | Pending |
| DRAW-06 | Phase 3 | Pending |
| DRAW-07 | Phase 3 | Pending |
| DRAW-08 | Phase 3 | Pending |
| DRAW-09 | Phase 3 | Pending |
| NAVI-01 | Phase 4 | Pending |
| NAVI-02 | Phase 4 | Pending |
| NAVI-03 | Phase 4 | Pending |
| STYLE-01 | Phase 3 | Pending |
| STYLE-02 | Phase 3 | Pending |
| STYLE-03 | Phase 3 | Pending |
| COLL-01 | Phase 5 | Pending |
| COLL-02 | Phase 5 | Pending |
| COLL-03 | Phase 5 | Pending |
| COLL-04 | Phase 5 | Pending |
| SESS-01 | Phase 1 | Pending |
| SESS-02 | Phase 1 | Pending |
| SESS-03 | Phase 1 | Pending |
| SESS-04 | Phase 1 | Pending |
| SESS-05 | Phase 1 | Pending |
| MEAS-01 | Phase 7 | Pending |
| MEAS-02 | Phase 7 | Pending |
| MEAS-03 | Phase 7 | Pending |
| MEAS-04 | Phase 7 | Pending |
| UNDO-01 | Phase 3 | Pending |
| UNDO-02 | Phase 3 | Pending |
| UNDO-03 | Phase 3 | Pending |
| EXPR-01 | Phase 6 | Pending |
| EXPR-02 | Phase 6 | Pending |
| EXPR-03 | Phase 6 | Pending |
| PERF-01 | Phase 8 | Pending |
| PERF-02 | Phase 8 | Pending |
| PERF-03 | Phase 2, 8 | Pending |
| PERF-04 | Phase 1, 8 | Pending |
| PERF-05 | Phase 1 | Pending |
| MOBL-01 | Phase 8 | Pending |
| MOBL-02 | Phase 8 | Pending |
| MOBL-03 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 52 total
- Mapped to phases: 52
- Unmapped: 0

---
*Requirements defined: 2026-02-10*
*Last updated: 2026-02-10 after roadmap creation*
