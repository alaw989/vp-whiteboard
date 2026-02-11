# Phase 4: Canvas Navigation - Research

**Researched:** 2026-02-11
**Domain:** Konva.js canvas navigation (zoom/pan), Yjs view state synchronization, Vue 3 composables
**Confidence:** HIGH

## Summary

Phase 4 focuses on implementing canvas navigation capabilities that enable users to work with large drawings. The core technical challenges involve: (1) implementing smooth mouse wheel zoom with pointer-relative scaling in Konva, (2) enabling pan-by-drag functionality on the stage, and (3) synchronizing viewport state (x, y, zoom) across all connected users via Yjs.

The existing codebase has partial implementation: `WhiteboardCanvas.vue` already includes basic `handleWheel` function for zoom and viewport state refs, but the implementation needs refinement for production-quality UX. The pan tool exists but toggles `draggable: true` on the stage, which is the correct Konva approach. The types system already defines `ViewportState` interface with x, y, zoom properties - this is already integrated into `CanvasState` and ready for use.

The research confirms that Konva 9.3.x provides built-in stage dragging (`draggable: true`) and scaling (`scaleX`, `scaleY`) that handle all navigation requirements. For collaboration, Yjs shared Map is the standard pattern for synchronizing view state - separate from element data to avoid polluting the undo history. The existing `yMeta` Map in `useCollaborativeCanvas.ts` can be extended for viewport storage.

**Primary recommendation:** Create a dedicated `useViewport` composable that encapsulates zoom/pan logic, extend Yjs `yMeta` Map to store viewport state for synchronization, and implement proper pointer-relative zoom calculations using Konva's transformation methods.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `konva` | 9.3.15 (existing) | Canvas rendering, stage transform, drag | Already in project, provides draggable stage and scale |
| `vue-konva` | 3.3.0 (existing) | Vue bindings for Konva | Already in project, reactive stage config |
| `yjs` | 13.6.29 (existing) | CRDT for collaborative state | Already in project, use yMeta.Map for viewport |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | - | - | Existing packages cover all needs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Konva stage.draggable | Custom drag calculation | Konva handles drag bounds, events, inertia - minimal code |
| Y.Map for viewport | Custom WebSocket sync | Yjs provides built-in observers, conflict resolution |
| Pointer-relative zoom | Center-stage zoom | UX - zooming toward cursor is more natural |

**Installation:**
```bash
# No new packages needed - all required dependencies already installed
npm ls konva vue-konva yjs  # Verify existing versions
```

## Architecture Patterns

### Recommended Project Structure
```
composables/
├── useViewport.ts          # NEW: manage zoom/pan state, wheel events, drag boundaries
├── useCollaborativeCanvas.ts # (modify: extend yMeta for viewport sync)
└── useKeyboardShortcuts.ts  # (existing: may extend for zoom shortcuts)

components/whiteboard/
├── WhiteboardCanvas.vue     # (modify: integrate useViewport, refine zoom/pan)
└── WhiteboardToolbar.vue    # (modify: add zoom controls if needed)

types/
└── index.ts                 # (existing: ViewportState already defined)
```

### Pattern 1: Viewport Composable for Zoom/Pan Management
**What:** Centralize all viewport state (x, y, zoom) and navigation logic in a dedicated composable following the project's composable pattern.
**When to use:** For all canvas navigation functionality - zoom wheel, pan drag, programmatic zoom.
**Example:**
```typescript
// composables/useViewport.ts
import { ref, computed, type Ref } from 'vue'
import type { ViewportState } from '~/types'

export interface ViewportOptions {
  stageRef: Ref<any>
  containerRef: Ref<HTMLDivElement | null>
  minZoom?: number
  maxZoom?: number
  onViewportChange?: (viewport: ViewportState) => void
}

export function useViewport(options: ViewportOptions) {
  const { stageRef, containerRef, minZoom = 0.1, maxZoom = 5 } = options

  // Viewport state
  const viewport = ref<ViewportState>({
    x: 0,
    y: 0,
    zoom: 1,
  })

  // Computed for stage config (reactive)
  const stageConfig = computed(() => ({
    scaleX: viewport.value.zoom,
    scaleY: viewport.value.zoom,
    x: viewport.value.x,
    y: viewport.value.y,
    draggable: false, // Controlled via useViewport, not directly
  }))

  // Zoom relative to pointer position
  function handleWheel(event: WheelEvent) {
    event.evt.preventDefault()

    const stage = stageRef.value?.getNode()
    if (!stage) return

    const oldScale = viewport.value.zoom
    const pointer = stage.getPointerPosition()

    // Scale factor for wheel zoom
    const scaleBy = 1.1
    const newScale = event.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy

    // Clamp to limits
    const clampedScale = Math.min(Math.max(newScale, minZoom), maxZoom)

    // Adjust position to zoom toward pointer
    if (pointer) {
      const scaleChange = clampedScale / oldScale
      viewport.value.x = pointer.x - (pointer.x - viewport.value.x) * scaleChange
      viewport.value.y = pointer.y - (pointer.y - viewport.value.y) * scaleChange
    }

    viewport.value.zoom = clampedScale
    onViewportChange?.(viewport.value)
  }

  return {
    viewport,
    stageConfig,
    handleWheel,
    // ... other methods
  }
}
// Source: https://konvajs.org/docs/sandbox/Zooming_Relative_To_Pointer.html
```

### Pattern 2: Pan Tool with Stage Draggable
**What:** Use Konva's built-in `draggable: true` on stage for panning, combined with drag boundaries.
**When to use:** When user selects pan tool or holds spacebar (optional enhancement).
**Example:**
```typescript
// In useViewport composable
const isPanning = ref(false)

function startPan() {
  isPanning.value = true
  const stage = stageRef.value?.getNode()
  if (stage) {
    stage.draggable(true)
  }
}

function stopPan() {
  isPanning.value = false
  const stage = stageRef.value?.getNode()
  if (stage) {
    // Update viewport position from stage
    const pos = stage.position()
    viewport.value.x = pos.x
    viewport.value.y = pos.y
    stage.draggable(false)
  }
}

// Watch drag move to sync state
watch(() => stageRef.value?.getNode()?.position(), (pos) => {
  if (isPanning.value && pos) {
    viewport.value.x = pos.x
    viewport.value.y = pos.y
  }
})
```

### Pattern 3: Yjs Viewport Synchronization
**What:** Store viewport state in Yjs shared Map to synchronize across all connected clients.
**When to use:** For collaborative sessions where all users should see the same viewport (optional follow-mode).
**Example:**
```typescript
// In useCollaborativeCanvas.ts - extend existing
const yMeta = ydoc.getMap<any>('meta')

// Viewport state in shared map
const yViewport = yMeta.get('viewport') as ViewportState | undefined

// Function to update viewport (only from current user to avoid loops)
function updateViewport(viewport: ViewportState) {
  ydoc.transact(() => {
    yMeta.set('viewport', {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
      lastUpdatedBy: userId, // Track who changed it
      timestamp: Date.now(),
    })
  }, userId)
}

// Observe remote viewport changes
yMeta.observe((event) => {
  if (event.keysChanged.has('viewport')) {
    const remoteViewport = yMeta.get('viewport')
    // Only apply if not from current user (avoid loop)
    if (remoteViewport?.lastUpdatedBy !== userId) {
      // Apply remote viewport (with transition for smooth UX)
      applyViewport(remoteViewport)
    }
  }
})
```

### Pattern 4: Zoom/Pan Boundaries
**What:** Constrain stage movement and zoom levels to prevent users from getting "lost" in empty space.
**When to use:** For all zoom/pan operations to maintain usable canvas bounds.
**Example:**
```typescript
// Boundary configuration
const BOUNDARIES = {
  minZoom: 0.1,  // 10% scale
  maxZoom: 5,     // 500% scale
  // Pan boundaries depend on zoom level - more zoom = more pan allowed
}

function clampPosition(x: number, y: number, zoom: number): {x: number, y: number} {
  // Calculate max pan distance based on zoom
  const maxPanX = (stageConfig.width * (1 - 1/zoom)) / 2
  const maxPanY = (stageConfig.height * (1 - 1/zoom)) / 2

  return {
    x: Math.max(-maxPanX, Math.min(maxPanX, x)),
    y: Math.max(-maxPanY, Math.min(maxPanY, y)),
  }
}
```

### Anti-Patterns to Avoid
- **Separate scaleX and scaleY for zoom:** Don't allow independent x/y scaling - always scale proportionally to maintain aspect ratio
- **Direct stage manipulation without state sync:** Don't update stage directly without updating viewport ref - breaks reactivity and collaboration
- **Storing viewport in elements array:** Don't put viewport state in yElements - pollutes undo/redo with non-user actions
- **Using CSS transform for zoom:** Don't use CSS scale/translate on the canvas container - breaks Konva's coordinate system
- **Updating viewport on every wheel event:** Don't sync to Yjs on every wheel tick - use debouncing to avoid excessive network traffic

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Custom drag calculation | Konva stage.draggable | Handles all drag events, bounds checking, touch support |
| Manual zoom-to-pointer math | Konva transformation methods | getPointerPosition(), getAbsoluteTransform() are battle-tested |
| Custom viewport sync protocol | Yjs Map observers | Automatic conflict resolution, awareness of remote changes |
| Debounce implementation | Custom throttle/debounce | VueUse @vueuse/core useDebounceFn - tested utility |

**Key insight:** Konva's `stage.draggable(true)` is a single property that enables:
- Mouse drag panning
- Touch drag panning
- Drag boundaries (dragBoundFunc)
- Drag events (dragstart, dragmove, dragend)
- No custom event handlers needed for basic pan

## Common Pitfalls

### Pitfall 1: Zoom Not Centered on Pointer
**What goes wrong:** User zooms in and canvas zooms toward top-left corner instead of where mouse is pointing.
**Why it happens:** Applying scale without adjusting position - the mathematical transformation is incorrect.
**How to avoid:** Always calculate new position relative to pointer position: `newPos = pointer - (pointer - oldPos) * (newScale / oldScale)`
**Warning signs:** Zooming feels "off" or requires re-centering after each zoom.

### Pitfall 2: Excessive Yjs Sync Traffic
**What goes wrong:** Every wheel movement broadcasts to all connected users, causing lag.
**Why it happens:** No debouncing on viewport updates - each wheel tick sends a Yjs message.
**How to avoid:** Debounce viewport sync (100-200ms) or sync only on wheel end (debounce event).
**Warning signs:** Network tab shows hundreds of viewport messages per minute, UI becomes laggy.

### Pitfall 3: Pan Tool Gets Stuck
**What goes wrong:** Pan tool becomes permanently enabled, user can't draw.
**Why it happens:** `stage.draggable` is set to true but never reset to false.
**How to avoid:** Always toggle draggable in mouseup/mouseleave events, or use tool state to control.
**Warning signs:** Canvas keeps dragging when switching to other tools.

### Pitfall 4: Coordinate System Confusion
**What goes wrong:** Drawing coordinates are wrong after zooming/panning.
**Why it happens:** Mixing stage coordinates (scaled/transformed) with layer coordinates (raw).
**How to avoid:** Use `getPointerPosition()` which automatically accounts for stage scale/position, then transform to layer coordinates if needed.
**Warning signs:** New drawings appear offset from cursor position.

### Pitfall 5: Viewport Sync Conflict Loop
**What goes wrong:** Viewport thrashes between two users as they fight over control.
**Why it happens:** Both users update viewport, remote changes trigger local updates, creating infinite loop.
**How to avoid:** Track "last updated by" in viewport state, only apply remote changes if not from current user.
**Warning signs:** Viewport jumps back and forth rapidly when multiple users are present.

### Pitfall 6: Mobile Touch Events Not Handled
**What goes wrong:** Pinch-to-zoom and two-finger pan don't work on mobile/tablet.
**Why it happens:** Only mouse wheel events are handled, touch gesture events are ignored.
**How to avoid:** Implement touch event handlers (touchstart, touchmove, touchend) with gesture detection.
**Warning signs:** Zoom/pan works on desktop but not on mobile devices.

### Pitfall 7: Performance Degradation with Zoom
**What goes wrong:** Canvas becomes slow when zoomed in with many elements.
**Why it happens:** More elements visible in viewport = more rendering, but caching isn't updated for scale changes.
**How to avoid:** Call `stage.batchDraw()` for programmatic changes, implement layer culling for elements outside viewport.
**Warning signs:** Frame rate drops when zoomed in, CPU usage increases.

## Code Examples

Verified patterns from official sources:

### Pointer-Relative Zoom
```typescript
function handleWheel(event: any) {
  event.evt.preventDefault()

  const stage = stageRef.value?.getNode()
  if (!stage) return

  const oldScale = viewport.value.zoom
  const pointer = stage.getPointerPosition()

  const scaleBy = 1.1
  const newScale = event.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy

  // Clamp zoom
  const clampedScale = Math.min(Math.max(newScale, 0.1), 5)

  // Adjust position to zoom toward pointer
  if (pointer) {
    viewport.value.x = pointer.x - (pointer.x - viewport.value.x) * (clampedScale / oldScale)
    viewport.value.y = pointer.y - (pointer.y - viewport.value.y) * (clampedScale / oldScale)
  }

  viewport.value.zoom = clampedScale
  stage.scale({ x: clampedScale, y: clampedScale })
  stage.position({ x: viewport.value.x, y: viewport.value.y })
  stage.batchDraw()
}
// Source: https://konvajs.org/docs/sandbox/Zooming_Relative_To_Pointer.html
```

### Pan Tool Toggle
```typescript
// In component template or composable
function handleMouseDown(event: any) {
  if (props.currentTool === 'pan') {
    const stage = stageRef.value?.getNode()
    if (stage) {
      stage.draggable(true)
      isPanning.value = true
    }
    return
  }
  // ... other tool handling
}

function handleMouseUp() {
  if (isPanning.value) {
    const stage = stageRef.value?.getNode()
    if (stage) {
      stage.draggable(false)
      // Sync final position
      const pos = stage.position()
      viewport.value.x = pos.x
      viewport.value.y = pos.y
    }
    isPanning.value = false
  }
}
// Source: Konva.js draggable stage pattern
```

### Yjs Viewport Sync
```typescript
// In useCollaborativeCanvas.ts
const yMeta = ydoc.getMap<any>('meta')

// Get current viewport
function getViewport(): ViewportState {
  return yMeta.get('viewport') || { x: 0, y: 0, zoom: 1 }
}

// Update viewport (broadcast to others)
function setViewport(viewport: ViewportState) {
  ydoc.transact(() => {
    yMeta.set('viewport', {
      ...viewport,
      updatedBy: userId,
      timestamp: Date.now(),
    })
  }, userId)
}

// Listen for remote viewport changes
yMeta.observe((event) => {
  if (event.keysChanged.has('viewport')) {
    const remote = yMeta.get('viewport')
    const localUserId = userId // closure

    // Avoid feedback loop
    if (remote?.updatedBy !== localUserId) {
      // Apply remote viewport smoothly
      applyRemoteViewport(remote)
    }
  }
})
// Source: https://docs.yjs.dev/api/map
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSS transform for zoom | Konva stage.scale() | ~2017 | Native canvas coordinate handling |
| Custom pan event math | stage.draggable=true | ~2018 | Less code, built-in drag events |
| WebSocket per message type | Yjs shared Map | ~2020 | Single connection, structured data |
| No zoom sync | Shared viewport state | ~2021 | Collaborative navigation awareness |

**Deprecated/outdated:**
- `Konva.Layer.draggable()`: Old approach - use stage.draggable instead
- Manual position calculation on every mousemove: Use drag events with dragBoundFunc
- Per-tick viewport sync: Use debounced sync instead

## Open Questions

1. **Optional "Follow User" mode**
   - What we know: Users might want to optionally follow another user's viewport
   - What's unclear: Should this be in Phase 4 or later feature?
   - Recommendation: Store Phase 4 - implement basic sync. "Follow user" can be user preference in Phase 5 or later.

2. **Viewport persistence**
   - What we know: Viewport state should persist across page reloads
   - What's unclear: Should viewport persist per-session or globally for user?
   - Recommendation: Per-session persistence (store in CanvasState.viewport), global preference (auto-follow vs. independent).

3. **Zoom UI controls**
   - What we know: Success criteria only require mouse wheel zoom
   - What's unclear: Should we add +/- buttons and zoom slider?
   - Recommendation: Focus on mouse wheel first (NAVI-01). UI controls can be added if UX testing suggests need.

## Sources

### Primary (HIGH confidence)
- [Konva.js - Zooming Stage Relative to Pointer](https://konvajs.org/docs/sandbox/Zooming_Relative_To_Pointer.html) - Core zoom implementation pattern
- [Konva.js - Limited Drag And Resize](https://konvajs.org/docs/sandbox/Limited_Drag_And_Resize.html) - Boundary constraints
- [Konva.js - Multi-Touch Scale Stage](https://konvajs.org/docs/sandbox/Multi-touch_Scale_Stage.html) - Touch gesture support
- [Yjs Map Documentation](https://docs.yjs.dev/api/map) - Viewport state storage in Y.Map
- [Yjs Observe Pattern](https://docs.yjs.dev/api/map#mapobserveevent) - Handling remote changes

### Secondary (MEDIUM confidence)
- [Stack Overflow - Konva pan and zoom boundaries](https://stackoverflow.com/questions/79038738/konva-js-how-to-set-a-drag-limit-to-avoid-seeing-white-space) - Practical boundary solutions
- [VueUse useDebounceFn](https://vueuse.org/core/usedebouncefn/) - Debouncing for viewport sync

### Tertiary (LOW confidence - marked for validation)
- CSDN/Vuejin articles on Vue-Konva zoom implementation - Community examples, verify with official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All packages verified in project, Konva 9.3 provides all required features
- Architecture: HIGH - Official Konva docs and existing project patterns (composables) guide implementation
- Pitfalls: MEDIUM - Zoom math is well-documented, Yjs sync patterns are standard, but mobile touch needs validation

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (30 days - Konva and Yjs are stable with infrequent breaking changes)
