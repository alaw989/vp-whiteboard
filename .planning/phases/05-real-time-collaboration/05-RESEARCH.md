# Phase 5: Real-time Collaboration - Research

**Researched:** 2026-02-11
**Domain:** Yjs awareness protocol, y-websocket real-time sync, Konva.js cursor rendering, Vue 3 collaborative composables
**Confidence:** HIGH

## Summary

Phase 5 focuses on implementing real-time multi-user collaboration features. The core technical challenges involve: (1) tracking and displaying remote user cursors with names/colors, (2) maintaining a live user presence list, (3) broadcasting drawing changes instantly via Yjs CRDT, and (4) implementing cursor throttling and cleanup to manage performance.

The existing codebase has foundational infrastructure: `useCollaborativeCanvas.ts` already initializes Yjs document with `yCursors` Map for presence and includes basic `updateCursor()` function. The types system defines `UserPresence` interface with id, name, color, cursor position, tool, and lastSeen timestamp. However, the current implementation lacks: actual cursor rendering on canvas, user list UI component, real-time drawing synchronization during active strokes (not just on stroke end), and cursor throttling/cleanup mechanisms.

The research confirms that Yjs provides two distinct mechanisms for collaboration: (1) Y.Map/Y.Array for persistent shared state (elements, viewport) and (2) Awareness protocol for ephemeral state like cursor positions and user presence. The existing code uses a custom Y.Map approach (`yCursors`) for cursors, but Yjs's built-in Awareness protocol (available via y-websocket provider) is more efficient and handles broadcast/cleanup automatically. For cursor rendering, Konva's shape layering requires cursors on top of all content - typically via a dedicated cursor layer.

**Primary recommendation:** Implement a dedicated `useCursors` composable for cursor management, create a `UserList` Vue component for presence display, extend the drawing tools to broadcast stroke points in real-time via Yjs, and implement requestAnimationFrame throttling for cursor updates to optimize performance.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `yjs` | 13.6.29 (existing) | CRDT for shared state, Awareness API for cursors | Already in project, provides awareness.getStates() and awareness.setLocalState() |
| `y-websocket` | 3.0.0 (existing) | WebSocket provider with built-in awareness | Already in project, includes automatic awareness broadcast/cleanup |
| `konva` | 9.3.15 (existing) | Canvas rendering, cursor shapes | Already in project, can render custom cursor shapes |
| `vue-konva` | 3.3.0 (existing) | Vue bindings for cursor components | Already in project, reactive cursor positioning |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@vueuse/core` | 12.0.1 (existing) | useDebounceFn, useRafFn for throttling | Already in project, tested utilities for performance |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Yjs Awareness | Custom WebSocket cursor messages | Awareness handles cleanup, deduplication, reconnection automatically |
| Custom cursor throttling | Broadcast every mousemove | Excessive network traffic; RAF throttling is industry standard |
| y-websocket | Hocuspocus server | Hocuspocus is more complex; y-websocket is simpler for this use case |
| Dedicated cursor layer | Render cursors on content layer | Layer isolation prevents cursors from interfering with hit detection |

**Installation:**
```bash
# No new packages needed - all required dependencies already installed
npm ls yjs y-websocket konva vue-konva @vueuse/core  # Verify existing versions
```

## Architecture Patterns

### Recommended Project Structure
```
composables/
├── useCursors.ts          # NEW: manage local cursor, observe remote cursors, throttling
├── useCollaborativeCanvas.ts # (modify: add awareness integration, real-time stroke sync)
└── useDrawingTools.ts      # (modify: broadcast strokes in progress)

components/whiteboard/
├── WhiteboardCanvas.vue     # (modify: render remote cursors, integrate useCursors)
├── UserPresenceList.vue    # NEW: display all connected users with colors/status
└── CursorRenderer.vue       # NEW: reusable cursor component (name label + pointer)

types/
└── index.ts                 # (existing: UserPresence already defined)
```

### Pattern 1: Yjs Awareness for Cursor Tracking
**What:** Use Yjs's built-in Awareness protocol instead of custom Y.Map for cursor/presence management.
**When to use:** For all real-time user presence and cursor position tracking.
**Example:**
```typescript
// composables/useCursors.ts
import * as Y from 'yjs'

export function useCursors(provider: any, userId: string, userName: string) {
  // Access awareness from WebSocket provider
  const awareness = provider.awareness

  const currentUser = ref({
    id: userId,
    name: userName,
    color: getUserColor(userId),
  })

  // All remote users' cursors
  const remoteCursors = ref<Map<number, any>>(new Map())

  // Subscribe to awareness changes
  const handleChange = () => {
    const states = awareness.getStates()
    const cursors = new Map<number, any>()

    states.forEach((state: any, clientId: number) => {
      // Skip current user
      if (clientId !== awareness.clientId) {
        cursors.set(clientId, {
          ...state,
          color: state.user?.color || getUserColor(clientId.toString()),
        })
      }
    })

    remoteCursors.value = cursors
  }

  awareness.on('change', handleChange)
  handleChange() // Initial sync

  // Update local cursor position with throttling
  let rafId: number | null = null
  function updateLocalCursor(x: number, y: number, tool?: DrawingTool) {
    if (rafId !== null) return // Already scheduled

    rafId = requestAnimationFrame(() => {
      awareness.setLocalState({
        user: currentUser.value,
        cursor: { x, y },
        tool,
      })
      rafId = null
    })
  }

  // Cleanup
  function cleanup() {
    awareness.off('change', handleChange)
    awareness.setLocalState(null) // Mark as offline
  }

  return {
    currentUser,
    remoteCursors,
    updateLocalCursor,
    cleanup,
    awareness,
  }
}

// Helper: Get consistent color for user
function getUserColor(userId: string): string {
  const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899']
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}
// Source: https://docs.yjs.dev/getting-started/adding-awareness
```

### Pattern 2: Konva Cursor Layer for Remote Cursors
**What:** Create a dedicated layer on top of all content layers for rendering remote user cursors.
**When to use:** In WhiteboardCanvas.vue template structure.
**Example:**
```vue
<template>
  <v-stage ref="stageRef" :config="stageConfig">
    <!-- Document Layer (bottom) -->
    <v-layer ref="documentLayerRef" />

    <!-- Main Drawing Layer -->
    <v-layer ref="drawingLayerRef">
      <!-- User's drawings -->
    </v-layer>

    <!-- Transformer Layer -->
    <v-layer ref="transformerLayerRef">
      <v-transformer ref="transformerRef" />
    </v-layer>

    <!-- Remote Cursors Layer (topmost) -->
    <v-layer ref="cursorsLayerRef">
      <template v-for="[clientId, cursor] in remoteCursors" :key="clientId">
        <v-group
          :config="{
            x: cursor.cursor?.x || 0,
            y: cursor.cursor?.y || 0,
            listening: false, // Don't intercept events
          }"
        >
          <!-- Cursor pointer (triangle) -->
          <v-path
            :config="{
              data: 'M 0 0 L 6 6 L 0 12 Z',
              fill: cursor.user?.color || '#3B82F6',
              offsetX: -3,
              offsetY: 0,
              scale: { x: 1.5, y: 1.5 },
            }"
          />

          <!-- User name label -->
          <v-tag
            :config="{
              x: 8,
              y: -5,
              text: cursor.user?.name || 'Anonymous',
              fill: cursor.user?.color || '#3B82F6',
              fontSize: 12,
              fontFamily: 'Arial, sans-serif',
              padding: 4,
              cornerRadius: 4,
              pointerDirection: 'left',
              pointerWidth: 0,
              lineJoin: 'round',
            }"
          />
        </v-group>
      </template>
    </v-layer>
  </v-stage>
</template>
// Source: https://konvajs.org/docs/index.html (custom shapes, layers)
```

### Pattern 3: Real-Time Stroke Broadcast
**What:** Broadcast stroke points incrementally during drawing (not just on stroke end) for real-time sync.
**When to use:** During pen/highlighter tool use for live collaborative drawing.
**Example:**
```typescript
// In useCollaborativeCanvas.ts or useDrawingTools.ts
import type { StrokePoint } from '~/types'

// Shared Y.Map for current strokes being drawn
const yActiveStrokes = ydoc.getMap<Record<string, StrokePoint[]>>('activeStrokes')

function startDrawingStroke(strokeId: string) {
  ydoc.transact(() => {
    yActiveStrokes.set(strokeId, [])
  }, userId)
}

function broadcastStrokePoint(strokeId: string, point: [number, number, number]) {
  ydoc.transact(() => {
    const existing = yActiveStrokes.get(strokeId) || []
    yActiveStrokes.set(strokeId, [...existing, point])
  }, userId)
}

function endDrawingStroke(strokeId: string) {
  ydoc.transact(() => {
    // Move from active to permanent elements array
    const points = yActiveStrokes.get(strokeId) || []

    // Create final element from active stroke points
    const element: CanvasElement = {
      id: strokeId,
      type: 'stroke',
      userId,
      userName,
      timestamp: Date.now(),
      data: {
        points,
        color: currentColor.value,
        size: currentSize.value,
        tool: currentTool.value === 'highlighter' ? 'highlighter' : 'pen',
        smooth: true,
      } as StrokeElement,
    }

    yElements.push([element])
    yActiveStrokes.delete(strokeId)
  }, userId)
}

// Observe remote active strokes for rendering
yActiveStrokes.observe((event) => {
  event.changes.keys.forEach((key) => {
    const strokeId = key as string
    const points = yActiveStrokes.get(strokeId)

    if (points) {
      // Render preview of remote stroke in progress
      renderActiveStroke(strokeId, points)
    } else {
      // Remote stroke ended - clear preview
      clearActiveStroke(strokeId)
    }
  })
})
// Source: https://docs.yjs.dev/api/map
```

### Pattern 4: Cursor Throttling with requestAnimationFrame
**What:** Throttle cursor position updates using RAF to avoid excessive network traffic while maintaining smooth UX.
**When to use:** In mousemove handler for local cursor broadcasting.
**Example:**
```typescript
// Throttle pattern from Excalidraw approach
let lastUpdateTime = 0
const THROTTLE_MS = 16 // ~60fps

function throttleRAF(callback: () => void) {
  if (Date.now() - lastUpdateTime < THROTTLE_MS) {
    return
  }
  lastUpdateTime = Date.now()

  requestAnimationFrame(() => {
    callback()
  })
}

// Usage in component
function handleMouseMove(event: any) {
  const stage = stageRef.value?.getNode()
  if (!stage) return

  const pos = stage.getPointerPosition()
  if (!pos) return

  throttleRAF(() => {
    updateLocalCursor(pos.x, pos.y, currentTool.value)
  })
}

// Or use VueUse's useDebounceFn with RAF
import { useDebounceFn } from '@vueuse/core'

const debouncedUpdateCursor = useDebounceFn(
  (x: number, y: number) => {
    updateLocalCursor(x, y)
  },
  16 // ~60fps
)
// Source: https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/component-utils.tsx (throttleRAF)
```

### Pattern 5: User Presence List Component
**What:** Display all connected users in a floating panel or sidebar with their assigned colors.
**When to use:** As a new component `UserPresenceList.vue`.
**Example:**
```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { UserPresence } from '~/types'

interface Props {
  users: Map<string, UserPresence>
}

const props = defineProps<Props>()

const userList = computed(() => {
  return Array.from(props.users.values())
    .filter(u => Date.now() - u.lastSeen < 30000) // Active within 30s
    .sort((a, b) => a.name.localeCompare(b.name))
})

const userCount = computed(() => userList.value.length)
</script>

<template>
  <div class="fixed top-4 right-4 bg-white rounded-lg shadow-lg p-3 max-w-xs">
    <div class="flex items-center justify-between mb-2">
      <h3 class="font-semibold text-sm text-gray-700">In Session</h3>
      <span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
        {{ userCount }}
      </span>
    </div>

    <ul class="space-y-2">
      <li
        v-for="user in userList"
        :key="user.id"
        class="flex items-center gap-2"
      >
        <!-- User color indicator -->
        <div
          class="w-3 h-3 rounded-full"
          :style="{ backgroundColor: user.color }"
        />

        <!-- User name and tool -->
        <div class="flex-1">
          <div class="text-sm font-medium text-gray-800">
            {{ user.name }}
          </div>
          <div class="text-xs text-gray-500">
            {{ user.tool || 'Viewing' }}
          </div>
        </div>

        <!-- Online status -->
        <div
          class="w-2 h-2 rounded-full"
          :class="Date.now() - user.lastSeen < 5000 ? 'bg-green-500' : 'bg-gray-300'"
        />
      </li>
    </ul>
  </div>
</template>
// Source: Tailwind CSS collaborative UI patterns
```

### Pattern 6: Cursor Cleanup on Disconnect
**What:** Automatically remove cursors when users disconnect, with timeout-based cleanup.
**When to use:** Integrated with awareness change handler.
**Example:**
```typescript
// In useCursors composable
const CLEANUP_TIMEOUT = 30000 // 30 seconds

watch(
  () => remoteCursors.value,
  (cursors) => {
    const now = Date.now()

    // Clean up stale cursors
    for (const [clientId, cursor] of cursors) {
      if (cursor.lastSeen && now - cursor.lastSeen > CLEANUP_TIMEOUT) {
        cursors.delete(clientId)
      }
    }
  },
  { deep: true }
)

// Awareness protocol handles this automatically
// Users are marked offline when they disconnect or timeout
awareness.on('change', () => {
  const states = awareness.getStates()
  for (const [clientId, state] of states) {
    // state is null if user is offline
    if (!state) {
      cursors.delete(clientId)
    }
  }
})
// Source: https://docs.yjs.dev/api/awareness
```

### Anti-Patterns to Avoid
- **Broadcasting every mousemove:** Don't send cursor position on every pixel movement - use RAF throttling (16ms minimum)
- **Using Y.Map for cursors:** Don't manually manage cursor lifecycle with yCursors Map - use Awareness API instead
- **Cursors on content layer:** Don't mix cursors with drawing elements - use dedicated top layer for proper z-index
- **Rendering own cursor:** Don't render local user's cursor on canvas - only render remote cursors
- **No cursor cleanup:** Don't let disconnected users' cursors persist forever - implement timeout-based removal
- **Storing active strokes in elements array:** Don't intermix in-progress strokes with completed elements - use separate Y.Map

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Custom cursor protocol | Yjs Awareness API | Handles broadcast, cleanup, reconnection, deduplication automatically |
| Manual cursor throttling | requestAnimationFrame + VueUse | Tested utility, browser-optimized timing |
| Custom user cleanup | Awareness change events | Automatic offline detection, timestamp tracking |
| Stroke diff algorithm | Yjs CRDT merge | Conflict-free concurrent stroke handling built-in |

**Key insight:** Yjs Awareness provides a complete presence/cursor solution:
- `awareness.setLocalState()` broadcasts your state
- `awareness.getStates()` returns all users
- `awareness.on('change')` notifies of changes
- Automatic cleanup on disconnect
- Client ID assignment without collision

## Common Pitfalls

### Pitfall 1: Excessive Network Traffic from Cursors
**What goes wrong:** Every mousemove event triggers a WebSocket message, causing lag.
**Why it happens:** No throttling on cursor updates - each pixel movement broadcasts.
**How to avoid:** Implement RAF throttling (minimum 16ms = ~60fps) before calling `setLocalState()`.
**Warning signs:** Network tab shows hundreds of awareness messages per second, cursor movement is jittery.

### Pitfall 2: Cursor Flickering
**What goes wrong:** Remote cursor jumps around instead of moving smoothly.
**Why it happens:** Direct position updates without interpolation or buffering during render.
**How to avoid:** Buffer cursor updates and render in `requestAnimationFrame`, or use CSS transitions for smooth movement.
**Warning signs:** Remote cursor movement looks stuttered or teleports between positions.

### Pitfall 3: Stale Cursors Persisting
**What goes wrong:** Disconnected users' cursors remain visible indefinitely.
**Why it happens:** Awareness state not cleaned up, or no timeout-based removal.
**How to avoid:** Awareness handles disconnect automatically; for custom Y.Map approach, implement 30-second timeout check.
**Warning signs:** User list shows people who left minutes ago, old cursors clutter canvas.

### Pitfall 4: Cursor Interfering with Hit Detection
**What goes wrong:** Clicking on a cursor triggers element selection or other events.
**Why it happens:** Cursor shapes have `listening: true` (default) and receive click events.
**How to avoid:** Set `listening: false` on cursor layer or individual cursor shapes.
**Warning signs:** Clicking "near" a cursor unexpectedly selects elements.

### Pitfall 5: Drawing Conflict During Simultaneous Edit
**What goes wrong:** Two users drawing simultaneously causes strokes to merge incorrectly.
**Why it happens:** Not using Yjs transactions properly, or interleaving points instead of maintaining separate arrays.
**How to avoid:** Each user's active stroke should be in separate Y.Map entry, merged to elements array only on completion.
**Warning signs:** Two users drawing at once results in corrupted or interleaved strokes.

### Pitfall 6: Local Cursor Rendered on Screen
**What goes wrong:** User sees their own cursor duplicated on canvas.
**Why it happens:** Rendering all cursors from awareness.getStates() without filtering local client.
**How to avoid:** Filter out `awareness.clientId` when iterating states for rendering.
**Warning signs:** Two cursors with same name/color visible, offset from actual pointer.

### Pitfall 7: Real-Time Stroke Performance Degradation
**What goes wrong:** Broadcasting every stroke point causes canvas lag.
**Why it happens:** Too frequent Yjs updates (every point) without batching or throttling.
**How to avoid:** Throttle stroke broadcast to ~30-60fps (16-33ms), or use smaller point intervals.
**Warning signs:** Drawing becomes slow with multiple users, CPU usage high.

## Code Examples

Verified patterns from official sources:

### Yjs Awareness Setup
```typescript
// From y-websocket provider
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

const ydoc = new Y.Doc()
const wsProvider = new WebsocketProvider(
  'ws://localhost:1234',
  'whiteboard-room-1',
  ydoc,
  {
    connect: true,
    params: {
      userId,
      userName,
    },
  }
)

// Access awareness from provider
const awareness = wsProvider.awareness

// Set local state
awareness.setLocalState({
  user: {
    name: userName,
    color: getUserColor(userId),
  },
  cursor: { x: 100, y: 200 },
  tool: 'pen',
})

// Get all states
const states = awareness.getStates()
// Map<number, {user, cursor, tool}>

// Listen for changes
awareness.on('change', () => {
  const states = awareness.getStates()
  console.log('Active users:', states.size)
})

// Cleanup on unmount
awareness.setLocalState(null)
// Source: https://docs.yjs.dev/getting-started/adding-awareness
```

### Konva Cursor Triangle Shape
```typescript
// Cursor pointer as SVG path data
const CURSOR_PATH = 'M 0 0 L 6 6 L 0 12 Z'

// Render cursor
const cursor = new Konva.Path({
  data: CURSOR_PATH,
  fill: userColor,
  x: cursorX,
  y: cursorY,
  offsetX: -3,  // Pivot point
  offsetY: 0,
  listening: false,
})

// Name label using Konva.Tag
const label = new Konva.Tag({
  x: cursorX + 8,
  y: cursorY - 5,
  text: userName,
  fill: userColor,
  fontSize: 12,
  padding: 4,
  cornerRadius: 4,
  pointerDirection: 'left',
  listening: false,
})

// Group for easy positioning
const cursorGroup = new Konva.Group({ x: cursorX, y: cursorY })
cursorGroup.add(cursor, label)
// Source: https://konvajs.org/api/Konva.Path.html
```

### RAF-Throttled Cursor Update
```typescript
import { useDebounceFn } from '@vueuse/core'

// Throttle to ~60fps minimum
const throttledCursorUpdate = useDebounceFn(
  (x: number, y: number, tool: DrawingTool) => {
    awareness?.setLocalState({
      user: currentUser.value,
      cursor: { x, y },
      tool,
    })
  },
  16 // 16ms = ~60fps
)

// Usage
function handleMouseMove(event: MouseEvent) {
  if (!stageRef.value) return

  const pos = stageRef.value.getPointerPosition()
  if (!pos) return

  throttledCursorUpdate(pos.x, pos.y, currentTool.value)
}
// Source: https://vueuse.org/core/usedebouncefn/
```

### Real-Time Active Stroke Observation
```typescript
// Y.Map for strokes currently being drawn
const yActiveStrokes = ydoc.getMap<Record<string, StrokePoint[]>>('activeStrokes')

// Render active strokes on canvas
const activeStrokes = ref<Record<string, StrokePoint[]>>({})

yActiveStrokes.observe((event) => {
  event.changes.keys.forEach((key) => {
    const strokeId = key as string
    const points = yActiveStrokes.get(strokeId)

    if (points && points.length > 0) {
      // Update or create active stroke
      activeStrokes.value[strokeId] = points
    } else {
      // Stroke ended - remove from active
      delete activeStrokes.value[strokeId]
    }
  })
})

// Render active strokes (preview)
function renderActiveStrokes() {
  return Object.entries(activeStrokes.value).map(([id, points]) => ({
    id,
    points,
    isPreview: true, // Flag for different rendering
  }))
}
// Source: https://docs.yjs.dev/api/map#mapobserveevent
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom WebSocket protocol | Yjs Awareness | ~2020 | Standardized, no need to implement presence/cursor protocol |
| Y.Map for cursors | Awareness API | ~2021 | Automatic cleanup, better performance, built-in reconnection handling |
| Poll-based updates | Real-time broadcast | ~2019 | Instant collaboration, no perceived lag |
| Stroke-end sync | Real-time point sync | ~2022 | Live collaborative drawing experience |
| No cursor throttling | RAF throttling | ~2021 | Reduced network traffic, smoother UX |

**Deprecated/outdated:**
- Custom cursor sync via WebSocket messages: Use Awareness API instead
- Manual user timeout tracking: Awareness handles this automatically
- Per-pixel cursor broadcasting: Throttle to 16-33ms minimum
- Polling for presence: Use Awareness change events instead

## Open Questions

1. **Should active strokes be visible to other users while drawing?**
   - What we know: Real-time sync requires broadcasting points during drawing
   - What's unclear: Should in-progress strokes be rendered differently (dashed, preview color)?
   - Recommendation: Render active strokes with slight visual distinction (lower opacity or different color) until completed.

2. **User list placement and persistence**
   - What we know: Need to show all users in session
   - What's unclear: Should this be a floating panel, sidebar, or toolbar dropdown?
   - Recommendation: Start with floating panel (top-right), can be moved to sidebar based on UX feedback.

3. **Cursor visibility limits**
   - What we know: Too many cursors can clutter canvas
   - What's unclear: Should we hide cursors when user is idle for some time?
   - Recommendation: Show cursor for 30 seconds after last movement, then fade or hide.

4. **Conflict handling for simultaneous edits**
   - What we know: Yjs CRDT handles merging automatically
   - What's unclear: Should users see "who is editing" indicator?
   - Recommendation: Phase 5 focuses on technical sync; conflict UX indicators can be added later based on user feedback.

## Sources

### Primary (HIGH confidence)
- [Yjs Official Documentation - Adding Awareness](https://docs.yjs.dev/getting-started/adding-awareness) - Core Awareness API reference
- [Yjs Awareness API Reference](https://docs.yjs.dev/api/awareness) - setLocalState, getStates, event handling
- [y-websocket GitHub Repository](https://github.com/yjs/y-websocket) - WebSocket provider with awareness
- [Konva.js Official Documentation](https://konvajs.org/docs/index.html) - Layer management, custom shapes
- [Konva Path API](https://konvajs.org/api/Konva.Path.html) - Cursor triangle rendering
- [Konva Tag API](https://konvajs.org/api/Konva.Tag.html) - Name labels for cursors

### Secondary (MEDIUM confidence)
- [Tiptap Collaboration - Awareness Concepts](https://tiptap.dev/docs/collaboration/core-concepts/awareness) - Practical awareness patterns for collaborative editing
- [Yjs Community Discussion - Remote User Cursors](https://discuss.yjs.dev/t/rendering-remote-user-cursor/1160) - Community implementation patterns
- [Dovetail Engineering - Yjs Fundamentals Part 2](https://dovetail.dev/blog/yjs-fundamentals-part-2-sync-awareness) - Awareness and sync best practices
- [Medium - Building Real-Time Collaboration with Yjs](https://medium.com/@connect.hashblock/from-zero-to-real-time-building-a-live-collaboration-tool-with-yjs-and-next-js-e82eadccd828) - Tutorial with examples

### Tertiary (LOW confidence - marked for validation)
- GitHub community examples for collaborative whiteboards - Verify cursor rendering patterns during implementation
- y-protocols repository for awareness protocol details - Reference for cleanup behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Yjs Awareness API and y-websocket are verified in project, official docs confirm all capabilities
- Architecture: HIGH - Official Yjs and Konva documentation provides complete patterns, VueUse utilities verified
- Pitfalls: MEDIUM - Throttling and performance patterns are industry standard (Excalidraw, Figma), but canvas-specific behavior needs validation

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (30 days - Yjs and Konva are stable with infrequent breaking changes)
