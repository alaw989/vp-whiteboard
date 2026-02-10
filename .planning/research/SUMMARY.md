# Project Research Summary

**Project:** vp-whiteboard
**Domain:** Real-time collaborative engineering whiteboard
**Researched:** 2025-02-09
**Confidence:** HIGH

## Executive Summary

vp-whiteboard is a collaborative whiteboard application focused on engineering/technical drawings, deployed to DigitalOcean. Expert builders in 2025 use CRDT-based real-time sync (Yjs) with self-hosted WebSocket servers (Hocuspocus) rather than managed services like Liveblocks, due to data residency requirements for engineering work. The canvas layer uses either tldraw SDK (purpose-built) or Konva.js (custom implementation) for performance. Deployment targets DigitalOcean droplets with PostgreSQL 17, MinIO for file storage, and Nginx for WebSocket proxying.

The recommended approach prioritizes self-hosted infrastructure over SaaS for authentication, file storage, and real-time sync—engineering organizations cannot risk vendor lock-in with confidential IP. The architecture follows a CRDT-first pattern: clients maintain local state with Yjs, WebSocket servers relay updates via Redis pub/sub for horizontal scaling, and PostgreSQL persists metadata and incremental updates. This pattern avoids centralized operational transformation complexity and enables offline-first support.

Key risks demand immediate attention: CRDT memory bloat (Yjs documents grow unbounded without garbage collection), WebSocket connection fragility (requiring robust heartbeat/reconnection), and large canvas performance collapse (viewport clipping and layer management are non-negotiable). Security pitfalls around file upload validation and WebSocket authentication bypass must be addressed in Phase 1—CVE reports show these are production-critical vulnerabilities.

## Key Findings

### Recommended Stack

The research strongly favors a modern, self-hosted stack. Frontend uses Next.js 15 with React 19 for Server Actions stability and Turbopack builds. Real-time collaboration uses Yjs 13.6.29 (stable CRDT) with Hocuspocus 3.4+ WebSocket server—self-hosted to avoid vendor lock-in. Database is PostgreSQL 17 with Drizzle ORM for better TypeScript integration than Prisma. Authentication uses Auth.js v5 (self-hosted) rather than Clerk. File storage is MinIO (S3-compatible, self-hosted) rather than AWS S3 or DO Spaces.

**Core technologies:**
- **Next.js 15 + React 19** — Full-stack framework with Turbopack, Server Actions stable, excellent real-time ecosystem
- **Yjs 13.6.29 + Hocuspocus 3.4+** — CRDT for conflict-free sync with self-hosted WebSocket server, actively maintained
- **tldraw SDK 4.2.3 or Konva.js 9.3+** — Canvas rendering; tldraw for speed-to-market, Konva for custom control
- **PostgreSQL 17 + Drizzle ORM** — 94% faster queries than v16, better JSONB for document storage
- **Auth.js v5** — Self-hosted auth with Next.js 15 App Router support, avoid Clerk's managed-only model
- **MinIO** — Self-hosted S3-compatible storage with object locking for engineering document retention

### Expected Features

The engineering whiteboard market has a gap between general-purpose tools (Miro, FigJam) and CAD-specific tools (Onshape, SolidWorks). Table stakes are standard whiteboard features: infinite canvas, real-time multiplayer, basic drawing tools, sticky notes, comments, undo/redo, export, shareable links, guest access, and responsive design.

Differentiators for engineering use cases are: CAD file import (DWG/DXF), PDF markup/redlining, precision tools (grid/snap/measure), engineering shape libraries, version history with restore, layer management, real-time measurements, and Jira/GitHub integration.

**Must have (table stakes):**
- **Infinite canvas with pan/zoom** — users expect space for large drawings
- **Real-time multiplayer editing** — simultaneous collaboration with presence indicators
- **Basic drawing tools + sticky notes** — pen, highlighter, shapes, lines, arrows
- **Comments/annotations** — feedback mechanism for review workflows
- **Shareable links + guest access** — primary collaboration mechanism
- **Export to PNG/PDF** — share work outside the platform

**Should have (competitive):**
- **PDF markup/import** — engineering drawings distributed as PDFs
- **Grid + snap-to-grid** — engineers need accuracy, not freeform
- **Engineering shape libraries** — pre-built symbols for electrical/mechanical
- **Version history** — engineering changes are critical, rollback mandatory

**Defer (v2+):**
- **CAD file import (DWG/DXF)** — high complexity, defer until PDF workflow proven
- **Built-in video/audio** — use existing tools (Zoom, Teams) instead
- **Mobile apps (iOS/Android)** — responsive web covers tablet use case
- **AI features** — validate utility first, engineering requires precision

### Architecture Approach

The recommended architecture follows a CRDT-first pattern with horizontal scaling via Redis pub/sub. Clients maintain local Yjs state and connect via WebSocket to Hocuspocus servers. Multiple WebSocket instances coordinate via Redis for message distribution. PostgreSQL stores metadata, permissions, and incremental CRDT updates. MinIO handles file uploads (images, PDFs, blueprints) with presigned URLs. Nginx provides TLS termination and WebSocket proxying with extended timeouts.

**Major components:**
1. **Client (Yjs + Canvas)** — Local CRDT state, UI rendering, offline support; connects to WebSocket server
2. **WebSocket Server (Hocuspocus)** — Connection management, message relay, auth validation, persistence to PostgreSQL
3. **Redis Pub/Sub** — Cross-server message distribution and presence tracking for horizontal scaling
4. **PostgreSQL** — User auth, board metadata, permissions, incremental updates, snapshots
5. **MinIO** — File storage with presigned URLs, object locking for retention
6. **Load Balancer (Nginx)** — TLS termination, connection distribution, health checks

### Critical Pitfalls

Research identified critical pitfalls that cause rewrites or production incidents. These must be addressed early.

1. **CRDT Memory Bloat** — Yjs documents grow unbounded; deleted entries remain as tombstones. Prevention: implement document size limits (10,000 elements or 50MB), use subdocuments for board sections, periodic state compression via snapshots. Foundation phase issue.

2. **WebSocket Connection Fragility** — Connections drop silently, state desynchronizes, users lose work. Prevention: bidirectional heartbeat (30-sec timeout), on reconnect fetch full server state, exponential backoff reconnection, store pending ops locally until server confirmation. Foundation phase issue.

3. **Large Canvas Performance Collapse** — Canvas becomes unresponsive with 500-1000+ elements. Prevention: viewport clipping (only render visible), Konva layer management, shape caching, pixel ratio handling for mobile, drag layer pattern. Performance phase issue.

4. **File Upload Security Vulnerabilities** — Arbitrary file upload allowing RCE, phishing, ZIP bomb DoS. Prevention: server-side magic byte validation, file size limits, malware scanning, private buckets with signed URLs, rate limiting. Security phase (Phase 1).

5. **Authentication Bypass via WebSocket** — WebSocket connections accepted without proper token validation. Prevention: require valid JWT on connection, validate with auth provider before accepting, use RLS policies, log all connections. Security phase (Phase 1).

## Implications for Roadmap

Based on combined research, the roadmap should follow a dependency-driven order that addresses critical pitfalls early while delivering value incrementally.

### Phase 1: Foundation + Security

**Rationale:** Authentication, database schema, and basic WebSocket infrastructure are prerequisites for all collaborative features. Security pitfalls (file upload, auth bypass) must be addressed before any production use. CRDT memory limits must be established before users create real content.

**Delivers:** Working authentication system, database with users/boards/permissions tables, basic WebSocket server with Yjs integration, secure file upload flow

**Addresses:** User registration/login, board creation, JWT-based auth, file upload with validation, basic canvas (single-user)

**Avoids:** CRDT memory bloat (document limits enforced from start), authentication bypass (JWT validated on WebSocket), file upload vulnerabilities (server-side validation, private storage)

**Stack used:** Next.js 15, React 19, PostgreSQL 17, Drizzle ORM, Auth.js v5, Yjs, Hocuspocus, MinIO, Valibot

### Phase 2: Real-Time Collaboration

**Rationale:** Once foundation is secure, enable multiplayer functionality. This is the core value proposition. WebSocket fragility must be addressed here—heartbeat, reconnection, and state sync are critical for user trust.

**Delivers:** Real-time canvas sync, presence indicators (cursors, online users), comments/annotations system, undo/redo (with proper persistence)

**Addresses:** Real-time multiplayer editing, presence tracking, threaded comments, shareable links, guest access

**Avoids:** Data loss on network interruption (IndexedDB persistence, pending ops queue), undo/redo corruption (persist undo stack separately), cursor awareness desync (throttle updates, proper cleanup)

**Stack used:** Yjs awareness, Redis (for presence), IndexedDB (client-side persistence)

### Phase 3: Performance + Engineering Features

**Rationale:** With collaboration working, optimize for larger canvases and add engineering-specific features. Canvas performance collapse becomes critical as boards grow. Engineering differentiators (PDF markup, precision tools) provide competitive advantage.

**Delivers:** Performance optimizations (viewport clipping, layer management), PDF markup/import, grid + snap-to-grid, engineering shape libraries, version history

**Addresses:** Large canvas performance, PDF redlining workflow, engineering precision requirements, version rollback

**Avoids:** Large canvas collapse (viewport clipping, shape caching, drag layer), coordinate precision loss (fixed precision storage, grid snapping)

**Stack used:** Konva performance optimizations, PDF rendering library, custom grid/snap system

### Phase 4: Scaling + Advanced Features

**Rationale:** After product-market fit validation, scale infrastructure. DigitalOcean connection limits become relevant here. Advanced integrations provide enterprise value.

**Delivers:** Horizontal scaling (multiple WebSocket instances, Redis pub/sub), load balancer configuration, Jira/GitHub integration, measurements + scale awareness, layer management

**Addresses:** Scaling beyond single droplet, third-party integrations, advanced engineering features

**Avoids:** DO connection limits (increase ulimits, load balancing, monitor connections)

**Stack used:** Redis pub/sub, Nginx load balancing, OAuth for integrations

### Phase Ordering Rationale

The order follows critical dependencies: security and database before collaboration, collaboration before performance optimization, performance before scaling. This ensures users get working features at each phase while addressing the most dangerous pitfalls (auth bypass, file upload security, CRDT bloat) before they can cause production incidents.

Grouping is based on architecture components: Phase 1 builds client + database + auth + single WebSocket instance. Phase 2 adds real-time sync + presence. Phase 3 adds canvas optimizations + engineering features. Phase 4 adds horizontal scaling + integrations.

This ordering avoids pitfalls by establishing security and memory limits before users store real data, building robust reconnection logic before collaboration depends on it, and optimizing canvas performance before boards get large enough to fail.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 3 (PDF/CAD Rendering):** Specific libraries for technical drawing annotation need deeper investigation—PDF.js vs react-pdf vs custom canvas rendering for markup
- **Phase 4 (WebSocket Scaling):** Multi-droplet setup with Redis for session sharing—specific DigitalOcean Managed Redis configuration for pub/sub workloads
- **Phase 4 (CAD File Import):** DWG/DXF parsing libraries or external conversion services—complex formats with limited open-source options

Phases with standard patterns (skip research-phase):

- **Phase 1 (Foundation):** Next.js 15 + Auth.js v5 + Drizzle ORM is well-documented with established patterns
- **Phase 2 (Real-Time Collaboration):** Yjs + Hocuspocus has excellent documentation and example implementations
- **Phase 3 (Performance):** Konva performance optimizations are thoroughly documented in official guides

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official docs confirm all recommended versions (Next.js 15, Yjs 13.6.29, Hocuspocus 3.4+, PostgreSQL 17) |
| Features | MEDIUM | Based on competitive analysis and product references; engineering-specific workflow validation needed |
| Architecture | HIGH | CRDT + WebSocket + Redis pattern is battle-tested; DigitalOcean-specific scaling based on documented case studies |
| Pitfalls | HIGH | Security vulnerabilities from CVE database, Yjs memory issues from official forum, canvas performance from Konva docs |

**Overall confidence:** HIGH

The stack and architecture recommendations are based on official documentation and high-confidence sources. Feature recommendations are based on competitive analysis—reasonable but may need validation with actual engineering users. Pitfall research is based on CVE reports and official project issues—these are production-critical and well-documented.

### Gaps to Address

- **Yjs on DigitalOcean specifically:** Limited production reports of Yjs deployment on DO droplets—case studies exist but not specific to this stack combination
- **Engineering workflow validation:** PDF markup and precision tool requirements based on general analysis—actual engineering user interviews would validate prioritization
- **CAD file import complexity:** DWG/DXF parsing deferred to Phase 4 research—formats are complex with limited open-source options
- **Undo/redo in multiplayer:** Yjs UndoManager has known issues documented, but production patterns for persistence are less documented

These gaps are acceptable for roadmap creation—phase-specific research can address CAD import and workflow validation when those phases are planned.

## Sources

### Primary (HIGH confidence)
- [Next.js 15 Release Notes](https://nextjs.org/blog/next-15) — Turbopack default, React 19 support, Server Actions stable
- [Yjs Official Documentation](https://docs.yjs.dev/) — CRDT architecture, network agnostic design
- [Yjs GitHub Issues](https://github.com/yjs/yjs/issues) — Memory bloat (#741), UndoManager bugs (#611)
- [Yjs Discussion Forum](https://discuss.yjs.dev/) — Production memory requirements, sync issues, tombstone leaks
- [Hocuspocus Documentation](https://tiptap.dev/docs/hocuspocus/) — WebSocket server for Yjs, auth hooks
- [PostgreSQL 17 Release Notes](https://www.postgresql.org/docs/release/17.0/) — 94% faster queries, enhanced JSONB
- [Konva Performance Docs](https://konvajs.org/docs/performance/) — Canvas optimization, viewport clipping
- [CVE Database (NVD)] — CVE-2024-51367 (arbitrary file upload), CVE-2024-48646 (unrestricted upload)
- [DigitalOcean Docs](https://docs.digitalocean.com/) — Load balancer limits, droplet sizing
- [Auth.js v5 Documentation](https://authjs.dev/) — Next.js 15 App Router support, self-hosted

### Secondary (MEDIUM confidence)
- [Velt - Best CRDT Libraries 2025](https://velt.dev/blog/best-crdt-libraries-real-time-data-sync) — CRDT library comparison
- [Drizzle vs Prisma 2025 Comparison](https://www.bytebase.com/blog/drizzle-vs-prisma/) — ORM performance comparison
- [Bun vs Node.js 2025 Performance](https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide) — Runtime benchmarks
- [Konva vs Fabric.js Comparison](https://medium.com/@www.blog4j.com/konva-js-vs-fabric-js-in-depth-technical-comparison-and-use-case-analysis) — Canvas engine comparison
- [Valibot vs Zod Comparison](https://valibot.dev/guides/comparison/) — Validation library performance
- [Ably WebSocket scaling challenges](https://dev.to/ably/challenges-of-scaling-websockets-3493) — WebSocket scaling patterns
- [FastAPI 45k concurrent WebSockets on DO droplet](https://medium.com/@ar.aldhafeeri11/part-1-fastapi-45k-concurrent-websocket-on-single-digitalocean-droplet-1e4fce4c5a64) — DO connection limits case study

### Tertiary (LOW confidence)
- [Best Whiteboarding Tools 2025](https://mockflow.com/blog/best-whiteboarding-tools) — General market overview
- [Forbes: Feature Bloat in Enterprise Software 2025](https://www.forbes.com/councils/forbestechcouncil/2025/01/09/navigating-feature-bloat-in-enterprise-software-a-guide-to-building-smart/) — Opinion piece on feature bloat
- [Concepts App Precision Tools](https://concepts.app/en/windows/manual/precisiontools) — Product reference for precision features

---
*Research completed: 2025-02-09*
*Ready for roadmap: yes*
