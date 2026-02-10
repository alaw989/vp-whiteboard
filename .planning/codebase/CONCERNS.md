# Codebase Concerns

**Analysis Date:** 2025-02-09

## Tech Debt

**Local Storage Fallback Without WebSocket:**
- Issue: The app falls back to localStorage when WebSocket connection fails, losing real-time collaboration
- Files: `composables/useCollaborativeCanvas.ts`
- Impact: Data stored only locally, no multi-user collaboration
- Fix approach: Implement proper WebSocket server fallback and user about disconnection

**Dynamic Yjs Import:**
- Issue: Yjs is imported dynamically via require() instead of ES6 imports
- Files: `composables/useCollaborativeCanvas.ts:17`
- Impact: Inconsistent error handling, potential runtime issues
- Fix approach: Use dynamic import() with proper error handling

**Hardcoded Canvas Size:**
- Issue: Canvas size (2000x1500) is hardcoded
- Files: `components/whiteboard/WhiteboardCanvas.vue:111-112`
- Impact: May not work well on different screen sizes
- Fix approach: Make canvas size responsive based on container dimensions

## Known Bugs

**WebSocket Connection Handling:**
- Symptoms: App may crash when WebSocket connection drops unexpectedly
- Files: `composables/useCollaborativeCanvas.ts`
- Trigger: Network interruption or server restart
- Workaround: Local storage fallback preserves data but breaks collaboration

**Cursor Persistence:**
- Symptoms: User cursors may not update immediately when users leave/join
- Files: `composables/useCollaborativeCanvas.ts:62`
- Trigger: Users disconnect without cleanup
- Workaround: Automatic cleanup after 30 seconds of inactivity

## Security Considerations

**Public Database Access:**
- Risk: Database allows public read/write access without authentication
- Files: `supabase/schema.sql:47-64`
- Current mitigation: Row Level Security (RLS) policies but overly permissive
- Recommendations: Implement proper authentication and authorization

**File Upload Validation:**
- Risk: No server-side file type or size validation
- Files: `server/api/whiteboard/upload.post.ts`
- Current mitigation: Client-side only (10MB limit)
- Recommendations: Add server-side validation for file types, sizes, and malware scanning

**User Identity Management:**
- Risk: User ID and name come from query parameters with no validation
- Files: `server/websocket/[...].ts:24-25`
- Current mitigation: Basic validation missing
- Recommendations: Implement proper authentication token validation

## Performance Bottlenecks

**Element Rendering Performance:**
- Problem: All elements re-render on every change
- Files: `components/whiteboard/WhiteboardCanvas.vue:31-67`
- Cause: Vue/Konva re-renders entire canvas
- Improvement path: Implement virtual rendering for large canvases

**WebSocket Memory Usage:**
- Problem: All canvas elements stored in memory
- Files: `composables/useCollaborativeCanvas.ts`
- Cause: Yjs Array stores all elements
- Improvement path: Implement pagination or lazy loading for large boards

**File Upload Synchronous Processing:**
- Problem: Large files block UI during upload
- Files: `composables/useWhiteboardStorage.ts:142-193`
- Cause: No chunked upload support
- Improvement path: Implement resumable chunked uploads

## Fragile Areas

**WebSocket Server Implementation:**
- Files: `server/websocket/[...].ts`
- Why fragile: Manual connection management, no reconnection logic
- Safe modification: Add connection pooling, heartbeat mechanism
- Test coverage: Limited error scenarios tested

**Canvas State Management:**
- Files: `composables/useCollaborativeCanvas.ts:158-172`
- Why fragile: Direct state manipulation without validation
- Safe modification: Add state validation and sanitization
- Test coverage: Edge cases not fully tested

## Scaling Limits

**Concurrent Users:**
- Current capacity: Limited by WebSocket server implementation
- Limit: Single server instance (no horizontal scaling)
- Scaling path: Implement Redis adapter for Yjs, load balancing

**Database Storage:**
- Current capacity: Limited by Supabase free tier limits
- Limit: 1GB storage, 2M requests/day
- Scaling path: Implement proper archival system for old boards

## Dependencies at Risk

**perfect-freehand:**
- Risk: Minor dependency, critical for smooth drawing
- Impact: No alternative in current stack
- Migration plan: Keep as-is, monitor for updates

**y-websocket:**
- Risk: Last updated 2 years ago
- Impact: May have security vulnerabilities
- Migration plan: Research Yjs alternatives or maintain custom WebSocket

## Missing Critical Features

**Authentication and Authorization:**
- Problem: No user authentication system
- Blocks: Cannot implement private boards or user management
- Priority: High

**Version Control History:**
- Problem: No history of changes made to whiteboards
- Blocks: Cannot revert to previous versions
- Priority: Medium

**Offline Support:**
- Problem: No proper offline functionality
- Blocks: Cannot work without internet
- Priority: Medium

## Test Coverage Gaps

**WebSocket Error Handling:**
- What's not tested: Network failure scenarios
- Files: `server/websocket/[...].ts`
- Risk: Application may crash during network issues
- Priority: High

**Canvas Data Validation:**
- What's not tested: Malformed element data handling
- Files: `components/whiteboard/WhiteboardCanvas.vue:31-67`
- Risk: Rendering errors could break the UI
- Priority: Medium

**File Upload Security:**
- What's not tested: Malicious file uploads
- Files: `server/api/whiteboard/upload.post.ts`
- Risk: Server could be compromised via malicious files
- Priority: High

---

*Concerns audit: 2025-02-09*