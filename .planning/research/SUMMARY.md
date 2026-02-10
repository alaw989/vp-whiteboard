# Project Research Summary

**Project:** VP Whiteboard
**Domain:** Collaborative Markup Tools for Engineering Drawings (Nuxt 3 + Yjs + Konva)
**Researched:** 2026-02-10
**Confidence:** HIGH

## Executive Summary

VP Whiteboard is a real-time collaborative whiteboard built on Nuxt 3 + Yjs + Konva + Supabase. This is a solid foundation for a collaborative markup tool targeting structural engineer-client workflows. Research shows the codebase already handles core whiteboard functionality (drawing, real-time sync, presence). The opportunity is to extend this with file-based markup capabilities: PDF rendering, session management, and professional export workflows.

The recommended approach leverages existing investments rather than rewrites. Keep Konva (switching to Fabric.js offers no material benefit and high migration cost). Add **pdfjs-dist** for PDF rendering, **html2canvas-pro** + **jsPDF** for export, and extend Konva's native Transformer for selection/manipulation. Key differentiator: no-auth sharing via link-based sessions—competitors require accounts, which creates friction in phone-based engineer-client workflows.

Critical risks center on three areas: (1) Yjs CRDT memory bloat without garbage collection—documents grow unbounded as tombstones accumulate, (2) WebSocket connection state fragility causing data loss on reconnect, and (3) large canvas performance collapse when element counts exceed ~500-1000. Mitigation strategies include implementing document size limits from day one, proper heartbeat/reconnection logic, and viewport clipping for performance. File upload security is also critical—use server-side validation (magic bytes, not extensions), private Supabase Storage buckets with signed URLs, and RLS policies.

## Key Findings

### Recommended Stack

The existing Nuxt 3 + Yjs + Konva + Supabase foundation is sound. Minimal additions required for file-based markup.

**Core technologies (already installed):**
- Nuxt 3 (^3.15.0) + Vue 3 (^3.5.0) — SSR framework with Nitro WebSocket server built-in
- Yjs (^13.6.29) + y-websocket — CRDT for conflict-free collaborative editing
- Konva (^9.3.15) + vue-konva — High-performance 2D canvas with native Transformer
- @supabase/supabase-js — PostgreSQL, real-time, auth, storage in one platform
- perfect-freehand — Smooth drawing with pressure sensitivity

**New additions required:**
- pdfjs-dist (^5.4.624) — Mozilla's PDF.js for browser-based PDF rendering with canvas layer support
- html2canvas-pro (^1.6.6) — Active fork of html2canvas (original unmaintained since 2022)
- jsPDF (^4.1.0) — PDF generation with CVE-2025-68428 security fix

**Key decision:** Keep Konva, do NOT switch to Fabric.js. Migration cost is high; Fabric trades ~30% performance for features already available in Konva's native Transformer.

### Expected Features

VP Whiteboard targets a specific niche: structural engineer reviewing drawings with 1-2 clients over phone. This differs from enterprise construction management tools (Bluebeam, Autodesk Docs).

**Must have (table stakes):**
- Pen/Highlighter/Eraser — Already implemented via perfect-freehand
- Text with Leader Lines — Callouts to specific drawing elements (GAP)
- Arrow Tool — Pointing at specific elements (GAP)
- Zoom/Pan — Navigate large drawings (already implemented)
- File Upload (PDF/Images) — Core workflow; images done, PDF needed
- Export as PDF — Client deliverable (GAP; only PNG exists)
- Simple Stamps — APPROVED, REVISED, NOTE markers (GAP)
- Real-time Sync — Already implemented via Yjs

**Should have (competitive):**
- Measurement Tools — Set scale once, measure distance/area
- Multi-page PDF — Page navigation for real drawings
- Comment/Replies — Threaded discussions on markups
- Markup Status — Open/Resolved checkboxes

**Defer (v2+):**
- Version Comparison — High complexity, uncertain value
- Session Recording — Cool feature, low demand
- CAD File Support — Different product category; use PDF exports
- Authentication/Accounts — Anti-feature for this use case; clients won't install apps

### Architecture Approach

File-based markup extends the existing collaborative canvas with document-centric workflows. The architecture follows a layered approach: uploaded files become background layers on the canvas, with annotations stored as CRDT-based vector elements in the foreground.

**Major components:**
1. Upload Component — File selection, drag-drop UI, validation, progress tracking
2. Document Viewer — PDF.js wrapper for rendering pages as canvas backgrounds
3. Markup Canvas — Existing Konva stage for annotations (already built)
4. Layer Manager — Z-order management, document locking, background layer lifecycle
5. Export Service — Composites document + annotations into PNG/PDF output
6. Session Manager — Shareable URL routing (/whiteboard/[uuid]), guest access

**Key pattern:** Document-as-background-layer. Treat uploaded PDFs/images as locked background layers in the Konva stage. Annotations are editable foreground layers synced via Yjs. This separation enables toggling document visibility and multi-document canvases.

### Critical Pitfalls

Research identified 18 pitfalls across critical, moderate, and minor severity. The top 5 require immediate attention:

1. **CRDT Memory Bloat** — Yjs documents grow unbounded; deleted entries remain as tombstones. Prevention: implement document size limits (10,000 elements or 50MB), use subdocuments for different sections, periodic state compression via snapshots.

2. **WebSocket Connection State Fragility** — Silent disconnects cause data loss. Prevention: bidirectional heartbeat with 30-second timeout, fetch full server state on reconnect, exponential backoff for reconnection.

3. **Supabase Realtime Silent Disconnections** — Background tabs disconnect without triggering events. Prevention: connection status monitoring with heartbeat, manual `client.connect()` on disconnect status, clear connection indicator to users.

4. **Large Canvas Performance Collapse** — >500-1000 elements cause lag and crashes. Prevention: viewport clipping (render visible area only), layer management, `listening(false)` on static layers, pre-scale images to target resolution.

5. **File Upload Security Vulnerabilities** — Client-side validation only leads to RCE. Prevention: server-side magic byte validation, private buckets with signed URLs, RLS policies, malware scanning, rate limiting.

## Implications for Roadmap

Based on combined research, the roadmap should follow a dependency-driven sequence that builds security and performance foundations before adding features.

### Phase 1: Foundation (Security + File Upload)

**Rationale:** File upload is the foundation for document-based markup. Security must be implemented before any file handling goes to production. WebSocket resilience and CRDT memory management are foundational— retrofitting either requires rewrites.

**Delivers:**
- Secure file upload with server-side validation
- WebSocket heartbeat and reconnection logic
- Document size limits and CRDT snapshot system
- Connection status indicator

**Addresses:**
- File Upload (from FEATURES.md)
- Security fundamentals (from PITFALLS.md)
- WebSocket connection state (from PITFALLS.md)

**Avoids:**
- File upload security vulnerabilities (Pitfall 6)
- WebSocket data loss (Pitfall 2, 3)
- CRDT memory bloat (Pitfall 1)

### Phase 2: Document Rendering (PDF.js Integration)

**Rationale:** Once files can be uploaded securely, they must be rendered. PDF.js is the only viable browser-based PDF renderer. This phase establishes the document-as-background-layer pattern.

**Delivers:**
- PDF.js worker setup for off-main-thread rendering
- Document-as-background-layer in Konva
- Lazy page loading (prevent browser crashes)
- Basic layer management

**Addresses:**
- PDF Rendering (from ARCHITECTURE.md)
- Multi-page PDF handling
- Large PDF performance (Pitfall 8)

**Uses:**
- pdfjs-dist (from STACK.md)
- Document Viewer component (from ARCHITECTURE.md)

**Avoids:**
- Large PDF rendering crashes (Pitfall 8)
- Rendering entire PDF at once (Anti-pattern from ARCHITECTURE.md)

### Phase 3: Drawing Tools (Arrow, Text, Stamps)

**Rationale:** Core markup tools are needed once documents are rendered. These are high-value, low-complexity features using Konva's native capabilities.

**Delivers:**
- Arrow tool (Konva.Arrow + Transformer)
- Text with leader lines
- Simple stamp library (APPROVED, REVISED, NOTE)
- Element selection and editing (Konva.Transformer)

**Addresses:**
- Arrow Tool (P1 feature from FEATURES.md)
- Text with Leader Lines (P1 feature)
- Simple Stamps (P1 feature)

**Uses:**
- Konva native Transformer (from STACK.md)
- Perfect-freehand optimization (Pitfall 5)

**Avoids:**
- Perfect-freehand drawing quality issues (Pitfall 5)

### Phase 4: Export (PDF + PNG)

**Rationale:** Export is the client deliverable. Requires both document rendering (Phase 2) and annotations (Phase 3/existing canvas). Composite export merges original PDF with annotation overlays.

**Delivers:**
- PNG export (composite document + annotations)
- PDF export with annotation overlays
- Export dialog with quality controls
- Preview before export

**Addresses:**
- Export as PDF (P1 feature from FEATURES.md)

**Uses:**
- html2canvas-pro + jsPDF (from STACK.md)
- Export Service pattern (from ARCHITECTURE.md)

**Avoids:**
- Export quality degradation (Pitfall 9)
- Exporting canvas only without document (Anti-pattern from ARCHITECTURE.md)

### Phase 5: Advanced Collaboration (Measurements, Comments)

**Rationale:** Once core file-based workflow works, add features that differentiate from competitors. Measurements and comments are high-value but not blocking for MVP.

**Delivers:**
- Measurement tools (set scale, measure distance/area)
- Comment threads on elements
- Markup status tracking (open/resolved)
- Cursor throttling and cleanup

**Addresses:**
- Measurement Tools (P2 feature from FEATURES.md)
- Comment/Replies (P2 feature)
- Cursor awareness desync (Pitfall 11)

**Uses:**
- Scale-aware coordinate system (from ARCHITECTURE.md)
- Yjs awareness protocol (from PITFALLS.md)

### Phase 6: Performance & Optimization

**Rationale:** Optimization comes after functionality. Premature optimization risks complexity; address performance once real usage patterns emerge.

**Delivers:**
- Viewport clipping for large canvases
- Progressive rendering
- Cached page rendering
- WebAssembly PDF.js (if needed)

**Addresses:**
- Large canvas performance collapse (Pitfall 4)
- Mobile performance gaps

**Uses:**
- Konva performance tips (from PITFALLS.md)
- Lazy loading patterns (from ARCHITECTURE.md)

### Phase Ordering Rationale

- **Security first:** File upload vulnerabilities enable RCE—must be secure before production
- **Dependencies clear:** Upload → Render → Annotate → Export is the logical data flow
- **Performance after function:** Optimize once real usage patterns emerge
- **Collaboration features build on foundation:** Measurements require scale system; comments require selection
- **Group by architectural layer:** Security layer, then document layer, then annotation layer, then export layer

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (PDF Rendering):** Large file performance patterns; coordinate mapping between PDF and canvas at different zoom levels
- **Phase 5 (Measurements):** Scale-aware coordinate system implementation details
- **Phase 6 (Performance):** Mobile-specific patterns; PDF.js + Konva on low-end tablets

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Well-documented Supabase + Yjs patterns
- **Phase 3 (Drawing Tools):** Konva native features thoroughly documented
- **Phase 4 (Export):** jsPDF + html2canvas patterns well-established

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm/official sources Feb 2025 |
| Features | MEDIUM | WebSearch verified against multiple sources; some inference on engineer-client workflow |
| Architecture | HIGH | Official docs (PDF.js, Konva, Yjs) + established patterns |
| Pitfalls | HIGH | Official GitHub issues, CVE database, Yjs forum, Supabase docs |

**Overall confidence:** HIGH

### Gaps to Address

- **Large file performance:** Engineering drawings can be 50MB+; streaming/progressive loading patterns need validation during Phase 2
- **Coordinate mapping:** PDF coordinates to canvas coordinates at different zoom levels—needs implementation research
- **Mobile performance:** PDF.js + Konva on low-end tablets—device testing required during Phase 6
- **Perfect-freehand fixes:** "Elbows" issue has fixes in tldraw not yet ported—may need custom smoothing

## Sources

### Primary (HIGH confidence)
- [pdfjs-dist npm v5.4.624](https://www.npmjs.com/package/pdfjs-dist) — PDF rendering
- [jsPDF npm v4.1.0](https://www.npmjs.com/package/jspdf) — CVE-2025-68428 patch verified
- [html2canvas-pro npm v1.6.6](https://www.npmjs.com/package/html2canvas-pro) — Active fork
- [Konva Performance Docs](https://konvajs.org/docs/performance/) — Large canvas issues
- [Yjs Official Docs](https://docs.yjs.dev/) — CRDT architecture
- [Yjs Discussion Forum](https://discuss.yjs.dev/) — Memory issues, production challenges
- [Supabase Realtime: Silent Disconnections](https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections) — Disconnect handling
- [Konva: Avoid Memory Leaks (2025)](https://konvajs.org/docs/performance/Avoid_Memory_Leaks.html) — Tween destruction
- [CVE Database](https://nvd.nist.gov/) — Security vulnerabilities (CVE-2024-51367, CVE-2024-48646)
- [MDN: Canvas toDataURL](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL) — Export quality

### Secondary (MEDIUM confidence)
- Building Real-time Collaborative Whiteboard (Medium, May 2025) — Arrow/text patterns
- PDF.js Express Collaboration — Real-time sync patterns
- Nuxt 3 File Upload Best Practices (2025) — Supabase storage
- Ably WebSocket scaling challenges — WebSocket scaling
- Liveblocks: Multiplayer Cursors — Cursor throttling
- IBM 2025 Data Breach Report — File sharing security
- Bluebeam Revu, Autodesk Docs, Drawboard — Competitor feature analysis

### Tertiary (LOW confidence)
- Best Whiteboarding Tools 2025 — Market overview
- Community forum discussions — Integration patterns
- Perfect-freehand GitHub issues — Ongoing fixes

---
*Research completed: 2026-02-10*
*Ready for roadmap: yes*
