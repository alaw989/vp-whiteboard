# Domain Pitfalls: Collaborative Engineering Whiteboard

**Domain:** Real-time collaborative whiteboard for engineering/technical use cases
**Researched:** 2026-02-09
**Overall confidence:** MEDIUM

## Executive Summary

Collaborative whiteboards face a distinct set of production challenges that differ from typical web applications. The convergence of real-time CRDT synchronization, canvas rendering performance, WebSocket state management, and engineering-specific precision requirements creates multiple failure modes that commonly cause rewrites or major architectural changes.

Based on research of production issues, CVE reports, and community discussions from 2024-2025, the most critical pitfalls cluster around: (1) CRDT memory bloat and lack of garbage collection, (2) WebSocket state management at scale, (3) large canvas performance degradation, and (4) security vulnerabilities in file upload and authentication flows.

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or production incidents.

### Pitfall 1: CRDT Memory Bloat Without Garbage Collection

**What goes wrong:**
Y.js documents grow unbounded in memory. Deleted entries remain as "tombstones" that are never cleaned up. Production reports show 40MB+ documents growing to 4GB+ during encoding operations. Tombstone accumulation from deleted map entries causes permanent memory leaks.

**Why it happens:**
CRDTs require tombstones to track deletions for proper conflict resolution. Y.js has no built-in garbage collection mechanism. Every write operation grows the document state, even when deleting content. Large whiteboards with thousands of elements create massive update histories.

**Consequences:**
- Server memory exhaustion leading to crashes
- Database storage bloat (updates are 20-75x document size in some scenarios)
- Unacceptable load times for existing boards
- Cannot implement "hard limits" without breaking CRDT guarantees

**Prevention strategy:**
1. Implement document size limits from day one (e.g., 10,000 elements or 50MB compressed)
2. Use Y.js subdocuments for different board sections to isolate memory impact
3. Implement periodic "state compression" by creating clean snapshot documents
4. Monitor memory usage per document and alert on growth patterns
5. Consider alternative CRDT libraries with built-in GC (Loro) if GC is critical

**Detection (warning signs):**
- Memory usage grows consistently even when users delete content
- Document encoding operations take longer than expected
- Server memory increases proportionally to active user count

**Phase to address:** Foundation Phase (Phase 1). This must be architected before users create real content.

**Sources:**
- [Yjs memory requirements discussion](https://discuss.yjs.dev/t/understanding-memory-requirements-for-production-usage/198) (HIGH confidence - official forum)
- [Yjs tombstone memory leak issue](https://github.com/yjs/yjs/issues/741) (HIGH confidence - official repo)
- [y-redis memory not decreasing issue](https://discuss.yjs.dev/t/issue-where-y-redis-memory-does-not-decrease-after-being-loaded/2554) (HIGH confidence - official forum)

---

### Pitfall 2: WebSocket Connection State Fragility

**What goes wrong:**
WebSocket connections drop silently, state becomes desynchronized across servers, and reconnection logic causes duplicate updates or lost data. Users see cursors from disconnected users, or their own changes disappear after reconnecting.

**Why it happens:**
WebSocket connections are stateful and fragile. Network interruptions, server restarts, and browser tab sleeping all break connections. Without proper heartbeat, reconnection, and state reconciliation logic, clients and servers diverge.

**Consequences:**
- Users lose work when connections drop
- Ghost cursors and presence indicators from disconnected users
- Duplicate elements created during reconnection
- Single server restart affects all active users

**Prevention strategy:**
1. Implement bidirectional heartbeat/ping-pong with 30-second timeout
2. On reconnect: always fetch full server state and apply diff
3. Use Y.js awareness protocol for proper presence cleanup
4. Implement exponential backoff for reconnection attempts
5. Store pending operations locally until server confirmation
6. Consider y-websocket's built-in reconnection with proper state sync

**Detection (warning signs):**
- Users report "my changes disappeared"
- Multiple cursors shown for same user
- Board state differs between users who should be in sync
- High frequency of WebSocket reconnect errors in logs

**Phase to address:** Foundation Phase (Phase 1). Connection resilience must be built before collaborative features.

**Sources:**
- [Ably WebSocket scaling challenges](https://dev.to/ably/challenges-of-scaling-websockets-3493) (MEDIUM confidence - 2024)
- [Challenges of scaling WebSockets](https://nooptoday.com/why-websockets-are-hard-to-scale/) (MEDIUM confidence)
- [Yjs discussion on sync issues](https://discuss.yjs.dev/t/without-real-clocks-how-can-the-order-of-offline-changes-be-known/2189) (HIGH confidence - official forum)

---

### Pitfall 3: Large Canvas Performance Collapse

**What goes wrong:**
Canvas becomes unresponsive when element count exceeds ~500-1000. Freehand drawing lags significantly, especially on large screens. Zooming and panning stutter. CPU usage spikes to 100%.

**Why it happens:**
Konva redraws the entire canvas on every change. Large canvases (5000x5000+) require moving massive amounts of pixel data to screen. Each element requires computation for hit testing and event handling. Retina displays multiply this by 2-4x.

**Consequences:**
- Drawing becomes "really laggy" per user reports
- Mobile devices become unusable
- Browser tab may crash
- Cannot support engineering diagrams with hundreds of elements

**Prevention strategy:**
1. Implement viewport clipping (only render visible area)
2. Use Konva layer management to isolate static vs dynamic content
3. Enable shape caching for complex elements
4. Set `Konva.pixelRatio = 1` for mobile/retina devices
5. Use `listening(false)` on static layers and shapes
6. Implement drag layer pattern (move dragged element to dedicated layer)
7. Consider progressive rendering for initial load
8. Set maximum canvas size and enforce it

**Detection (warning signs):**
- Frame rate drops below 30fps during drawing
- Drawing delay noticeable on mouse/touch input
- CPU profiler shows canvas operations taking >16ms per frame
- Performance acceptable on desktop but not mobile

**Phase to address:** Performance Phase (Phase 2). Start with viewport limits and basic optimizations before adding features.

**Sources:**
- [Konva All Performance Tips](https://konvajs.org/docs/performance/All_Performance_Tips.html) (HIGH confidence - official docs)
- [7000x8000 canvas rendering discussion](https://www.reddit.com/r/webgl/comments/1ga71y4/rendering_1k_elements_on_a_70008000_canvas/) (MEDIUM confidence - community)
- [Konva performance issue on large screens](https://stackoverflow.com/questions/77057820/konva-free-drawing-slows-down-on-large-screens) (MEDIUM confidence - community)

---

### Pitfall 4: File Upload Security Vulnerabilities

**What goes wrong:**
Arbitrary file upload allowing code execution, phishing through uploaded files, ZIP bomb DoS attacks, no file type validation, files publicly accessible without authentication.

**Why it happens:**
Many implementations only validate file extensions client-side. Server-side validation is missing or incomplete. File parsers (image processing) have vulnerabilities. Files stored in publicly accessible buckets without access controls.

**Consequences:**
- Remote code execution on server (CVE-2024-51367, CVE-2024-48646)
- Server compromise through malicious files
- Phishing attacks using uploaded content
- DoS from file bombs
- Data leakage from public file access

**Prevention strategy:**
1. Server-side file type validation using magic bytes, not extensions
2. Enforce file size limits with strict rejection
3. Scan uploads for malware (ClamAV or cloud service)
4. Store files in private buckets with signed URLs
5. Implement RLS on file metadata in Supabase
6. Use separate domain for file serving (CORS isolation)
7. Sanitize image metadata (EXIF stripping)
8. Rate limit uploads per user

**Detection (warning signs):**
- File validation only in client-side code
- Files accessible via direct URL without authentication
- No virus/malware scanning implemented
- File size limits enforced only client-side

**Phase to address:** Security Phase (Phase 1). Must be implemented before any file upload feature goes to production.

**Sources:**
- [CVE-2024-51367: BlackBoard arbitrary file upload](https://nvd.nist.gov/vuln/detail/CVE-2024-51367) (HIGH confidence - CVE)
- [CVE-2024-48646: Sage 1000 unrestricted file upload](https://nvd.nist.gov/vuln/detail/CVE-2024-48646) (HIGH confidence - CVE)
- [Supabase security misconfiguration article](https://medium.com/@ctrl_cipher/how-misconfigured-supabase-apis-exposed-sensitive-data-across-thousands-of-organizations-162e24363c22) (MEDIUM confidence - 2024)

---

### Pitfall 5: Authentication Bypass via WebSocket

**What goes wrong:**
WebSocket connections accepted without proper authentication token validation. User IDs from query parameters trusted without verification. Session tokens not validated on WebSocket upgrade.

**Why it happens:**
WebSocket upgrade happens separately from HTTP authentication flow. Developers often skip auth validation on WebSocket endpoint for simplicity. Query parameters treated as trusted user identity.

**Consequences:**
- Unauthorized users access private whiteboards
- Impersonation attacks by manipulating user ID parameters
- Data leakage to unauthorized parties
- Unable to audit who accessed what

**Prevention strategy:**
1. Require valid JWT token on WebSocket connection (query param or subprotocol)
2. Validate token with Supabase Auth before accepting connection
3. Use Row Level Security (RLS) policies for all data access
4. Implement proper session management with token refresh
5. Log all WebSocket connections with user identity
6. Use Supabase Realtime authorization for broadcast/presence

**Detection (warning signs):**
- WebSocket accepts connection without any token
- User ID read directly from query parameters without validation
- No RLS policies on whiteboard data tables
- Cannot track which user made which changes

**Phase to address:** Security Phase (Phase 1). Authentication must be implemented before any collaborative features.

**Sources:**
- [Supabase Realtime Broadcast and Presence Authorization](https://supabase.com/blog/supabase-realtime-broadcast-and-presence-authorization) (HIGH confidence - official blog)
- [Supabase Auth ultimate guide](https://www.supaboost.dev/blog/supabase-auth) (MEDIUM confidence - community)
- [CVE-2024-45409: GitLab SAML auth bypass](https://nvd.nist.gov/vuln/detail/CVE-2024-45409) (HIGH confidence - CVE - related pattern)

---

## Moderate Pitfalls

Significant issues that cause problems but may not require complete rewrites.

### Pitfall 6: Undo/Redo State Corruption

**What goes wrong:**
UndoManager doesn't persist metadata properly. Cross-system undo fails when mixing CRDT implementations. Undo history lost when document reloads. Selective undo causes conflicts.

**Why it happens:**
Y.js UndoManager has known issues with metadata persistence across undo/redo stack operations. Time travel requires manual comparison and merging. Undo state is not persisted with document.

**Consequences:**
- Users cannot undo changes reliably
- Undo causes unexpected state changes
- Lost work when relying on undo
- User frustration with unpredictable behavior

**Prevention strategy:**
1. Persist undo stack state separately from document
2. Implement custom UndoManager with proper metadata handling
3. Consider operation-based undo instead of state-based undo
4. Clear communication about undo limitations in collaborative scenarios
5. Test undo extensively with concurrent users

**Detection (warning signs):**
- Undo doesn't restore expected state
- Undo history disappears on page refresh
- Undo behaves differently with multiple users

**Phase to address:** Collaboration Phase (Phase 2). Critical for user experience but not blocking initial MVP.

**Sources:**
- [Yjs UndoManager meta persistence issue](https://github.com/yjs/yjs/issues/611) (HIGH confidence - official repo)
- [Yjs undo/redo history persistence discussion](https://discuss.yjs.dev/t/how-to-keep-undo-redo-history-after-doc-disappears/2469) (HIGH confidence - official forum)
- [CRDT undo research paper 2024](https://arxiv.org/html/2404.11308v1) (MEDIUM confidence - academic)

---

### Pitfall 7: Cursor/Pointer Awareness Desync

**What goes wrong:**
Cursors lag behind actual user position. Cursors persist after users leave. Multiple cursors shown for same user. Cursor position jumps unpredictably.

**Why it happens:**
Network latency causes position updates to arrive late. No proper cleanup on disconnect. Throttling not implemented causing excessive updates. Cursor state managed separately from document state.

**Consequences:**
- Confusing user experience
- Difficulty collaborating in real-time
- "Ghost" cursors from disconnected users
- Unnecessary bandwidth usage

**Prevention strategy:**
1. Implement cursor update throttling (50-100ms)
2. Use Y.js awareness protocol with proper timeout
3. Clear cursor state on disconnect with heartbeat
4. Interpolate cursor position for smooth movement
5. Hide cursors for inactive users after timeout

**Detection (warning signs):**
- Cursors visible after users close browser
- Cursor position updates faster than screen refresh
- Multiple cursors with same name/color
- High WebSocket message rate from cursor updates

**Phase to address:** Collaboration Phase (Phase 2). Nice-to-have for MVP but essential for production.

**Sources:**
- [How to animate multiplayer cursors (Liveblocks)](https://liveblocks.io/blog/how-to-animate-multiplayer-cursors) (MEDIUM confidence - 2022 but still relevant)
- [Presence indicators guide (Superviz)](https://dev.to/superviz/how-to-use-presence-indicators-like-live-cursors-to-enhance-user-experience-38jn) (MEDIUM confidence - 2024)

---

### Pitfall 8: DigitalOcean Droplet Connection Limits

**What goes wrong:**
Droplet hits connection limit around 500-1000 concurrent WebSocket connections. New connections rejected. Existing connections become unstable. Server becomes unresponsive.

**Why it happens:**
Default Linux file descriptor limits. Single droplet has practical connection limits based on RAM and CPU. No load balancing or horizontal scaling implemented.

**Consequences:**
- Users cannot connect during peak usage
- Existing connections become unstable
- Server crashes under load
- Poor user experience during collaboration sessions

**Prevention strategy:**
1. Increase ulimit for file descriptors on server
2. Implement connection pooling and proper cleanup
3. Use DigitalOcean Load Balancer for horizontal scaling
4. Monitor active connections and set alerts
5. Consider upgrading to Premium CPU droplets (10 Gbps vs 2 Gbps)
6. Implement graceful degradation when near limits

**Detection (warning signs):**
- "EMFILE: too many open files" errors
- Connection failures during peak usage
- Server becomes slow with high concurrent users
- Cannot exceed ~500 concurrent connections

**Phase to address:** Scaling Phase (Phase 3). Can start with single droplet but need scaling plan before growth.

**Sources:**
- [FastAPI 45k concurrent WebSockets on DO droplet](https://medium.com/@ar.aldhafeeri11/part-1-fastapi-45k-concurrent-websocket-on-single-digitalocean-droplet-1e4fce4c5a64) (MEDIUM confidence - case study)
- [DigitalOcean Load Balancer limits docs](https://docs.digitalocean.com/products/networking/load-balancers/details/limits/) (HIGH confidence - official docs)
- [DO Load Balancer scaling to 1M+ connections](https://www.digitalocean.com/blog/load-balancer-scaling-to-1000000-connections) (HIGH confidence - official blog 2024)

---

### Pitfall 9: Data Loss on Network Interruption

**What goes wrong:**
Changes lost when connection drops. Local changes not persisted. Conflicting changes applied incorrectly on reconnect. No offline support.

**Why it happens:**
No pending operation queue. Local storage fallback incomplete. Y.js updates not persisted before sending. Conflict resolution not handled properly during reconnection.

**Consequences:**
- Users lose work when network unstable
- Frustrating user experience
- Cannot use on unreliable connections
- Data inconsistency between clients

**Prevention strategy:**
1. Persist all Y.js updates to IndexedDB immediately
2. Implement pending operations queue
3. On reconnect: sync full state and resolve conflicts
4. Show clear connection status to users
5. Auto-save to server on interval + on change
6. Implement conflict resolution UI for severe cases

**Detection (warning signs):**
- Changes disappear when browser refreshes
- No indication of connection status
- Different users see different content
- No offline functionality

**Phase to address:** Reliability Phase (Phase 2). Critical for user trust but not blocking initial development.

**Sources:**
- [Yjs network agnostic documentation](https://docs.yjs.dev/) (HIGH confidence - official docs)
- [Local-first conf reflections](https://norman.life/posts/local-first-conf) (LOW confidence - blog post)

---

## Minor Pitfalls

Issues that cause annoyance or require workarounds but don't severely impact functionality.

### Pitfall 10: Coordinate Precision Loss

**What goes wrong:**
Engineering drawings require precision but floating-point arithmetic causes drift. Positions don't align exactly. Grid snapping doesn't match engineering requirements. Dimensions don't match specified values.

**Why it happens:**
JavaScript uses 64-bit floats with precision limitations. Konva coordinates are pixel-based. No dedicated coordinate system for technical drawings.

**Consequences:**
- Drawings don't align properly
- Dimensions slightly off
- Professional users frustrated
- Cannot import/export CAD files accurately

**Prevention strategy:**
1. Store coordinates as integers or decimals with fixed precision
2. Implement grid snapping at configurable intervals
3. Use a virtual coordinate system for engineering features
4. Provide dimension tools with precise measurement display
5. Consider separate "precision mode" for technical drawings

**Detection (warning signs):**
- Dimension measurements inconsistent
- Elements don't align to grid properly
- CAD imports have wrong positions

**Phase to address:** Engineering Features Phase (Phase 3). Only critical for engineering/technical use cases.

**Sources:**
- [AutoCAD 2024 Precision documentation](https://help.autodesk.com/view/ACD/2024/ENU/?guid=GUID-061A5ED6-E7F7-437E-978B-58146316EF40) (HIGH confidence - official docs)
- [How to prepare perfect engineering drawing](https://xometry.pro/en-tr/articles/prepare-technical-drawing/) (MEDIUM confidence - guide)

---

### Pitfall 11: Browser Incompatibility Issues

**What goes wrong:**
Features work in Chrome but not Safari. Mobile browsers have different touch behaviors. Performance varies wildly across browsers. Canvas rendering differs.

**Why it happens:**
Safari has different WebGL/Canvas implementation. Touch events handled differently. Mobile performance much lower. Browser-specific bugs in Konva or Y.js libraries.

**Consequences:**
- Safari users cannot use certain features
- Mobile experience is poor
- Hard to reproduce bugs
- Support burden increased

**Prevention strategy:**
1. Test on Safari, Chrome, Firefox, Edge regularly
2. Test on mobile devices (iOS Safari, Chrome Android)
3. Implement feature detection with graceful degradation
4. Use Konva's pixel ratio handling for mobile
5. Performance testing on lowest-spec target device

**Detection (warning signs):**
- Bug reports specific to Safari
- Mobile users complain about performance
- Different behavior across browsers

**Phase to address:** Testing Phase (ongoing). Should be tested from Phase 1 but not blocking.

**Sources:**
- [Konva Safari iOS 15 performance issue](https://github.com/konvajs/konva/issues/1182) (HIGH confidence - official repo)
- [Konva pixel ratio documentation](https://konvajs.org/docs/performance/All_Performance_Tips.html) (HIGH confidence - official docs)

---

### Pitfall 12: Export/Import Complexity

**What goes wrong:**
Exported boards don't import correctly. Large boards fail to export. Imported boards have missing elements. Format compatibility issues.

**Why it happens:**
Complex CRDT state difficult to serialize. Large canvases exceed export size limits. Element references lost during export. No standard format for whiteboard content.

**Consequences:**
- Users cannot backup their work
- Cannot share boards with non-users
- Data lock-in
- Migration difficult

**Prevention strategy:**
1. Use simple JSON format for exports (snapshot, not full CRDT state)
2. Implement chunked export for large boards
3. Validate export format with import tests
4. Support common formats (PNG, SVG, PDF)
5. Document export format for third-party tools

**Detection (warning signs):**
- Export fails on large boards
- Import produces different result than export
- Cannot export to standard formats

**Phase to address:** Data Portability Phase (Phase 3). Not critical for MVP but important for production.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Phase 1: Foundation** | WebSocket connection fragility | Implement heartbeat, reconnection logic, and state sync from day one |
| **Phase 1: Foundation** | CRDT memory bloat | Set document size limits, implement monitoring, use subdocuments |
| **Phase 1: Foundation** | File upload security | Server-side validation, RLS, private storage, malware scanning |
| **Phase 1: Foundation** | Authentication bypass | Validate JWT on WebSocket, use RLS, implement proper session management |
| **Phase 2: Performance** | Large canvas collapse | Viewport clipping, layer management, shape caching, pixel ratio handling |
| **Phase 2: Performance** | Data loss on network | IndexedDB persistence, pending ops queue, clear status indicators |
| **Phase 2: Collaboration** | Undo/redo corruption | Persist undo stack, custom UndoManager, test extensively |
| **Phase 2: Collaboration** | Cursor awareness desync | Throttle updates, use awareness protocol, proper cleanup |
| **Phase 3: Scaling** | DO connection limits | Increase ulimits, implement load balancing, monitor connections |
| **Phase 3: Engineering** | Coordinate precision | Fixed precision storage, grid snapping, virtual coordinate system |
| **Phase 3: Portability** | Export/import complexity | Simple JSON format, chunked export, validate round-trip |

---

## Sources Summary

| Source | Confidence | Topics Covered |
|--------|-----------|----------------|
| [Yjs Official Docs](https://docs.yjs.dev/) | HIGH | CRDT architecture, network agnostic design |
| [Yjs Discussion Forum](https://discuss.yjs.dev/) | HIGH | Memory issues, sync problems, production challenges |
| [Yjs GitHub Issues](https://github.com/yjs/yjs/issues) | HIGH | UndoManager bugs, tombstone memory leaks |
| [Konva Performance Docs](https://konvajs.org/docs/performance/) | HIGH | Canvas optimization, large canvas issues |
| [Konva GitHub Issues](https://github.com/konvajs/konva/issues) | HIGH | Safari performance, mobile issues |
| [Supabase Official Blog](https://supabase.com/blog/) | HIGH | Realtime auth, RLS, security |
| [DigitalOcean Docs](https://docs.digitalocean.com/) | HIGH | Connection limits, load balancing |
| [CVE Database (NVD)] | HIGH | Security vulnerabilities in file upload, auth |
| [Ably WebSocket Content](https://ably.com/topic/websocket-architecture-best-practices) | MEDIUM | WebSocket scaling challenges |
| [Community/Forum Posts](various) | MEDIUM/LOW | Real-world production issues, workarounds |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| CRDT Memory Issues | HIGH | Multiple official Yjs sources confirm |
| WebSocket Scaling | MEDIUM | Official docs + community case studies |
| Canvas Performance | HIGH | Official Konva docs + multiple community reports |
| Security Vulnerabilities | HIGH | CVE database + official security advisories |
| Engineering Precision | MEDIUM | CAD docs but less specific to whiteboards |
| Undo/Redo Issues | HIGH | Official GitHub issues + academic research |
| Cursor Awareness | MEDIUM | Primarily community implementations |

---

## Gaps to Address

1. **Yjs specific to DigitalOcean deployment:** Limited production reports of Yjs on DO specifically
2. **Engineering whiteboard benchmarks:** No direct performance data for technical drawing workloads
3. **Supabase Realtime with Yjs:** Integration patterns not well documented
4. **Konva vs WebGL for large canvases:** Need more specific data for engineering diagrams

These gaps suggest phase-specific deep-dive research is needed when approaching scaling and engineering features.
