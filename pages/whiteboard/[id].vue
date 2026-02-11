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
      <!-- Left Sidebar - Tools -->
      <aside class="w-16 bg-white border-r border-neutral-200 flex flex-col items-center py-4 gap-2">
        <WhiteboardToolbar
          :current-tool="currentTool"
          :current-color="currentColor"
          :current-size="currentSize"
          :can-undo="canUndo"
          :can-redo="canRedo"
          @select-tool="setTool"
          @select-color="setColor"
          @select-size="setSize"
          @stamp-type-change="handleStampTypeChange"
          @undo="undo"
          @redo="redo"
          @clear="clearCanvas"
          @export="exportCanvas"
        />
      </aside>

      <!-- Canvas Area -->
      <main class="flex-1 relative overflow-hidden">
        <ClientOnly>
          <WhiteboardCanvas
            ref="canvasRef"
            :whiteboard-id="whiteboardId"
            :user-id="currentUser.id"
            :user-name="currentUser.name"
            :elements="elements"
            :connected-users="connectedUsers"
            :current-tool="currentTool"
            :current-color="currentColor"
            :current-size="currentSize"
            :current-stamp-type="currentStampType"
            @element-add="addElement"
            @cursor-update="updateCursor"
          />
          <template #fallback>
            <div class="flex items-center justify-center h-full">
              <div class="text-center">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p class="text-neutral-600">Loading whiteboard...</p>
              </div>
            </div>
          </template>
        </ClientOnly>

        <!-- User List Overlay -->
        <div class="absolute top-4 right-4 z-10">
          <ClientOnly>
            <WhiteboardUserList :users="connectedUsers" />
            <template #fallback>
              <div class="bg-white rounded-lg shadow-sm border border-neutral-200 p-3">
                <div class="text-sm text-neutral-400">Loading users...</div>
              </div>
            </template>
          </ClientOnly>
        </div>
      </main>
    </div>

    <!-- Share Modal -->
    <div v-if="showShareModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showShareModal = false">
      <div class="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-semibold">Share Whiteboard</h2>
          <button @click="showShareModal = false" class="text-neutral-500 hover:text-neutral-700">
            <Icon name="mdi:close" class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-neutral-700 mb-2">
              Share Link
            </label>
            <div class="flex gap-2">
              <input
                :value="shareUrl"
                readonly
                class="input flex-1"
              />
              <button
                @click="copyShareLink"
                class="btn-primary"
              >
                <Icon name="mdi:content-copy" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div class="p-3 bg-blue-50 text-blue-700 text-sm rounded-lg">
            <Icon name="mdi:information" class="w-4 h-4 inline mr-1" />
            Anyone with this link can view and edit the whiteboard.
          </div>
        </div>
      </div>
    </div>

    <!-- Upload Modal -->
    <div v-if="showUploadModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showUploadModal = false">
      <div class="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full mx-4">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-semibold">Upload File</h2>
          <button @click="showUploadModal = false" class="text-neutral-500 hover:text-neutral-700">
            <Icon name="mdi:close" class="w-5 h-5" />
          </button>
        </div>

        <WhiteboardUpload
          :whiteboard-id="whiteboardId"
          @upload-success="handleUploadSuccess"
          @upload-error="handleUploadError"
        />

        <div class="mt-4 flex justify-end">
          <button @click="showUploadModal = false" class="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Whiteboard, CanvasElement, UploadResult } from '~/types'
import type { StampType } from '~/components/whiteboard/WhiteboardCanvas.vue'

const route = useRoute()
const whiteboardId = route.params.id as string

// Create user info (simple object, not a function)
const currentUser = {
  id: `user-${Math.random().toString(36).substring(2, 9)}`,
  name: 'Guest',
}

// Initialize collaborative canvas (only on client)
let canvas: ReturnType<typeof useCollaborativeCanvas> | null = null

// Tool state
const currentTool = ref<'select' | 'pan' | 'pen' | 'highlighter' | 'line' | 'arrow' | 'rectangle' | 'circle' | 'ellipse' | 'text-annotation' | 'stamp' | 'eraser'>('pen')
const currentColor = ref('#000000')
const currentSize = ref(4)
const currentStampType = ref<StampType>('APPROVED')

// UI state
const showShareModal = ref(false)
const showUploadModal = ref(false)
const canvasRef = ref<InstanceType<typeof WhiteboardCanvas> | null>(null)

// Fetch whiteboard data
const { data: whiteboardData } = await useFetch<ApiResponse<Whiteboard>>(`/api/whiteboard/${whiteboardId}`)
const whiteboard = computed(() => whiteboardData.value?.data)

// Share URL
const shareUrl = computed(() => {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl as string
  return `${baseUrl}/whiteboard/${whiteboardId}`
})

// Canvas state (initialized on client mount)
const isConnected = ref(false)
const connectionStatus = ref('disconnected')
const connectedUsers = ref<Map<string, any>>(new Map())
const elements = ref<CanvasElement[]>([])
const canUndo = ref(false)
const canRedo = ref(false)

// Initialize canvas on client side
onMounted(() => {
  canvas = useCollaborativeCanvas(
    whiteboardId,
    currentUser.id,
    currentUser.name
  )

  // Set up reactive bindings to composable
  isConnected.value = canvas.isConnected.value
  connectionStatus.value = canvas.connectionStatus.value
  connectedUsers.value = canvas.connectedUsers.value
  elements.value = canvas.elements.value
  canUndo.value = canvas.canUndo.value
  canRedo.value = canvas.canRedo.value

  // Watch for updates
  watch(() => canvas.isConnected.value, (v) => { isConnected.value = v })
  watch(() => canvas.connectionStatus.value, (v) => { connectionStatus.value = v })
  watch(() => canvas.connectedUsers.value, (v) => { connectedUsers.value = v })
  watch(() => canvas.elements.value, (v) => { elements.value = v })
  watch(() => canvas.canUndo.value, (v) => { canUndo.value = v })
  watch(() => canvas.canRedo.value, (v) => { canRedo.value = v })

  // Load saved canvas state
  if (whiteboard.value?.canvas_state) {
    canvas.importState(whiteboard.value.canvas_state)
  }

  // Auto-save canvas state periodically
  const saveInterval = setInterval(() => {
    if (canvas && canvas.isConnected.value) {
      const state = canvas.exportState()
      $fetch(`/api/whiteboard/${whiteboardId}`, {
        method: 'PATCH',
        body: { canvas_state: state },
      })
    }
  }, 30000)

  onUnmounted(() => {
    clearInterval(saveInterval)
    if (canvas) canvas.cleanup()
  })
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

function handleStampTypeChange(stampType: StampType) {
  currentStampType.value = stampType
}

// Canvas handlers
function addElement(element: CanvasElement) {
  if (canvas) canvas.addElement(element)
}

function updateCursor(x: number, y: number) {
  if (canvas) canvas.updateCursor(x, y, currentTool.value)
}

function undo() {
  if (canvas) canvas.undo()
}

function redo() {
  if (canvas) canvas.redo()
}

function clearCanvas() {
  if (confirm('Are you sure you want to clear the canvas? This cannot be undone.')) {
    if (canvas) canvas.clearCanvas()
  }
}

function exportCanvas(format: 'png' | 'pdf') {
  if (format === 'png' && canvasRef.value) {
    const dataUrl = canvasRef.value.exportAsImage()
    if (dataUrl) {
      const link = document.createElement('a')
      link.download = `${whiteboard.value?.name || 'whiteboard'}.png`
      link.href = dataUrl
      link.click()
    }
  }
}

function copyShareLink() {
  navigator.clipboard.writeText(shareUrl.value)
}

async function handleUploadSuccess(result: UploadResult) {
  if (!canvasRef.value) return

  try {
    const fileType = result.fileRecord?.file_type || ''

    if (fileType === 'application/pdf') {
      // For PDFs, fetch as ArrayBuffer and use addPDFLayer
      const response = await fetch(result.url)
      const arrayBuffer = await response.arrayBuffer()

      const element = await canvasRef.value.addPDFLayer({
        id: result.fileId,
        url: result.url,
        name: result.fileName,
      }, arrayBuffer)

      if (element && canvas) canvas.addElement(element)
    } else {
      // For images, use addImageLayer directly
      const element = await canvasRef.value.addImageLayer({
        id: result.fileId,
        url: result.url,
        name: result.fileName,
      })

      if (element && canvas) canvas.addElement(element)
    }

    // Close the upload modal on success
    showUploadModal.value = false
  } catch (error) {
    console.error('Failed to render document:', error)
    // Optionally show error notification to user
  }
}

function handleUploadError(error: string) {
  console.error('Upload error:', error)
  // Optionally show error notification to user
}

// Keyboard shortcuts
onMounted(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Check not typing in input
    const activeTag = document.activeElement?.tagName
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
      return
    }

    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    }
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.key === 'z' && e.shiftKey)) {
      e.preventDefault()
      redo()
    }
    if (e.key === 'Escape') {
      setTool('select')
    }
    // Tool shortcuts
    if (e.key === 'l' || e.key === 'L') {
      setTool('line')
    }
    if (e.key === 'a' || e.key === 'A') {
      setTool('arrow')
    }
    if (e.key === 's' || e.key === 'S') {
      setTool('stamp')
    }
    if (e.key === 'r' || e.key === 'R') {
      setTool('rectangle')
    }
    if (e.key === 'c' || e.key === 'C') {
      setTool('circle')
    }
    if (e.key === 'e' || e.key === 'E') {
      setTool('ellipse')
    }
    if (e.key === 't' || e.key === 'T') {
      setTool('text-annotation')
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })
})

// SEO
useHead({
  title: computed(() => whiteboard.value?.name || 'Whiteboard'),
})
</script>
