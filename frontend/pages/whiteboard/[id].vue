<template>
  <div class="h-dvh flex flex-col bg-neutral-100">
    <!-- Header -->
    <header class="bg-chrome border-b border-chrome-border px-4 py-2 flex items-center justify-between z-10">
      <div class="flex items-center gap-4">
        <NuxtLink
          to="/"
          class="p-2 -ml-2 rounded-lg hover:bg-neutral-700 active:bg-neutral-600 transition-colors duration-150 text-chrome-fg-muted hover:text-chrome-fg"
          title="Back to home"
        >
          <Icon name="mdi:arrow-left" class="w-5 h-5" />
        </NuxtLink>

        <div class="min-w-0">
          <div v-if="isEditingName" class="flex items-center gap-2">
            <input
              ref="nameInput"
              v-model="editNameValue"
              class="text-lg font-semibold text-chrome-fg bg-neutral-800 border border-neutral-600 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
              @keydown.enter="saveName"
              @keydown.escape="cancelNameEdit"
              @blur="saveName"
            />
          </div>
          <h1
            v-else
            class="text-lg font-semibold text-chrome-fg truncate cursor-pointer hover:text-blue-400 transition-colors"
            title="Click to rename"
            @click="startNameEdit"
          >
            {{ whiteboard?.name || 'Loading...' }}
            <Icon name="mdi:pencil-outline" class="w-3.5 h-3.5 inline ml-1 opacity-0 group-hover:opacity-50" />
          </h1>
          <p v-if="connectedUsers.size > 1" class="text-xs text-chrome-fg-muted flex items-center gap-1">
            <Icon name="mdi:account-group" class="w-3 h-3" />
            {{ connectedUsers.size }} users online
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Save State (auto-save persistence indicator — distinct from WS health) -->
        <div
          data-testid="save-state-badge"
          role="status"
          aria-live="polite"
          :class="[
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300',
            saveStateVisuals.classes
          ]"
          :title="saveStateTitle"
        >
          <Icon
            :name="saveStateVisuals.icon"
            class="w-3.5 h-3.5"
            :class="saveStateVisuals.iconSpin && 'animate-spin'"
          />
          <span>{{ saveStateVisuals.text }}</span>
        </div>

        <!-- Connection Status -->
        <div
          :class="[
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300',
            isConnected
              ? 'bg-green-900/50 text-green-400 border border-green-700'
              : 'bg-amber-900/50 text-amber-400 border border-amber-700'
          ]"
        >
          <div
            :class="[
              'w-2 h-2 rounded-full relative',
              isConnected ? 'bg-green-400' : 'bg-amber-400 animate-pulse-subtle'
            ]"
          >
            <div
              v-if="isConnected"
              class="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75"
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

    <!-- Anonymous / unauthenticated notice -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="collabBlocked && !bannerDismissed"
        class="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-3 text-sm text-amber-300 z-20"
        role="status"
      >
        <div class="flex items-center gap-2 min-w-0">
          <Icon name="mdi:account-lock-outline" class="w-4 h-4 flex-shrink-0" />
          <span class="truncate">
            You're viewing this whiteboard without an account, so real-time collaboration is off.
            <NuxtLink to="/login" class="underline font-medium hover:text-amber-200">Log in</NuxtLink>
            or open a <span class="font-medium">Share link</span> (Share button → create link) to collaborate live.
          </span>
        </div>
        <button
          class="p-1 rounded hover:bg-amber-500/20 flex-shrink-0"
          title="Dismiss"
          aria-label="Dismiss notice"
          @click="bannerDismissed = true"
        >
          <Icon name="mdi:close" class="w-4 h-4" />
        </button>
      </div>
    </Transition>

    <!-- Main Content -->
    <div class="flex-1 flex relative overflow-hidden">
      <!-- Layer Panel (between toolbar and canvas) -->
      <ClientOnly>
        <LayerPanel
          :show="showLayerPanel"
          :layers="layerList"
          :active-layer-id="activeLayerId"
          @close="showLayerPanel = false"
          @set-active="handleSetActiveLayer"
          @toggle-visibility="handleToggleLayerVisibility"
          @toggle-lock="handleToggleLayerLock"
          @set-color="handleSetLayerColor"
          @remove="handleRemoveLayer"
          @add="handleAddLayer"
          @rename="handleRenameLayer"
        />
      </ClientOnly>

      <!-- Toolbar (responsive - handles desktop/mobile display internally) -->
      <WhiteboardToolbar
        :current-tool="currentTool"
        :current-color="currentColor"
        :current-size="currentSize"
        :can-undo="canUndo"
        :can-redo="canRedo"
        :is-exporting="isExporting"
        :export-progress="exportProgress"
        :layers="layerList"
        :active-layer-id="activeLayerId"
        :ortho-enabled="orthoEnabled"
        :polar-enabled="polarTrackingActive"
        :grid-enabled="gridEnabled"
        :snap-enabled="snapEnabled"
        @select-tool="setTool"
        @select-color="setColor"
        @select-size="setSize"
        @stamp-type-change="handleStampTypeChange"
        @undo="undo"
        @redo="redo"
        @clear="clearCanvas"
        @open-export="openExportDialog"
        @set-active-layer="handleSetActiveLayer"
        @add-layer="handleAddLayer"
        @toggle-ortho="toggleOrtho"
        @toggle-polar="togglePolarTracking"
        @toggle-grid="toggleGridFromToolbar"
        @toggle-snap="toggleSnapFromToolbar"
      />

      <!-- Canvas Area -->
      <main class="flex-1 relative overflow-hidden pb-16 md:pb-0 flex flex-col">
        <div class="flex-1 relative min-h-0">
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
              :hidden-layer-ids="hiddenLayerIds"
              :active-layer-id="activeLayerId"
              :active-strokes="activeStrokes"
              :start-active-stroke="startActiveStroke"
              :broadcast-stroke-point="broadcastStrokePoint"
              :end-active-stroke="endActiveStroke"
              :cancel-active-stroke="cancelActiveStroke"
              :get-viewport="(canvasInstance as any)?.getViewport"
              :sync-viewport="(canvasInstance as any)?.syncViewport"
              :observe-viewport="(canvasInstance as any)?.observeViewport"
              :y-document-layers="(canvasInstance as any)?.yDocumentLayers"
              :add-document-layer="(canvasInstance as any)?.addDocumentLayer"
              :measurement-unit="measurementUnit"
              :update-document-layer="(canvasInstance as any)?.updateDocumentLayer"
              :remove-document-layer="(canvasInstance as any)?.removeDocumentLayer"
              @element-add="(element) => canvasInstance?.addElement?.(element)"
              @element-delete="handleDeleteElement"
              @element-update="(id, updates) => canvasInstance?.updateElement?.(id, updates)"
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
            v-if="scaleInstance && !showLayerPanel"
            :display-format="scaleDisplayFormat"
            :current-scale="currentScaleValue"
            @open-scale-dialog="showScalePalette = true"
          />
        </ClientOnly>

        <!-- Coordinate Display -->
        <ClientOnly>
          <CoordinateDisplay
            :x="cursorPosition.x"
            :y="cursorPosition.y"
            :distance="cursorDistance"
            :angle="cursorAngle"
            :ortho-enabled="orthoEnabled"
            :polar-enabled="polarTrackingActive"
          />
          <button
            class="px-1.5 py-1 text-[10px] font-mono rounded hover:bg-neutral-700 transition-colors text-neutral-400 hover:text-neutral-200 flex-shrink-0"
            :title="'Toggle units'"
            @click="toggleUnit"
          >
            {{ measurementUnit === 'inches' ? 'in' : 'ft' }}
          </button>
        </ClientOnly>
        </div>

        <!-- Command Line -->
        <ClientOnly>
          <CommandLine
            :visible="true"
            :output-lines="commandOutputLines"
            :execute="executeCommand"
            :cancel-pending="cancelCommandPending"
            :get-completions="getCommandCompletions"
            :is-waiting-for-param="commandWaitingForParam"
            :pending-prompt="commandPendingPrompt"
          />
        </ClientOnly>
      </main>
    </div>

    <!-- Share Modal -->
    <WhiteboardShareModal
      :show="showShareModal"
      :whiteboard-id="whiteboardId"
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

    <!-- Clear Canvas Confirmation -->
    <ClientOnly>
      <ConfirmDialog
        :show="showClearConfirm"
        title="Clear Canvas"
        message="Are you sure you want to clear the canvas? This cannot be undone."
        confirm-text="Clear"
        :destructive="true"
        @confirm="confirmClearCanvas"
        @cancel="showClearConfirm = false"
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
import type { StampType } from '~/composables/tools/useStampTool'
import ExportDialog from '~/components/whiteboard/ExportDialog.vue'
import WhiteboardShareModal from '~/components/whiteboard/WhiteboardShareModal.vue'
import UserPresenceList from '~/components/whiteboard/UserPresenceList.vue'
import ScaleBadge from '~/components/whiteboard/ScaleBadge.vue'
import ScaleToolPalette from '~/components/whiteboard/ScaleToolPalette.vue'
import KeyboardShortcutsModal from '~/components/whiteboard/KeyboardShortcutsModal.vue'
import ConfirmDialog from '~/components/whiteboard/ConfirmDialog.vue'
import CommandLine from '~/components/whiteboard/CommandLine.vue'
import CoordinateDisplay from '~/components/whiteboard/CoordinateDisplay.vue'
import LayerPanel from '~/components/whiteboard/LayerPanel.vue'
import { toastSuccess, toastError } from '~/composables/useToast'
import { useCommandEngine } from '~/composables/useCommandEngine'
import { useLayers } from '~/composables/useLayers'
import { usePDFRendering } from '~/composables/usePDFRendering'
import { useSaveState } from '~/composables/useSaveState'

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
const { $api } = useApi()
const whiteboardData = ref<ApiResponse<Whiteboard> | null>(null)
const whiteboardLoading = ref(true)
const whiteboard = computed(() => whiteboardData.value?.data)

onMounted(async () => {
  try {
    whiteboardData.value = await $api<ApiResponse<Whiteboard>>(`/api/whiteboards/${whiteboardId}`)
    if (!whiteboardData.value?.success && !whiteboardData.value?.data) {
      throw createError({ statusCode: 404, statusMessage: 'Whiteboard not found' })
    }
  } catch (e) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Whiteboard not found',
      message: 'The whiteboard you are looking for does not exist or has been deleted.',
      fatal: true,
    })
  } finally {
    whiteboardLoading.value = false
  }
})

// Share links are managed in WhiteboardShareModal (per-link /s/{token}).

// Modal states
const showShareModal = ref(false)
const showUploadModal = ref(false)
const showExportDialog = ref(false)
const showScalePalette = ref(false)
const showKeyboardShortcuts = ref(false)
const showClearConfirm = ref(false)
const showLayerPanel = ref(false)

// Layer state
const layerInstance = ref<ReturnType<typeof useLayers> | null>(null)
const layerList = computed(() => {
  const inst = layerInstance.value
  return inst ? inst.sortedLayers : []
})
const activeLayerId = computed(() => {
  const inst = layerInstance.value
  return inst ? inst.activeLayerId : 'default'
})
const hiddenLayerIds = computed(() => {
  const inst = layerInstance.value
  return inst ? inst.hiddenLayerIds : new Set<string>()
})

// Inline rename state
const isEditingName = ref(false)
const editNameValue = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

function startNameEdit() {
  if (!whiteboard.value) return
  editNameValue.value = whiteboard.value.name
  isEditingName.value = true
  nextTick(() => {
    nameInput.value?.focus()
    nameInput.value?.select()
  })
}

async function saveName() {
  if (!isEditingName.value) return
  const name = editNameValue.value.trim()
  if (!name || name === whiteboard.value?.name) {
    cancelNameEdit()
    return
  }
  try {
    await $api(`/api/whiteboards/${whiteboardId}`, {
      method: 'PATCH',
      body: { name },
    })
    if (whiteboardData.value?.data) {
      whiteboardData.value.data.name = name
    }
    toastSuccess('Whiteboard renamed')
  } catch {
    toastError('Failed to rename')
  }
  isEditingName.value = false
}

function cancelNameEdit() {
  isEditingName.value = false
  editNameValue.value = ''
}

// Measurement unit (shared with canvas through props)
const measurementUnit = ref<'inches' | 'feet'>('inches')
function toggleUnit() {
  measurementUnit.value = measurementUnit.value === 'inches' ? 'feet' : 'inches'
}

// Scale state
const scaleInstance = ref<ReturnType<typeof useScale> | null>(null)
const currentScaleValue = ref<any>(null)
const scaleDisplayFormat = ref<string>('No scale set')

// Canvas state refs (computed - derived from canvasInstance)
const instance = computed(() => canvasInstance.value)
const isConnected = computed(() => {
  const inst = instance.value
  return inst ? !!inst.isConnected : false
})
const connectionStatus = computed(() => {
  const inst = instance.value
  return inst ? (inst.connectionStatus || 'disconnected') : 'disconnected'
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
  return inst ? !!inst.canUndo : false
})
const canRedo = computed(() => {
  const inst = instance.value
  return inst ? !!inst.canRedo : false
})
const activeStrokes = computed(() => {
  const inst = instance.value
  return inst ? inst.activeStrokes : {}
})

// Anonymous/unauth notice — the WS relay rejected us with 4001 (no valid
// session or share token). Reconnect is stopped, so this explains why real-time
// collaboration is off and how to enable it.
const collabBlocked = computed(() => {
  const inst = instance.value
  return inst ? (inst.authRejected === true) : false
})
const bannerDismissed = ref(false)

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
const cancelActiveStroke = computed(() => canvasInstance.value?.cancelActiveStroke)

// Export functionality
const { isExporting, progress: exportProgress, exportAsPNG, exportAsPDF } = useExport()

// Ortho mode — synced with canvas via exposed ref
const orthoEnabled = ref(false)

function toggleOrtho() {
  const canvas = canvasRef.value as any
  if (canvas?.toggleOrtho) {
    canvas.toggleOrtho()
  }
  // Read the current state (defineExpose unwraps refs, so no .value needed)
  syncCanvasState()
}

// Polar tracking — synced with canvas
const polarTrackingActive = ref(false)

function togglePolarTracking() {
  const canvas = canvasRef.value as any
  if (canvas?.polarTracking) {
    canvas.polarTracking.toggle()
  }
  syncCanvasState()
}

function syncCanvasState() {
  const canvas = canvasRef.value as any
  // defineExpose unwraps refs — access directly without .value
  if (canvas?.orthoEnabled !== undefined) {
    orthoEnabled.value = !!canvas.orthoEnabled
  }
  if (canvas?.polarTracking?.isPolarEnabled !== undefined) {
    polarTrackingActive.value = !!canvas.polarTracking.isPolarEnabled
  }
  if (canvas?.gridEnabled !== undefined) {
    gridEnabled.value = !!canvas.gridEnabled
  }
  if (canvas?.snapEnabled !== undefined) {
    snapEnabled.value = !!canvas.snapEnabled
  }
}

// Grid and snap mode — synced with canvas
const gridEnabled = ref(false)
const snapEnabled = ref(true)

function toggleGridFromToolbar() {
  const canvas = canvasRef.value as any
  if (canvas?.toggleGrid) {
    canvas.toggleGrid()
  }
  syncCanvasState()
}

function toggleSnapFromToolbar() {
  const canvas = canvasRef.value as any
  if (canvas?.toggleSnap) {
    canvas.toggleSnap()
  }
  syncCanvasState()
}

// Cursor position tracking for coordinate display
const cursorPosition = ref({ x: 0, y: 0 })
const cursorDistance = ref<number | null>(null)
const cursorAngle = ref<number | null>(null)
const lastClickPosition = ref<{ x: number; y: number } | null>(null)

// Command engine
const {
  outputLines: commandOutputLines,
  isWaitingForParam: commandWaitingForParam,
  pendingPrompt: commandPendingPrompt,
  execute: executeCommand,
  cancelPending: cancelCommandPending,
  getCompletions: getCommandCompletions,
  output: commandOutput,
} = useCommandEngine({
  setActiveTool: (tool) => { currentTool.value = tool },
  toggleGrid: () => {
    const canvas = canvasRef.value as any
    if (canvas?.toggleGrid) {
      canvas.toggleGrid()
      commandOutput(canvas.gridEnabled ? 'GRID: ON' : 'GRID: OFF')
    }
  },
  toggleGridSnap: () => {
    const canvas = canvasRef.value as any
    if (canvas?.toggleGridSnap) {
      canvas.toggleGridSnap()
      commandOutput(canvas.gridSnapEnabled ? 'GRID SNAP: ON' : 'GRID SNAP: OFF')
    }
  },
  toggleOrtho: () => { toggleOrtho(); commandOutput(orthoEnabled.value ? 'ORTHO: ON' : 'ORTHO: OFF') },
  togglePolarTracking: () => { togglePolarTracking(); commandOutput(polarTrackingActive.value ? 'POLAR: ON' : 'POLAR: OFF') },
  toggleSnap: () => {
    const canvas = canvasRef.value as any
    if (canvas?.toggleSnap) {
      canvas.toggleSnap()
      commandOutput(canvas.snapEnabled ? 'OSNAP: ON' : 'OSNAP: OFF')
    }
  },
  undo: () => { canvasInstance.value?.undo?.() },
  redo: () => { canvasInstance.value?.redo?.() },
  applyDirectDistance: (dist: number) => {
    const canvas = canvasRef.value as any
    // Convert from inches to pixels (96 ppi default)
    const pixelsPerInch = 96
    const pixelDist = dist * pixelsPerInch
    return canvas?.applyDirectDistance?.(pixelDist) ?? false
  },
  isDrawing: () => {
    const canvas = canvasRef.value as any
    // defineExpose unwraps refs — isDrawing is a boolean, not a ref
    return !!canvas?.isDrawing
  },
  setFilletRadiusIfActive: (n: number) => {
    const canvas = canvasRef.value as any
    return canvas?.setFilletRadiusIfActive?.(n) ?? false
  },
})

// Cursor tracking state from WhiteboardCanvas's useCursors
const currentUserFromCanvas = ref<{ id: string; name: string; color: string }>({
  id: currentUser.id,
  name: currentUser.name,
  color: '',
})
const remoteCursors = ref<Map<number, any>>(new Map())

// Initialize canvas on client side
onMounted(() => {
  // One-time share token handed over by the /s/{token} redirect. Stash it in
  // sessionStorage for the WS handshake (?share=) then scrub it from the URL.
  const shareParam = (route.query as any).share as string | undefined
  if (shareParam) {
    try {
      sessionStorage.setItem('vp_share_token', shareParam)
    } catch { /* ignore storage errors */ }
    const clean = window.location.href.replace(/[?&]share=[^&]+/, '').replace(/\?$/, '')
    window.history.replaceState(null, '', clean)
  }

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

      // Initialize layer system
      const layers = useLayers(yMeta, ydoc, currentUser.id)
      layers.observeLayers()
      layerInstance.value = layers

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

  // Sync canvas constraint state (ortho/polar) periodically
  const syncInterval = setInterval(() => syncCanvasState(), 500)
  onUnmounted(() => clearInterval(syncInterval))
})

// Watch for whiteboard data loaded — import canvas state and re-render PDF layers
watch(whiteboardData, (data) => {
  if (!canvasInstance.value) return
  if (data?.data?.canvas_state) {
    canvasInstance.value.importState(data.data.canvas_state)
    // Initial load from API — don't mark as dirty (the import triggers
    // the elements watcher, but there's nothing new to save).
    nextTick(() => {
      dirty = false
      saveState.reset()
    })
  }

  // Re-render PDF document layers that need rendering
  const allLayers = canvasInstance.value.getDocumentLayers()
  const pendingLayers = allLayers.filter((l: any) => l.needsRender)
  if (allLayers.length) console.log('[pdf-render] document layers loaded:', allLayers.length, 'pending:', pendingLayers.length)
  if (pendingLayers.length === 0) return

  const { loadPDFDocument, renderPageToImage, cleanupPDFDocument } = usePDFRendering()
  pendingLayers.forEach(async (layer: any) => {
    try {
      const fileId = layer.fileId
      const config = useRuntimeConfig()
      const laravelUrl = (config.public.laravelUrl as string) || 'http://localhost:8000'
      const serveUrl = `${laravelUrl}/api/files/${fileId}/serve`
      const fileResponse = await fetch(serveUrl)
      if (!fileResponse.ok) return
      const arrayBuffer = await fileResponse.arrayBuffer()
      const pdfDocument = await loadPDFDocument(arrayBuffer)
      const pageNum = layer.pageNumber || 1
      const page = await pdfDocument.getPage(pageNum)
      const dataUrl = await renderPageToImage(page, { scale: 1.5 })
      const viewport = page.getViewport({ scale: 1.5 })
      canvasInstance.value?.updateDocumentLayer(layer.id, {
        src: dataUrl,
        width: viewport.width,
        height: viewport.height,
        needsRender: false,
      })
      cleanupPDFDocument(pdfDocument)
    } catch (e) {
      console.warn('[pdf-render] failed to re-render layer', layer.id, e)
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

// Auto-save canvas state periodically (client-side only to avoid SSR error)
const saveInterval = ref<ReturnType<typeof setInterval> | null>(null)
let saveInProgress = false
let dirty = false

// Save-state indicator — pure state machine driving the header badge. It is
// passive: it only reflects the existing auto-save flow (it never triggers
// saves or changes the cadence).
const saveState = useSaveState()

const saveStateVisuals = computed(() => {
  const visuals = {
    saving: {
      text: 'Saving…',
      icon: 'mdi:loading',
      iconSpin: true,
      classes: 'bg-blue-900/50 text-blue-400 border border-blue-700',
    },
    saved: {
      text: 'Saved',
      icon: 'mdi:check-circle',
      iconSpin: false,
      classes: 'bg-green-900/50 text-green-400 border border-green-700',
    },
    offline: {
      text: `Offline – retrying (${saveState.retryCount.value})`,
      icon: 'mdi:alert-circle',
      iconSpin: false,
      classes: 'bg-red-900/50 text-red-400 border border-red-700',
    },
  }
  return visuals[saveState.state.value]
})

const saveStateTitle = computed(() => {
  const lastFailed = saveState.lastFailedAt.value
  if (saveState.state.value === 'offline' && lastFailed !== null) {
    return `Last save failed at ${new Date(lastFailed).toLocaleTimeString()} — retrying automatically`
  }
  if (saveState.state.value === 'saving') return 'Saving your changes…'
  return 'All changes saved'
})

async function saveCanvasState() {
  const instance = canvasInstance.value
  if (!instance || saveInProgress) return

  // Skip save if nothing changed since the last save
  if (!dirty) return

  saveInProgress = true
  saveState.onSaveStart()
  try {
    const state = instance.exportState()
    await $api(`/api/whiteboards/${whiteboardId}`, {
      method: 'PATCH',
      body: { canvas_state: state },
    })
    dirty = false
    saveState.onSaveSuccess()
  } catch (e) {
    console.warn('[auto-save] failed to persist canvas state:', e)
    saveState.onSaveFailure()
  } finally {
    saveInProgress = false
  }
}

onMounted(() => {
  saveInterval.value = setInterval(saveCanvasState, 30000)

  // Debounced save on every elements change — catches edits between
  // the 30s timer ticks, so a quick draw+reload is always persisted.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => canvasInstance.value?.elements,
    () => {
      dirty = true
      saveState.markDirty()
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(saveCanvasState, 2000)
    },
    { deep: true },
  )

  // Also mark dirty when document layers change (PDF/image uploads)
  // so auto-save persists them within the next 30s interval tick.
  const docLayers = canvasInstance.value?.yDocumentLayers
  if (docLayers) {
    const onDocLayersChange = () => {
      dirty = true
      saveState.markDirty()
    }
    docLayers.observe(onDocLayersChange)
    onUnmounted(() => { docLayers.unobserve(onDocLayersChange) })
  }
})

onUnmounted(() => {
  if (saveInterval.value !== null) clearInterval(saveInterval.value)

  // Capture state synchronously before Yjs doc is destroyed.
  // Use fetch + keepalive so the request survives page unload/tab close
  // (navigator.sendBeacon only supports POST, but keepalive fetch allows PATCH).
  const state = canvasInstance.value?.exportState()
  if (state) {
    try {
      // Read XSRF token from cookie — same pattern as $api helper.
      // Required by Laravel Sanctum for stateful PATCH requests.
      let xsrfHeader: Record<string, string> = {}
      if (import.meta.client) {
        const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/)
        if (match && match[1]) {
          xsrfHeader['X-XSRF-TOKEN'] = decodeURIComponent(match[1])
        }
      }
      const config = useRuntimeConfig()
      const laravelUrl = (config.public.laravelUrl as string) || 'http://localhost:8000'
      fetch(`${laravelUrl}/api/whiteboards/${whiteboardId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...xsrfHeader,
        },
        body: JSON.stringify({ canvas_state: state }),
        credentials: 'include' as RequestCredentials,
        keepalive: true,
      })
    } catch { /* fire-and-forget */ }
  }

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
  const canvas = canvasRef.value as any

  if (!canvas) {
    console.error('Canvas not available')
    showUploadModal.value = false
    return
  }

  const laravelUrl = (useRuntimeConfig().public.laravelUrl as string) || 'http://localhost:8000'
  const serveUrl = `${laravelUrl}/api/files/${result.fileId}/serve`

  try {
    if (fileType === 'application/pdf') {
      const response = await fetch(serveUrl)
      const arrayBuffer = await response.arrayBuffer()
      await canvas.addPDFLayer(
        { id: result.fileId, url: serveUrl, name: result.fileName },
        arrayBuffer
      )
    } else if (fileType.startsWith('image/')) {
      await canvas.addImageLayer({
        id: result.fileId,
        url: serveUrl,
        name: result.fileName,
      })
    }
  } catch (error) {
    console.error('Failed to add file to canvas:', error)
  }

  showUploadModal.value = false
}

function handleUploadError(error: any) {
  console.error('Upload error:', error)
}

function handleStampTypeChange(stampType: StampType) {
  currentStampType.value = stampType
  setTool('stamp')
}

function undo() {
  canvasInstance.value?.undo()
}

function redo() {
  canvasInstance.value?.redo()
}

function clearCanvas() {
  showClearConfirm.value = true
}

function confirmClearCanvas() {
  showClearConfirm.value = false
  canvasInstance.value?.clearCanvas()
}

function handleDeleteElement(elementId: string) {
  canvasInstance.value?.deleteElement(elementId)
}

// Layer handlers
function handleSetActiveLayer(layerId: string) {
  layerInstance.value?.setActiveLayer(layerId)
}

function handleToggleLayerVisibility(layerId: string) {
  layerInstance.value?.toggleLayerVisibility(layerId)
}

function handleToggleLayerLock(layerId: string) {
  layerInstance.value?.toggleLayerLock(layerId)
}

function handleSetLayerColor(layerId: string, color: string) {
  layerInstance.value?.setLayerColor(layerId, color)
}

function handleRemoveLayer(layerId: string) {
  layerInstance.value?.removeLayer(layerId)
}

function handleAddLayer() {
  layerInstance.value?.addLayer()
}

function handleRenameLayer(layerId: string, name: string) {
  layerInstance.value?.renameLayer(layerId, name)
}

function updateCursor(x: number, y: number) {
  canvasInstance.value?.updateCursor(x, y)
  cursorPosition.value = { x, y }
  if (lastClickPosition.value) {
    const dx = x - lastClickPosition.value.x
    const dy = y - lastClickPosition.value.y
    cursorDistance.value = Math.sqrt(dx * dx + dy * dy)
    cursorAngle.value = Math.atan2(-dy, dx) * (180 / Math.PI)
  }
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
    // F8 for ortho toggle (works even when input focused)
    if (e.key === 'F8') {
      e.preventDefault()
      toggleOrtho()
      return
    }

    // F10 for polar tracking toggle
    if (e.key === 'F10') {
      e.preventDefault()
      togglePolarTracking()
      commandOutput(polarTrackingActive.value ? 'POLAR: ON' : 'POLAR: OFF')
      return
    }

    // F7 for grid toggle
    if (e.key === 'F7') {
      e.preventDefault()
      const canvas = canvasRef.value as any
      if (canvas?.toggleGrid) {
        canvas.toggleGrid()
        commandOutput(canvas.gridEnabled ? 'GRID: ON' : 'GRID: OFF')
      }
      return
    }

    // F9 for grid snap toggle
    if (e.key === 'F9') {
      e.preventDefault()
      const canvas = canvasRef.value as any
      if (canvas?.toggleGridSnap) {
        canvas.toggleGridSnap()
        commandOutput(canvas.gridSnapEnabled ? 'GRID SNAP: ON' : 'GRID SNAP: OFF')
      }
      return
    }

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
        case 'B':
          setTool('highlighter')
          break
        case 'L':
          setTool('line')
          break
        case 'K':
          showLayerPanel.value = !showLayerPanel.value
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
          if (e.shiftKey) {
            setTool('measure-area')
          } else {
            setTool('measure-distance')
          }
          break
        case 'S':
          setTool('stamp')
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
