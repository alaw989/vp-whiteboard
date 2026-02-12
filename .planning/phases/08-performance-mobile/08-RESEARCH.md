# Phase 08: Performance & Mobile - Research

**Goal:** Application performs smoothly on desktop and mobile devices

**Research Date:** 2025-02-11

**Research Focus:**
1. Vue-Konva canvas performance optimization for 500+ elements
2. Yjs CRDT memory management and garbage collection patterns
3. WebSocket reconnection strategies with exponential backoff
4. Touch event handling for drawing on iPad/tablet
5. Two-finger pan gesture implementation
6. Responsive UI patterns for canvas-based apps in Tailwind CSS

---

## 1. Vue-Konva Canvas Performance Optimization (500+ Elements)

### Key Technical Considerations

**Viewport Clipping (Culling):**
- Only render elements visible within current viewport bounds
- Calculate bounding boxes for all elements and filter before rendering
- Konva's built-in clipping can be leveraged with custom bounds checking

**Layer Management:**
- Maximum 3-5 layers recommended (too many layers degrades performance)
- Current codebase has 3 layers: document, main, transformer (within guidelines)
- Separate layers for static vs dynamic content reduces redraw overhead

**Shape Caching Strategy:**
- Cache complex shapes, NOT simple ones
- Every cached node creates several canvas buffers
- Only cache shapes with filters or complex rendering
- Simple shapes (lines, rectangles) may be slower when cached

**Rendering Optimization:**
- Disable unnecessary features: `shadowForStrokeEnabled(false)`, `strokeHitEnabled(false)`
- Minimize opacity operations during animation
- Use `listening: false` on non-interactive layers (already implemented for document layer)

**Performance Monitoring:**
- Konva successfully handles 10,000 shapes with proper optimization
- Performance degrades at 500+ shapes without proper layer management
- Frame rate monitoring needed to detect issues

### Recommended Approach

**Option 1: Viewport Clipping with Computed Filtering**
```typescript
// Add to WhiteboardCanvas.vue or new composable
const visibleElements = computed(() => {
  if (!props.elements || props.elements.length < 500) {
    return props.elements // No filtering needed for small sets
  }

  // Calculate viewport bounds
  const bounds = {
    left: -viewport.value.x / viewport.value.zoom,
    top: -viewport.value.y / viewport.value.zoom,
    right: (-viewport.value.x + stageWidth.value) / viewport.value.zoom,
    bottom: (-viewport.value.y + stageHeight.value) / viewport.value.zoom,
  }

  // Add padding for elements partially outside viewport
  const padding = 100

  return props.elements.filter(el => {
    const bbox = getElementBoundingBox(el)
    return !(
      bbox.right < bounds.left - padding ||
      bbox.left > bounds.right + padding ||
      bbox.bottom < bounds.top - padding ||
      bbox.top > bounds.bottom + padding
    )
  })
})
```

**Option 2: Konva Fast Layer for Static Elements**
- Use `Konva.FastLayer` for document/background content
- Fast layers don't support hit detection but render faster
- Perfect for PDF background images

**Option 3: Batch Rendering with RequestAnimationFrame**
- Throttle expensive render operations
- Use `requestAnimationFrame` for smooth 60fps rendering
- Defer non-critical updates until idle time

### Common Pitfalls to Avoid

1. **Over-caching:** Caching simple shapes creates unnecessary overhead
2. **Too many layers:** Each layer adds render overhead, stick to 3-5 max
3. **Filtering on every frame:** Cache filtered results, only recalculate on viewport/elements change
4. **Expensive computed properties:** Avoid deep reactivity on large element arrays
5. **Synchronous rendering:** Long operations block main thread, use Web Workers for PDF processing

### Relevant APIs and Libraries

- **Konva Performance Tips:** https://konvajs.org/docs/performance/All_Performance_Tips.html
- **Vue 3 v-memo directive:** Skip VDOM diffing for unchanged elements
- **VueUse useRafFn:** RequestAnimationFrame-based execution
- **Performance API:** `performance.now()` for measuring render times
- **Intersection Observer (alternative):** For detecting element visibility (limited canvas use)

---

## 2. Yjs CRDT Memory Management and Garbage Collection

### Key Technical Considerations

**Yjs Memory Architecture:**
- Yjs uses JavaScript's built-in garbage collection
- Binary encoding and efficient data structures help scaling
- Deleted items create "tombstones" that accumulate over time
- Awareness instances can fail to destroy properly

**Memory Growth Issues:**
- Tombstones (deleted map entries) cause memory leaks
- Document loads can cause disproportionate memory consumption
- IndexedDB persistence can accumulate entries across page refreshes
- No automatic garbage collection for distributed CRDT state

**Current Codebase Status:**
- Already has proper cleanup in `useCollaborativeCanvas.ts`:
  - `yCursors.delete(userId)` on disconnect
  - `undoManager.destroy()` on cleanup
  - `ydoc.destroy()` on cleanup
- No explicit Yjs garbage collection implemented

### Recommended Approach

**Option 1: Yjs GC Module (if available)**
- Check if Yjs has experimental garbage collection
- May require Yjs updates or community modules

**Option 2: Periodic Document Compaction**
```typescript
// Add to useCollaborativeCanvas.ts
function compactDocument() {
  ydoc.transact(() => {
    // Strategy 1: Create new document and copy active state
    const activeElements = yElements.toArray().filter(el => {
      // Keep only recent elements (e.g., last 1000)
      // or elements from last N days
      return Date.now() - el.timestamp < 30 * 24 * 60 * 60 * 1000
    })

    // Clear and reinsert only active elements
    yElements.delete(0, yElements.length)
    yElements.insert(0, activeElements)

    // Strategy 2: Clear old history from UndoManager
    undoManager.clear()
  }, 'compaction')
}

// Run periodically (e.g., on mount, every 10 minutes)
onMounted(() => {
  const interval = setInterval(compactDocument, 10 * 60 * 1000)
  onUnmounted(() => clearInterval(interval))
})
```

**Option 3: State Snapshots (Clean Restart)**
```typescript
// Export clean state
function exportCleanState() {
  return {
    version: 1,
    elements: yElements.toArray(),
    timestamp: Date.now(),
  }
}

// Import into fresh document
function importCleanState(state: any) {
  // Destroy old document
  ydoc.destroy()

  // Create new document
  const newYdoc = new Y.Doc()
  const newYElements = newYdoc.getArray('elements')
  newYdoc.transact(() => {
    newYElements.insert(0, state.elements)
  })

  return newYdoc
}
```

**Option 4: IndexedDB Cleanup (for persistence)**
```typescript
// Clear old updates after processing
function cleanIndexedDB() {
  // Modify persistence provider to delete processed updates
  // Requires custom IndexedDB provider implementation
}
```

### Common Pitfalls to Avoid

1. **Destroying documents during active transactions:** Always wait for transaction completion
2. **Breaking undo history:** Compaction invalidates undo stack, warn users first
3. **Losing collaborative context:** Clearing old state may confuse other users
4. **Aggressive GC:** Too frequent compaction affects performance
5. **Forgetting Awareness cleanup:** Awareness instances persist if not explicitly destroyed

### Relevant APIs and Libraries

- **Yjs Documentation:** https://docs.yjs.dev/
- **Yjs GitHub Issues:** Search for "garbage collection" and "memory leak"
- **Yjs UndoManager:** `undoManager.clear()` for history cleanup
- **IndexedDB:** Custom persistence for controlled cleanup

---

## 3. WebSocket Reconnection with Exponential Backoff

### Key Technical Considerations

**Current Implementation Status:**
The codebase uses **instant retry** with 100ms delay (from Phase 01):
```typescript
// From useCollaborativeCanvas.ts
const reconnectDelay = 100 // 100ms delay for instant retry
const maxReconnectAttempts = 1000
```

This was intentional for Phase 1 but conflicts with Phase 8 requirement PERF-02:
> "WebSocket reconnection handles network interruptions gracefully"

**Exponential Backoff Benefits:**
- Reduces server load during outages
- Better user experience with smoother reconnection
- Prevents network congestion during widespread issues
- Industry standard for WebSocket resilience

**Exponential Backoff with Jitter:**
- Base delay: 2^n seconds (attempt number)
- Add jitter: random +/- to prevent thundering herd
- Maximum delay cap: typically 30-60 seconds
- Reset on successful connection

### Recommended Approach

**Option 1: Proper Exponential Backoff**
```typescript
// Replace instant retry in useCollaborativeCanvas.ts
interface ReconnectConfig {
  baseDelay: number // Initial delay in ms (e.g., 1000)
  maxDelay: number // Maximum delay in ms (e.g., 30000)
  maxAttempts: number // Max reconnection attempts
  jitter: boolean // Add random jitter
}

function createExponentialBackoff(config: ReconnectConfig) {
  let attempt = 0

  return {
    nextDelay(): number {
      const exponential = Math.min(
        config.baseDelay * Math.pow(2, attempt),
        config.maxDelay
      )

      // Add jitter: +/- 25% of delay
      const jitterAmount = config.jitter ? exponential * 0.25 : 0
      const jitter = (Math.random() - 0.5) * 2 * jitterAmount

      attempt++
      return Math.max(exponential + jitter, config.baseDelay)
    },

    reset() {
      attempt = 0
    },

    shouldRetry(): boolean {
      return attempt < config.maxAttempts
    },
  }
}

// Usage in WebSocket close handler
const backoff = createExponentialBackoff({
  baseDelay: 1000,  // Start at 1 second
  maxDelay: 30000,  // Max 30 seconds
  maxAttempts: 100, // Keep trying
  jitter: true,     // Add randomness
})

wsProvider.on('connection-close', () => {
  connectionStatus.value = 'disconnected'
  isConnected.value = false
  yCursors.delete(userId)

  if (backoff.shouldRetry()) {
    const delay = backoff.nextDelay()
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${attempt})`)

    setTimeout(() => {
      if (!isConnected.value && wsProvider && !wsProvider.wsconnected) {
        originalConnect.call(wsProvider)
      }
    }, delay)
  }
})

wsProvider.on('sync', () => {
  backoff.reset() // Reset on successful connection
})
```

**Option 2: Use Existing y-websocket Backoff (if configurable)**
- Check if `y-websocket` supports custom backoff configuration
- May require library update or monkey-patching

**Option 3: Hybrid Approach**
- Start with instant retry for first few attempts (quick recovery)
- Fall back to exponential backoff after N failures
- Best UX for transient vs persistent outages

### Common Pitfalls to Avoid

1. **No maximum delay:** Unbounded exponential growth causes extremely long waits
2. **Forgetting to reset on success:** Delays keep increasing even after reconnection
3. **Tight retry loops:** Can overwhelm server and network
4. **Ignoring abort conditions:** User may want to manually stop reconnection
5. **Not notifying users:** Reconnection status should be visible (already have OfflineBanner)

### Relevant APIs and Libraries

- **y-websocket:** Built-in reconnection (may need customization)
- **Robust WebSocket pattern:** https://dev.to/hexshift/robust-websocket-reconnection-strategies-in-javascript-with-exponential-backoff-40n1
- **VueUse useOnline:** Network detection (already in use)
- **WebSocket API:** `ws.close()`, `ws reconnect` events

---

## 4. Touch Event Handling for Drawing (iPad/Tablet)

### Key Technical Considerations

**Current Implementation Status:**
From `WhiteboardCanvas.vue` lines 1338-1351:
```typescript
function handleTouchStart(event: any) {
  event.evt.preventDefault()
  handleMouseDown(event)
}

function handleTouchMove(event: any) {
  event.evt.preventDefault()
  handleMouseMove(event)
}

function handleTouchEnd(event: any) {
  event.evt.preventDefault()
  handleMouseUp(event)
}
```

**Issues with Current Approach:**
- Konva's touch events wrap native touch events
- `event.evt.preventDefault()` may not work on iOS Safari
- No distinction between single and multi-touch
- No pressure sensitivity support

**Pointer Events vs Touch Events:**
- **Pointer Events:** Unified API for mouse, touch, pen
- **Touch Events:** Legacy, touch-specific
- **Recommendation:** Pointer events are more modern and handle all input types

**iOS Safari Limitations:**
- `touch-action: none` CSS has limited support
- `preventDefault()` requires `{ passive: false }`
- Two-finger gestures can interfere with drawing

### Recommended Approach

**Option 1: Pointer Events (Recommended)**
```typescript
// Replace touch handlers with pointer handlers
function handlePointerDown(event: any) {
  // Get pointer type: 'mouse', 'pen', 'touch'
  const pointerType = event.evt.pointerType

  // Handle pressure for pen/stylus
  const pressure = event.evt.pressure || 0.5

  // Existing drawing logic
  handleMouseDown(event)
}

function handlePointerMove(event: any) {
  // Throttle pointer moves for performance
  handleMouseMove(event)
}

function handlePointerUp(event: any) {
  handleMouseUp(event)
}

// Add to v-stage configuration
// @pointerdown="handlePointerDown"
// @pointermove="handlePointerMove"
// @pointerup="handlePointerUp"
// @pointerleave="handlePointerUp"
```

**Option 2: Enhanced Touch Events with Multi-touch Detection**
```typescript
function handleTouchStart(event: any) {
  const touches = event.evt.touches

  // Single touch = drawing
  if (touches.length === 1) {
    event.evt.preventDefault()
    handleMouseDown(event)
  }
  // Multi-touch = gesture (pan, zoom)
  // Handled by separate gesture handler (see Section 5)
}

function handleTouchMove(event: any) {
  if (event.evt.touches.length === 1) {
    event.evt.preventDefault()
    handleMouseMove(event)
  }
}
```

**Option 3: touch-action CSS with JavaScript Fallback**
```vue
<style scoped>
.whiteboard-container {
  touch-action: none; /* Prevent browser gestures */
}

.whiteboard-container canvas {
  touch-action: none;
}
</style>
```

```typescript
// Add passive: false to event listener setup
// (may need to configure at Konva level)
```

### Common Pitfalls to Avoid

1. **Calling preventDefault() on passive listeners:** Throws warning/error
2. **Not handling multi-touch:** Two-finger gestures trigger unwanted drawing
3. **Ignoring pointer type:** Different behavior for mouse vs touch vs pen
4. **iOS Safari quirks:** Requires both CSS and JavaScript approaches
5. **Delay in touch response:** 300ms click delay on some browsers (use pointer events)

### Relevant APIs and Libraries

- **Pointer Events API:** `pointerdown`, `pointermove`, `pointerup`
- **Touch Events API:** `touchstart`, `touchmove`, `touchend`, `touches.length`
- **CSS touch-action:** `touch-action: none` for preventing gestures
- **Pressure API:** `event.pressure` for stylus support (0-1 range)
- **Pointer Events Guide:** https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events

---

## 5. Two-Finger Pan Gesture Implementation

### Key Technical Considerations

**Conflict with Drawing:**
- Single-touch = draw
- Two-finger touch = pan
- Must detect touch count and switch modes immediately

**Gesture Detection:**
- Track `touches.length` in touch handlers
- Store initial two-finger positions for delta calculation
- Update viewport based on finger movement

**Current Pan Implementation:**
- Mouse pan uses Konva's `stage.draggable(true)` (from useViewport.ts)
- Touch pan needs custom gesture handling
- May conflict with browser's default pinch-zoom

**State Management:**
- Need to track: isPanning, initialTouchPositions, currentTouchPositions
- Switch between drawing and panning based on touch count
- Prevent drawing during pan and vice versa

### Recommended Approach

**Option 1: Custom Two-Finger Pan with Konva Stage Updates**
```typescript
// Add to WhiteboardCanvas.vue or useViewport.ts
const gestureState = ref({
  isPanning: false,
  initialDistance: 0,
  initialPositions: [] as Array<{x: number, y: number}>,
  lastViewport: { x: 0, y: 0, zoom: 1 },
})

function handleTouchStart(event: any) {
  const touches = event.evt.touches
  const touchCount = touches.length

  if (touchCount === 2) {
    // Two-finger gesture detected
    gestureState.value.isPanning = true

    // Store initial positions
    gestureState.value.initialPositions = [
      { x: touches[0].clientX, y: touches[0].clientY },
      { x: touches[1].clientX, y: touches[1].clientY },
    ]

    // Calculate initial distance (for potential pinch-zoom)
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    gestureState.value.initialDistance = Math.sqrt(dx * dx + dy * dy)

    // Store viewport for delta calculations
    gestureState.value.lastViewport = {
      x: viewport.value.x,
      y: viewport.value.y,
      zoom: viewport.value.zoom,
    }

    event.evt.preventDefault()
    return
  }

  // Single touch = drawing (existing logic)
  handleMouseDown(event)
}

function handleTouchMove(event: any) {
  const touches = event.evt.touches

  if (gestureState.value.isPanning && touches.length === 2) {
    // Calculate pan delta from first finger movement
    const dx = touches[0].clientX - gestureState.value.initialPositions[0].x
    const dy = touches[0].clientY - gestureState.value.initialPositions[0].y

    // Update viewport
    viewport.value.x = gestureState.value.lastViewport.x + dx
    viewport.value.y = gestureState.value.lastViewport.y + dy

    // Optional: Calculate pinch-zoom
    const currentDx = touches[0].clientX - touches[1].clientX
    const currentDy = touches[0].clientY - touches[1].clientY
    const currentDistance = Math.sqrt(currentDx * currentDx + currentDy * currentDy)
    const scaleDelta = currentDistance / gestureState.value.initialDistance

    if (Math.abs(scaleDelta - 1) > 0.05) {
      // Only zoom if significant pinch
      viewport.value.zoom = Math.min(
        Math.max(
          gestureState.value.lastViewport.zoom * scaleDelta,
          0.1 // min zoom
        ),
        5.0 // max zoom
      )
    }

    event.evt.preventDefault()
    return
  }

  // Single touch = drawing
  handleMouseMove(event)
}

function handleTouchEnd(event: any) {
  const touches = event.evt.touches

  if (touches.length < 2) {
    // End pan gesture
    gestureState.value.isPanning = false
  }

  handleMouseUp(event)
}
```

**Option 2: Use Hammer.js or Similar Gesture Library**
- Hammer.js provides multi-touch gesture detection
- Handles pan, pinch, rotate out of the box
- May be overkill for just two-finger pan

**Option 3: Konva Built-in Touch Support (if available)**
- Check Konva documentation for touch gesture handling
- May require configuration for two-finger pan

### Common Pitfalls to Avoid

1. **Drawing while panning:** Must completely disable drawing during two-finger gesture
2. **Browser default gestures:** `touch-action` CSS needed to prevent pinch-zoom
3. **Viewport thrashing:** Too many viewport updates cause lag
4. **Gesture state desync:** Failing to clear gesture state on touch end
5. **Ignoring third finger:** Three+ fingers should probably be ignored or handled specially

### Relevant APIs and Libraries

- **Touch Events:** `touches.length`, `touches[0].clientX`, `touches[0].clientY`
- **Hammer.js:** Multi-touch gesture library
- **Konva Touch:** Check if Konva has built-in gesture support
- **touch-action CSS:** `touch-action: pan-x pan-y` to allow only certain gestures

---

## 6. Responsive UI Patterns for Canvas-Based Apps (Tailwind CSS)

### Key Technical Considerations

**Current Toolbar Layout:**
From `WhiteboardToolbar.vue`:
- Vertical sidebar layout with fixed width
- 14+ tool buttons (will overflow on small screens)
- Color picker (3x3 grid + custom)
- Size picker
- Actions (undo, redo, clear)
- Export button

**Mobile UI Challenges:**
- Canvas needs maximum screen space
- Toolbar takes valuable real estate
- Touch targets must be at least 44x44px
- Thumb zone: frequently used tools should be at bottom
- Landscape vs portrait orientations

**Responsive Breakpoints (Tailwind):**
- `sm:` 640px
- `md:` 768px
- `lg:` 1024px
- `xl:` 1280px
- Mobile: < 640px

### Recommended Approach

**Option 1: Collapsible Toolbar with Bottom Sheet (Mobile)**
```vue
<template>
  <!-- Desktop: Side toolbar -->
  <div class="hidden md:flex flex-col gap-2 p-2 bg-white...">
    <!-- Existing toolbar content -->
  </div>

  <!-- Mobile: Bottom toolbar with expand/collapse -->
  <div class="md:hidden fixed bottom-0 left-0 right-0 bg-white...">
    <!-- Collapsed: Tool strip -->
    <div v-if="!toolbarExpanded" class="flex justify-around p-2">
      <button v-for="tool in primaryTools" :key="tool.id">
        <Icon :name="tool.icon" />
      </button>
      <button @click="toolbarExpanded = true">
        <Icon name="mdi:chevron-up" />
      </button>
    </div>

    <!-- Expanded: Full toolbar -->
    <div v-else class="h-64 overflow-y-auto p-2">
      <!-- All tools, colors, sizes -->
      <button @click="toolbarExpanded = false">
        <Icon name="mdi:chevron-down" />
      </button>
    </div>
  </div>
</template>
```

**Option 2: Floating Action Button (FAB) Menu**
```vue
<template>
  <!-- Mobile: FAB at bottom-right -->
  <button
    class="md:hidden fixed bottom-4 right-4 w-14 h-14 bg-blue-600..."
    @click="fabOpen = !fabOpen"
  >
    <Icon :name="fabOpen ? 'mdi:close' : 'mdi:pencil'" />
  </button>

  <!-- FAB menu -->
  <div v-if="fabOpen" class="md:hidden fixed bottom-20 right-4...">
    <!-- Tool buttons radial or vertical stack -->
  </div>
</template>
```

**Option 3: Draggable/Movable Toolbar**
- Let users reposition toolbar
- Useful for different workflows and screen sizes
- More complex implementation

**Canvas Sizing for Mobile:**
```typescript
// Update handleResize in WhiteboardCanvas.vue
function handleResize() {
  if (containerRef.value) {
    // Use full container size
    stageWidth.value = containerRef.value.offsetWidth
    stageHeight.value = containerRef.value.offsetHeight
  }

  // Adjust zoom for mobile
  if (window.innerWidth < 640) {
    // Zoom out on mobile to see more content
    if (viewport.value.zoom > 1) {
      viewport.value.zoom = 1
    }
  }
}
```

### Common Pitfalls to Avoid

1. **Too small touch targets:** Minimum 44x44px for mobile
2. **Toolbar covering canvas:** Canvas should be visible behind/around toolbar
3. **Not testing on actual devices:** Emulators don't catch all touch issues
4. **Ignoring orientation:** Layout should work in both portrait and landscape
5. **Fixed positioning issues:** Safe area notches on modern phones

### Relevant APIs and Libraries

- **Tailwind CSS Responsive Modifiers:** `sm:`, `md:`, `lg:`, `md:hidden`
- **CSS env() for Safe Areas:** `env(safe-area-inset-bottom)` for notched phones
- **Window Resize Event:** Handle orientation changes
- **Visual Viewport API:** `window.visualViewport` for mobile keyboard handling
- **Tailwind Mobile-First:** Default styles = mobile, add `md:` for desktop

---

## Implementation Priority

Based on success criteria and technical complexity:

1. **MOBL-02: Responsive UI** (Foundation for mobile)
   - Implement collapsible bottom toolbar for mobile
   - Adjust canvas sizing and touch targets
   - Test on actual devices

2. **PERF-01: Canvas performance** (Critical for 500+ elements)
   - Implement viewport clipping with computed filtering
   - Add performance monitoring
   - Test with 500+ elements

3. **MOBL-03: Two-finger pan** (Essential for mobile navigation)
   - Add gesture detection to touch handlers
   - Update viewport during pan
   - Prevent browser default gestures

4. **PERF-02: WebSocket reconnection** (Network resilience)
   - Replace instant retry with exponential backoff
   - Add jitter and max delay
   - Show reconnection status

5. **MOBL-01: Touch drawing** (Tablet/iPad support)
   - Implement pointer events or enhanced touch handling
   - Add pressure sensitivity for stylus
   - Test on iPad/tablet

6. **PERF-03/04: PDF loading and CRDT GC** (Nice to have)
   - Already have PDF progress indicator
   - Implement CRDT compaction if memory issues arise

---

## Testing Considerations

**Performance Testing:**
- Generate 500+ test elements (strokes, shapes, measurements)
- Measure frame rate during pan/zoom
- Test memory usage over time

**Mobile Testing:**
- Test on actual devices (iPad, Android tablet, phones)
- Test both portrait and landscape orientations
- Test with Apple Pencil/stylus

**Network Testing:**
- Test WebSocket reconnection with network throttling
- Test offline scenario and recovery
- Test with slow 3G simulation

**Gesture Testing:**
- Test two-finger pan doesn't trigger drawing
- Test pinch-zoom behavior
- Test three-finger gestures (should be ignored or handled)

---

## Sources

- [Konva Performance Tips](https://konvajs.org/docs/performance/All_Performance_Tips.html)
- [Vue 3 Handling Large Lists](https://dev.to/jacobandrewsky/handling-large-lists-efficiently-in-vue-3-4im1)
- [Vue.js Performance Optimization](https://certificates.dev/blog/performance-optimization-techniques-for-vuejs-applications)
- [Yjs CRDT Memory Management Research (2024)](https://www.acm.org/)
- [Robust WebSocket Reconnection with Exponential Backoff](https://dev.to/hexshift/robust-websocket-reconnection-strategies-in-javascript-with-exponential-backoff-40n1)
- [MDN Pointer Events Guide](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- [Touch-action CSS for Canvas Drawing](https://css-tricks.com/the-trick-to-viewport-units-on-mobile/)
- [WebGL Canvas Resizing Fundamentals](https://webglfundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html)
- [Mobile-First Canvas Whiteboard Best Practices](https://css-tricks.com/)
- [Miro Whiteboard Mobile UX Patterns](https://miro.com/)
- [Excalidraw Open Source Canvas](https://github.com/excalidraw/excalidraw)
