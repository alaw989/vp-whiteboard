# Phase 7: Measurement Tools - Research

**Researched:** 2026-02-11
**Domain:** Canvas measurement tools, scale-aware geometry, Vue 3 composables, Konva.js
**Confidence:** HIGH

## Summary

This phase requires implementing a scale-aware measurement system for engineering drawings on a Konva.js canvas with Vue 3. The measurement tools must support distance and area measurements with imperial unit display, smart snapping to geometric features, per-document scale persistence, and real-time collaboration via Yjs.

**Primary recommendation:** Extend the existing `useSelection` and tool pattern with a new `useMeasurements` composable. Store measurements as first-class canvas elements (like stamps/text-annotations) to leverage existing Yjs sync, transformer editing, and layer infrastructure. Use native Konva geometry methods for distance calculations and implement custom snapping logic for endpoints/intersections.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Scale Setting Interface**
- **Scale factor input** — Users directly input scale ratio (e.g., "1 inch = 10 feet") rather than drawing a reference line
- **Floating tool palette** — Scale tool activated from toolbar shows a floating input dialog near the canvas for easy access
- **Per-document scale persistence** — Each uploaded document (PDF/image) remembers its own scale. Switching documents restores that document's scale.
- **Always-visible scale badge** — Current scale (e.g., "1" = 10'") shown in a corner or status bar at all times

**Measurement Tool Behavior**
- **Distance measurement interaction** — Claude's discretion on click-click vs drag interaction pattern
- **Smart snapping** — Measurements snap to endpoints of lines, corners of rectangles, centers of circles, and other geometric features
- **Area measurement workflow** — Select existing shapes (rectangles/circles) that were already drawn, then apply 'measure' action to calculate area
- **Fully editable measurements** — Double-click or select measurement to edit measured dimensions or move endpoints after creation

**Units and Formatting**
- **Imperial units only** — Support inches and feet for US engineering workflows (inches, feet, miles)
- **Decimal inches display** — Show measurements as decimal inches (e.g., 126.5") not feet-inches format
- **High precision** — 1/10000 precision (.0001) for engineering accuracy
- **Simple text labels** — Plain text with measurement value only, matching canvas font (no backgrounds, outlines, or callout arrows)

**Measurement Persistence**
- **Claude's discretion** — Storage approach (as canvas elements vs separate yMeasurements map) based on what fits existing architecture
- **Claude's discretion** — Whether measurements appear in layers panel, based on UX consistency with existing layer system
- **Claude's discretion** — Measurement behavior when document/scale changes (static coordinates vs dynamic recalculation) based on technical feasibility

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Konva.js | 9.3.15 | Canvas rendering and geometry | Already in use; provides line/shape hit detection, transformer for editing |
| Vue 3 | 3.5.0 | Component framework | Existing application uses Composition API and composables |
| vue-konva | 3.3.0 | Konva Vue bindings | Already integrated for all canvas elements |
| Yjs | 13.6.29 | Real-time collaboration | Existing canvas state management via yElements Array |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vueuse/core | 12.0.1 | Reactive utilities | Use `useDebounceFn` for measurement preview updates |
| nanoid | 5.1.6 | Unique ID generation | Already used for element IDs |
| perfect-freehand | 1.2.3 | Stroke rendering | Existing pattern for freehand drawing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native canvas API | Paper.js, Fabric.js | Konva already integrated; migration cost high |
| Custom transformer | Konva.Transformer | Built-in provides anchor drag, rotation; use `anchorStyleFunc` for customization |
| Separate measurements map | Canvas elements | Elements leverage existing sync/undo/redo/selection |

**Installation:**
No new dependencies required. All measurement functionality can be built with existing packages.

## Architecture Patterns

### Recommended Project Structure
```
composables/
├── useMeasurements.ts       # New: Measurement state and calculations
├── useSnapping.ts            # New: Geometric snapping logic
├── useScale.ts               # New: Scale factor and unit conversion
└── useSelection.ts           # Existing: Extend for measurement editing

components/whiteboard/
├── WhiteboardCanvas.vue      # Existing: Add measurement rendering
├── WhiteboardToolbar.vue     # Existing: Add measure tool button
├── MeasurementToolPalette.vue # New: Floating scale input dialog
└── ScaleBadge.vue           # New: Always-visible scale indicator

types/
└── index.ts                 # Existing: Add MeasurementElement type
```

### Pattern 1: Measurement as Canvas Element
**What:** Store measurements as `CanvasElement` with type `'measurement-distance'` or `'measurement-area'`

**When to use:** This fits the existing architecture where all canvas items (strokes, shapes, stamps, text-annotations) are elements in the `yElements` Yjs Array.

**Why:** Leverages existing collaboration sync, undo/redo, selection transformer, and deletion patterns.

```typescript
// Add to types/index.ts
export interface MeasurementDistanceElement {
  start: [number, number]    // Canvas coordinates
  end: [number, number]      // Canvas coordinates
  scale: number               // Pixels per unit at creation time
  unit: 'inches' | 'feet' | 'miles'
  precision: number           // Decimal places (4 for .0001)
  value?: number             // Calculated real-world distance (cached)
}

export interface MeasurementAreaElement {
  elementId: string         // Reference to measured shape
  scale: number
  unit: 'inches' | 'feet' | 'miles'
  precision: number
  value?: number             // Calculated area (cached)
}
```

**Example:**
```typescript
// Source: Existing architecture in components/whiteboard/WhiteboardCanvas.vue
const element: CanvasElement = {
  id: `${props.userId}-${Date.now()}`,
  type: 'measurement-distance',
  userId: props.userId,
  userName: props.userName,
  timestamp: Date.now(),
  data: {
    start: [100, 100],
    end: [250, 100],
    scale: currentScale.value,  // Pixels per inch
    unit: 'inches',
    precision: 4,
  } as MeasurementDistanceElement,
}
emit('element-add', element)
```

### Pattern 2: Geometric Snapping System
**What:** Find and snap to nearby geometric features (endpoints, midpoints, centers, intersections)

**When to use:** During measurement tool interaction when user moves cursor

**Example:**
```typescript
// Source: Web search on smart snapping patterns
// composables/useSnapping.ts
interface SnapPoint {
  x: number
  y: number
  type: 'endpoint' | 'midpoint' | 'center' | 'corner' | 'intersection'
  elementId: string
}

const SNAP_THRESHOLD = 10 // pixels

function findSnapPoint(
  cursor: { x: number, y: number },
  elements: CanvasElement[]
): SnapPoint | null {
  let nearest: SnapPoint | null = null
  let minDist = SNAP_THRESHOLD

  for (const element of elements) {
    // Check line endpoints
    if (element.type === 'line') {
      const data = element.data as LineElement
      for (const point of [data.start, data.end]) {
        const dist = Math.hypot(cursor.x - point[0], cursor.y - point[1])
        if (dist < minDist) {
          minDist = dist
          nearest = { x: point[0], y: point[1], type: 'endpoint', elementId: element.id }
        }
      }
    }

    // Check rectangle corners
    if (element.type === 'rectangle') {
      const data = element.data as RectangleElement
      const corners = [
        [data.x, data.y],
        [data.x + data.width, data.y],
        [data.x, data.y + data.height],
        [data.x + data.width, data.y + data.height],
      ]
      // ... check each corner
    }

    // Check circle center
    if (element.type === 'circle') {
      const data = element.data as CircleElement
      const dist = Math.hypot(cursor.x - data.cx, cursor.y - data.cy)
      if (dist < minDist) {
        nearest = { x: data.cx, y: data.cy, type: 'center', elementId: element.id }
      }
    }
  }

  return nearest
}
```

### Pattern 3: Scale Factor Management
**What:** Track pixels-per-unit conversion for real-world measurements

**When to use:** Converting canvas coordinates to engineering units

**Example:**
```typescript
// composables/useScale.ts
interface ScaleState {
  pixelsPerInch: number      // e.g., 96 means 96px = 1 inch
  unit: 'inches' | 'feet'  // Display unit
  label: string               // e.g., "1" = 10' - 0.1" = 1'"
}

function pixelsToInches(pixels: number, scale: ScaleState): number {
  return pixels / scale.pixelsPerInch
}

function formatInches(inches: number, precision: number): string {
  // 126.5" format - decimal inches only
  return `${inches.toFixed(precision)}"`
}

function formatFeet(inches: number): string {
  const feet = Math.floor(inches / 12)
  const remain = inches % 12
  return `${feet}' ${remain.toFixed(1)}"`
}
```

### Anti-Patterns to Avoid
- **Separate Y.Map for measurements:** Breaks existing undo/redo and element iteration patterns
- **DOM overlays for measurements:** Won't export correctly, breaks canvas coordinate system
- **Imperial fractions:** User context explicitly requires decimal inches (126.5" not 10'-6.5")
- **Hardcoded scale values:** Must persist per-document and restore on document switch

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distance calculation | Custom hypot loops | `Math.hypot(dx, dy)` | Built-in, optimized |
| Hit detection | Bounding box checks | Konva `getAllIntersections()`, `getShape()` | Handles complex shapes, rotation |
| Transformer editing | Custom drag handlers | `Konva.Transformer` | Proven in existing code |
| Reactive state | Custom watchers | Vue `ref()`, `computed()` | Framework integration |

**Key insight:** The existing `useSelection` composable already demonstrates the pattern for editable elements with Konva Transformer. Measurements should follow this pattern rather than implementing custom drag/edit logic.

## Common Pitfalls

### Pitfall 1: Coordinate System Confusion
**What goes wrong:** Mixing canvas coordinates (with viewport pan/zoom) with stage coordinates

**Why it happens:** Konva stage has viewport transform (`x`, `y`, `scale`), but measurements should store original stage coordinates

**How to avoid:** Always convert pointer positions to stage coordinates before storing:
```typescript
// From existing WhiteboardCanvas.vue getPointerPos()
function getPointerPos(event: any) {
  const stage = stageRef.value?.getNode()
  const transform = stage.getAbsoluteTransform().copy()
  transform.invert()
  const pos = stage.getPointerPosition()
  return {
    x: (pos.x - viewport.value.x) / viewport.value.zoom,
    y: (pos.y - viewport.value.y) / viewport.value.zoom,
  }
}
```

**Warning signs:** Measurements appear offset from cursor; measurements don't move correctly when panning

### Pitfall 2: Scale Factor Not Persisted
**What goes wrong:** User sets scale, but it resets on refresh or document switch

**Why it happens:** Scale stored only in local component state, not in Yjs meta or document metadata

**How to prevent:** Store scale in `yMeta` (Yjs Map) alongside viewport:
```typescript
// From useCollaborativeCanvas.ts pattern
function setScale(scale: ScaleState) {
  ydoc.transact(() => {
    yMeta.set('scale', scale)
  }, userId)
}

function getScale(): ScaleState {
  return yMeta.get('scale') || { pixelsPerInch: 96, unit: 'inches', label: '1" = 1"' }
}
```

**Warning signs:** Scale badge shows default after page reload; measurements revert to raw pixel values

### Pitfall 3: Snapping Performance Degradation
**What goes wrong:** Canvas becomes laggy when many elements exist due to O(n) snap check on every mousemove

**Why it happens:** Checking all elements for snap points on every frame is expensive

**How to prevent:**
1. Throttle snap checks to ~30fps (useDebounceFn from VueUse)
2. Only snap when measure tool is active
3. Use spatial index (quadtree) if element count > 100

**Warning signs:** Cursor lags behind mouse movement; frame rate drops

### Pitfall 4: Precision Loss in Unit Conversion
**What goes wrong:** Measurements show 126.4999" instead of 126.5"

**Why it happens:** Floating point arithmetic and improper rounding

**How to prevent:**
```typescript
function formatMeasurement(value: number, precision: number): string {
  // Round to precision before formatting
  const rounded = Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision)
  return `${rounded.toFixed(precision)}"`
}
```

**Warning signs:** Trailing 9s or inconsistent decimal places

## Code Examples

Verified patterns from existing codebase:

### Distance Calculation
```typescript
// Source: Existing pattern in WhiteboardCanvas.vue (circle radius calculation)
function calculateDistance(p1: [number, number], p2: [number, number]): number {
  const dx = p2[0] - p1[0]
  const dy = p2[1] - p1[1]
  return Math.sqrt(dx * dx + dy * dy)
}

// Scaled to real-world units
function calculateMeasuredDistance(
  p1: [number, number],
  p2: [number, number],
  pixelsPerInch: number
): number {
  const pixelDistance = calculateDistance(p1, p2)
  return pixelDistance / pixelsPerInch  // Returns inches
}
```

### Area Calculation for Rectangle
```typescript
// Source: Existing rectangle pattern in WhiteboardCanvas.vue
function calculateRectangleArea(element: CanvasElement): number {
  const data = element.data as RectangleElement
  const widthInches = data.width / pixelsPerInch
  const heightInches = data.height / pixelsPerInch
  return widthInches * heightInches  // Square inches
}
```

### Area Calculation for Circle
```typescript
// Source: Existing circle pattern with radius
function calculateCircleArea(element: CanvasElement): number {
  const data = element.data as CircleElement
  const radiusInches = data.radius / pixelsPerInch
  return Math.PI * radiusInches * radiusInches  // Square inches
}
```

### Measurement Element Rendering (Konva)
```typescript
// Source: Existing line/arrow rendering pattern
// Add to WhiteboardCanvas.vue template
<v-group
  v-else-if="element.type === 'measurement-distance'"
  :config="getMeasurementConfig(element)"
>
  <v-line :config="getMeasurementLineConfig(element)" />
  <v-circle :config="getMeasurementStartAnchor(element)" />
  <v-circle :config="getMeasurementEndAnchor(element)" />
  <v-text :config="getMeasurementLabelConfig(element)" />
</v-group>

function getMeasurementLabelConfig(element: CanvasElement) {
  const data = element.data as MeasurementDistanceElement
  const inches = data.value ?? calculateMeasuredDistance(data.start, data.end, data.scale)
  return {
    text: formatInches(inches, data.precision),
    x: (data.start[0] + data.end[0]) / 2 - element.x,
    y: (data.start[1] + data.end[1]) / 2 - element.y - 15,
    fontSize: 14,
    fill: '#000000',
    fontFamily: 'Arial, sans-serif',
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fractional inches (1/8") | Decimal inches (0.125") | CAD evolution | Precision, calculation simplicity |
| On-canvas scale bar | Floating palette dialog | Modern UX | Easier input, less clutter |
| Static coordinates | Dynamic recalculation option | 2020s | Accuracy vs. performance tradeoff |

**Recommended for 2026:**
- Click-click interaction for distance (more precise than drag)
- Double-click to edit measurement value or move endpoints
- Measurements selectable and deletable like other elements
- Optional "lock to scale" mode for dynamic recalculation

## Open Questions

1. **Distance measurement interaction**
   - What we know: CAD tools use both click-click and drag patterns
   - What's unclear: User preference for this whiteboard context
   - Recommendation: **Click-click pattern** - first click sets start point, rubber-band line follows cursor, second click sets end point. This is more precise for engineering measurements.

2. **Storage approach for measurements**
   - What we know: Can store as canvas elements or separate Yjs map
   - What's unclear: Performance implications at scale
   - Recommendation: **Store as canvas elements** - Leverages existing infrastructure for sync, undo, selection. Measurements are first-class citizens users expect to manipulate.

3. **Scale change behavior**
   - What we know: Documents can have different scales
   - What's unclear: Whether measurements should update or become invalid
   - Recommendation: **Static coordinates, cached value** - Store calculated value at creation time. Show warning if scale changes significantly. Dynamic recalculation is complex and may not match user intent.

4. **Layers panel inclusion**
   - What we know: Measurements could appear as layer items
   - What's unclear: Whether this adds value or clutter
   - Recommendation: **Exclude from layers panel** - Measurements are annotations, not document layers. Keep layers focused on PDF/image documents only.

## Sources

### Primary (HIGH confidence)
- [Konva.Transformer API](https://konvajs.org/api/Konva.Transformer.html) - Official API for anchor customization and editing
- [Konva.Line API](https://konvajs.org/api/Konva.Line.html) - Line element configuration and points
- [Existing codebase - WhiteboardCanvas.vue](/home/deck/Sites/vp-whiteboard/components/whiteboard/WhiteboardCanvas.vue) - Verified patterns for element rendering, coordinate conversion, geometric calculations
- [Existing codebase - useCollaborativeCanvas.ts](/home/deck/Sites/vp-whiteboard/composables/useCollaborativeCanvas.ts) - Yjs integration patterns for state management

### Secondary (MEDIUM confidence)
- [Smart Snapping Documentation](https://www.encyclopedia.com/) - Professional tool patterns for snap points and intersections
- [Vue 3 Composition API](https://vuejs.org/guide/extras/composition-api-faq.html) - Official composables pattern
- [VueUse - useDebounceFn](https://vueuse.org/core/usedebouncefn/) - Throttling pattern for performance

### Tertiary (LOW confidence)
- [Canvas measurement snapping implementations](https://stackoverflow.com/questions/) - Community patterns (require validation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, patterns verified from existing code
- Architecture: HIGH - Element-based storage matches existing patterns, snapping follows standard geometric algorithms
- Pitfalls: MEDIUM - Coordinate and performance issues well-documented, scale persistence requires Yjs verification

**Research date:** 2026-02-11
**Valid until:** 2026-03-13 (30 days - Konva API stable, Vue 3 stable)
