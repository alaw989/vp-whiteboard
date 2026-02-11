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
            <!-- Stroke elements (freehand drawing) -->
            <v-line
              v-if="element.type === 'stroke'"
              :config="getStrokeConfig(element)"
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
    <template v-for="[id, presence] in connectedUsers" :key="id">
      <CursorPointer v-if="presence?.cursor" :presence="presence" />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { CanvasElement, StrokeElement, LineElement, RectangleElement, CircleElement, ImageElement, TextElement, UserPresence } from '~/types'

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
  'cursor-update': [x: number, y: number]
  'layer-change': [layers: any[]]
}>()

// Document layer management
const {
  visibleLayers,
  addImageLayer,
  addPDFLayer,
  updateLayer,
  removeLayer,
  setActiveLayer,
  state: layerState,
  getLayer,
} = useDocumentLayer()

// Container ref
const containerRef = ref<HTMLDivElement | null>(null)
const stageRef = ref<any>(null)
const layerRef = ref<any>(null)

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
const currentStrokePoints = ref<[number, number][]>([])

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

// Mouse handlers
function handleMouseDown(event: any) {
  if (props.currentTool === 'pan') {
    stageConfig.value.draggable = true
    return
  }

  if (props.currentTool === 'select') {
    // Handle selection
    return
  }

  // Drawing tools
  const pos = getPointerPos(event)
  isDrawing.value = true
  currentStrokePoints.value = [[pos.x, pos.y]]
}

function handleMouseMove(event: any) {
  const pos = getPointerPos(event)

  // Emit cursor update for collaboration
  emit('cursor-update', pos.x, pos.y)

  if (!isDrawing.value) return

  if (props.currentTool === 'pen' || props.currentTool === 'highlighter' || props.currentTool === 'eraser') {
    currentStrokePoints.value.push([pos.x, pos.y])
  }
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

  // Create element from stroke
  if (currentStrokePoints.value.length > 1) {
    const element: CanvasElement = {
      id: `${props.userId}-${Date.now()}`,
      type: 'stroke',
      userId: props.userId,
      userName: props.userName,
      timestamp: Date.now(),
      data: {
        points: currentStrokePoints.value.map(p => [p[0], p[1], 0.5]) as [number, number, number][],
        color: props.currentTool === 'eraser' ? '#f5f5f5' : props.currentColor,
        size: props.currentTool === 'eraser' ? 20 : props.currentSize,
        tool: props.currentTool === 'highlighter' ? 'highlighter' : 'pen',
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
  return {
    points: data.points.flatMap(p => [p[0], p[1]]),
    stroke: data.color,
    strokeWidth: data.size,
    tension: 0.5,
    lineCap: 'round',
    lineJoin: 'round',
    globalAlpha: data.tool === 'highlighter' ? 0.5 : 1,
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
  const points = currentStrokePoints.value.flat()
  return {
    points,
    stroke: props.currentTool === 'eraser' ? '#f5f5f5' : props.currentColor,
    strokeWidth: props.currentTool === 'eraser' ? 20 : props.currentSize,
    tension: 0.5,
    lineCap: 'round',
    lineJoin: 'round',
    globalAlpha: props.currentTool === 'highlighter' ? 0.5 : 1,
  }
})

// Export canvas as image
function exportAsImage(): string | null {
  const stage = stageRef.value?.getNode()
  if (!stage) return null
  return stage.toDataURL({ pixelRatio: 2 })
}

/**
 * Bring layer to front (highest z-index)
 */
function bringLayerToFront(layerId: string) {
  const layers = layerState.value.layers
  const index = layers.findIndex(l => l.id === layerId)
  if (index > -1) {
    const [layer] = layers.splice(index, 1)
    layers.push(layer)
    emit('layer-change', layers)
  }
}

/**
 * Send layer to back (lowest z-index)
 */
function sendLayerToBack(layerId: string) {
  const layers = layerState.value.layers
  const index = layers.findIndex(l => l.id === layerId)
  if (index > -1) {
    const [layer] = layers.splice(index, 1)
    layers.unshift(layer)
    emit('layer-change', layers)
  }
}

/**
 * Toggle layer visibility
 */
function toggleLayerVisibility(layerId: string) {
  const layer = layerState.value.layers.find(l => l.id === layerId)
  if (layer) {
    layer.visible = !layer.visible
    emit('layer-change', layerState.value.layers)
  }
}

/**
 * Delete layer
 */
function deleteLayer(layerId: string) {
  removeLayer(layerId)
  emit('layer-change', layerState.value.layers)
}

/**
 * Get all layers for external consumption
 */
function getAllLayers() {
  return layerState.value.layers
}

/**
 * Get active layer ID
 */
function getActiveLayerId() {
  return layerState.value.activeLayerId
}

defineExpose({
  exportAsImage,
  addImageLayer,
  addPDFLayer,
  updateLayer,
  removeLayer,
  visibleLayers,
  layerState,
  setActiveLayer,
  bringLayerToFront,
  sendLayerToBack,
  toggleLayerVisibility,
  deleteLayer,
  getAllLayers,
  getActiveLayerId,
  getLayer,
})
</script>
