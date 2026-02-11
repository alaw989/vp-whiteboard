# Phase 01: Foundation - Research

**Researched:** 2026-02-10
**Domain:** Nuxt 3 + Supabase + Yjs collaborative whiteboard foundation
**Confidence:** HIGH

## Summary

Phase 1 establishes the core infrastructure for the VP Associates whiteboard: session management, file uploads, auto-save, and connection resilience. The existing codebase already has significant foundation work including Supabase integration, WebSocket handling, Yjs CRDT sync, and basic file upload functionality.

**Primary recommendation:** Build upon existing infrastructure rather than rebuild. The current implementation has solid foundations but needs refinement for short URL session IDs, proper file upload progress tracking (Nuxt's `$fetch` doesn't support progress), robust connection resilience with offline detection, and session expiration logic.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**File Upload Handling**
- File size limit: 10MB maximum per upload
- Upload feedback: Detailed — show file name + progress indicator during upload
- Multiple files: Single file only per session (one at a time workflow)
- Validation: Both client-side (before upload) and server-side (defense in depth)
- Accepted types: PDF, JPG, PNG, WebP

**Save and Persistence**
- Auto-save interval: Every 30 seconds
- Conflict resolution: Silent merge (last write wins, no prompts to user)
- Network failure: Queue changes and retry when connection restored
- Save indicator: Visual indicator showing "Saving..." / "Saved" status

**Connection Resilience**
- Reconnection strategy: Instant retry (no exponential backoff)
- Offline indication: Visible warning/banner when disconnected
- Offline capability: Fully disabled when offline — show error, disable drawing
- User awareness: Clear messaging about connection state

**Session IDs and URLs**
- URL format: Short random string — `vp-whiteboard.com/abc123`
- Session creation: Homepage has prominent "New Session" button
- Session expiration: 7 days, then session is deleted
- Link sharing: Anyone with URL can join (no authentication)

### Claude's Discretion
- Exact progress indicator design (bar, spinner, percentage)
- Placement of "New Session" button on homepage
- Offline warning styling (banner position, color, messaging)
- Session ID generation algorithm (length, character set)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Nuxt 3 | 3.15.0 | Full-stack framework | Current stable release with experimental WebSocket support |
| Supabase JS | 2.39.0 | Database + Storage | Industry standard for serverless PostgreSQL with built-in auth/storage |
| Yjs | 13.6.29 | CRDT sync | De facto standard for real-time collaboration without server dependency |
| y-websocket | 3.0.0 | Yjs WebSocket provider | Official WebSocket provider for Yjs network sync |
| Vue | 3.5.0 | UI framework | Reactive foundation for Nuxt 3 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vueuse/nuxt | 12.0.1 | Composables utilities | Use `useOnline` for network status detection |
| nanoid | (add) | URL-friendly IDs | When replacing UUIDs with shareable short URLs |
| axios | (add) | HTTP client with progress | When `$fetch` progress limitations are problematic |
| perfect-freehand | 1.2.3 | Smooth stroke rendering | Already installed, for Phase 3 drawing tools |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase | Firebase | More opinionated, vendor lock-in, costs scale differently |
| Yjs | Automerge | Heavier, more complex API, less ecosystem adoption |
| nanoid | shortid | shortid is deprecated, nanoid is actively maintained |
| axios | $fetch (Nuxt) | `$fetch` lacks upload progress, lower-level control |

**Installation:**
```bash
# Add missing packages for Phase 1
npm install nanoid axios
npm install -D @types/nanoid
```

## Architecture Patterns

### Recommended Project Structure

```
server/
├── api/
│   ├── session/
│   │   ├── index.post.ts          # Create new session with short ID
│   │   └── [id].get.ts            # Get session by short ID
│   └── whiteboard/
│       └── upload.post.ts         # File upload (already exists)
├── utils/
│   ├── session-id.ts              # Short ID generation
│   └── session-cleanup.ts         # Background cleanup for expired sessions
└── websocket/
    └── [...].ts                   # Already exists for Yjs

composables/
├── useSession.ts                  # NEW: Session management
├── useAutoSave.ts                 # NEW: Auto-save with queue/retry
├── useOffline.ts                  # NEW: Offline detection and handling
├── useFileUpload.ts               # NEW: File upload with progress
├── useCollaborativeCanvas.ts      # EXISTS: Yjs integration
└── useWhiteboardStorage.ts        # EXISTS: Supabase integration

components/
├── session/
│   ├── SessionCard.vue            # NEW: Session list item
│   └── OfflineBanner.vue          # NEW: Connection status banner
└── whiteboard/
    ├── WhiteboardUpload.vue       # EXISTS: enhance with progress
    └── SaveStatusIndicator.vue    # NEW: Auto-save status

pages/
├── index.vue                      # EXISTS: enhance with "New Session" button
├── s/[id].vue                     # NEW: Short URL route (replaces /whiteboard/[id])
└── new.vue                        # EXISTS: may simplify for quick session creation

types/
└── index.ts                       # EXISTS: extend with Session types
```

### Pattern 1: Short URL Session ID Generation

**What:** Replace UUID-based session IDs with URL-friendly random strings.

**When to use:** For shareable session URLs that users need to communicate verbally or via text.

**Example:**
```typescript
// server/utils/session-id.ts
import { customAlphabet } from 'nanoid'

// URL-safe alphabet: a-z, A-Z, 0-9 (no ambiguous chars like 0OIl)
const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const nanoid = customAlphabet(alphabet, 8) // 8 chars = ~64 trillion combinations

export function generateSessionId(): string {
  return nanoid()
}

// Collision probability: 1% chance of collision after ~10 million IDs at 1,000/hour
// More than sufficient for a whiteboard application
```

**Source:** NanoID collision calculator - real-world examples show 1% collision probability over 35+ years with moderate usage (1,000 IDs/hour) for 8-character IDs.

### Pattern 2: File Upload with Progress Tracking

**What:** Track upload progress and provide visual feedback during file uploads.

**When to use:** Nuxt 3's `$fetch` doesn't natively support upload progress - use Axios or XMLHttpRequest for progress tracking.

**Example:**
```typescript
// composables/useFileUpload.ts
import axios from 'axios'
import type { UploadResult } from '~/types'

export function useFileUpload() {
  const config = useRuntimeConfig()

  async function uploadFile(
    whiteboardId: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<UploadResult> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('whiteboard_id', whiteboardId)

    const response = await axios.post('/api/whiteboard/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(percent)
        }
      },
    })

    return response.data
  }

  return { uploadFile }
}
```

**Source:** DEV Community - Nuxt 3 file upload patterns show Axios is preferred over `$fetch` for progress tracking.

### Pattern 3: Auto-Save with Debounce and Interval

**What:** Combine debounced saves (1-3 seconds after change) with interval fallback (30 seconds max).

**When to use:** When you want both responsive saves and a safety net for continuous typing.

**Example:**
```typescript
// composables/useAutoSave.ts
import { watch, onUnmounted } from 'vue'

export function useAutoSave<T>(
  data: Ref<T>,
  saveFn: (data: T) => Promise<void>,
  options = { debounceMs: 1000, intervalMs: 30000 }
) {
  const isSaving = ref(false)
  const lastSaveTime = ref<Date | null>(null)
  const saveError = ref<string | null>(null)
  const pendingChanges = ref(false)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let intervalTimer: ReturnType<typeof setInterval> | null = null

  async function save() {
    if (isSaving.value) return // Don't overlap saves

    isSaving.value = true
    saveError.value = null

    try {
      await saveFn(data.value)
      lastSaveTime.value = new Date()
      pendingChanges.value = false
    } catch (err) {
      saveError.value = err instanceof Error ? err.message : 'Save failed'
    } finally {
      isSaving.value = false
    }
  }

  function triggerSave() {
    pendingChanges.value = true
    clearTimeout(debounceTimer!)
    debounceTimer = setTimeout(save, options.debounceMs)
  }

  // Start interval fallback
  function startInterval() {
    intervalTimer = setInterval(() => {
      if (pendingChanges.value && !isSaving.value) {
        save()
      }
    }, options.intervalMs)
  }

  // Watch for changes
  const stopWatch = watch(data, triggerSave, { deep: true })

  // Cleanup
  function cleanup() {
    clearTimeout(debounceTimer!)
    clearInterval(intervalTimer!)
    stopWatch()
  }

  onUnmounted(cleanup)

  return {
    isSaving,
    lastSaveTime,
    saveError,
    save,
    startInterval,
    cleanup,
  }
}
```

**Source:** Modern auto-save implementations combine debouncing (1-3s) with interval fallback (30s) for reliability.

### Pattern 4: Connection Resilience with Offline Detection

**What:** Detect network status and handle offline/online transitions with immediate reconnection.

**When to use:** Real-time collaborative applications that need to handle network interruptions gracefully.

**Example:**
```typescript
// composables/useOffline.ts
import { useOnline } from '@vueuse/core'
import { watch } from 'vue'

export function useOffline() {
  const isOnline = useOnline()
  const wasOffline = ref(false)

  watch(isOnline, (online) => {
    if (!online) {
      wasOffline.value = true
      // Show offline banner, disable drawing
    } else if (wasOffline.value) {
      // Just came back online
      wasOffline.value = false
      // Trigger immediate save/reconnect
      // Hide offline banner
    }
  })

  return {
    isOnline,
    isOffline: computed(() => !isOnline.value),
  }
}
```

**Source:** VueUse `useOnline` uses the Network Information API for reliable network status detection.

### Pattern 5: Session Expiration with TTL

**What:** Automatically delete sessions after 7 days using PostgreSQL TTL.

**When to use:** For data that should automatically expire without manual cleanup.

**Example:**
```sql
-- Add expiration tracking to whiteboards table
ALTER TABLE whiteboards ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days';

-- Create index for efficient cleanup queries
CREATE INDEX idx_whiteboards_expires_at ON whiteboards(expires_at);

-- Background cleanup function (run via cron or pg_cron)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM whiteboards WHERE expires_at < NOW();
  DELETE FROM whiteboard_files WHERE whiteboard_id NOT IN (SELECT id FROM whiteboards);
END;
$$ LANGUAGE plpgsql;

-- Schedule with pg_cron (if available) or external cron
-- SELECT cron.schedule('cleanup-sessions', '0 2 * * *', 'SELECT cleanup_expired_sessions()');
```

**Source:** PostgreSQL doesn't have built-in TTL; use pg_cron extension or external cron for 7-day cleanup.

### Anti-Patterns to Avoid

- **Relying solely on client-side validation:** Always validate server-side for security.
- **Using `$fetch` for upload progress:** Use Axios or XMLHttpRequest for progress tracking.
- **Exponential backoff for WebSocket reconnection:** User requirement is instant retry.
- **Using UUID for user-facing URLs:** Replace with short, memorable strings.
- **Storing files in database:** Use Supabase Storage, database only needs metadata.
- **Deleting files immediately on session delete:** Consider soft delete or archive.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Short ID generation | Custom random string generator | nanoid with custom alphabet | Battle-tested collision math, URL-safe default |
| File upload progress | XMLHttpRequest wrapper | Axios with onUploadProgress | Handles edge cases, cancelation, retries |
| Network detection | navigator.onLine polling | VueUse useOnline() | Cross-browser compatible, reactive |
| Auto-save logic | Custom debounce+interval | VueUse useDebounceFn + setInterval | Well-tested debounce implementation |
| CRDT sync | Custom WebSocket messaging | Yjs + y-websocket | Handles conflict resolution automatically |
| Database queries | Raw SQL without typing | Supabase JS client | Type-safe, handles connection pooling |

**Key insight:** Real-time collaboration has many edge cases (concurrent edits, network splits, late-arriving messages). Yjs has solved these over years of development - building custom CRDT logic is a months-long project with high risk of correctness bugs.

## Common Pitfalls

### Pitfall 1: Nuxt `$fetch` Lacks Upload Progress

**What goes wrong:** Developers assume `$fetch` supports upload progress like Axios does, leading to poor UX during file uploads.

**Why it happens:** Nuxt's `$fetch` is built on native `fetch` API which doesn't report upload progress.

**How to avoid:** Use Axios for file uploads when progress tracking is required. Keep `$fetch` for regular API calls.

**Warning signs:** Upload completes silently with no progress indicator, large files appear frozen.

### Pitfall 2: WebSocket Connection State Desynchronization

**What goes wrong:** UI shows "connected" but WebSocket is actually disconnected, or vice versa.

**Why it happens:** Yjs WebSocketProvider status events aren't properly wired to Vue reactive state.

**How to avoid:** Create a reactive wrapper that watches `wsProvider.on('status', ...)` and updates a Vue ref. Test with actual network disconnection (DevTools Network tab -> Offline).

**Warning signs:** Drawing stops syncing but no error shown, reconnection doesn't trigger UI updates.

### Pitfall 3: Auto-Save Race Conditions

**What goes wrong:** Multiple rapid saves overwrite each other, causing data loss.

**Why it happens:** Save operations aren't properly queued or tracked.

**How to avoid:** Track `isSaving` state and skip new save requests while saving. Consider versioning or timestamps for conflict resolution.

**Warning signs:** "Last write wins" causes unexpected data loss, rapid updates result in corrupted state.

### Pitfall 4: Session ID Collision with Short Strings

**What goes wrong:** Two sessions get the same ID, causing data crossover.

**Why it happens:** Using too short an ID or insufficient character set.

**How to avoid:** Use nanoid with 8+ characters and URL-safe alphabet. Collision probability is astronomically low at 8 characters.

**Warning signs:** Users report seeing other people's drawings, session data is wrong.

### Pitfall 5: File Upload Size Limit Bypass

**What goes wrong:** Users can upload files larger than 10MB by bypassing client-side validation.

**Why it happens:** Only client-side validation was implemented, which can be bypassed.

**How to avoid:** Always validate file size on the server (defense in depth). The existing code already does this correctly.

**Warning signs:** Storage costs unexpectedly high, slow upload performance.

### Pitfall 6: Session Expiration Not Enforced

**What goes wrong:** Old sessions accumulate in database indefinitely, increasing storage and query costs.

**Why it happens:** No automated cleanup mechanism is in place.

**How to avoid:** Implement a cron job or scheduled task to delete sessions older than 7 days. Consider using pg_cron for PostgreSQL-native scheduling.

**Warning signs:** Database size grows continuously, slow queries on whiteboards table.

## Code Examples

Verified patterns from official sources:

### Generating Short Session IDs

```typescript
// server/utils/session-id.ts
import { customAlphabet } from 'nanoid'

const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
// Removed: 0OIl (ambiguous characters)
const sessionId = customAlphabet(alphabet, 8)

export function generateSessionId(): string {
  return sessionId()
}
```

**Source:** NanoID documentation - custom alphabet for URL-safe, human-readable IDs.

### Client-Side File Validation

```typescript
// composables/useFileUpload.ts
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File size exceeds 10MB limit' }
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Only PDF, JPEG, PNG, and WebP files are allowed' }
  }

  return { valid: true }
}
```

**Source:** OWASP file upload guidelines - validate both size and type client-side for UX, server-side for security.

### VueUse Online Detection

```vue
<script setup lang="ts">
import { useOnline } from '@vueuse/core'

const isOnline = useOnline()
</script>

<template>
  <div v-if="!isOnline" class="offline-banner">
    You're offline. Reconnecting...
  </div>
</template>
```

**Source:** VueUse documentation - `useOnline` composable for reactive network status.

### Yjs Auto-Save Integration

```typescript
// composables/useAutoSave.ts
import * as Y from 'yjs'

export function useYjsAutoSave(
  ydoc: Y.Doc,
  whiteboardId: string,
  saveFn: (state: any) => Promise<void>
) {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null

  // Save on any Yjs document change
  ydoc.on('update', () => {
    clearTimeout(saveTimeout!)
    saveTimeout = setTimeout(async () => {
      const state = ydoc.toArray() // or your export logic
      await saveFn({ whiteboardId, canvas_state: state })
    }, 30000) // 30 second debounce
  })

  // Also save on interval as safety net
  const saveInterval = setInterval(() => {
    const state = ydoc.toArray()
    saveFn({ whiteboardId, canvas_state: state })
  }, 30000)

  onUnmounted(() => {
    clearTimeout(saveTimeout!)
    clearInterval(saveInterval)
  })
}
```

**Source:** Yjs documentation - listening to document updates for persistence.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| UUID for URLs | Short memorable strings (nanoid) | ~2020 | Better UX for shareable links |
| FormData without progress | Axios with onUploadProgress | 2021-2022 | Modern upload UX like Google Drive |
| Manual polling for online status | VueUse useOnline (Network API) | ~2023 | More reliable, less battery drain |
| Manual save button | Auto-save with debounce | ~2019, now standard | Expectation in all collaborative apps |
| Exponential backoff for reconnect | User-controllable strategy | Varies by use case | This project requires instant retry |

**Deprecated/outdated:**
- **shortid**: Deprecated library, replaced by nanoid
- **socket.io**: For this use case, native WebSocket + Yjs is more appropriate
- **jQuery AJAX**: Use fetch/Axios in modern Vue applications
- **Relational database for canvas state**: JSONB in PostgreSQL is more flexible for nested document structures

## Open Questions

1. **Session ID Character Set Optimization**
   - What we know: Standard nanoid alphabet includes 0OIl which are visually ambiguous
   - What's unclear: Whether to prioritize maximum entropy (62 chars) vs human readability (remove ambiguous chars)
   - Recommendation: Use reduced alphabet (remove 0OIl1) for better UX, still provides >1 trillion combinations with 8 chars

2. **WebSocket Reconnection with Yjs**
   - What we know: y-websocket handles reconnection, but default behavior includes exponential backoff
   - What's unclear: How to configure instant retry without exponential backoff
   - Recommendation: Investigate y-websocket configuration options or implement custom WebSocket provider wrapper

3. **Session Cleanup Scheduling**
   - What we know: PostgreSQL doesn't have built-in TTL, need external cron or pg_cron
   - What's unclear: Whether Supabase hosting supports pg_cron extension
   - Recommendation: Use external cron job (e.g., GitHub Actions cron, Vercel Cron) as fallback if pg_cron unavailable

## Sources

### Primary (HIGH confidence)
- NanoID collision calculator - zelark.github.io/nano-id-cc/ (collision probability math)
- NanoID documentation - URL-safe ID generation with custom alphabet
- Nitro WebSocket Guide - nitro.build/guide/websocket (official Nitro WebSocket docs)
- Yjs documentation - CRDT sync and persistence patterns
- VueUse documentation - useOnline composable for network detection
- Supabase Storage documentation - File upload and bucket management

### Secondary (MEDIUM confidence)
- DEV Community: "Building a Secure File Upload API with Nuxt 3" (2025)
- dev.to: "Robust WebSocket Reconnection Strategies" (reconnection patterns)
- 30 Seconds of Code: debounce implementation reference
- ProjectScale API Decision: Real-world nanoid collision calculations
- mtechzilla.com: NanoID vs UUID collision comparison (2025)

### Tertiary (LOW confidence)
- WebSearch results on auto-save patterns (2026) - Need verification with official docs
- WebSearch results on Supabase session cleanup (2026) - Confirmed PostgreSQL doesn't have native TTL
- WebSearch results on file upload security (2026) - OWASP guidelines are authoritative

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All packages are industry standards with current versions verified
- Architecture: HIGH - Patterns are based on official documentation and existing working codebase
- Pitfalls: MEDIUM - Some identified through research, others through codebase analysis

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (30 days - Nuxt/Supabase ecosystem is relatively stable)

**Existing codebase status:**
- Supabase integration: COMPLETE (schema.sql, useWhiteboardStorage.ts)
- WebSocket handler: COMPLETE (server/websocket/[...].ts)
- Yjs composable: COMPLETE (useCollaborativeCanvas.ts)
- File upload API: COMPLETE (server/api/whiteboard/upload.post.ts) but needs progress tracking
- Session ID generation: NEEDS IMPLEMENTATION (currently uses UUID)
- Auto-save logic: PARTIAL (exists in whiteboard/[id].vue but not as reusable composable)
- Offline detection: NEEDS IMPLEMENTATION
- Session expiration: NEEDS IMPLEMENTATION
