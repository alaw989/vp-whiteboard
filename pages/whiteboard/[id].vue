<template>
  <div class="h-screen flex flex-col bg-neutral-100">
    <!-- Header -->
    <header class="bg-white border-b border-neutral-200 px-4 py-2 flex items-center justify-between z-10">
      <div class="flex items-center gap-4">
        <NuxtLink to="/" class="text-neutral-600 hover:text-neutral-900">
          <Icon name="mdi:arrow-left" class="w-6 h-6" />
        </NuxtLink>

        <div>
          <h1 class="text-lg font-semibold text-neutral-900">{{ whiteboard?.name || 'Loading...' }}</h1>
          <p v-if="connectedUsers.size > 1" class="text-xs text-neutral-500">
            {{ connectedUsers.size }} users online
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Connection Status -->
        <div
          :class="[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm',
            isConnected
              ? 'bg-green-100 text-green-700'
              : 'bg-yellow-100 text-yellow-700'
          ]"
        >
          <div
            :class="[
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
            ]"
          />
          {{ connectionStatus }}
        </div>

        <!-- Share Button -->
        <button
          @click="showShareModal = true"
          class="btn-secondary gap-2"
        >
          <Icon name="mdi:share-variant" class="w-4 h-4" />
          Share
        </button>

        <!-- Upload Button -->
        <button
          @click="showUploadModal = true"
          class="btn-secondary gap-2"
        >
          <Icon name="mdi:upload" class="w-4 h-4" />
          Upload
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Left Sidebar - Tools (Desktop only) -->
      <aside class="hidden md:flex w-16 bg-white border-r border-neutral-200 flex-col items-center py-4 gap-2 overflow-y-auto max-h-screen">
        <WhiteboardToolbar
          :current-tool="currentTool"
          :current-color="currentColor"
          :current-size="currentSize"
          :can-undo="canUndo"
          :can-redo="canRedo"
          :is-exporting="isExporting"
          :export-progress="exportProgress"
          @select-tool="setTool"
          @select-color="setColor"
          @select-size="setSize"
          @stamp-type-change="handleStampTypeChange"
          @undo="undo"
          @redo="redo"
          @clear="clearCanvas"
          @open-export="openExportDialog"
        />
      </aside>

      <!-- Canvas Area -->
      <main class="flex-1 relative overflow-hidden pb-16 md:pb-0">
        <ClientOnly>
          <WhiteboardCanvas
            ref="canvasRef"
            :whiteboard-id="whiteboardId"
            :user-id="currentUser.id"
            :user-name="currentUser.name"
            :elements="elements"
            :connected-users="connectedUsers"
            :ws-provider="canvas?.wsProvider"
            :current-tool="currentTool"
            :current-color="currentColor"
            :current-size="currentSize"
            :current-stamp-type="currentStampType"
            :active-strokes="activeStrokes"
            :start-active-stroke="startActiveStroke"
            :broadcast-stroke-point="broadcastStrokePoint"
            :end-active-stroke="endActiveStroke"
            :get-viewport="canvas?.getViewport"
            :sync-viewport="canvas?.syncViewport"
            :observe-viewport="canvas?.observeViewport"
            @element-add="addElement"
            @element-delete="handleDeleteElement"
            @cursor-update="updateCursor"
          />
          <template #fallback>
            <div class="flex items-center justify-center h-full">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p class="text-neutral-600">{{ whiteboard?.name ? 'Loading canvas...' : 'Loading whiteboard...' }}</p>
            </div>
          </template>
        </ClientOnly>

        <!-- User Presence List -->
        <ClientOnly>
          <UserPresenceList
            v-if="currentUserFromCanvas && remoteCursors.size > 0"
            :users="remoteCursors"
          />
        </ClientOnly>

        <!-- Scale Badge -->
        <ClientOnly>
          <ScaleBadge
            v-if="scaleInstance"
            :display-format="scaleDisplayFormat"
            :current-scale="currentScaleValue"
            @open-scale-dialog="showScalePalette = true"
          />
        </ClientOnly>
      </main>
    </div>

    <!-- Share Modal -->
    <WhiteboardShareModal
      v-if="showShareModal"
      :share-url="shareUrl"
      @close="showShareModal = false"
    />

    <!-- Upload Modal -->
    <WhiteboardUpload
      v-if="showUploadModal"
      :whiteboard-id="whiteboardId"
      @upload-success="handleUploadSuccess"
      @upload-error="handleUploadError"
      @close="showUploadModal = false"
    />

    <!-- Export Dialog -->
    <ClientOnly>
      <ExportDialog
        :show="showExportDialog"
        :stage="(canvasRef.value as any)?.stageRef?.getNode() || null"
        :filename="whiteboard.value?.name"
        :is-exporting="isExporting"
        :export-progress="exportProgress"
        @close="closeExportDialog"
        @export="confirmExport"
      />
    </ClientOnly>

    <!-- Scale Tool Palette -->
    <ClientOnly>
      <ScaleToolPalette
        :show="showScalePalette"
        :current-scale="currentScaleValue"
        @close="showScalePalette = false"
        @set-scale="handleSetScale"
      />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { Whiteboard, CanvasElement, UploadResult, DrawingTool } from '~/types'
import type { StampType } from '~/components/whiteboard/WhiteboardCanvas.vue'
import ExportDialog from '~/components/whiteboard/ExportDialog.vue'
import UserPresenceList from '~/components/whiteboard/UserPresenceList.vue'
import ScaleBadge from '~/components/whiteboard/ScaleBadge.vue'
import ScaleToolPalette from '~/components/whiteboard/ScaleToolPalette.vue'

const route = useRoute()
const whiteboardId = route.params.id as string

// Create user info (simple object, not a function)
const currentUser = {
  id: `user-${Math.random().toString(36).substring(2, 9)}`,
  name: 'Guest',
}

// Canvas state (initialized on mount, safely accessed via computed)
const canvasInstance = ref<ReturnType<typeof useCollaborativeCanvas> | null>(null)
const canvasRef = ref<{ stageRef?: { getNode: () => any } } | null>(null)

// Fetch whiteboard data
const { data: whiteboardData } = await useFetch<ApiResponse<Whiteboard>>(`/api/whiteboard/${whiteboardId}`)
const whiteboard = computed(() => whiteboardData.value?.data)

// Share URL
const shareUrl = computed(() => {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl as string
  return `${baseUrl}/whiteboard/${whiteboardId}`
})

// Modal states
const showShareModal = ref(false)
const showUploadModal = ref(false)
const showExportDialog = ref(false)
const showScalePalette = ref(false)

// Scale state
const scaleInstance = ref<ReturnType<typeof useScale> | null>(null)
const currentScaleValue = ref<{ label: string } | null>(null)
const scaleDisplayFormat = ref('No scale set')

// Canvas state refs (will be set when canvasInstance is ready)
const isConnected = ref(false)
const connectionStatus = ref('disconnected')
const connectedUsers = ref<Map<string, any>>(new Map())
const elements = ref<CanvasElement[]>([])
const canUndo = ref(false)
const canRedo = ref(false)
const activeStrokes = ref<Record<string, [number, number, number][]>>({})

// Tool state
const currentTool = ref<DrawingTool>('select')
const currentColor = ref('#000000')
const currentSize = ref(4)
const currentStampType = ref<StampType>('APPROVED')

// Load saved tool state from localStorage
const STORAGE_KEY_STYLE = 'whiteboard-style'
if (import.meta.client) {
  try {
    const savedStyle = localStorage.getItem(STORAGE_KEY_STYLE)
    if (savedStyle) {
      const { color, size } = JSON.parse(savedStyle)
      if (color) currentColor.value = color
      if (size) currentSize.value = size
    }
  } catch {
    // Ignore localStorage errors
  }
}

// Computed refs for canvas binding (functions from composable)
const startActiveStroke = ref<ReturnType<typeof useCollaborativeCanvas>['startActiveStroke']>()
const broadcastStrokePoint = ref<ReturnType<typeof useCollaborativeCanvas>['broadcastStrokePoint']>()
const endActiveStroke = ref<ReturnType<typeof useCollaborativeCanvas>['endActiveStroke']>()

// Export functionality
const { isExporting, progress: exportProgress, exportAsPNG, exportAsPDF } = useExport()

// Cursor tracking state from WhiteboardCanvas's useCursors
const currentUserFromCanvas = ref<{ id: string; name: string; color: string }>({
  id: currentUser.id,
  name: currentUser.name,
  color: '',
})
const remoteCursors = ref<Map<number, any>>(new Map())

// Initialize canvas on client side
onMounted(() => {
  canvasInstance.value = useCollaborativeCanvas(
    whiteboardId,
    currentUser.id,
    currentUser.name
  )

  // Initialize scale composable with yMeta from canvas instance
  nextTick(() => {
    if (canvasInstance.value) {
      scaleInstance.value = useScale({
        yMeta: canvasInstance.value.yMeta,
        userId: currentUser.id,
        documentId: whiteboardId,
      })

      // Set up reactive bindings for scale
      if (scaleInstance.value) {
        currentScaleValue.value = scaleInstance.value.currentScale as any
        scaleDisplayFormat.value = scaleInstance.value.displayFormat

        // Observe scale changes for UI updates
        scaleInstance.value.observeScale((scale) => {
          currentScaleValue.value = scale
          scaleDisplayFormat.value = scale.label
        })
      }
    }
  })

  // Set up reactive bindings to composable (now canvas is guaranteed to be set)
  isConnected.value = computed(() => canvasInstance.value?.isConnected.value ?? false)
  connectionStatus.value = computed(() => canvasInstance.value?.connectionStatus.value ?? 'disconnected')
  connectedUsers.value = computed(() => canvasInstance.value?.connectedUsers.value ?? new Map())
  elements.value = computed(() => canvasInstance.value?.elements.value ?? [])
  canUndo.value = computed(() => canvasInstance.value?.canUndo.value ?? false)
  canRedo.value = computed(() => canvasInstance.value?.canRedo.value ?? false)
  activeStrokes.value = computed(() => canvasInstance.value?.activeStrokes.value ?? {})
  startActiveStroke.value = computed(() => canvasInstance.value?.startActiveStroke)
  broadcastStrokePoint.value = computed(() => canvasInstance.value?.broadcastStrokePoint)
  endActiveStroke.value = computed(() => canvasInstance.value?.endActiveStroke)
})

// Watch for updates
watch(() => canvasInstance.value?.isConnected.value, (v) => { isConnected.value = v })
watch(() => canvasInstance.value?.connectionStatus.value, (v) => { connectionStatus.value = v })
watch(() => canvasInstance.value?.connectedUsers.value, (v) => { connectedUsers.value = v })
watch(() => canvasInstance.value?.elements.value, (v) => { elements.value = v })
watch(() => canvasInstance.value?.canUndo.value, (v) => { canUndo.value = v })
watch(() => canvasInstance.value?.canRedo.value, (v) => { canRedo.value = v })
watch(() => canvasInstance.value?.activeStrokes.value, (v) => { activeStrokes.value = v.value || {} }, { deep: true })

// Watch for cursor tracking updates from WhiteboardCanvas component
watchEffect(() => {
  const canvasComponent = canvasRef.value
  if (canvasComponent) {
    // Access exposed values from WhiteboardCanvas
    const exposed = canvasComponent as unknown as {
      currentUser?: { id: string; name: string; color: string }
      remoteCursors?: Map<number, any>
    }
    if (exposed.currentUser) {
      currentUserFromCanvas.value = exposed.currentUser
    }
    if (exposed.remoteCursors) {
      remoteCursors.value = exposed.remoteCursors
    }
  }
})

// Load saved canvas state
if (whiteboard.value?.canvas_state && canvasInstance.value) {
  canvasInstance.value.importState(whiteboard.value.canvas_state)
}

// Auto-save canvas state periodically (client-side only to avoid SSR error)
const saveInterval = ref<number | null>(null)

onMounted(() => {
  saveInterval.value = window.setInterval(() => {
    if (canvasInstance.value && canvasInstance.value.isConnected.value) {
      const state = canvasInstance.value.exportState()
      $fetch(`/api/whiteboard/${whiteboardId}`, {
        method: 'PATCH',
        body: { canvas_state: state },
      })
    }
  }, 30000) as unknown as number
})

onUnmounted(() => {
  if (saveInterval.value) window.clearInterval(saveInterval.value)
  if (canvasInstance.value) canvasInstance.value.cleanup()
})

// Tool handlers
function setTool(tool: typeof currentTool.value) {
  currentTool.value = tool
}

function setColor(color: string) {
  currentColor.value = color
}

function setSize(size: number) {
  currentSize.value = size
}

function openExportDialog() {
  showExportDialog.value = true
}

function closeExportDialog() {
  showExportDialog.value = false
}

async function confirmExport(format: 'png' | 'pdf') {
  if (!canvasInstance.value) return

  const stage = (canvasRef.value as any)?.stageRef?.getNode() || null
  const filename = whiteboard.value?.name || 'whiteboard'

  if (format === 'png') {
    await exportAsPNG(stage, { filename })
  } else if (format === 'pdf') {
    await exportAsPDF(stage, { filename })
  }

  // Close dialog after export completes
  closeExportDialog()
}

async function handleUploadSuccess(result: UploadResult) {
  const fileType = result.fileRecord?.file_type || ''

  if (fileType === 'application/pdf') {
    // For PDFs, fetch as ArrayBuffer and use addPDFLayer
    const response = await fetch(result.url)
    const arrayBuffer = await response.arrayBuffer()

    const element = await canvasInstance.value.addPDFLayer({
      id: result.fileId,
      url: result.url,
      name: result.fileName,
    }, arrayBuffer)

    if (element && canvasInstance.value) canvasInstance.value.addElement(element)
  } else {
    // For images, use addImageLayer directly
    const element = await canvasInstance.value.addImageLayer({
      id: result.fileId,
      url: result.url,
      name: result.fileName,
    })

    if (element && canvasInstance.value) canvasInstance.value.addElement(element)
  }

  // Close upload modal on success
  showUploadModal.value = false
}

function handleUploadError(error: any) {
  console.error('Upload error:', error)
}

function handleStampTypeChange(stampType: StampType) {
  // Automatically switch to stamp tool when stamp type changes
  setTool('stamp')
}

function undo() {
  canvasInstance.value?.undo()
}

function redo() {
  canvasInstance.value?.redo()
}

function clearCanvas() {
  if (confirm('Are you sure you want to clear the canvas? This cannot be undone.')) {
    canvasInstance.value?.clearCanvas()
  }
}

function handleDeleteElement(elementId: string) {
  canvasInstance.value?.deleteElement(elementId)
}

function updateCursor(x: number, y: number) {
  canvasInstance.value?.updateCursor(x, y)
}

// Scale handlers
function handleSetScale(
  drawingUnits: number,
  drawingUnit: 'inches',
  realWorldUnits: number,
  realWorldUnit: 'feet' | 'inches'
) {
  // Calculate the new pixelsPerInch value
  const standardDPI = 96
  let realWorldInches = realWorldUnits
  if (realWorldUnit === 'feet') {
    realWorldInches = realWorldUnits * 12
  }
  const newPixelsPerInch = (standardDPI * drawingUnits) / realWorldInches

  // Check for stale measurements before applying new scale
  const staleMeasurements = canvasInstance.value?.getStaleMeasurements?.(newPixelsPerInch)
  if (staleMeasurements && staleMeasurements.length > 0) {
    const confirmed = confirm(
      `Warning: Changing the scale will make ${staleMeasurements.length} existing measurement(s) stale. ` +
      `Stale measurements will be marked with amber color and "(!)" indicator. ` +
      `You can update them individually by double-clicking with the measure tool.\n\n` +
      `Continue with scale change?`
    )
    if (!confirmed) {
      return // User cancelled, don't change scale
    }
  }

  scaleInstance.value?.setScale(drawingUnits, drawingUnit, realWorldUnits, realWorldUnit)

  // Update display values
  if (scaleInstance.value) {
    currentScaleValue.value = scaleInstance.value.currentScale as any
    scaleDisplayFormat.value = scaleInstance.value.displayFormat
  }

  // Close the palette
  showScalePalette.value = false
}

// Watch for style changes and persist to localStorage
watch([currentColor, currentSize], () => {
  if (import.meta.client) {
    localStorage.setItem(STORAGE_KEY_STYLE, JSON.stringify({
      color: currentColor.value,
      size: currentSize.value,
    }))
  }
})
</script>
