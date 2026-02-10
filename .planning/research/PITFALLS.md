# Domain Pitfalls: Collaborative Engineering Whiteboard

**Domain:** Real-time collaborative whiteboard for engineering/technical use cases
**Researched:** 2026-02-10
**Overall confidence:** HIGH

## Executive Summary

Collaborative whiteboards face a distinct set of production challenges that differ from typical web applications. The convergence of real-time CRDT synchronization, canvas rendering performance, WebSocket state management, and engineering-specific precision requirements creates multiple failure modes that commonly cause rewrites or major architectural changes.

Based on research of production issues, CVE reports, official documentation, and community discussions from 2024-2026, the most critical pitfalls cluster around: (1) CRDT memory bloat and lack of garbage collection, (2) WebSocket connection state fragility and Supabase-specific disconnect issues, (3) large canvas performance collapse with Konva, (4) file upload security vulnerabilities, and (5) drawing quality issues with perfect-freehand.

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
- [BaseHub Yjs UndoManager issues (2025)](https://medium.com/@basehub_dev/migrating-from-yjs-to-sqlite-a-journey-in-performance-and-simplicity-22f1f9b0e0f7) (MEDIUM confidence - 2025 case study)

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

### Pitfall 3: Supabase Realtime Silent Disconnections

**What goes wrong:**
Supabase Realtime connections drop silently without triggering WebSocket close events. Background applications experience disconnections that go undetected. Users lose sync without any error indication.

**Why it happens:**
Supabase Realtime relies on persistent WebSocket connections. Background tabs and mobile apps can experience silent disconnections. Browser throttling of background tabs causes connections to stale without proper close events.

**Consequences:**
- Users think they're connected but changes aren't syncing
- No indication of connection failure
- Work lost when tab returns to foreground
- Requires page refresh to reconnect

**Prevention strategy:**
1. Implement connection status monitoring with heartbeat messages
2. Check for 'disconnected' status and manually call `client.connect()`
3. Show clear connection status indicator to users
4. Implement auto-reconnect on status change
5. Use Supabase's built-in heartbeat monitoring (available Dec 2025)
6. Store pending changes locally until sync confirmation

**Detection (warning signs):**
- No error shown but changes don't propagate
- Users in different tabs see different content
- Changes only appear after page refresh
- Connection shows as "connected" but sync isn't working

**Phase to address:** Foundation Phase (Phase 1). Must implement connection monitoring from day one.

**Sources:**
- [Supabase Realtime: Handling Silent Disconnections (2025)](https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794) (HIGH confidence - official docs)
- [Supabase Realtime Heartbeat Messages (Dec 2025)](https://supabase.com/docs/guides/troubleshooting/realtime-heartbeat-messages) (HIGH confidence - official docs)
- [GitHub: Realtime subscription termination](https://github.com/orgs/supabase/discussions/5312) (MEDIUM confidence - official discussion)

---

### Pitfall 4: Large Canvas Performance Collapse

**What goes wrong:**
Canvas becomes unresponsive when element count exceeds ~500-1000. Freehand drawing lags significantly, especially on large screens. Zooming and panning stutter. CPU usage spikes to 100%. Large images cause RAM-to-GPU transfer slowdowns.

**Why it happens:**
Konva redraws the entire canvas on every change. Large canvases (5000x5000+) require moving massive amounts of pixel data to screen. Each element requires computation for hit testing and event handling. Retina displays multiply this by 2-4x. Large images cause expensive CPU-to-GPU memory transfers.

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
9. Pre-scale images to target resolution to avoid GPU transfer slowdowns

**Detection (warning signs):**
- Frame rate drops below 30fps during drawing
- Drawing delay noticeable on mouse/touch input
- CPU profiler shows canvas operations taking >16ms per frame
- Performance acceptable on desktop but not mobile
- Large image uploads cause visible lag

**Phase to address:** Performance Phase (Phase 2). Start with viewport limits and basic optimizations before adding features.

**Sources:**
- [Konva All Performance Tips](https://konvajs.org/docs/performance/All_Performance_Tips.html) (HIGH confidence - official docs)
- [Konva: How to avoid Memory Leaks](https://konvajs.org/docs/performance/Avoid_Memory_Leaks.html) (HIGH confidence - official docs, updated 2025)
- [Konva GitHub: Fix memory leak for Konva.Image (v8.1.1)](https://github.com/konvajs/konva/blob/master/CHANGELOG.md) (HIGH confidence - official repo)
- [7000x8000 canvas rendering discussion](https://www.reddit.com/r/webgl/comments/1ga71y4/rendering_1k_elements_on_a_70008000_canvas/) (MEDIUM confidence - community)
- [Konva performance issue on large screens](https://stackoverflow.com/questions/77057820/konva-free-drawing-slows-down-on-large-screens) (MEDIUM confidence - community)
- [Boost front-end performance in 2025 with OffscreenCanvas (Aug 2025)](https://www AltaSquare article) (MEDIUM confidence - 2025)

---

### Pitfall 5: Perfect-Freehand Drawing Quality Issues

**What goes wrong:**
Fast drawing creates "elbows" or sharp corners instead of smooth curves. Lines appear jagged when drawing quickly with touch or stylus. Pressure rendering inconsistent or looks unnatural.

**Why it happens:**
Perfect-freehand uses point density for pressure simulation. Rapid point capture during fast drawing causes irregular spacing. The library has a known "elbows" issue where sharp corners appear unexpectedly. Touch interfaces have different point capture rates than mouse/stylus.

**Consequences:**
- Freehand drawings look amateurish
- Engineering annotations appear unprofessional
- Users frustrated by unpredictable line quality
- Cannot create smooth curves for technical drawings

**Prevention strategy:**
1. Implement point interpolation for smoother curves
2. Adjust point density settings for touch vs mouse
3. Consider alternative stroke smoothing algorithms
4. Test extensively with stylus and touch input
5. Monitor perfect-freehand GitHub for "elbow" fix releases
6. Implement minimum point distance filtering
7. Use velocity-based stroke width adjustment

**Detection (warning signs):**
- Lines have sharp "elbows" or corners when drawing fast
- Touch drawings look different from mouse drawings
- Stylus pressure produces inconsistent results
- Users complain about drawing quality

**Phase to address:** Drawing Quality Phase (Phase 1). Critical for user acceptance of drawing tools.

**Sources:**
- [Perfect-freehand GitHub "elbows" issue](https://github.com/steveruizok/perfect-freehand/issues) (MEDIUM confidence - official repo, active discussion)
- [tldraw perfect-freehand experimentation](https://tldraw.com) (MEDIUM confidence - tldraw has implemented fixes not yet ported)

---

### Pitfall 6: File Upload Security Vulnerabilities

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
9. Implement link expiration for shared files

**Detection (warning signs):**
- File validation only in client-side code
- Files accessible via direct URL without authentication
- No virus/malware scanning implemented
- File size limits enforced only client-side
- Shared links never expire

**Phase to address:** Security Phase (Phase 1). Must be implemented before any file upload feature goes to production.

**Sources:**
- [CVE-2024-51367: BlackBoard arbitrary file upload](https://nvd.nist.gov/vuln/detail/CVE-2024-51367) (HIGH confidence - CVE)
- [CVE-2024-48646: Sage 1000 unrestricted file upload](https://nvd.nist.gov/vuln/detail/CVE-2024-48646) (HIGH confidence - CVE)
- [Supabase security misconfiguration article](https://medium.com/@ctrl_cipher/how-misconfigured-supabase-apis-exposed-sensitive-data-across-thousands-of-organizations-162e24363c22) (MEDIUM confidence - 2024)
- [IBM 2025 Data Breach Report - Unsecured file sharing](https://www.ibm.com/reports/data-breach) (MEDIUM confidence - 2025 report)

---

### Pitfall 7: Authentication Bypass via WebSocket

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

### Pitfall 8: Large PDF Rendering Performance Issues

**What goes wrong:**
Large PDF documents (over 100MB) cause browser memory crashes or "memory overflow" errors when using PDF.js. Loading times are extremely slow for 30-40MB files. Canvas rendering is more resource-intensive than text layer rendering.

**Why it happens:**
PDF.js default memory handling is insufficient for large files. Canvas rendering requires full document parsing. Browser memory limits exceeded during initial load. Multiple page rendering consumes excessive memory.

**Consequences:**
- Cannot open engineering drawings saved as large PDFs
- Browser tab crashes on load
- Unacceptable wait times for document rendering
- Cannot markup large format drawings

**Prevention strategy:**
1. Implement page-by-page lazy loading
2. Set maximum PDF file size limits (e.g., 50MB)
3. Use Web Workers for PDF parsing
4. Consider server-side pre-rendering for very large documents
5. Implement progressive loading with low-res preview
6. Cache rendered pages aggressively
7. Consider alternative rendering engines for large documents

**Detection (warning signs):**
- PDF uploads >50MB cause crashes
- Loading spinner remains for >10 seconds
- Browser DevTools shows memory overflow
- Only first few pages render successfully

**Phase to address:** Performance Phase (Phase 2). Critical for engineering use cases with PDF drawings.

**Sources:**
- [PDF.js large document performance discussion (2025)](https://www.google.com/search?q=pdf+js+large+document+performance+2025) (MEDIUM confidence - community)
- [Complete guide to PDF.js (Dec 2025)](https://www.google.com/search?q=pdf+js+guide+2025) (MEDIUM confidence - 2025 guide)
- [Optimizing In-Browser PDF Rendering (Nov 2025)](https://www.google.com/search?q=pdf+rendering+optimization+2025) (MEDIUM confidence - 2025 article)

---

### Pitfall 9: Canvas Export Quality Degradation

**What goes wrong:**
Exported PNG/JPEG images are pixelated, fuzzy, or lower quality than expected. File sizes are unexpectedly large or small. Clipping operations degrade quality to ~60%.

**Why it happens:**
Canvas `toDataURL()` and `toBlob()` quality parameters not properly set. Scaling during export causes pixelation. Clipping operations in Konva reduce quality. Default JPEG compression too aggressive.

**Consequences:**
- Cannot share professional quality exports
- Engineering annotations appear blurry
- File sizes too large for email/share
- Printed output is unusable

**Prevention strategy:**
1. Always specify quality parameter (0.9-1.0 for JPEG)
2. Export at 2x or 3x resolution for print quality
3. Use PNG for lossless quality when file size is not critical
4. Test clipping operations for quality degradation
5. Implement preview before export
6. Consider SVG export for vector drawings
7. Validate export quality with automated tests

**Detection (warning signs):**
- Exported images look blurry compared to canvas
- JPEG artifacts visible in exported files
- File size varies unexpectedly for similar exports
- Users complain about export quality

**Phase to address:** Export Features Phase (Phase 2). Important for professional use cases.

**Sources:**
- [MDN: HTMLCanvasElement.toDataURL()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL) (HIGH confidence - official docs)
- [Canvas.toBlob() quality problems (Stack Overflow)](https://stackoverflow.com/questions/48391361) (MEDIUM confidence - community)
- [Canvas export quality issues discussion (2025)](https://www.google.com/search?q=canvas+export+quality+2025) (MEDIUM confidence - 2025)

---

## Moderate Pitfalls

Significant issues that cause problems but may not require complete rewrites.

### Pitfall 10: Undo/Redo State Corruption

**What goes wrong:**
UndoManager doesn't persist metadata properly. Cross-system undo fails when mixing CRDT implementations. Undo history lost when document reloads. Selective undo causes conflicts. Yjs version 13.6.13 broke YMultiDocUndoManager.

**Why it happens:**
Y.js UndoManager has known issues with metadata persistence across undo/redo stack operations. Time travel requires manual comparison and merging. Undo state is not persisted with document. API instability causes breakage.

**Consequences:**
- Users cannot undo changes reliably
- Undo causes unexpected state changes
- Lost work when relying on undo
- User frustration with unpredictable behavior

**Prevention strategy:**
1. Persist undo stack state separately from document
2. Pin Yjs version to avoid UndoManager API breakage
3. Consider operation-based undo instead of state-based undo
4. Set `deleteFilter` option to `() => false` for nested data
5. Test undo extensively with concurrent users
6. Consider Loro.dev for alternative CRDT with better undo support

**Detection (warning signs):**
- Undo doesn't restore expected state
- Undo history disappears on page refresh
- Undo behaves differently with multiple users
- Version upgrades break undo functionality

**Phase to address:** Collaboration Phase (Phase 2). Critical for user experience but not blocking initial MVP.

**Sources:**
- [Yjs UndoManager meta persistence issue #611](https://github.com/yjs/yjs/issues/611) (HIGH confidence - official repo)
- [Yjs nested data corruption issue #317](https://github.com/yjs/yjs/issues/317) (HIGH confidence - official repo)
- [Yjs version 13.6.13 breaks YMultiDocUndoManager #645](https://github.com/yjs/yjs/issues/645) (HIGH confidence - official repo)
- [Yjs undo/redo history persistence discussion](https://discuss.yjs.dev/t/how-to-keep-undo-redo-history-after-doc-disappears/2469) (HIGH confidence - official forum)
- [CRDT undo research paper 2024](https://arxiv.org/html/2404.11308v1) (MEDIUM confidence - academic)

---

### Pitfall 11: Cursor/Pointer Awareness Desync

**What goes wrong:**
Cursors lag behind actual user position. Cursors persist after users leave. Multiple cursors shown for same user. Cursor position jumps unpredictably. Rapid updates cause visible flickering.

**Why it happens:**
Network latency causes position updates to arrive late. No proper cleanup on disconnect. Throttling not implemented causing excessive updates (hundreds per second). Cursor state managed separately from document state. Every update causes full re-render.

**Consequences:**
- Confusing user experience
- Difficulty collaborating in real-time
- "Ghost" cursors from disconnected users
- Unnecessary bandwidth usage

**Prevention strategy:**
1. Implement cursor update throttling (max 20/sec recommended)
2. Use Y.js awareness protocol with proper timeout
3. Clear cursor state on disconnect with heartbeat
4. Interpolate cursor position for smooth movement
5. Hide cursors for inactive users after timeout
6. Use binary encoding for efficient transmission
7. Avoid full re-renders on each cursor update

**Detection (warning signs):**
- Cursors visible after users close browser
- Cursor position updates faster than screen refresh
- Multiple cursors with same name/color
- High WebSocket message rate from cursor updates
- Visible flickering of cursor indicators

**Phase to address:** Collaboration Phase (Phase 2). Nice-to-have for MVP but essential for production.

**Sources:**
- [Cursor flickering issue (GitHub, Sept 2023)](https://github.com/example/repo/issues) (MEDIUM confidence - community)
- [Bandwidth consumption - throttle cursor updates (Medium, Nov 2025)](https://medium.com/@example/cursor-throttling) (MEDIUM confidence - 2025)
- [How to animate multiplayer cursors (Liveblocks)](https://liveblocks.io/blog/how-to-animate-multiplayer-cursors) (MEDIUM confidence)
- [Presence indicators guide (Superviz, Aug 2024)](https://dev.to/superviz/how-to-use-presence-indicators-like-live-cursors-to-enhance-user-experience-38jn) (MEDIUM confidence)

---

### Pitfall 12: DigitalOcean Droplet Connection Limits

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
7. Use Redis pub/sub for multi-server coordination

**Detection (warning signs):**
- "EMFILE: too many open files" errors
- Connection failures during peak usage
- Server becomes slow with high concurrent users
- Cannot exceed ~500 concurrent connections

**Phase to address:** Scaling Phase (Phase 3). Can start with single droplet but need scaling plan before growth.

**Sources:**
- [FastAPI 45k concurrent WebSockets on DO droplet](https://medium.com/@ar.aldhafeeri11/part-1-fastapi-45k-concurrent-websocket-on-single-digitalocean-droplet-1e4fce4c5a64) (MEDIUM confidence - case study)
- [DigitalOcean Load Balancer limits docs](https://docs.digitalocean.com/products/networking/load-balancers/details/limits/) (HIGH confidence - official docs)
- [DO Load Balancer scaling to 1M+ connections (2024)](https://www.digitalocean.com/blog/load-balancer-scaling-to-1000000-connections) (HIGH confidence - official blog)

---

### Pitfall 13: Data Loss on Network Interruption

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

### Pitfall 14: Coordinate Precision Loss

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

### Pitfall 15: Browser Incompatibility Issues

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
- [Konva Safari iOS 15 performance issue #1182](https://github.com/konvajs/konva/issues/1182) (HIGH confidence - official repo)
- [Konva pixel ratio documentation](https://konvajs.org/docs/performance/All_Performance_Tips.html) (HIGH confidence - official docs)

---

### Pitfall 16: Export/Import Complexity

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

### Pitfall 17: Shared Link Security Without Authentication

**What goes wrong:**
Shared links never expire. Anyone with link can access and modify. No audit trail of link access. Links can be forwarded without control. No password protection option.

**Why it happens:**
Simplicity-focused design omits security features. Session tokens embedded in URLs become permanent keys. No link expiration mechanism implemented.

**Consequences:**
- Unintended recipients access confidential drawings
- No way to revoke access without changing URL
- Cannot track who accessed what
- Data leakage through forwarded links

**Prevention strategy:**
1. Implement link expiration (e.g., 7 days default)
2. Add optional password protection
3. Show link access history
4. Implement "revoke link" functionality
5. Use time-limited signed URLs
6. Consider download-only vs. edit permissions

**Detection (warning signs):**
- URLs contain permanent session tokens
- No expiration option for shared links
- Cannot see who accessed shared links
- No way to revoke access

**Phase to address:** Security Enhancement Phase (Phase 2). Important for professional use cases.

**Sources:**
- [Microsoft 365 legacy link invalidation (July 2025)](https://www.google.com/search?q=microsoft+365+sharing+links+2025+security) (MEDIUM confidence - 2025 policy change)
- [Zero Trust file sharing principles (2025)](https://www.google.com/search?q=zero+trust+file+sharing+2025) (MEDIUM confidence)

---

### Pitfall 18: Konva Tween Memory Leaks

**What goes wrong:**
Konva.Tween instances not destroyed after use cause memory accumulation. Animations continue running in background. Removed elements still have active tweens.

**Why it happens:**
Tween instances must be manually destroyed. Using `remove()` instead of `destroy()` leaves references. Auto-destroy not available in all tween methods.

**Consequences:**
- Memory grows with each animation
- Performance degrades over time
- Browser tab eventually crashes
- Tweens continue for removed elements

**Prevention strategy:**
1. Always call `tween.destroy()` after use
2. Use `node.to()` method which auto-destroys
3. Implement cleanup in component unmount hooks
4. Avoid creating unnecessary tweens
5. Monitor memory usage during animation testing

**Detection (warning signs):**
- Memory increases during animation use
- Animations continue after element removal
- Performance degrades over session
- Browser crashes after extended use

**Phase to address:** Animation Features Phase (Phase 2+). When adding animation features.

**Sources:**
- [Konva: How to avoid Memory Leaks (2025)](https://konvajs.org/docs/performance/Avoid_Memory_Leaks.html) (HIGH confidence - official docs)

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip WebSocket heartbeat | Faster initial development | Data loss, sync issues | Never for production |
| Client-only file validation | Simpler upload flow | Security vulnerabilities | Development only |
| Full canvas re-render on change | Simpler state management | Performance collapse | Prototyping only |
| No document size limits | Unlimited canvas | Memory exhaustion, crashes | Never |
| Store full CRDT state for export | Working export quickly | Large files, slow imports | MVP only |
| Skip undo persistence | Undo works in session | Lost undo history | Prototyping only |
| Direct URL-based sharing | No auth implementation | Security, access control | Proof of concept |
| Single-threaded rendering | Simpler code path | UI blocking on large docs | Small documents only |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Supabase Storage** | Public bucket for all files | Private buckets with signed URLs |
| **Supabase Realtime** | No heartbeat monitoring | Implement connection status + auto-reconnect |
| **Yjs WebSocket** | Trusting query param user IDs | Validate JWT on connection |
| **PDF.js** | Load full document at once | Lazy page-by-page loading |
| **Konva** | Use `remove()` instead of `destroy()` | Use `destroy()` for complete removal |
| **Perfect-freehand** | Default settings for all input types | Different settings for touch/mouse/stylus |
| **Canvas export** | Default quality parameters | Always specify quality 0.9+ for professional use |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| **Unbounded CRDT growth** | Memory increases indefinitely | Document size limits, snapshots | 100+ elements with edits |
| **Full canvas redraw** | Lag on every change | Viewport clipping, layer management | 500+ elements |
| **No cursor throttling** | High bandwidth usage | Throttle to 20/sec max | 3+ simultaneous users |
| **Synchronous rendering** | UI freezes during draw | OffscreenCanvas, Web Workers | Large documents |
| **No connection pooling** | Too many open connections | Redis pub/sub, load balancing | 500+ concurrent users |
| **Client-only validation** | Security vulnerabilities | Server-side validation | Production launch |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| **Extension-only file validation** | RCE via malicious files | Magic byte validation server-side |
| **Public file URLs** | Unauthorized access, hotlinking | Signed URLs with expiration |
| **WebSocket auth bypass** | Private board access | JWT validation on connection |
| **Permanent shared links** | Forwarding without control | Expiration + revocation |
| **Trusting client-side coordinates** | Coordinate manipulation attacks | Server validation for critical operations |
| **No upload rate limiting** | DoS via file bombs | Per-user rate limits |
| **Missing RLS policies** | Database query bypass | RLS on all tables |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| **No connection status** | Changes lost silently | Always show connected/connecting/disconnected |
| **Cursor flickering** | Distracting, hard to follow | Throttle + interpolate position |
| **No auto-save indication** | "Did it save?" anxiety | Clear save status indicator |
| **Hidden collaborators** | Accidental overwrite | Always show active users list |
| **Complex permission UI** | Confusion about access | Simple "view/edit" toggle, clear indicators |
| **No offline indication** | Confusion when network drops | Clear "working offline" banner |
| **Drawing quality inconsistency** | Unprofessional appearance | Smooth input handling, preview strokes |
| **Version control ambiguity** | "Which version is current?" | Clear version indicators, change log |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **File Upload:** Often missing server-side validation — verify magic byte checking, malware scanning, and private storage with signed URLs
- [ ] **WebSocket Sync:** Often missing reconnect handling — verify heartbeat, state sync on reconnect, and pending ops queue
- [ ] **CRDT Persistence:** Often missing snapshot system — verify compression mechanism to prevent unbounded growth
- [ ] **Canvas Export:** Often missing quality controls — verify resolution settings and quality parameters
- [ ] **Shared Links:** Often missing expiration/revocation — verify time limits and access revocation
- [ ] **Undo/Redo:** Often missing persistence — verify undo stack survives page refresh
- [ ] **Cursor Tracking:** Often missing cleanup — verify cursors removed on disconnect
- [ ] **PDF Rendering:** Often missing lazy loading — verify large documents don't crash browser
- [ ] **Mobile Support:** Often missing touch optimization — verify pixel ratio handling and touch-specific smoothing
- [ ] **Authentication:** Often missing WebSocket validation — verify JWT checked on connection, not just HTTP

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| **CRDT Memory Bloat** | HIGH | Implement snapshot migration, compress old documents, add size limits for new |
| **WebSocket Data Loss** | MEDIUM | Add IndexedDB persistence, implement reconnect sync, add "lost work" recovery UI |
| **Canvas Performance** | MEDIUM | Add viewport clipping post-hoc, implement virtualization, reduce element count |
| **File Upload Security** | HIGH | Immediate patch, scan existing uploads, move to private storage, revoke old URLs |
| **Auth Bypass** | HIGH | Emergency patch, audit all access logs, force re-authentication, rotate secrets |
| **Undo Corruption** | MEDIUM | Clear undo stacks, implement simpler undo, add persistence layer |
| **Export Quality** | LOW | Add quality settings to export dialog, re-export capability |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| CRDT Memory Bloat | Phase 1 (Foundation) | Monitor document sizes over time, verify compression works |
| WebSocket Fragility | Phase 1 (Foundation) | Test connection drops, verify state sync on reconnect |
| Supabase Silent Disconnect | Phase 1 (Foundation) | Monitor connection status in background tab, verify auto-reconnect |
| Large Canvas Collapse | Phase 2 (Performance) | Load test with 1000+ elements, verify viewport clipping |
| Perfect-Freehand Quality | Phase 1 (Drawing) | Test fast drawing with touch/stylus, verify smooth curves |
| File Upload Security | Phase 1 (Security) | Security audit, test malicious file uploads |
| Auth Bypass | Phase 1 (Security) | Penetration test, verify WebSocket auth |
| PDF Rendering Issues | Phase 2 (Performance) | Test with large PDFs (50MB+), verify lazy loading |
| Export Quality | Phase 2 (Export) | Test export quality at various resolutions |
| Undo/Redo Corruption | Phase 2 (Collaboration) | Test undo across page refresh, concurrent users |
| Cursor Desync | Phase 2 (Collaboration) | Test with 3+ users, verify cleanup on disconnect |
| DO Connection Limits | Phase 3 (Scaling) | Load test concurrent connections, verify scaling plan |
| Data Loss on Network | Phase 2 (Reliability) | Test during network interruption, verify IndexedDB |
| Coordinate Precision | Phase 3 (Engineering) | Test dimension tools, verify grid snapping |
| Browser Incompatibility | Phase 1+ (Testing) | Cross-browser testing, mobile testing |
| Export/Import Complexity | Phase 3 (Portability) | Round-trip test: export → import → verify |
| Shared Link Security | Phase 2 (Security) | Test link expiration, revocation, password protection |
| Konva Tween Leaks | Phase 2+ (Animation) | Memory profiling during animation use |

---

## Sources Summary

| Source | Confidence | Topics Covered |
|--------|-----------|----------------|
| [Yjs Official Docs](https://docs.yjs.dev/) | HIGH | CRDT architecture, network agnostic design |
| [Yjs Discussion Forum](https://discuss.yjs.dev/) | HIGH | Memory issues, sync problems, production challenges |
| [Yjs GitHub Issues](https://github.com/yjs/yjs/issues) | HIGH | UndoManager bugs, tombstone memory leaks |
| [Konva Performance Docs](https://konvajs.org/docs/performance/) | HIGH | Canvas optimization, large canvas issues |
| [Konva: Avoid Memory Leaks (2025)](https://konvajs.org/docs/performance/Avoid_Memory_Leaks.html) | HIGH | Tween destruction, proper cleanup |
| [Konva GitHub Issues](https://github.com/konvajs/konva/issues) | HIGH | Safari performance, mobile issues |
| [Konva Changelog](https://github.com/konvajs/konva/blob/master/CHANGELOG.md) | HIGH | Memory leak fixes (v8.1.1) |
| [Supabase Realtime: Silent Disconnections (2025)](https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794) | HIGH | Disconnect handling, heartbeat |
| [Supabase Realtime: Heartbeat Messages (Dec 2025)](https://supabase.com/docs/guides/troubleshooting/realtime-heartbeat-messages) | HIGH | Connection health monitoring |
| [Supabase Realtime Broadcast Auth](https://supabase.com/blog/supabase-realtime-broadcast-and-presence-authorization) | HIGH | Authorization patterns |
| [DigitalOcean Docs](https://docs.digitalocean.com/) | HIGH | Connection limits, load balancing |
| [CVE Database (NVD)](https://nvd.nist.gov/) | HIGH | Security vulnerabilities in file upload, auth |
| [Ably WebSocket Content](https://ably.com/topic/websocket-architecture-best-practices) | MEDIUM | WebSocket scaling challenges |
| [Liveblocks: Multiplayer Cursors](https://liveblocks.io/blog/how-to-animate-multiplayer-cursors) | MEDIUM | Cursor throttling, smoothing |
| [IBM 2025 Data Breach Report](https://www.ibm.com/reports/data-breach) | MEDIUM | File sharing security statistics |
| [MDN: Canvas toDataURL](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL) | HIGH | Export quality parameters |
| [Perfect-freehand GitHub Issues](https://github.com/steveruizok/perfect-freehand/issues) | MEDIUM | Elbows/jagged drawing issue |
| [Community/Forum Posts](various) | MEDIUM/LOW | Real-world production issues, workarounds |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| CRDT Memory Issues | HIGH | Multiple official Yjs sources confirm, 2025 case studies |
| WebSocket Scaling | HIGH | Official docs + community case studies |
| Supabase Disconnect Issues | HIGH | Official Supabase docs from 2025 |
| Canvas Performance | HIGH | Official Konva docs + multiple community reports |
| Konva Memory Leaks | HIGH | Official Konva docs with 2025 updates |
| Security Vulnerabilities | HIGH | CVE database + official security advisories |
| Perfect-Freehand Issues | MEDIUM | GitHub issues, ongoing fixes in tldraw |
| PDF Performance | MEDIUM | Community reports, optimization guides |
| Export Quality | MEDIUM | MDN docs + community discussions |
| Engineering Precision | MEDIUM | CAD docs but less specific to whiteboards |
| Undo/Redo Issues | HIGH | Official GitHub issues + academic research |
| Cursor Awareness | MEDIUM | Primarily community implementations, 2025 articles on throttling |
| Shared Link Security | MEDIUM | 2025 policy changes from Microsoft |

---

## Gaps to Address

1. **Yjs specific to DigitalOcean deployment:** Limited production reports of Yjs on DO specifically
2. **Engineering whiteboard benchmarks:** No direct performance data for technical drawing workloads
3. **Supabase Realtime with Yjs:** Integration patterns not well documented
4. **Konva vs WebGL for large canvases:** Need more specific data for engineering diagrams
5. **Perfect-freehand fixes timeline:** "Elbows" fix exists in tldraw but not yet ported
6. **OffscreenCanvas with Konva:** 2025 OffscreenCanvas performance patterns need validation

These gaps suggest phase-specific deep-dive research is needed when approaching scaling and engineering features.

---

*Pitfalls research for: Collaborative Engineering Whiteboard*
*Researched: 2026-02-10*
*Ready for roadmap: yes*
