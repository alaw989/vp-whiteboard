<template>
  <div class="whiteboard-container" ref="containerRef">
    <!-- Stage (Konva container) -->
    <v-stage
      ref="stageRef"
      :config="stageConfig"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
      @wheel="handleWheel"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
      @click="handleStageClick"
    >
      <!-- Document Background Layer (non-interactive, rendered first) -->
      <v-layer ref="documentLayerRef" :config="{ listening: false }">
        <template v-for="layer in visibleLayers" :key="layer.id">
          <v-group :config="{
            x: layer.x,
            y: layer.y,
            scaleX: layer.scale,
            scaleY: layer.scale,
            opacity: layer.opacity,
          }">
            <v-image
              :config="{
                image: getLayerImage(layer.src),
                width: layer.width,
                height: layer.height,
                listening: false,
              }"
            />
          </v-group>
        </template>
      </v-layer>

      <!-- Main Layer (drawings, annotations) -->
      <v-layer ref="layerRef">
        <!-- Background -->
        <v-rect
          :config="{
            x: 0,
            y: 0,
            width: stageConfig.width,
            height: stageConfig.height,
            fill: '#f5f5f5',
          }"
        />

        <!-- Grid -->
        <v-group :config="{ x: viewport.x, y: viewport.y }">
          <!-- Render all elements -->
          <template v-for="element in elements" :key="element.id">
            <!-- Stroke elements (freehand drawing) - rendered as filled polygon -->
            <v-line
              v-if="element.type === 'stroke'"
              :config="{
                ...getStrokeConfig(element),
                closed: true,
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragend="handleDragEnd"
            />

            <!-- Line elements -->
            <v-line
              v-else-if="element.type === 'line'"
              :config="{
                ...getLineConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragend="handleDragEnd"
            />

            <!-- Arrow elements -->
            <v-arrow
              v-else-if="element.type === 'arrow'"
              :config="{
                ...getArrowConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragend="handleDragEnd"
            />

            <!-- Rectangle elements -->
            <v-rect
              v-else-if="element.type === 'rectangle'"
              :config="{
                ...getRectConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragend="handleDragEnd"
            />

            <!-- Circle elements -->
            <v-circle
              v-else-if="element.type === 'circle'"
              :config="{
                ...getCircleConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragend="handleDragEnd"
            />

            <!-- Ellipse elements -->
            <v-ellipse
              v-else-if="element.type === 'ellipse'"
              :config="{
                ...getEllipseConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragend="handleDragEnd"
            />

            <!-- Image elements -->
            <v-image
              v-else-if="element.type === 'image'"
              :config="{
                ...getImageConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragend="handleDragEnd"
            />

            <!-- Text elements -->
            <v-text
              v-else-if="element.type === 'text'"
              :config="{
                ...getTextConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragend="handleDragEnd"
            />

            <!-- Text annotation elements (text + leader line in group) -->
            <v-group
              v-else-if="element.type === 'text-annotation'"
              :config="{
                ...getTextAnnotationConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragend="handleDragEnd"
            >
              <v-line :config="getTextAnnotationLineConfig(element)" />
              <v-text :config="getTextAnnotationTextConfig(element)" />
            </v-group>

            <!-- Stamp elements (rect + text in group) -->
            <v-group
              v-else-if="element.type === 'stamp'"
              :config="{
                ...getStampGroupConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragend="handleDragEnd"
            >
              <v-rect :config="getStampRectConfig(element)" />
              <v-text :config="getStampTextConfig(element)" />
            </v-group>

            <!-- Distance measurement elements (line + anchors + label in group) -->
            <v-group
              v-else-if="element.type === 'measurement-distance'"
              :config="{
                ...getMeasurementGroupConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragend="handleDragEnd"
            >
              <v-line :config="getMeasurementLineConfig(element)" />
              <v-circle :config="getMeasurementStartAnchor(element)" />
              <v-circle :config="getMeasurementEndAnchor(element)" />
              <v-text :config="getMeasurementLabelConfig(element)" />
            </v-group>

            <!-- Area measurement elements (label positioned above shape) -->
            <v-group
              v-else-if="element.type === 'measurement-area'"
              :config="{
                id: element.id,
                x: getAreaLabelPosition(element).x,
                y: getAreaLabelPosition(element).y
              }"
              @click="handleElementClick(element, $event)"
              @dragend="handleDragEnd"
            >
              <v-text :config="getAreaLabelConfig(element)" />
            </v-group>
          </template>

          <!-- Current stroke being drawn -->
          <v-line
            v-if="currentStrokePoints.length > 0"
            :config="currentStrokeConfig"
          />

          <!-- Remote active strokes (in-progress drawings from other users) -->
          <v-line
            v-for="[strokeId, points] in Object.entries(activeStrokes || {})"
            :key="`active-${strokeId}`"
            :config="getActiveStrokeConfig(strokeId, points)"
          />

          <!-- Current arrow preview -->
          <v-arrow
            v-if="currentArrowPreview"
            :config="currentArrowPreview"
          />

          <!-- Current line preview -->
          <v-line
            v-if="currentLinePreview"
            :config="currentLinePreview"
          />

          <!-- Current shape preview -->
          <v-rect
            v-if="currentShapePreview?.type === 'rectangle'"
            :config="currentShapePreview.config"
          />
          <v-circle
            v-if="currentShapePreview?.type === 'circle'"
            :config="currentShapePreview.config"
          />
          <v-ellipse
            v-if="currentShapePreview?.type === 'ellipse'"
            :config="currentShapePreview.config"
          />

          <!-- Current leader line preview for text annotation -->
          <v-line
            v-if="currentLeaderLinePreview"
            :config="currentLeaderLinePreview"
          />

          <!-- Current measurement distance preview -->
          <template v-if="isMeasuring && previewLine">
            <v-line :config="previewLine" />
            <v-circle
              v-if="measurementStart"
              :config="{
                x: measurementStart[0],
                y: measurementStart[1],
                radius: 5,
                fill: '#3B82F6',
                stroke: '#FFFFFF',
                strokeWidth: 2,
              }"
            />
            <v-circle
              v-if="currentMeasurementEnd"
              :config="{
                x: currentMeasurementEnd[0],
                y: currentMeasurementEnd[1],
                radius: 5,
                fill: '#3B82F6',
                stroke: '#FFFFFF',
                strokeWidth: 2,
              }"
            />
            <v-text
              v-if="previewLine.label"
              :config="{
                text: previewLine.label,
                x: (measurementStart![0] + currentMeasurementEnd![0]) / 2,
                y: (measurementStart![1] + currentMeasurementEnd![1]) / 2 - 20,
                fontSize: 14,
                fill: '#3B82F6',
                fontFamily: 'Arial, sans-serif',
              }"
            />
          </template>

          <!-- Snap indicator circle -->
          <v-circle
            v-if="currentSnapPoint"
            :config="{
              x: currentSnapPoint.x,
              y: currentSnapPoint.y,
              radius: 8,
              fill: 'transparent',
              stroke: '#F59E0B',
              strokeWidth: 2,
              dash: [3, 3],
            }"
          />
        </v-group>
      </v-layer>

      <!-- Transformer Layer (on top for selection handles) -->
      <v-layer ref="transformerLayerRef" name="transformerLayer">
        <v-transformer
          ref="transformerRef"
          :config="{
            anchorSize: 10,
            anchorStroke: '#3B82F6',
            anchorFill: '#FFFFFF',
            anchorCornerRadius: 2,
            borderStroke: '#3B82F6',
            borderDash: [4, 4],
            rotateAnchorOffset: 20,
          }"
        />
      </v-layer>
    </v-stage>

    <!-- Text annotation input dialog -->
    <div
      v-if="showAnnotationInput"
      class="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
      @click.self="cancelAnnotation"
    >
      <div class="bg-white rounded-lg shadow-xl p-4 w-80">
        <h3 class="text-lg font-semibold mb-3">Add Annotation</h3>
        <textarea
          v-model="pendingAnnotationText"
          class="w-full border border-gray-300 rounded-md p-2 mb-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows="3"
          placeholder="Enter your annotation..."
          @keydown.enter.prevent="confirmAnnotation"
          @keydown.esc="cancelAnnotation"
        />
        <div class="flex justify-end gap-2">
          <button
            @click="cancelAnnotation"
            class="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            Cancel
          </button>
          <button
            @click="confirmAnnotation"
            class="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md"
          >
            Add
          </button>
        </div>
      </div>
    </div>

    <!-- Collaborative cursors -->
    <ClientOnly>
      <template v-for="[clientId, cursorState] in remoteCursors" :key="clientId">
        <WhiteboardCursorPointer
          v-if="cursorState?.cursor"
          :presence="{
            id: cursorState.user.id,
            name: cursorState.user.name,
            color: cursorState.user.color,
            cursor: cursorState.cursor,
            tool: cursorState.tool,
          }"
        />
      </template>
    </ClientOnly>

    <!-- Measurement edit input dialog -->
    <div
      v-if="showMeasurementEditDialog"
      class="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
      @click.self="cancelMeasurementEdit"
    >
      <div class="bg-white rounded-lg shadow-xl p-4 w-80">
        <h3 class="text-lg font-semibold mb-3">Edit Measurement</h3>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">Measurement Value</label>
          <input
            v-model="pendingMeasurementValue"
            type="number"
            step="0.0001"
            class="w-full border border-gray-300 rounded-md p-2 mb-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter measurement value..."
            @keydown.enter.prevent="confirmMeasurementEdit"
            @keydown.esc="cancelMeasurementEdit"
          />
        </div>
        <div class="flex justify-end gap-2">
          <button
            @click="cancelMeasurementEdit"
            class="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            Cancel
          </button>
          <button
            @click="confirmMeasurementEdit"
            class="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md"
          >
            Update
          </button>
        </div>
      </div>
    </div>

    <!-- PDF Loading Indicator -->
    <PDFLoadingIndicator
      :loading="pdfLoadingState.loading"
      :file-name="pdfFileName"
      :state="pdfLoadingState"
      :cancellable="pdfAbortController !== null"
      @cancel="cancelPDFLoad"
      @close="closeLoadingIndicator"
    />
  </div>
</template>

<script setup lang="ts">
import { getStroke } from 'perfect-freehand'
import type { CanvasElement, StrokeElement, LineElement, RectangleElement, CircleElement, EllipseElement, ImageElement, TextElement, TextAnnotationElement, ArrowElement, StampElement, MeasurementDistanceElement, MeasurementAreaElement, UserPresence, DocumentLayer } from '~/types'
import PDFLoadingIndicator from '~/components/whiteboard/PDFLoadingIndicator.vue'
import WhiteboardCursorPointer from '~/components/whiteboard/WhiteboardCursorPointer.vue'
import type { PDFLoadingState } from '~/types'
import { useSelection } from '~/composables/useSelection'
import { useViewport } from '~/composables/useViewport'
import { useCursors, type CursorState } from '~/composables/useCursors'
import { useMeasurements } from '~/composables/useMeasurements'
import { useSnapping } from '~/composables/useSnapping'

// Stamp configurations with styling
const STAMP_CONFIGS = {
  APPROVED: {
    text: 'APPROVED',
    backgroundColor: '#10B981',  // Green
    textColor: '#FFFFFF',
    borderColor: '#059669',
    fontSize: 24,
    padding: 12,
    borderRadius: 4,
  },
  REVISED: {
    text: 'REVISED',
    backgroundColor: '#F59E0B',  // Amber
    textColor: '#FFFFFF',
    borderColor: '#D97706',
    fontSize: 24,
    padding: 12,
    borderRadius: 4,
  },
  NOTE: {
    text: 'NOTE',
    backgroundColor: '#3B82F6',  // Blue
    textColor: '#FFFFFF',
    borderColor: '#2563EB',
    fontSize: 20,
    padding: 10,
    borderRadius: 4,
  },
  'FOR REVIEW': {
    text: 'FOR REVIEW',
    backgroundColor: '#EF4444',  // Red
    textColor: '#FFFFFF',
    borderColor: '#DC2626',
    fontSize: 20,
    padding: 10,
    borderRadius: 4,
  },
} as const

export type StampType = keyof typeof STAMP_CONFIGS

const props = defineProps<{
  whiteboardId: string
  userId: string
  userName: string
  elements: CanvasElement[]
  connectedUsers: Map<string, UserPresence>
  wsProvider: any  // WebSocket provider for Awareness API
  currentTool: string
  currentColor: string
  currentSize: number
  currentStampType?: StampType
  // Real-time stroke broadcasting props (optional - from useCollaborativeCanvas)
  activeStrokes?: Record<string, [number, number, number][]>
  startActiveStroke?: ((strokeId: string) => void) | null
  broadcastStrokePoint?: ((strokeId: string, point: [number, number, number]) => void) | null
  endActiveStroke?: ((strokeId: string, element: CanvasElement) => void) | null
  // Viewport sync props
  getViewport?: () => import('~/types').SharedViewportState
  syncViewport?: (viewport: import('~/types').ViewportState) => void
  observeViewport?: (callback: (viewport: import('~/types').SharedViewportState) => void) => () => void
}>()

const emit = defineEmits<{
  'element-add': [element: CanvasElement]
  'element-delete': [elementId: string]
  'element-update': [elementId: string, updates: Partial<CanvasElement>]
  'cursor-update': [x: number, y: number]
}>()

// Container ref
const containerRef = ref<HTMLDivElement | null>(null)
const stageRef = ref<any>(null)
const layerRef = ref<any>(null)
const documentLayerRef = ref<any>(null)
const transformerLayerRef = ref<any>(null)

// Document layer composable
const {
  visibleLayers,
  addImageLayer,
  addPDFLayer,
  updateLayer,
  removeLayer,
} = useDocumentLayer()

// Default scale: 96 pixels per inch (standard screen resolution)
const pixelsPerInch = ref(96)

// Measurement composable
const yElementsProxy = {
  push: (elements: CanvasElement[]) => {
    // Forward to emit for now - parent handles yElements
    elements.forEach(el => emit('element-add', el))
  },
  toArray: () => props.elements,
}

const {
  isMeasuring,
  measurementStart,
  currentMeasurementEnd,
  previewLine,
  startDistanceMeasurement,
  updateMeasurementPreview,
  completeDistanceMeasurement,
  cancelMeasurement,
  measureArea,
  getMeasurementLabel,
  isMeasurementStale,
  getStaleMeasurements,
  updateMeasurementEndpoint,
  updateMeasurementValue,
} = useMeasurements({
  yElements: yElementsProxy,
  userId: props.userId,
  userName: props.userName,
  pixelsPerInch,
})

// Snapping composable
const { findSnapPoint, clearSnapPoint } = useSnapping({ threshold: 10 })

// Selection composable
const {
  selectedId,
  hasSelection,
  transformerRef,
  selectElement,
  deselect,
  deleteSelected,
  selectElementAtPosition,
  handleStageClick,
} = useSelection(stageRef, computed(() => props.elements))

// Viewport composable
const {
  viewport,
  stageConfig: viewportStageConfig,
  handleWheel,
  isPanning,
  enablePan,
  disablePan,
  startPan,
  stopPan,
  setViewportDirect,
  applyRemoteViewport,
} = useViewport({
  stageRef,
  containerRef,
  minZoom: 0.1,
  maxZoom: 5.0,
  userId: props.userId,
  syncViewport: props.syncViewport,
  applyRemoteViewport: undefined, // We'll handle this via observer callback
})

// Cursor tracking composable with Awareness API
const {
  currentUser,
  remoteCursors,
  updateLocalCursor,
  cleanup: cleanupCursors,
} = useCursors(props.wsProvider, props.userId, props.userName)

// Stage configuration (merges viewport config with width/height)
const stageConfig = computed(() => ({
  width: stageWidth.value,
  height: stageHeight.value,
  ...viewportStageConfig.value,
}))

// Stage width/height (separate from viewport config)
const stageWidth = ref(2000)
const stageHeight = ref(1500)

// Layer image cache to prevent reloading - use plain Map (non-reactive)
// to avoid triggering re-renders when cache is updated
const layerImageCache = new Map<string, HTMLImageElement>()

function getLayerImage(src: string): HTMLImageElement | null {
  // Check cache first
  if (layerImageCache.has(src)) {
    const cached = layerImageCache.get(src)!
    // Only return if image is loaded or failed (complete)
    if (cached.complete) return cached
  }

  // Create and cache new image (this won't trigger re-render since Map is non-reactive)
  const img = new Image()
  img.src = src
  layerImageCache.set(src, img)
  return img
}

// Pre-load layer images when layers change to avoid render-time loading
watch(visibleLayers, (layers) => {
  for (const layer of layers) {
    if (layer.src && !layerImageCache.has(layer.src)) {
      const img = new Image()
      img.src = layer.src
      layerImageCache.set(layer.src, img)
    }
  }
}, { deep: true })

// Drawing state
const isDrawing = ref(false)

// Gesture state for two-finger pan
const gestureState = ref({
  isPanning: false,
  initialPositions: [] as Array<{x: number, y: number}>,
  lastViewport: { x: 0, y: 0, zoom: 1 },
})
const currentStrokePoints = ref<[number, number, number][]>([])
const currentStrokeId = ref<string | null>(null)

// Text annotation state
const textAnnotationStart = ref<{x: number, y: number} | null>(null)
const currentLeaderLineEnd = ref<{x: number, y: number} | null>(null)
const pendingAnnotationText = ref('')
const showAnnotationInput = ref(false)
const annotationInputPosition = ref<{x: number, y: number}>({ x: 0, y: 0 })

// Arrow and line drawing state
const arrowStart = ref<{x: number, y: number} | null>(null)
const currentArrowEnd = ref<{x: number, y: number} | null>(null)
const lineStart = ref<{x: number, y: number} | null>(null)
const currentLineEnd = ref<{x: number, y: number} | null>(null)

// Shape drawing state
const shapeStart = ref<{x: number, y: number} | null>(null)
const currentShapeEnd = ref<{x: number, y: number} | null>(null)

// Measurement tool state
const currentSnapPoint = ref<{x: number, y: number} | null>(null)

// Measurement edit dialog state
const showMeasurementEditDialog = ref(false)
const editingMeasurementElement = ref<CanvasElement | null>(null)
const pendingMeasurementValue = ref('')

// PDF loading state
const pdfLoadingState = ref<PDFLoadingState>({
  loading: false,
  loaded: 0,
  total: 100,
  percent: 0,
})
const pdfFileName = ref<string>('')
const pdfAbortController = ref<AbortController | null>(null)

// Viewport observer cleanup function
let cleanupViewportObserver: (() => void) | null = null

// Initialize stage size
onMounted(() => {
  if (containerRef.value) {
    stageWidth.value = containerRef.value.offsetWidth || 2000
    stageHeight.value = containerRef.value.offsetHeight || 1500
  }

  // Handle window resize
  window.addEventListener('resize', handleResize)

  // Add keyboard shortcuts for selection
  window.addEventListener('keydown', handleKeyDown)

  // Set up viewport sync if functions provided
  if (props.observeViewport && props.getViewport) {
    // Load initial viewport from shared state
    const initialViewport = props.getViewport()
    if (initialViewport.lastUpdatedBy && initialViewport.lastUpdatedBy !== props.userId) {
      // Apply remote viewport if it exists and is from another user
      if (applyRemoteViewport) {
        applyRemoteViewport({
          x: initialViewport.x,
          y: initialViewport.y,
          zoom: initialViewport.zoom,
        })
      }
    }

    // Set up observer for remote viewport changes
    cleanupViewportObserver = props.observeViewport((remoteViewport) => {
      // Apply remote viewport change
      if (applyRemoteViewport) {
        applyRemoteViewport({
          x: remoteViewport.x,
          y: remoteViewport.y,
          zoom: remoteViewport.zoom,
        })
      }
    })
  }
})

onUnmounted(() => {
  layerImageCache.clear()
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleKeyDown)

  // Clean up viewport observer
  if (cleanupViewportObserver) {
    cleanupViewportObserver()
    cleanupViewportObserver = null
  }

  // Clean up cursor tracking via Awareness
  cleanupCursors()
})

function handleResize() {
  if (containerRef.value) {
    stageWidth.value = containerRef.value.offsetWidth || 2000
    stageHeight.value = containerRef.value.offsetHeight || 1500
  }
}

/**
 * Handle keyboard shortcuts for selection and tools
 */
function handleKeyDown(event: KeyboardEvent) {
  // Don't trigger shortcuts if typing in input/textarea
  if (document.activeElement?.tagName === 'INPUT' ||
      document.activeElement?.tagName === 'TEXTAREA' ||
      document.activeElement?.getAttribute('contenteditable') === 'true') {
    return
  }

  // Delete/Backspace - remove selected element
  if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection.value) {
    // Don't delete if user is typing in an input
    if (document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.getAttribute('contenteditable') !== 'true') {
      event.preventDefault()
      const id = deleteSelected()
      if (id) {
        emit('element-delete', id)

        // Also clean up any area measurements linked to this element
        const areaMeasurementIds = findAreaMeasurementsFor(id)
        areaMeasurementIds.forEach(areaId => emit('element-delete', areaId))
      }
    }
  }

  // Escape - deselect
  if (event.key === 'Escape' && hasSelection.value) {
    event.preventDefault()
    deselect()
  }
}

// Get stage position from mouse/touch event
function getPointerPos(event: any) {
  const stage = stageRef.value?.getNode()
  if (!stage) return { x: 0, y: 0 }

  const transform = stage.getAbsoluteTransform().copy()
  transform.invert()

  const pos = stage.getPointerPosition()
  if (!pos) return { x: 0, y: 0 }

  return {
    x: (pos.x - viewport.value.x) / viewport.value.zoom,
    y: (pos.y - viewport.value.y) / viewport.value.zoom,
  }
}

/**
 * Erase element at the given position
 * Uses hit detection to find and remove elements
 */
function eraseElementAt(x: number, y: number) {
  const stage = stageRef.value?.getNode()
  if (!stage) return

  // Get all shapes at the clicked position
  const shapes = stage.getAllIntersections({ x, y })

  // Filter out document layer and background
  const canvasShapes = shapes.filter(shape => {
    const parent = shape.getParent()
    const layer = parent?.getParent()
    return layer?.name !== 'documentLayer'
  })

  // Delete the first non-stroke element (shapes, images, text)
  // For strokes, we need more precise hit detection
  for (const shape of canvasShapes) {
    const elementId = shape.id()
    if (elementId && elementId.startsWith(props.userId)) {
      emit('element-delete', elementId)
      break
    }
  }
}

/**
 * Place a stamp at the given position
 * Stamps are placed centered on the click position
 */
function placeStamp(x: number, y: number, stampType: StampType) {
  const config = STAMP_CONFIGS[stampType]
  const fontSize = config.fontSize

  // Estimate text width (approximate based on character count)
  const textWidth = config.text.length * fontSize * 0.6
  const width = textWidth + config.padding * 2
  const height = fontSize + config.padding * 2

  const element: CanvasElement = {
    id: `${props.userId}-${Date.now()}`,
    type: 'stamp',
    userId: props.userId,
    userName: props.userName,
    timestamp: Date.now(),
    data: {
      stampType,
      text: config.text,
      x: x - width / 2,  // Center on click
      y: y - height / 2,
      width,
      height,
      backgroundColor: config.backgroundColor,
      textColor: config.textColor,
      borderColor: config.borderColor,
      fontSize,
      padding: config.padding,
      borderRadius: config.borderRadius,
    } as StampElement,
  }

  emit('element-add', element)
}

// Mouse handlers
function handleMouseDown(event: any) {
  if (props.currentTool === 'pan') {
    enablePan()
    return
  }

  // Select tool - handle element selection
  if (props.currentTool === 'select') {
    const pos = getPointerPos(event)
    selectElementAtPosition(pos.x, pos.y)
    return
  }

  // Drawing tools
  const pos = getPointerPos(event)

  // Stamp tool - place stamp immediately on click
  if (props.currentTool === 'stamp' && props.currentStampType) {
    placeStamp(pos.x, pos.y, props.currentStampType)
    return
  }

  // Measure distance tool - click-click interaction
  if (props.currentTool === 'measure-distance') {
    if (!isMeasuring.value) {
      // First click - start measurement
      const snap = findSnapPoint(pos, props.elements)
      const startPoint: [number, number] = snap ? [snap.x, snap.y] : [pos.x, pos.y]
      startDistanceMeasurement(startPoint)
    } else {
      // Second click - complete measurement
      const snap = findSnapPoint(pos, props.elements)
      const endPoint: [number, number] = snap ? [snap.x, snap.y] : [pos.x, pos.y]
      completeDistanceMeasurement(endPoint, props.currentColor)
    }
    return
  }

  isDrawing.value = true

  // Arrow tool - start drawing arrow
  if (props.currentTool === 'arrow') {
    arrowStart.value = pos
    currentArrowEnd.value = pos
    return
  }

  // Line tool - start drawing line
  if (props.currentTool === 'line') {
    lineStart.value = pos
    currentLineEnd.value = pos
    return
  }

  // Measure area tool - select shape to measure
  if (props.currentTool === 'measure-area') {
    // Find the shape at clicked position
    const stage = stageRef.value?.getNode()
    if (stage) {
      const allShapes = stage.getAllIntersections({ x: pos.x, y: pos.y })
      const canvasShapes = allShapes.filter((shape: any) => {
        const parent = shape.getParent()
        const layer = parent?.getParent()
        return layer?.name !== 'documentLayer'
      })

      if (canvasShapes.length > 0) {
        const shape = canvasShapes[0]
        const elementId = shape.id() || shape.getParent()?.id()

        if (elementId) {
          // Find element and create area measurement
          const targetElement = props.elements.find(el => el.id === elementId)
          if (targetElement && (targetElement.type === 'rectangle' || targetElement.type === 'circle' || targetElement.type === 'ellipse')) {
            measureArea(elementId, props.currentColor)
          }
        }
      }
    }
    return
  }

  // Shape tools - start drawing shape
  if (props.currentTool === 'rectangle' || props.currentTool === 'circle' || props.currentTool === 'ellipse') {
    shapeStart.value = pos
    currentShapeEnd.value = pos
    return
  }

  if (props.currentTool === 'pen' || props.currentTool === 'highlighter') {
    // Start stroke with pressure (default 0.5)
    currentStrokePoints.value = [[pos.x, pos.y, 0.5]]
  } else if (props.currentTool === 'eraser') {
    // Eraser starts immediately - check for elements to delete
    eraseElementAt(pos.x, pos.y)
  } else if (props.currentTool === 'text-annotation') {
    // Text annotation tool - click to place text, drag to set leader line
    textAnnotationStart.value = pos
    currentLeaderLineEnd.value = pos
  } else {
    // Other tools
    currentStrokePoints.value = [[pos.x, pos.y]]
  }
}

function handleMouseMove(event: any) {
  const pos = getPointerPos(event)

  // Update local cursor position via Awareness API
  updateLocalCursor(pos.x, pos.y, props.currentTool as any)

  // Also emit cursor update for parent (backward compatibility)
  emit('cursor-update', pos.x, pos.y)

  // Handle measurement tool snapping (even when not drawing)
  if (props.currentTool === 'measure-distance' && isMeasuring.value) {
    const snap = findSnapPoint(pos, props.elements)
    const updatePos: [number, number] = snap ? [snap.x, snap.y] : [pos.x, pos.y]
    updateMeasurementPreview(updatePos)
    currentSnapPoint.value = snap || null
    return
  }

  // Clear snap point for non-measurement tools
  if (props.currentTool !== 'measure-distance') {
    currentSnapPoint.value = null
  }

  if (!isDrawing.value) return

  // Update arrow preview
  if (props.currentTool === 'arrow' && arrowStart.value) {
    currentArrowEnd.value = pos
    return
  }

  // Update line preview
  if (props.currentTool === 'line' && lineStart.value) {
    currentLineEnd.value = pos
    return
  }

  // Update shape preview
  if ((props.currentTool === 'rectangle' || props.currentTool === 'circle' || props.currentTool === 'ellipse') && shapeStart.value) {
    currentShapeEnd.value = pos
    return
  }

  // Update text annotation leader line preview
  if (props.currentTool === 'text-annotation' && textAnnotationStart.value) {
    currentLeaderLineEnd.value = pos
    return
  }

  if (props.currentTool === 'pen' || props.currentTool === 'highlighter') {
    currentStrokePoints.value.push([pos.x, pos.y, 0.5])
  } else if (props.currentTool === 'eraser') {
    eraseElementAt(pos.x, pos.y)
  }
  // ... other tool handling
}

function handleMouseUp(event: any) {
  if (isPanning.value) {
    disablePan()
    return
  }

  if (!isDrawing.value) return

  // Complete arrow drawing
  if (props.currentTool === 'arrow' && arrowStart.value && currentArrowEnd.value) {
    const start = arrowStart.value
    const end = currentArrowEnd.value

    const element: CanvasElement = {
      id: `${props.userId}-${Date.now()}`,
      type: 'arrow',
      userId: props.userId,
      userName: props.userName,
      timestamp: Date.now(),
      data: {
        points: [[start.x, start.y], [end.x, end.y]],
        pointerLength: 10,
        pointerWidth: 10,
        stroke: props.currentColor,
        strokeWidth: props.currentSize,
        fill: props.currentColor,
      } as ArrowElement,
    }
    emit('element-add', element)

    arrowStart.value = null
    currentArrowEnd.value = null
    isDrawing.value = false
    return
  }

  // Complete line drawing
  if (props.currentTool === 'line' && lineStart.value && currentLineEnd.value) {
    const start = lineStart.value
    const end = currentLineEnd.value

    const element: CanvasElement = {
      id: `${props.userId}-${Date.now()}`,
      type: 'line',
      userId: props.userId,
      userName: props.userName,
      timestamp: Date.now(),
      data: {
        start: [start.x, start.y],
        end: [end.x, end.y],
        color: props.currentColor,
        size: props.currentSize,
      } as LineElement,
    }
    emit('element-add', element)

    lineStart.value = null
    currentLineEnd.value = null
    isDrawing.value = false
    return
  }

  // Complete rectangle drawing
  if (props.currentTool === 'rectangle' && shapeStart.value && currentShapeEnd.value) {
    const start = shapeStart.value
    const end = currentShapeEnd.value

    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)

    if (width > 5 && height > 5) {  // Minimum size to avoid accidental clicks
      const element: CanvasElement = {
        id: `${props.userId}-${Date.now()}`,
        type: 'rectangle',
        userId: props.userId,
        userName: props.userName,
        timestamp: Date.now(),
        data: {
          x,
          y,
          width,
          height,
          stroke: props.currentColor,
          strokeWidth: props.currentSize,
          fill: 'transparent',
        } as RectangleElement,
      }
      emit('element-add', element)
    }

    shapeStart.value = null
    currentShapeEnd.value = null
    isDrawing.value = false
    return
  }

  // Complete circle drawing
  if (props.currentTool === 'circle' && shapeStart.value && currentShapeEnd.value) {
    const start = shapeStart.value
    const end = currentShapeEnd.value

    const dx = end.x - start.x
    const dy = end.y - start.y
    const radius = Math.sqrt(dx * dx + dy * dy)

    if (radius > 5) {  // Minimum radius
      const element: CanvasElement = {
        id: `${props.userId}-${Date.now()}`,
        type: 'circle',
        userId: props.userId,
        userName: props.userName,
        timestamp: Date.now(),
        data: {
          cx: start.x,
          cy: start.y,
          radius,
          stroke: props.currentColor,
          strokeWidth: props.currentSize,
          fill: 'transparent',
        } as CircleElement,
      }
      emit('element-add', element)
    }

    shapeStart.value = null
    currentShapeEnd.value = null
    isDrawing.value = false
    return
  }

  // Complete ellipse drawing
  if (props.currentTool === 'ellipse' && shapeStart.value && currentShapeEnd.value) {
    const start = shapeStart.value
    const end = currentShapeEnd.value

    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)

    if (width > 5 && height > 5) {
      const element: CanvasElement = {
        id: `${props.userId}-${Date.now()}`,
        type: 'ellipse',
        userId: props.userId,
        userName: props.userName,
        timestamp: Date.now(),
        data: {
          x: x + width / 2,  // Konva ellipse uses center position
          y: y + height / 2,
          radiusX: width / 2,
          radiusY: height / 2,
          rotation: 0,
          stroke: props.currentColor,
          strokeWidth: props.currentSize,
          fill: 'transparent',
        } as EllipseElement,
      }
      emit('element-add', element)
    }

    shapeStart.value = null
    currentShapeEnd.value = null
    isDrawing.value = false
    return
  }

  // Complete text annotation - show input dialog
  if (props.currentTool === 'text-annotation' && textAnnotationStart.value && currentLeaderLineEnd.value) {
    const start = textAnnotationStart.value
    const end = currentLeaderLineEnd.value

    // Show input dialog at text position
    annotationInputPosition.value = { x: start.x, y: start.y }
    pendingAnnotationText.value = ''
    showAnnotationInput.value = true

    // Store leader line endpoint for when text is confirmed
    ;(window as any).__pendingLeaderLine = {
      start: [start.x, start.y],
      end: [end.x, end.y],
    }

    textAnnotationStart.value = null
    currentLeaderLineEnd.value = null
    isDrawing.value = false
    return
  }

  // Create pen or highlighter stroke element
  if ((props.currentTool === 'pen' || props.currentTool === 'highlighter') && currentStrokePoints.value.length > 1) {
    // Use perfect-freehand to render smooth stroke
    const outline = getStroke(currentStrokePoints.value, {
      size: props.currentSize,
      thinning: props.currentTool === 'highlighter' ? 0 : 0.5,
      smoothing: 0.5,
      streamline: 0.5,
    })

    // Convert to flat array for Konva
    const flatPoints = outline.flatMap(p => [p[0], p[1]])

    const element: CanvasElement = {
      id: `${props.userId}-${Date.now()}`,
      type: 'stroke',
      userId: props.userId,
      userName: props.userName,
      timestamp: Date.now(),
      data: {
        points: currentStrokePoints.value,
        color: props.currentColor,
        size: props.currentSize,
        tool: props.currentTool,
        smooth: true,
      } as StrokeElement,
    }

    // End active stroke and move to permanent elements
    if (currentStrokeId.value && props.endActiveStroke) {
      props.endActiveStroke(currentStrokeId.value, element)
    } else {
      // Fallback to regular emit if no active stroke broadcasting
      emit('element-add', element)
    }
  }

  isDrawing.value = false
  currentStrokePoints.value = []
  currentStrokeId.value = null
}

/**
 * Handle drag end for selected elements
 * Updates element position in Yjs after drag completes
 */
function handleDragEnd(event: any) {
  if (props.currentTool !== 'select' || !selectedId.value) return

  const node = event.target
  const element = props.elements.find(el => el.id === selectedId.value)
  if (!element) return

  // Get new position from the node
  const newPosition = node.position()
  const newScale = node.scale()
  const newRotation = node.rotation()

  // Build update based on element type
  const updates: Partial<CanvasElement> = {}

  // Handle different element types with different position properties
  if (element.type === 'rectangle' || element.type === 'ellipse' || element.type === 'text' || element.type === 'image') {
    // These use x, y
    const data = element.data as any
    updates.data = {
      ...data,
      x: newPosition.x,
      y: newPosition.y,
      scaleX: newScale.x,
      scaleY: newScale.y,
      rotation: newRotation,
    }
  } else if (element.type === 'circle') {
    // Circles use cx, cy
    const data = element.data as any
    updates.data = {
      ...data,
      cx: newPosition.x,
      cy: newPosition.y,
      scaleX: newScale.x,
      scaleY: newScale.y,
      rotation: newRotation,
    }
  } else if (element.type === 'stamp' || element.type === 'text-annotation') {
    // Groups use x, y
    const data = element.data as any
    updates.data = {
      ...data,
      x: newPosition.x,
      y: newPosition.y,
      scaleX: newScale.x,
      scaleY: newScale.y,
      rotation: newRotation,
    }
  } else if (element.type === 'stroke' || element.type === 'line' || element.type === 'arrow') {
    // Lines and arrows need point transformation
    const data = element.data as any
    updates.data = {
      ...data,
      scaleX: newScale.x,
      scaleY: newScale.y,
      rotation: newRotation,
    }
  } else if (element.type === 'measurement-distance') {
    // Measurements use x, y for group offset
    const data = element.data as any
    updates.data = {
      ...data,
      x: newPosition.x,
      y: newPosition.y,
      scaleX: newScale.x,
      scaleY: newScale.y,
      rotation: newRotation,
    }
  }

  emit('element-update', selectedId.value, updates)
}

// Touch handlers
function handleTouchStart(event: any) {
  const touches = event.evt.touches
  const touchCount = touches.length

  // Two-finger pan gesture
  if (touchCount === 2) {
    // Enter pan mode
    gestureState.value.isPanning = true
    gestureState.value.initialPositions = [
      { x: touches[0].clientX, y: touches[0].clientY },
      { x: touches[1].clientX, y: touches[1].clientY },
    ]
    gestureState.value.lastViewport = { x: viewport.value.x, y: viewport.value.y, zoom: viewport.value.zoom }
    event.evt.preventDefault()
    return
  }

  // Single touch - proceed to drawing
  if (touchCount === 1) {
    event.evt.preventDefault()
    handleMouseDown(event)
    return
  }
}

function handleTouchMove(event: any) {
  const touches = event.evt.touches
  const touchCount = touches.length

  // Handle two-finger pan
  if (gestureState.value.isPanning && touchCount === 2) {
    const currentPositions = [
      { x: touches[0].clientX, y: touches[0].clientY },
      { x: touches[1].clientX, y: touches[1].clientY },
    ]

    // Calculate delta from first finger movement
    const deltaX = currentPositions[0].x - gestureState.value.initialPositions[0].x
    const deltaY = currentPositions[0].y - gestureState.value.initialPositions[0].y

    // Update viewport directly (no sync during gesture)
    setViewportDirect({
      x: gestureState.value.lastViewport.x + deltaX,
      y: gestureState.value.lastViewport.y + deltaY,
    })

    event.evt.preventDefault()
    return
  }

  // Single touch - proceed to drawing
  if (touchCount === 1) {
    event.evt.preventDefault()
    handleMouseMove(event)
    return
  }
}

function handleTouchEnd(event: any) {
  const touches = event.evt.touches
  const touchCount = touches.length

  // Exit pan mode if less than 2 touches
  if (touchCount < 2) {
    if (gestureState.value.isPanning) {
      gestureState.value.isPanning = false
      gestureState.value.initialPositions = []
    }
  }

  // Always call handleMouseUp for proper cleanup
  event.evt.preventDefault()
  handleMouseUp(event)
}

// Element config helpers
function getStrokeConfig(element: CanvasElement) {
  const data = element.data as StrokeElement

  // Use perfect-freehand to render smooth stroke as filled polygon
  const outline = getStroke(data.points, {
    size: data.size,
    thinning: data.tool === 'highlighter' ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  })

  const flatPoints = outline.flatMap(p => [p[0], p[1]])

  return {
    points: flatPoints,
    stroke: data.color,
    strokeWidth: 1,  // Outline is filled, so stroke width doesn't matter
    fill: data.color,
    globalAlpha: data.tool === 'highlighter' ? 0.5 : 1,
    lineCap: 'round',
    lineJoin: 'round',
    closed: true,
  }
}

/**
 * Get config for rendering remote active stroke (preview state)
 * Uses lower opacity to indicate in-progress state
 */
function getActiveStrokeConfig(strokeId: string, points: [number, number, number][]) {
  // Extract userId from strokeId to get user color
  const userId = strokeId.split('-')[0]
  const userColor = getUserColor(userId)

  // Use perfect-freehand to render smooth stroke as filled polygon
  const outline = getStroke(points, {
    size: 4,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  })

  const flatPoints = outline.flatMap(p => [p[0], p[1]])

  return {
    points: flatPoints,
    stroke: userColor,
    strokeWidth: 1,
    fill: userColor,
    globalAlpha: 0.6,  // Lower opacity for preview state
    lineCap: 'round',
    lineJoin: 'round',
    closed: true,
  }
}

function getLineConfig(element: CanvasElement) {
  const data = element.data as LineElement
  return {
    points: [data.start[0], data.start[1], data.end[0], data.end[1]],
    stroke: data.color,
    strokeWidth: data.size,
    lineCap: 'round',
  }
}

function getArrowConfig(element: CanvasElement) {
  const data = element.data as ArrowElement
  // Flatten points array: [[x1, y1], [x2, y2]] -> [x1, y1, x2, y2]
  const points = data.points.flatMap(p => p)

  return {
    points,
    pointerLength: data.pointerLength || 10,
    pointerWidth: data.pointerWidth || 10,
    stroke: data.stroke,
    strokeWidth: data.strokeWidth,
    fill: data.fill,
    lineCap: 'round',
    lineJoin: 'round',
  }
}

function getRectConfig(element: CanvasElement) {
  const data = element.data as RectangleElement
  return {
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    stroke: data.stroke,
    strokeWidth: data.strokeWidth,
    fill: data.fill || 'transparent',
  }
}

function getCircleConfig(element: CanvasElement) {
  const data = element.data as CircleElement
  return {
    x: data.cx,
    y: data.cy,
    radius: data.radius,
    stroke: data.stroke,
    strokeWidth: data.strokeWidth,
    fill: data.fill || 'transparent',
  }
}

function getEllipseConfig(element: CanvasElement) {
  const data = element.data as EllipseElement
  return {
    x: data.x,
    y: data.y,
    radiusX: data.radiusX,
    radiusY: data.radiusY,
    rotation: data.rotation,
    stroke: data.stroke,
    strokeWidth: data.strokeWidth,
    fill: data.fill || 'transparent',
  }
}

function getImageConfig(element: CanvasElement) {
  const data = element.data as ImageElement
  const image = new Image()
  image.src = data.src
  return {
    x: data.x,
    y: data.y,
    image,
    width: data.width,
    height: data.height,
  }
}

function getTextConfig(element: CanvasElement) {
  const data = element.data as TextElement
  return {
    x: data.x,
    y: data.y,
    text: data.text,
    fontSize: data.fontSize,
    fill: data.color,
    fontFamily: data.fontFamily,
  }
}

// Text annotation config helpers
function getTextAnnotationConfig(element: CanvasElement) {
  const data = element.data as TextAnnotationElement
  return {
    x: data.x,
    y: data.y,
  }
}

function getTextAnnotationTextConfig(element: CanvasElement) {
  const data = element.data as TextAnnotationElement
  const leaderEnd = data.leaderLine.end

  return {
    text: data.text,
    x: leaderEnd[0] - data.x,
    y: leaderEnd[1] - data.y + 20,  // Offset below the leader line end
    fontSize: data.fontSize,
    fill: data.color,
    fontFamily: data.fontFamily,
    padding: 8,
  }
}

function getTextAnnotationLineConfig(element: CanvasElement) {
  const data = element.data as TextAnnotationElement

  return {
    // Points relative to group position (data.x, data.y)
    points: [
      data.leaderLine.start[0] - data.x,
      data.leaderLine.start[1] - data.y,
      data.leaderLine.end[0] - data.x,
      data.leaderLine.end[1] - data.y,
    ],
    stroke: data.color,
    strokeWidth: 2,
    lineCap: 'round',
  }
}

// Stamp config helpers
function getStampGroupConfig(element: CanvasElement) {
  const data = element.data as StampElement
  return {
    x: data.x,
    y: data.y,
  }
}

function getStampRectConfig(element: CanvasElement) {
  const data = element.data as StampElement
  return {
    width: data.width,
    height: data.height,
    fill: data.backgroundColor,
    stroke: data.borderColor,
    strokeWidth: 2,
    cornerRadius: data.borderRadius,
    shadowColor: 'rgba(0, 0, 0, 0.2)',
    shadowBlur: 4,
    shadowOffset: { x: 0, y: 2 },
  }
}

function getStampTextConfig(element: CanvasElement) {
  const data = element.data as StampElement
  return {
    text: data.text,
    x: data.width / 2,
    y: data.height / 2,
    fontSize: data.fontSize,
    fill: data.textColor,
    fontFamily: 'Arial, sans-serif',
    fontStyle: 'bold',
    align: 'center',
    verticalAlign: 'middle',
    offsetX: 0,
    offsetY: 0,
  }
}

// Measurement distance config helpers
function getMeasurementGroupConfig(element: CanvasElement) {
  return { x: 0, y: 0 }
}

function getMeasurementLineConfig(element: CanvasElement) {
  const data = element.data as MeasurementDistanceElement
  const isStale = isMeasurementStale(element, pixelsPerInch.value)
  return {
    points: [data.start[0], data.start[1], data.end[0], data.end[1]],
    stroke: isStale ? '#F59E0B' : '#3B82F6',  // Amber for stale measurements
    strokeWidth: 2,
    lineCap: 'round',
    dash: isStale ? [5, 5] : undefined,  // Dashed line for stale
  }
}

function getMeasurementStartAnchor(element: CanvasElement) {
  const data = element.data as MeasurementDistanceElement
  return {
    x: data.start[0],
    y: data.start[1],
    radius: 5,
    fill: '#3B82F6',
    stroke: '#FFFFFF',
    strokeWidth: 2,
  }
}

function getMeasurementEndAnchor(element: CanvasElement) {
  const data = element.data as MeasurementDistanceElement
  return {
    x: data.end[0],
    y: data.end[1],
    radius: 5,
    fill: '#3B82F6',
    stroke: '#FFFFFF',
    strokeWidth: 2,
  }
}

function getMeasurementLabelConfig(element: CanvasElement) {
  const data = element.data as MeasurementDistanceElement
  const inches = data.value ?? calculateDistance(data.start, data.end) / data.pixelsPerInch
  const label = formatDistanceMeasurement(inches, data.precision, data.unit)
  const isStale = isMeasurementStale(element, pixelsPerInch.value)
  const midX = (data.start[0] + data.end[0]) / 2
  const midY = (data.start[1] + data.end[1]) / 2
  return {
    text: label + (isStale ? ' (!)' : ''),
    x: midX,
    y: midY - 15,
    fontSize: 14,
    fill: isStale ? '#F59E0B' : '#3B82F6',
    fontFamily: 'Arial, sans-serif',
    align: 'center',
  }
}

// Element click handler for selection
function handleElementClick(element: CanvasElement, evt: any) {
  if (props.currentTool === 'select') {
    const node = evt.target
    // For groups (stamps, text-annotations), get the parent group
    const targetNode = node.getParent()?.className === 'Group' ? node.getParent() : node
    selectElement(element.id, targetNode)
    evt.cancelBubble = true
  } else if (props.currentTool === 'measure-distance' && evt.evt.detail === 2) {
    // Double-click on measurement with measure tool active - open edit dialog
    handleMeasurementDoubleClick(element)
    evt.cancelBubble = true
  }
}

// Current leader line preview for text annotation
const currentLeaderLinePreview = computed(() => {
  if (!textAnnotationStart.value || !currentLeaderLineEnd.value) return null

  const start = textAnnotationStart.value
  const end = currentLeaderLineEnd.value

  return {
    points: [start.x, start.y, end.x, end.y],
    stroke: props.currentColor,
    strokeWidth: 2,
    dash: [5, 5],  // Dashed for preview
  }
})

// Current stroke config
const currentStrokeConfig = computed(() => {
  if (currentStrokePoints.value.length < 2) {
    return { points: [], stroke: props.currentColor, strokeWidth: 1 }
  }

  // Render using perfect-freehand for preview
  const outline = getStroke(currentStrokePoints.value, {
    size: props.currentSize,
    thinning: props.currentTool === 'highlighter' ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  })

  const flatPoints = outline.flatMap(p => [p[0], p[1]])

  return {
    points: flatPoints,
    stroke: props.currentColor,
    strokeWidth: 1,  // Outline is filled, so stroke width doesn't matter
    fill: props.currentColor,
    globalAlpha: props.currentTool === 'highlighter' ? 0.5 : 1,
    lineCap: 'round',
    lineJoin: 'round',
    closed: true,
  }
})

// Current arrow preview config
const currentArrowPreview = computed(() => {
  if (!arrowStart.value || !currentArrowEnd.value) return null

  return {
    points: [arrowStart.value.x, arrowStart.value.y, currentArrowEnd.value.x, currentArrowEnd.value.y],
    pointerLength: 10,
    pointerWidth: 10,
    stroke: props.currentColor,
    strokeWidth: props.currentSize,
    fill: props.currentColor,
    lineCap: 'round',
    lineJoin: 'round',
    dash: [5, 5],  // Dashed line for preview
  }
})

// Current line preview config
const currentLinePreview = computed(() => {
  if (!lineStart.value || !currentLineEnd.value) return null

  return {
    points: [lineStart.value.x, lineStart.value.y, currentLineEnd.value.x, currentLineEnd.value.y],
    stroke: props.currentColor,
    strokeWidth: props.currentSize,
    lineCap: 'round',
    dash: [5, 5],  // Dashed line for preview
  }
})

// Current shape preview config
const currentShapePreview = computed(() => {
  if (!shapeStart.value || !currentShapeEnd.value) return null

  const start = shapeStart.value
  const end = currentShapeEnd.value

  // Rectangle preview
  if (props.currentTool === 'rectangle') {
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)

    return {
      type: 'rectangle',
      config: {
        x, y, width, height,
        stroke: props.currentColor,
        strokeWidth: props.currentSize,
        fill: 'transparent',
        dash: [5, 5],  // Dashed for preview
      }
    }
  }

  // Circle preview
  if (props.currentTool === 'circle') {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const radius = Math.sqrt(dx * dx + dy * dy)

    return {
      type: 'circle',
      config: {
        x: start.x,
        y: start.y,
        radius,
        stroke: props.currentColor,
        strokeWidth: props.currentSize,
        fill: 'transparent',
        dash: [5, 5],
      }
    }
  }

  // Ellipse preview
  if (props.currentTool === 'ellipse') {
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)

    return {
      type: 'ellipse',
      config: {
        x: x + width / 2,
        y: y + height / 2,
        radiusX: width / 2,
        radiusY: height / 2,
        rotation: 0,
        stroke: props.currentColor,
        strokeWidth: props.currentSize,
        fill: 'transparent',
        dash: [5, 5],
      }
    }
  }

  return null
})

// Export canvas as image
function exportAsImage(): string | null {
  const stage = stageRef.value?.getNode()
  if (!stage) return null
  return stage.toDataURL({ pixelRatio: 2 })
}

// Load PDF and add to canvas
async function loadPDF(arrayBuffer: ArrayBuffer, fileName: string) {
  // Cancel any existing load
  if (pdfAbortController.value) {
    pdfAbortController.value.abort()
  }

  // Create new abort controller
  pdfAbortController.value = new AbortController()
  pdfFileName.value = fileName

  const { loadAndRenderPage } = usePDFRendering()

  try {
    // Reset loading state
    pdfLoadingState.value = { loading: true, loaded: 0, total: 100, percent: 0 }

    // Load and render first page
    const { dataUrl, totalPages } = await loadAndRenderPage(arrayBuffer, 1, {
      onProgress: (state) => {
        pdfLoadingState.value = state
      },
      signal: pdfAbortController.value.signal,
    })

    // Create image element from rendered PDF
    const img = new Image()
    img.src = dataUrl

    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
    })

    // Add as canvas element
    const element: CanvasElement = {
      id: `${props.userId}-pdf-${Date.now()}`,
      type: 'image',
      userId: props.userId,
      userName: props.userName,
      timestamp: Date.now(),
      data: {
        src: dataUrl,
        x: 100,
        y: 100,
        width: img.width,
        height: img.height,
      } as ImageElement,
    }

    emit('element-add', element)

    // Clear loading state
    pdfLoadingState.value = { loading: false, loaded: 1, total: 1, percent: 100 }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      // User cancelled - clear state
      pdfLoadingState.value = { loading: false, loaded: 0, total: 0, percent: 0 }
    } else {
      // Error occurred
      const message = error instanceof Error ? error.message : 'Failed to load PDF'
      pdfLoadingState.value = {
        loading: false,
        loaded: 0,
        total: 0,
        percent: 0,
        error: message,
      }
    }
  } finally {
    pdfAbortController.value = null
  }
}

// Cancel PDF loading
function cancelPDFLoad() {
  pdfAbortController.value?.abort()
}

// Close loading indicator
function closeLoadingIndicator() {
  pdfLoadingState.value = { loading: false, loaded: 0, total: 0, percent: 0 }
}

// Text annotation handlers
function confirmAnnotation() {
  const text = pendingAnnotationText.value.trim()
  if (!text) {
    showAnnotationInput.value = false
    return
  }

  const leaderLine = (window as any).__pendingLeaderLine
  if (!leaderLine) {
    showAnnotationInput.value = false
    return
  }

  const element: CanvasElement = {
    id: `${props.userId}-${Date.now()}`,
    type: 'text-annotation',
    userId: props.userId,
    userName: props.userName,
    timestamp: Date.now(),
    data: {
      text,
      x: leaderLine.start[0],
      y: leaderLine.start[1],
      fontSize: 16,
      color: props.currentColor,
      fontFamily: 'Arial, sans-serif',
      leaderLine: {
        start: leaderLine.end,
        end: leaderLine.start,
      },
    } as TextAnnotationElement,
  }

  emit('element-add', element)
  showAnnotationInput.value = false
  delete (window as any).__pendingLeaderLine
}

function cancelAnnotation() {
  showAnnotationInput.value = false
  pendingAnnotationText.value = ''
  delete (window as any).__pendingLeaderLine
}

/**
 * Get consistent color for user based on userId
 * Matches the color generation in useCollaborativeCanvas.ts
 */
function getUserColor(userId: string): string {
  const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899']
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

/**
 * Handle double-click on measurement to open edit dialog
 */
function handleMeasurementDoubleClick(element: CanvasElement) {
  if (element.type === 'measurement-distance') {
    editingMeasurementElement.value = element
    const data = element.data as MeasurementDistanceElement
    pendingMeasurementValue.value = String(data.value ?? 0)
    showMeasurementEditDialog.value = true
  }
}

/**
 * Confirm measurement value edit
 */
function confirmMeasurementEdit() {
  if (!editingMeasurementElement.value) return

  const newValue = parseFloat(pendingMeasurementValue.value)
  if (isNaN(newValue)) return

  // Update the element with the new measurement value
  emit('element-update', editingMeasurementElement.value.id, {
    data: {
      ...editingMeasurementElement.value.data,
      value: newValue
    }
  })

  showMeasurementEditDialog.value = false
  editingMeasurementElement.value = null
  pendingMeasurementValue.value = ''
}

/**
 * Cancel measurement edit
 */
function cancelMeasurementEdit() {
  showMeasurementEditDialog.value = false
  editingMeasurementElement.value = null
  pendingMeasurementValue.value = ''
}

// Get center point of a shape element (for area measurement positioning)
function getShapeCenter(element: CanvasElement): { x: number; y: number } {
  switch (element.type) {
    case 'rectangle': {
      const data = element.data as RectangleElement
      return {
        x: data.x + data.width / 2,
        y: data.y + data.height / 2
      }
    }
    case 'circle': {
      const data = element.data as CircleElement
      return { x: data.cx, y: data.cy }
    }
    case 'ellipse': {
      const data = element.data as EllipseElement
      return { x: data.x, y: data.y }
    }
    default:
      return { x: 0, y: 0 }
  }
}

// Calculate distance between two points
function calculateDistance(p1: [number, number], p2: [number, number]): number {
  return Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
}

// Format distance measurement for display
function formatDistanceMeasurement(inches: number, precision: number, unit: 'inches' | 'feet'): string {
  if (unit === 'feet') {
    const feet = inches / 12
    return `${feet.toFixed(precision)}'`
  }
  return `${inches.toFixed(precision)}"`
}

// Format area measurement for display
function formatAreaMeasurement(sqInches: number, precision: number, unit: 'sq-inches' | 'sq-feet'): string {
  if (unit === 'sq-feet') {
    const sqFeet = sqInches / 144
    return `${sqFeet.toFixed(precision)} sq ft`
  }
  return `${sqInches.toFixed(precision)} sq in`
}

// Get area measurement label config
function getAreaLabelConfig(element: CanvasElement) {
  const data = element.data as MeasurementAreaElement
  const value = data.value ?? 0
  const label = formatAreaMeasurement(value, data.precision, data.unit)
  const isStale = isMeasurementStale(element, pixelsPerInch.value)
  return {
    text: label + (isStale ? ' (!)' : ''),
    x: 0,
    y: 0,
    fontSize: 12,
    fill: isStale ? '#F59E0B' : '#3B82F6',
    fontFamily: 'Arial, sans-serif',
  }
}

// Get area label position (above the target shape)
function getAreaLabelPosition(element: CanvasElement): { x: number; y: number } {
  const data = element.data as MeasurementAreaElement
  const target = props.elements.find(el => el.id === data.targetElementId)
  if (!target) return { x: 0, y: 0 }

  // Get center position of target shape
  const center = getShapeCenter(target)

  // Offset label above shape
  return {
    x: center.x,
    y: center.y - 20  // 20px vertical offset
  }
}

// Get center point of a shape element (alias for compatibility)
function getShapeCenterForElement(element: CanvasElement): { x: number; y: number } {
  return getShapeCenter(element)
}

defineExpose({
  exportAsImage,
  loadPDF,
  addImageLayer,
  addPDFLayer,
  updateLayer,
  removeLayer,
  visibleLayers,
  // Cursor tracking for UserPresenceList
  currentUser,
  remoteCursors,
  // Measurement helpers
  getStaleMeasurements,
})
</script>

<style scoped>
.whiteboard-container {
  touch-action: none;
  /* Prevent browser default gestures like pinch-zoom and scroll */
}
</style>

