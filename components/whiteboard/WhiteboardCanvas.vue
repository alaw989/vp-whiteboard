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
              }"
            />

            <!-- Line elements -->
            <v-line
              v-else-if="element.type === 'line'"
              :config="getLineConfig(element)"
            />

            <!-- Rectangle elements -->
            <v-rect
              v-else-if="element.type === 'rectangle'"
              :config="getRectConfig(element)"
            />

            <!-- Circle elements -->
            <v-circle
              v-else-if="element.type === 'circle'"
              :config="getCircleConfig(element)"
            />

            <!-- Image elements -->
            <v-image
              v-else-if="element.type === 'image'"
              :config="getImageConfig(element)"
            />

            <!-- Text elements -->
            <v-text
              v-else-if="element.type === 'text'"
              :config="getTextConfig(element)"
            />
          </template>

          <!-- Current stroke being drawn -->
          <v-line
            v-if="currentStrokePoints.length > 0"
            :config="currentStrokeConfig"
          />
        </v-group>
      </v-layer>
    </v-stage>

    <!-- Collaborative cursors -->
    <ClientOnly>
      <template v-for="[id, presence] in connectedUsers" :key="id">
        <WhiteboardCursorPointer v-if="presence?.cursor" :presence="presence" />
      </template>
    </ClientOnly>

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
import type { CanvasElement, StrokeElement, LineElement, RectangleElement, CircleElement, EllipseElement, ImageElement, TextElement, TextAnnotationElement, ArrowElement, UserPresence, DocumentLayer } from '~/types'
import PDFLoadingIndicator from '~/components/whiteboard/PDFLoadingIndicator.vue'
import type { PDFLoadingState } from '~/types'

const props = defineProps<{
  whiteboardId: string
  userId: string
  userName: string
  elements: CanvasElement[]
  connectedUsers: Map<string, UserPresence>
  currentTool: string
  currentColor: string
  currentSize: number
}>()

const emit = defineEmits<{
  'element-add': [element: CanvasElement]
  'element-delete': [elementId: string]
  'cursor-update': [x: number, y: number]
}>()

// Document layer composable
const {
  visibleLayers,
  addImageLayer,
  addPDFLayer,
  updateLayer,
  removeLayer,
} = useDocumentLayer()

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

// Container ref
const containerRef = ref<HTMLDivElement | null>(null)
const stageRef = ref<any>(null)
const layerRef = ref<any>(null)
const documentLayerRef = ref<any>(null)

// Stage configuration
const stageConfig = ref({
  width: 2000,
  height: 1500,
  scaleX: 1,
  scaleY: 1,
  x: 0,
  y: 0,
  draggable: false,
})

// Viewport state
const viewport = ref({ x: 0, y: 0, zoom: 1 })

// Drawing state
const isDrawing = ref(false)
const currentStrokePoints = ref<[number, number, number][]>([])

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

// PDF loading state
const pdfLoadingState = ref<PDFLoadingState>({
  loading: false,
  loaded: 0,
  total: 100,
  percent: 0,
})
const pdfFileName = ref<string>('')
const pdfAbortController = ref<AbortController | null>(null)

// Initialize stage size
onMounted(() => {
  if (containerRef.value) {
    stageConfig.value.width = containerRef.value.offsetWidth || 2000
    stageConfig.value.height = containerRef.value.offsetHeight || 1500
  }

  // Handle window resize
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  layerImageCache.clear()
  window.removeEventListener('resize', handleResize)
})

function handleResize() {
  if (containerRef.value) {
    stageConfig.value.width = containerRef.value.offsetWidth || 2000
    stageConfig.value.height = containerRef.value.offsetHeight || 1500
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

// Mouse handlers
function handleMouseDown(event: any) {
  if (props.currentTool === 'pan') {
    stageConfig.value.draggable = true
    return
  }

  if (props.currentTool === 'select') {
    // Handle selection (implemented in 03-06)
    return
  }

  // Drawing tools
  const pos = getPointerPos(event)
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

  // Emit cursor update for collaboration
  emit('cursor-update', pos.x, pos.y)

  if (!isDrawing.value) return

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
  if (props.currentTool === 'pan') {
    stageConfig.value.draggable = false
    // Update viewport position
    const stage = stageRef.value?.getNode()
    if (stage) {
      viewport.value.x = stage.x()
      viewport.value.y = stage.y()
    }
    return
  }

  if (!isDrawing.value) return

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
    emit('element-add', element)
  }

  isDrawing.value = false
  currentStrokePoints.value = []
}

// Touch handlers
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

// Zoom handler
function handleWheel(event: any) {
  event.evt.preventDefault()

  const oldScale = viewport.value.zoom
  const pointer = stageRef.value?.getNode().getPointerPosition()

  const scaleBy = 1.1
  const newScale = event.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy

  // Limit zoom
  const clampedScale = Math.min(Math.max(newScale, 0.1), 5)

  // Adjust position to zoom toward pointer
  if (pointer) {
    viewport.value.x = pointer.x - (pointer.x - viewport.value.x) * (clampedScale / oldScale)
    viewport.value.y = pointer.y - (pointer.y - viewport.value.y) * (clampedScale / oldScale)
  }

  viewport.value.zoom = clampedScale
  stageConfig.value.scaleX = clampedScale
  stageConfig.value.scaleY = clampedScale
  stageConfig.value.x = viewport.value.x
  stageConfig.value.y = viewport.value.y
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

function getLineConfig(element: CanvasElement) {
  const data = element.data as LineElement
  return {
    points: [data.start[0], data.start[1], data.end[0], data.end[1]],
    stroke: data.color,
    strokeWidth: data.size,
    lineCap: 'round',
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

defineExpose({
  exportAsImage,
  loadPDF,
  addImageLayer,
  addPDFLayer,
  updateLayer,
  removeLayer,
  visibleLayers,
})
</script>
