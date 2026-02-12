<template>
  <div class="h-screen flex flex-col bg-neutral-100">
    <!-- Header -->
    <header class="bg-white border-b border-neutral-200 px-4 py-2 flex items-center justify-between z-10">
      <div class="flex items-center gap-4">
        <NuxtLink
          to="/"
          class="p-2 -ml-2 rounded-lg hover:bg-neutral-100 active:bg-neutral-200 transition-colors duration-150 text-neutral-600 hover:text-neutral-900"
          title="Back to home"
        >
          <Icon name="mdi:arrow-left" class="w-5 h-5" />
        </NuxtLink>

        <div class="min-w-0">
          <h1 class="text-lg font-semibold text-neutral-900 truncate">{{ whiteboard?.name || 'Loading...' }}</h1>
          <p v-if="connectedUsers.size > 1" class="text-xs text-neutral-500 flex items-center gap-1">
            <Icon name="mdi:account-group" class="w-3 h-3" />
            {{ connectedUsers.size }} users online
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Connection Status -->
        <div
          :class="[
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300',
            isConnected
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          ]"
        >
          <div
            :class="[
              'w-2 h-2 rounded-full relative',
              isConnected ? 'bg-green-500' : 'bg-amber-500 animate-pulse-subtle'
            ]"
          >
            <div
              v-if="isConnected"
              class="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75"
            />
          </div>
          <span class="capitalize">{{ connectionStatus }}</span>
        </div>

        <!-- Share Button -->
        <button
          @click="showShareModal = true"
          class="btn-secondary gap-2"
          title="Share whiteboard"
        >
          <Icon name="mdi:share-variant" class="w-4 h-4" />
          <span class="hidden sm:inline">Share</span>
        </button>

        <!-- Upload Button -->
        <button
          @click="showUploadModal = true"
          class="btn-secondary gap-2"
          title="Upload file"
        >
          <Icon name="mdi:upload" class="w-4 h-4" />
          <span class="hidden sm:inline">Upload</span>
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Toolbar (responsive - handles desktop/mobile display internally) -->
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
            :ws-provider="canvasInstance?.wsProvider"
            :current-tool="currentTool"
            :current-color="currentColor"
            :current-size="currentSize"
            :current-stamp-type="currentStampType"
            :active-strokes="activeStrokes"
            :start-active-stroke="startActiveStroke"
            :broadcast-stroke-point="broadcastStrokePoint"
            :end-active-stroke="endActiveStroke"
            :get-viewport="(canvasInstance as any)?.getViewport"
            :sync-viewport="(canvasInstance as any)?.syncViewport"
            :observe-viewport="(canvasInstance as any)?.observeViewport"
            @element-add="(element) => canvasInstance?.addElement?.(element)"
            @element-delete="handleDeleteElement"
            @cursor-update="updateCursor"
          />
          <template #fallback>
            <div class="flex flex-col items-center justify-center h-full gap-6 animate-fade-in">
              <div class="relative">
                <!-- Outer ring -->
                <div class="w-20 h-20 rounded-full border-4 border-blue-100"></div>
                <!-- Spinning arc -->
                <div class="absolute top-0 left-0 w-20 h-20 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
                <!-- Center dot with pulse -->
                <div class="absolute inset-0 flex items-center justify-center">
                  <div class="w-3 h-3 rounded-full bg-blue-600 animate-pulse"></div>
                </div>
              </div>
              <div class="text-center">
                <p class="text-lg font-semibold text-neutral-900">{{ whiteboard?.name ? 'Loading canvas...' : 'Loading whiteboard...' }}</p>
                <p class="text-sm text-neutral-500 mt-1">Preparing your collaborative workspace</p>
              </div>
            </div>
          </template>
        </ClientOnly>

        <!-- User Presence List -->
        <ClientOnly>
          <UserPresenceList
            v-if="currentUserFromCanvas && remoteCursors.size > 0"
            :users="remoteCursors"
            :current-user="currentUserFromCanvas"
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
      :show="showShareModal"
      :share-url="shareUrl"
      @close="showShareModal = false"
    />

    <!-- Upload Modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="showUploadModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          @click.self="showUploadModal = false"
        >
          <div
            class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
            @click.stop
          >
            <div class="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h2 class="text-lg font-semibold text-neutral-900">Upload File</h2>
              <button
                @click="showUploadModal = false"
                class="p-1 hover:bg-neutral-100 rounded-lg transition-colors"
                title="Close"
              >
                <Icon name="mdi:close" class="w-5 h-5 text-neutral-600" />
              </button>
            </div>
            <div class="p-6">
              <WhiteboardUpload
                :whiteboard-id="whiteboardId"
                @upload-success="handleUploadSuccess"
                @upload-error="handleUploadError"
              />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Export Dialog -->
    <ClientOnly>
      <ExportDialog
        :show="showExportDialog"
        :stage="(canvasRef as any)?.stageRef?.getNode() || null"
        :filename="whiteboard?.name"
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

    <!-- Keyboard Shortcuts Modal -->
    <ClientOnly>
      <KeyboardShortcutsModal
        :show="showKeyboardShortcuts"
        @close="showKeyboardShortcuts = false"
      />
    </ClientOnly>

    <!-- Keyboard Shortcut Hint Button -->
    <button
      class="fixed bottom-4 right-4 z-30 w-10 h-10 rounded-xl bg-neutral-800/90 hover:bg-neutral-700 text-white flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg backdrop-blur-sm"
      title="Keyboard shortcuts (?)"
      aria-label="Show keyboard shortcuts"
      @click="showKeyboardShortcuts = true"
    >
      <span class="text-sm font-semibold">?</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Whiteboard, CanvasElement, UploadResult, DrawingTool, ApiResponse } from '~/types'
import type { StampType } from '~/components/whiteboard/WhiteboardCanvas.vue'
import ExportDialog from '~/components/whiteboard/ExportDialog.vue'
import WhiteboardShareModal from '~/components/whiteboard/WhiteboardShareModal.vue'
import UserPresenceList from '~/components/whiteboard/UserPresenceList.vue'
import ScaleBadge from '~/components/whiteboard/ScaleBadge.vue'
import ScaleToolPalette from '~/components/whiteboard/ScaleToolPalette.vue'
import KeyboardShortcutsModal from '~/components/whiteboard/KeyboardShortcutsModal.vue'

// Canvas instance type combining composable return with exposed methods
type CanvasInstanceType = ReturnType<typeof useCollaborativeCanvas> & {
  getStaleMeasurements?: (pixelsPerInch: number) => CanvasElement[]
}

const route = useRoute()
// Nuxt route params have complex union types - using any for dynamic param access
const whiteboardId = String((route.params as any).id || '')

// Create user info (simple object, not a function)
const currentUser = {
  id: `user-${Math.random().toString(36).substring(2, 9)}`,
  name: 'Guest',
}

// Canvas state (initialized on mount, safely accessed via computed)
const canvasInstance = ref<CanvasInstanceType | null>(null)
const canvasRef = ref<{ stageRef?: { getNode: () => any } } | null>(null)

// Fetch whiteboard data
const { data: whiteboardData, error: fetchError } = await useFetch<ApiResponse<Whiteboard>>(`/api/whiteboard/${whiteboardId}`)
const whiteboard = computed(() => whiteboardData.value?.data)

// Handle error state - redirect to home with a message if whiteboard not found
if (fetchError.value || (!whiteboardData.value?.success && !whiteboardData.value?.data)) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Whiteboard not found',
    message: 'The whiteboard you are looking for does not exist or has been deleted.',
    fatal: true,
  })
}

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
const showKeyboardShortcuts = ref(false)

// Scale state
const scaleInstance = ref<ReturnType<typeof useScale> | null>(null)
const currentScaleValue = ref<{ label: string } | null>(null)
const scaleDisplayFormat = ref<string>('No scale set')

// Canvas state refs (computed - derived from canvasInstance)
const instance = computed(() => canvasInstance.value)
const isConnected = computed(() => {
  const inst = instance.value
  return inst ? (inst.isConnected as any).value : false
})
const connectionStatus = computed(() => {
  const inst = instance.value
  return inst ? (inst.connectionStatus as any).value : 'disconnected'
})
const connectedUsers = computed(() => {
  const inst = instance.value
  return inst ? inst.connectedUsers : new Map()
})
const elements = computed(() => {
  const inst = instance.value
  return inst ? inst.elements : []
})
const canUndo = computed(() => {
  const inst = instance.value
  return inst ? inst.canUndo : false
})
const canRedo = computed(() => {
  const inst = instance.value
  return inst ? inst.canRedo : false
})
const activeStrokes = computed(() => {
  const inst = instance.value
  return inst ? inst.activeStrokes : {}
})

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
const startActiveStroke = computed(() => canvasInstance.value?.startActiveStroke)
const broadcastStrokePoint = computed(() => canvasInstance.value?.broadcastStrokePoint)
const endActiveStroke = computed(() => canvasInstance.value?.endActiveStroke)

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
      const yMeta = canvasInstance.value.yMeta as any
      const ydoc = canvasInstance.value.ydoc as any
      scaleInstance.value = useScale({
        yMeta: yMeta,
        ydoc: ydoc,
        userId: currentUser.id,
        documentId: whiteboardId,
      })

      // Set up reactive bindings for scale
      if (scaleInstance.value) {
        const scaleVal = scaleInstance.value.currentScale as { label: string } | null
        currentScaleValue.value = scaleVal
        scaleDisplayFormat.value = scaleInstance.value.displayFormat as string

        // Observe scale changes for UI updates
        scaleInstance.value.observeScale((scale) => {
          currentScaleValue.value = scale
          scaleDisplayFormat.value = scale.label
        })
      }
    }
  })
})

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
const saveInterval = ref<ReturnType<typeof setInterval> | null>(null)

onMounted(() => {
  saveInterval.value = setInterval(() => {
    const instance = canvasInstance.value
    if (instance && (instance.isConnected as any).value) {
      const state = instance.exportState()
      $fetch(`/api/whiteboard/${whiteboardId}`, {
        method: 'PATCH',
        body: { canvas_state: state },
      })
    }
  }, 30000)
})

onUnmounted(() => {
  if (saveInterval.value !== null) clearInterval(saveInterval.value)
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

  // File upload is handled by WhiteboardUpload component
  // which emits to the canvas directly
  // Just close the upload modal on success
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
  // Measurements become stale when the scale changes by more than 1%
  const staleMeasurements = canvasInstance.value?.getStaleMeasurements
    ? canvasInstance.value.getStaleMeasurements(newPixelsPerInch)
    : []
  if (staleMeasurements.length > 0) {
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
    currentScaleValue.value = scaleInstance.value.currentScale as { label: string } | null
    scaleDisplayFormat.value = scaleInstance.value.displayFormat as string
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

// Keyboard shortcuts listener
onMounted(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ignore if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return
    }

    // Show keyboard shortcuts on "?" key
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault()
      showKeyboardShortcuts.value = true
    }

    // Tool shortcuts
    if (!e.ctrlKey && !e.metaKey) {
      switch (e.key.toUpperCase()) {
        case 'V':
          setTool('select')
          break
        case 'H':
          setTool('pan')
          break
        case 'P':
          setTool('pen')
          break
        case 'L':
          setTool('line')
          break
        case 'A':
          setTool('arrow')
          break
        case 'R':
          setTool('rectangle')
          break
        case 'C':
          setTool('circle')
          break
        case 'E':
          setTool('ellipse')
          break
        case 'T':
          setTool('text-annotation')
          break
        case 'M':
          setTool('measure-distance')
          break
        case 'X':
          setTool('eraser')
          break
      }
    }

    // Undo/Redo shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      if (e.shiftKey) {
        redo()
      } else {
        undo()
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault()
      redo()
    }

    // Delete shortcut
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Handle deletion of selected elements
    }

    // Escape to deselect
    if (e.key === 'Escape') {
      setTool('select')
    }
  }

  window.addEventListener('keydown', handleKeyDown)

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })
})
</script>
