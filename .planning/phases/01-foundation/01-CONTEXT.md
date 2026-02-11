# Phase 1: Foundation - Context

**Gathered:** 2026-02-10
**Status:** Ready for planning

## Phase Boundary

Users can create shareable sessions and upload files securely. This phase establishes the session model, file upload infrastructure, persistence layer, and connection resilience. It does NOT include rendering files as backgrounds (Phase 2) or drawing tools (Phase 3).

## Implementation Decisions

### File Upload Handling
- **File size limit:** 10MB maximum per upload
- **Upload feedback:** Detailed — show file name + progress indicator during upload
- **Multiple files:** Single file only per session (one at a time workflow)
- **Validation:** Both client-side (before upload) and server-side (defense in depth)
- **Accepted types:** PDF, JPG, PNG, WebP

### Save and Persistence
- **Auto-save interval:** Every 30 seconds
- **Conflict resolution:** Silent merge (last write wins, no prompts to user)
- **Network failure:** Queue changes and retry when connection restored
- **Save indicator:** Visual indicator showing "Saving..." / "Saved" status

### Connection Resilience
- **Reconnection strategy:** Instant retry (no exponential backoff)
- **Offline indication:** Visible warning/banner when disconnected
- **Offline capability:** Fully disabled when offline — show error, disable drawing
- **User awareness:** Clear messaging about connection state

### Session IDs and URLs
- **URL format:** Short random string — `vp-whiteboard.com/abc123`
- **Session creation:** Homepage has prominent "New Session" button
- **Session expiration:** 7 days, then session is deleted
- **Link sharing:** Anyone with URL can join (no authentication)

### Claude's Discretion
- Exact progress indicator design (bar, spinner, percentage)
- Placement of "New Session" button on homepage
- Offline warning styling (banner position, color, messaging)
- Session ID generation algorithm (length, character set)

## Specific Ideas

- "I want it to be dead simple — engineer clicks button, gets link, sends to client"
- File upload should feel modern like Google Drive or Slack (drag/drop, clear feedback)
- Save status should be unobtrusive but visible when something goes wrong

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 01-foundation*
*Context gathered: 2026-02-10*
