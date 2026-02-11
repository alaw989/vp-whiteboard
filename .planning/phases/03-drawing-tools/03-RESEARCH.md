# Phase 3: Drawing Tools - Research

**Researched:** 2026-02-10
**Domain:** Konva.js drawing tools, vue-konva integration, Transformer selection, Yjs undo/redo
**Confidence:** HIGH

## Summary

This phase focuses on implementing comprehensive drawing and annotation tools for the whiteboard. The core technical challenges involve extending the existing Konva-based canvas with new shape types (arrows, text annotations, stamps), implementing element selection and transformation using Konva's Transformer, and integrating with the existing Yjs-based undo/redo system.

The research reveals that Konva 9.3.x provides robust built-in support for all required drawing operations. The `Konva.Transformer` class handles selection, resize, and rotation functionality out of the box. For arrow drawing, `Konva.Arrow` is a dedicated shape class. Text annotations can use `Konva.Text` combined with `Konva.Line` for leader lines. Stamps are essentially pre-configured text/shape combinations. The existing perfect-freehand library (already in package.json) provides pressure-sensitive smooth stroke rendering for pen and highlighter tools.

The existing codebase already has a solid foundation: `useDrawingTools.ts` composable handles tool settings, `WhiteboardCanvas.vue` has the Konva stage setup, and `useCollaborativeCanvas.ts` includes Yjs UndoManager integration. The main work involves extending the types, adding new element renderers, implementing the Transformer for selection, and wiring up keyboard shortcuts.

**Primary recommendation:** Use native Konva shape classes (Arrow, Text, Star for stamps) with vue-konva components, implement Konva.Transformer for element selection/manipulation, extend the existing Yjs UndoManager for undo/redo, and create a composable for managing selection state.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `konva` | 9.3.15 (existing) | Canvas rendering, shapes, Transformer | Already in project, provides all drawing primitives |
| `vue-konva` | 3.3.0 (existing) | Vue bindings for Konva | Already in project, declarative component API |
| `perfect-freehand` | 1.2.3 (existing) | Smooth stroke rendering with pressure | Already in project, ideal for pen/highlighter |
| `yjs` | 13.6.29 (existing) | CRDT for collaborative state | Already in project, includes UndoManager |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | - | - | Existing packages cover all needs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Konva.Transformer | Custom selection handles | Konva handles all edge cases (rotation, aspect ratio, anchor positioning) |
| perfect-freehand | Konva.Line with tension | perfect-freehand provides variable width based on pressure |
| Yjs UndoManager | Custom undo stack | Yjs integrates with CRDT, handles collaborative undo correctly |

**Installation:**
```bash
# No new packages needed - all required dependencies already installed
npm ls konva vue-konva perfect-freehand yjs  # Verify existing versions
```

## Architecture Patterns

### Recommended Project Structure
```
composables/
├── useDrawingTools.ts       # (existing - extend for new tools)
├── useSelection.ts          # NEW: manage selected element(s), Transformer state
├── useKeyboardShortcuts.ts  # NEW: global keyboard handler for undo/redo
└── useCollaborativeCanvas.ts # (existing - has undoManager, use it)

components/whiteboard/
├── WhiteboardCanvas.vue     # (modify: add Transformer, new element types)
├── WhiteboardToolbar.vue    # (existing - has tools, extend for stamps)
└── DrawingProperties.vue    # NEW: color picker, stroke size (or extend toolbar)

types/
└── index.ts                 # (extend: ArrowElement, StampElement, TextAnnotationElement)
```

### Pattern 1: Konva.Transformer for Selection
**What:** Use Konva's built-in Transformer class to enable selection, resize, and rotation of drawn elements.
**When to use:** For all drawable elements when the user selects the "select" tool.
**Example:**
```typescript
// composables/useSelection.ts
import { ref, watch } from 'vue'

export function useSelection(stageRef: Ref<any>) {
  const selectedId = ref<string | null>(null)
  const transformerRef = ref<any>(null)

  function selectElement(id: string, node: any) {
    selectedId.value = id

    const transformer = transformerRef.value?.getNode()
    const stage = stageRef.value?.getNode()

    if (transformer && stage) {
      // Attach transformer to the selected node
      transformer.nodes([node])

      // Move transformer to top layer
      transformer.moveToTop()
    }
  }

  function deselect() {
    selectedId.value = null
    const transformer = transformerRef.value?.getNode()
    if (transformer) {
      transformer.nodes([])
    }
  }

  function deleteSelected() {
    if (selectedId.value) {
      // Emit delete event for the element
      const id = selectedId.value
      deselect()
      return id
    }
  }

  return {
    selectedId,
    transformerRef,
    selectElement,
    deselect,
    deleteSelected,
  }
}
// Source: https://konvajs.org/docs/select_and_transform/Basic_demo.html
```

### Pattern 2: Vue-Konva Transformer Integration
**What:** Add Transformer to the Konva stage and conditionally attach it to selected nodes.
**When to use:** In the main WhiteboardCanvas.vue template.
**Example:**
```vue
<template>
  <v-stage ref="stageRef" :config="stageConfig">
    <!-- Document Layer (existing) -->
    <v-layer ref="documentLayerRef" :config="{ listening: false }">
      <!-- ... -->
    </v-layer>

    <!-- Main Layer with elements -->
    <v-layer ref="layerRef">
      <!-- Render all elements with click handlers -->
      <template v-for="element in elements" :key="element.id">
        <!-- Existing stroke/line/rect/circle/image/text elements -->
        <!-- Add @click to handle selection -->

        <!-- NEW: Arrow elements -->
        <v-arrow
          v-if="element.type === 'arrow'"
          :config="getArrowConfig(element)"
          @click="handleElementClick(element)"
        />

        <!-- NEW: Stamp elements (using Text + Group) -->
        <v-group
          v-if="element.type === 'stamp'"
          :config="getStampGroupConfig(element)"
          @click="handleElementClick(element)"
        >
          <v-rect :config="getStampRectConfig(element)" />
          <v-text :config="getStampTextConfig(element)" />
        </v-group>
      </template>
    </v-layer>

    <!-- Transformer for selection -->
    <v-layer ref="transformerLayerRef">
      <v-transformer
        ref="transformerRef"
        :config="{
          anchorSize: 10,
          anchorStroke: '#3B82F6',
          anchorFill: '#FFFFFF',
          borderStroke: '#3B82F6',
          borderDash: [4, 4],
        }"
      />
    </v-layer>
  </v-stage>
</template>

<script setup lang="ts">
const transformerRef = ref<any>(null)

function handleElementClick(element: CanvasElement, evt: any) {
  if (currentTool.value === 'select') {
    const node = evt.target
    selectElement(element.id, node)
    evt.cancelBubble = true
  }
}
</script>
// Source: https://konvajs.org/docs/vue/Transformer.html
```

### Pattern 3: Arrow Drawing with Preview
**What:** Draw arrows by dragging from start point to end point, showing live preview during drag.
**When to use:** When user selects the arrow tool.
**Example:**
```typescript
// State for arrow drawing
const arrowStart = ref<{x: number, y: number} | null>(null)
const currentArrowEnd = ref<{x: number, y: number} | null>(null)

function handleMouseDown(pos: {x: number, y: number}) {
  if (currentTool.value === 'arrow') {
    arrowStart.value = pos
    currentArrowEnd.value = pos
  }
}

function handleMouseMove(pos: {x: number, y: number}) {
  if (currentTool.value === 'arrow' && arrowStart.value) {
    currentArrowEnd.value = pos
  }
}

function handleMouseUp() {
  if (currentTool.value === 'arrow' && arrowStart.value && currentArrowEnd.value) {
    const start = arrowStart.value
    const end = currentArrowEnd.value

    // Create arrow element
    const element: CanvasElement = {
      id: `${userId}-${Date.now()}`,
      type: 'arrow',
      userId,
      userName,
      timestamp: Date.now(),
      data: {
        points: [start.x, start.y, end.x, end.y],
        pointerLength: 10,
        pointerWidth: 10,
        stroke: currentColor.value,
        strokeWidth: currentSize.value,
        fill: currentColor.value,
      } as ArrowElement,
    }

    emit('element-add', element)
    arrowStart.value = null
    currentArrowEnd.value = null
  }
}
// Source: https://konvajs.org/docs/shapes/Arrow.html
```

### Pattern 4: Text Annotation with Leader Line
**What:** Combine a `Konva.Text` element with a `Konva.Line` element in a `Konva.Group` for annotations with leader lines.
**When to use:** When user places text annotations with lines pointing to document elements.
**Example:**
```typescript
// Text annotation element structure
interface TextAnnotationElement {
  text: string
  x: number          // Text position
  y: number
  fontSize: number
  color: string
  leaderLine: {
    start: [number, number]  // Point on document
    end: [number, number]    // Connection to text
  }
}

// Render as group
<v-group :config="{ x: element.data.x, y: element.data.y }">
  <v-line
    :config="{
      points: [
        element.data.leaderLine.start[0] - element.data.x,
        element.data.leaderLine.start[1] - element.data.y,
        element.data.leaderLine.end[0] - element.data.x,
        element.data.leaderLine.end[1] - element.data.y,
      ],
      stroke: element.data.color,
      strokeWidth: 2,
    }"
  />
  <v-text
    :config="{
      text: element.data.text,
      fontSize: element.data.fontSize,
      fill: element.data.color,
      x: element.data.leaderLine.end[0] - element.data.x,
      y: element.data.leaderLine.end[1] - element.data.y,
    }"
  />
</v-group>
// Source: https://konvajs.org/docs/vue/Label.html (alternative approach)
```

### Pattern 5: Stamp Tool as Pre-configured Groups
**What:** Stamps are pre-configured combinations of shapes and text.
**When to use:** When user selects a stamp from the toolbar and clicks on canvas.
**Example:**
```typescript
// Stamp configurations
const STAMPS = {
  APPROVED: {
    text: 'APPROVED',
    backgroundColor: '#10B981',
    textColor: '#FFFFFF',
    borderColor: '#059669',
    font: 'bold 24px Arial',
    padding: 8,
    borderRadius: 4,
  },
  REVISED: {
    text: 'REVISED',
    backgroundColor: '#F59E0B',
    textColor: '#FFFFFF',
    borderColor: '#D97706',
    font: 'bold 24px Arial',
    padding: 8,
    borderRadius: 4,
  },
  NOTE: {
    text: 'NOTE',
    backgroundColor: '#3B82F6',
    textColor: '#FFFFFF',
    borderColor: '#2563EB',
    font: 'bold 20px Arial',
    padding: 6,
    borderRadius: 4,
  },
  'FOR REVIEW': {
    text: 'FOR REVIEW',
    backgroundColor: '#EF4444',
    textColor: '#FFFFFF',
    borderColor: '#DC2626',
    font: 'bold 20px Arial',
    padding: 6,
    borderRadius: 4,
  },
} as const

function createStampElement(
  stampType: keyof typeof STAMPS,
  x: number,
  y: number
): CanvasElement {
  const config = STAMPS[stampType]
  const fontSize = parseInt(config.font)
  const textWidth = config.text.length * fontSize * 0.6  // Approximate

  return {
    id: `${userId}-${Date.now()}`,
    type: 'stamp',
    userId,
    userName,
    timestamp: Date.now(),
    data: {
      stampType,
      text: config.text,
      x,
      y,
      width: textWidth + config.padding * 2,
      height: fontSize + config.padding * 2,
      backgroundColor: config.backgroundColor,
      textColor: config.textColor,
      borderColor: config.borderColor,
      fontSize,
      padding: config.padding,
      borderRadius: config.borderRadius,
    } as StampElement,
  }
}
// Source: Konva.js Group + Rect + Text pattern
```

### Pattern 6: Keyboard Shortcuts for Undo/Redo
**What:** Global keyboard event listener that calls Yjs UndoManager methods.
**When to use:** Mounted in WhiteboardCanvas or main page component.
**Example:**
```typescript
// composables/useKeyboardShortcuts.ts
export function useKeyboardShortcuts(
  canUndo: Ref<boolean>,
  canRedo: Ref<boolean>,
  onUndo: () => void,
  onRedo: () => void,
  onDelete: () => void
) {
  function handleKeydown(event: KeyboardEvent) {
    // Ctrl+Z for undo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      event.preventDefault()
      if (canUndo.value) {
        onUndo()
      }
    }

    // Ctrl+Y or Ctrl+Shift+Z for redo
    if (
      ((event.ctrlKey || event.metaKey) && event.key === 'y') ||
      ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'z')
    ) {
      event.preventDefault()
      if (canRedo.value) {
        onRedo()
      }
    }

    // Delete/Backspace for selected element
    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Don't delete if user is typing in an input
      if (document.activeElement?.tagName !== 'INPUT' &&
          document.activeElement?.tagName !== 'TEXTAREA') {
        event.preventDefault()
        onDelete()
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })

  return { handleKeydown }
}
// Source: Standard JavaScript keyboard event handling
```

### Anti-Patterns to Avoid
- **Re-implementing selection handles:** Don't build custom resize/rotate handles - Konva.Transformer handles all edge cases
- **Storing transformer state in Yjs:** Don't sync the transformer itself - only sync the transformed element properties
- **Using CSS for tool cursors:** Don't use CSS cursor property - Konva has built-in cursor management per shape
- **Creating new Y.UndoManager instances:** Don't create multiple undo managers - use the existing one from useCollaborativeCanvas
- **Erasing by painting background color:** Don't implement eraser as "paint with background color" - use actual deletion or proper layer compositing

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Element selection handles | Custom resize/rotate implementation | Konva.Transformer | Handles all transform math, anchor positioning, aspect ratio, rotation |
| Undo/redo stack | Custom history array with push/pop | Y.UndoManager | Integrates with CRDT, handles collaborative undo conflicts |
| Smooth stroke rendering | Custom bezier curve smoothing | perfect-freehand | Pressure-sensitive, tested at scale (used in tldraw) |
| Arrow head calculation | Custom trigonometry for arrowheads | Konva.Arrow | Built-in pointerLength, pointerWidth, automatic angle calculation |
| Text measurement | Canvas context measureText | Konva.Text.getSize() | Handles multi-line, wrapping, font metrics |
| Hit detection | Custom point-in-shape math | Konva's built-in hit detection | Handles transformed shapes, groups, complex paths |

**Key insight:** Konva.Transformer alone saves hundreds of lines of complex code. It handles:
- 8 anchor points (corners + edges)
- Rotation handle
- Aspect ratio locking
- Minimum size constraints
- Visual feedback (anchors, borders)
- Transform events (transformstart, transform, transformend)
- Multiple selection
- Centered scaling
- Flipping

## Common Pitfalls

### Pitfall 1: Transformer Not Appearing
**What goes wrong:** Transformer is created but doesn't show up on canvas.
**Why it happens:** Transformer must be added to a layer AFTER the nodes it will transform, and nodes must be attached via `transformer.nodes([node])`.
**How to avoid:** Always add transformer to a dedicated layer on top of your content layer. Call `transformer.nodes([node])` after selecting.
**Warning signs:** No visible selection box when clicking elements.

### Pitfall 2: Dragging Instead of Drawing
**What goes wrong:** Clicking and dragging on a selectable element drags it instead of drawing.
**Why it happens:** Elements have `draggable: true` but the current tool is a drawing tool.
**How to avoid:** Set `draggable` property conditionally based on whether the current tool is 'select'.
**Warning signs:** Can't draw on canvas, elements move unexpectedly.

### Pitfall 3: Eraser Only Paints Over
**What goes wrong:** Eraser "erases" but the original drawing is still there, just covered.
**Why it happens:** Eraser is implemented as drawing with the background color instead of actual deletion.
**How to avoid:** Eraser should delete elements (remove from Yjs array) or use proper layer composition with globalCompositeOperation = 'destination-out'.
**Warning signs:** "Erased" marks reappear when canvas redraws, can't erase over non-background elements.

### Pitfall 4: Stroke Hit Detection Issues
**What goes wrong:** Thin lines and arrows are hard to click/select.
**Why it happens:** Konva's hit detection for lines follows the actual stroke width; thin strokes have small hit areas.
**How to avoid:** Set `strokeHitEnabled: true` (default) and consider setting a minimum hit stroke width or using invisible wider stroke for hit detection.
**Warning signs:** Users struggle to select thin lines and arrows.

### Pitfall 5: Undo/Redo Only Works Locally
**What goes wrong:** Undo works locally but doesn't sync with other users.
**Why it happens:** UndoManager is created with `trackedOrigins` that don't match the transaction origin.
**How to avoid:** The existing code has this set up correctly with `trackedOrigins: new Set([userId])`. Ensure all modifications use `ydoc.transact(() => {}, userId)`.
**Warning signs:** Undo reverts local changes but remote changes are not affected, causing state divergence.

### Pitfall 6: Performance with Many Elements
**What goes wrong:** Canvas becomes slow with hundreds of drawn elements.
**Why it happens:** Each element is re-rendered on every frame; no caching or batching.
**How to avoid:** Use Konva's `toDataURL()` for static elements, cache complex groups with `node.cache()`, or use layer clipping.
**Warning signs:** Frame rate drops below 30fps, input lag increases.

### Pitfall 7: Perfect-Freehand Not Rendering
**What goes wrong:** Freehand strokes don't appear or look wrong.
**Why it happens:** perfect-freehand returns outline points that need to be rendered as a filled shape (polygon), not a stroke.
**How to avoid:** Use `getStroke()` to get outline, then render as `v-line` or `v-polygon` with filled shape.
**Warning signs:** Strokes appear as single-pixel lines, variable width not working.

## Code Examples

Verified patterns from official sources:

### Konva Transformer with Vue
```vue
<script setup lang="ts">
import { ref } from 'vue'

const transformerRef = ref<any>(null)
const selectedShapeId = ref<string | null>(null)

const stageConfig = ref({
  width: 800,
  height: 600,
})

function handleStageClick(e: any) {
  // Clicked on empty stage - deselect
  if (e.target === e.target.getStage()) {
    selectedShapeId.value = null
    if (transformerRef.value) {
      const transformer = transformerRef.value.getNode()
      transformer.nodes([])
    }
  }
}

function handleRectClick(id: string, e: any) {
  selectedShapeId.value = id
  if (transformerRef.value) {
    const transformer = transformerRef.value.getNode()
    const node = e.target
    transformer.nodes([node])
  }
}
</script>

<template>
  <v-stage :config="stageConfig" @click="handleStageClick">
    <v-layer>
      <v-rect
        :config="{
          x: 100,
          y: 100,
          width: 100,
          height: 100,
          fill: 'red',
          draggable: true,
        }"
        @click="handleRectClick('rect1', $event)"
      />
    </v-layer>

    <v-layer>
      <v-transformer ref="transformerRef" />
    </v-layer>
  </v-stage>
</template>
// Source: https://konvajs.org/docs/vue/Transformer.html
```

### Arrow Shape Configuration
```typescript
function getArrowConfig(element: CanvasElement) {
  const data = element.data as ArrowElement
  return {
    points: data.points.flat(), // [x1, y1, x2, y2]
    pointerLength: data.pointerLength || 10,
    pointerWidth: data.pointerWidth || 10,
    stroke: data.stroke,
    strokeWidth: data.strokeWidth,
    fill: data.fill, // Arrow head color
    lineCap: 'round',
    lineJoin: 'round',
  }
}
// Source: https://konvajs.org/api/Konva.Arrow.html
```

### Perfect-Freehand + Konva Integration
```typescript
import { getStroke } from 'perfect-freehand'

function createFreehandStroke(
  points: [number, number, number][],
  color: string,
  size: number
): { outline: number[][]; bbox: {x: number, y: number, width: number, height: number} } {
  // Get the stroke outline points
  const outline = getStroke(points, {
    size,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  })

  // Calculate bounding box
  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of outline) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  return {
    outline,
    bbox: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    },
  }
}

// Render in Vue using v-line with the outline points
const strokePoints = computed(() => {
  if (!currentStroke.value) return []
  const { outline, bbox } = createFreehandStroke(
    currentStroke.value.points,
    currentStroke.value.color,
    currentStroke.value.size
  )
  return outline.flat() // [x1, y1, x2, y2, ...]
})
// Source: https://github.com/steveruizok/perfect-freehand
```

### Yjs UndoManager Integration
```typescript
// Existing implementation in useCollaborativeCanvas.ts
const undoManager = new Y.UndoManager([yElements], {
  trackedOrigins: new Set([userId]),
})

// Add element to canvas
function addElement(element: CanvasElement) {
  ydoc.transact(() => {
    yElements.push([element])
  }, userId)
}

// Undo function (expose to component)
function undo() {
  undoManager.undo()
}

// Redo function
function redo() {
  undoManager.redo()
}

// Check if undo/redo available
const canUndo = computed(() => undoManager.canUndo())
const canRedo = computed(() => undoManager.canRedo())
// Source: https://docs.yjs.dev/api/undo-manager
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom selection handles | Konva.Transformer | ~2019 | Less code, more features, better UX |
| Manual undo stack | Y.UndoManager | ~2020 | Collaborative undo, conflict resolution |
| Simple line strokes | perfect-freehand variable width | ~2021 | Natural drawing feel, pressure sensitivity |
| Per-element keyboard handlers | Global keyboard listener | Always | Centralized shortcut handling, cleaner code |

**Deprecated/outdated:**
- `Konva.Factory`: Old API for creating shapes, use vue-konva components instead
- Manual transform calculations: Use Transformer instead of implementing rotation/scale math
- Yjs `origin` property as number: Use `trackedOrigins: Set<string>` instead

## Open Questions

1. **Ellipse drawing vs. circle**
   - What we know: Konva has both Circle and Ellipse shapes
   - What's unclear: Should ellipse be a separate tool or modifier for circle tool (shift+drag for circle)?
   - Recommendation: Start with separate tools for simplicity; can consolidate later if UX testing suggests it.

2. **Eraser implementation approach**
   - What we know: Two approaches - delete entire elements vs. partial erasure
   - What's unclear: Which approach users expect for engineering markups
   - Recommendation: Phase 3 should implement element deletion (whole eraser). Partial erasure (pixel-level) can be added later if needed.

3. **Stamp text editing**
   - What we know: Stamps are pre-configured text
   - What's unclear: Should users be able to edit stamp text after placement?
   - Recommendation: Start with fixed stamp text (APPROVED, REVISED, NOTE, FOR REVIEW). Custom text annotation tool (DRAW-04) covers editable text.

4. **Leader line interaction**
   - What we know: Text annotations need leader lines pointing to document elements
   - What's unclear: UX for creating leader lines - drag from text to target, or click-to-place endpoints?
   - Recommendation: Two-step placement: click for text position, then drag/adjust leader line endpoint.

## Sources

### Primary (HIGH confidence)
- [Konva.js Official Documentation - Select and Transform](https://konvajs.org/docs/select_and_transform/Basic_demo.html) - Transformer usage
- [Konva.js Vue Transformer Documentation](https://konvajs.org/docs/vue/Transformer.html) - Vue-Konva integration
- [Konva.Arrow API Reference](https://konvajs.org/api/Konva.Arrow.html) - Arrow shape properties
- [perfect-freehand GitHub Repository](https://github.com/steveruizok/perfect-freehand) - Stroke rendering library
- [Yjs UndoManager Documentation](https://docs.yjs.dev/api/undo-manager) - Undo/redo with CRDT
- [Konva.js Performance Tips](https://konvajs.org/docs/performance/All_Performance_Tips.html) - Optimization patterns

### Secondary (MEDIUM confidence)
- [Building an SVG Editor with Konva.js - DEV Community (2025)](https://dev.to/lovestaco/building-an-svg-editor-with-konvajs-56fo) - Modern implementation patterns
- [Stack Overflow: Konva image selection and transformation](https://stackoverflow.com/questions/62574011/using-konva-how-can-i-select-and-transform-images) - Practical solutions
- [Stack Overflow: Vertical arrow with text annotation](https://stackoverflow.com/questions/75631452/how-do-i-create-a-vertical-arrow-with-text-annotation-with-dynamic-text-position) - Arrow + text patterns

### Tertiary (LOW confidence - marked for validation)
- CSDN/Juejin articles in Chinese about React + Konva editors - Community examples, verify with official docs
- Web search results on eraser implementation patterns - Confirm during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All packages already verified in project, official docs confirm capabilities
- Architecture: HIGH - Official Konva documentation and existing project patterns used
- Pitfalls: MEDIUM - Some sources are secondary (Stack Overflow, blogs); patterns need implementation verification

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (30 days - Konva and Yjs are stable with infrequent breaking changes)
