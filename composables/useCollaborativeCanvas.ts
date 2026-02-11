import * as Y from 'yjs'
import type { CanvasElement, UserPresence, DrawingTool, ViewportState, SharedViewportState } from '~/types'

export function useCollaborativeCanvas(whiteboardId: string, userId: string, userName: string) {
  const config = useRuntimeConfig()
  const wsUrl = config.public.wsUrl as string

  // Initialize Yjs document
  const ydoc = new Y.Doc()

  // For testing: Use local storage to persist state
  // In production with proper WebSocket server, WebsocketProvider would be used here
  let wsProvider: any = null

  // Try to connect to WebSocket server (will fail gracefully if not available)
  try {
    const { WebsocketProvider } = require('y-websocket')
    wsProvider = new WebsocketProvider(
      wsUrl,
      `whiteboard:${whiteboardId}`,
      ydoc,
      {
        connect: true,
        params: {
          userId,
          userName,
        },
        // Configure for instant retry - minimize backoff
        // Note: y-websocket uses internal backoff, we override below
      }
    )

    // Configure instant retry reconnection (override y-websocket default)
    // The default uses exponential backoff which we want to avoid
    if (wsProvider.wsconnecting) {
      const originalConnect = wsProvider.connect
      let reconnectAttempts = 0
      const maxReconnectAttempts = 1000 // Keep trying essentially forever
      const reconnectDelay = 100 // 100ms delay for instant retry

      // Override connection close handler for instant retry
      wsProvider.on('connection-close', () => {
        connectionStatus.value = 'disconnected'
        isConnected.value = false
        yCursors.delete(userId)

        // Instant retry - no exponential backoff
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++
          console.log(`[WebSocket] Instant reconnect... (attempt ${reconnectAttempts})`)

          // Try to reconnect immediately with small delay to prevent tight loop
          setTimeout(() => {
            if (!isConnected.value && wsProvider && !wsProvider.wsconnected) {
              originalConnect.call(wsProvider)
            }
          }, reconnectDelay)
        }
      })

      // Reset attempts on successful connect
      wsProvider.on('sync', () => {
        reconnectAttempts = 0
      })
    }
  } catch (e) {
    console.warn('WebSocket provider not available, running in local mode')
  }

  // Get shared data structures
  const yElements = ydoc.getArray<CanvasElement>('elements')
  const yCursors = ydoc.getMap<UserPresence>('cursors')
  const yMeta = ydoc.getMap<any>('meta')

  // Local state
  const isConnected = ref(wsProvider !== null)
  const connectionStatus = ref(wsProvider !== null ? 'connected' : 'disconnected')
  const currentUser = ref({ id: userId, name: userName, color: getUserColor(userId) })
  const connectedUsers = ref<Map<string, UserPresence>>(new Map())

  // Undo/redo manager
  const undoManager = new Y.UndoManager([yElements], {
    trackedOrigins: new Set([userId]),
  })

  // Watch connection status if provider exists
  if (wsProvider) {
    wsProvider.on('status', (event: { status: string }) => {
      connectionStatus.value = event.status as 'connecting' | 'connected' | 'disconnected'
      isConnected.value = event.status === 'connected'
    })

    // Watch for other users' cursors
    yCursors.observe((event) => {
      const users = new Map<string, UserPresence>()
      yCursors.forEach((presence, userId) => {
        // Only show active users (seen within last 30 seconds)
        if (Date.now() - presence.lastSeen < 30000) {
          users.set(userId, presence)
        }
      })
      connectedUsers.value = users
    })

    // Cleanup cursor for current user on disconnect
    wsProvider.on('connection-close', () => {
      yCursors.delete(userId)
    })
  }

  // Load from localStorage for persistence
  onMounted(() => {
    const savedState = localStorage.getItem(`whiteboard:${whiteboardId}`)
    if (savedState && yElements.length === 0) {
      try {
        const state = JSON.parse(savedState)
        importState(state)
      } catch (e) {
        console.error('Failed to load saved state:', e)
      }
    }
  })

  // Save to localStorage when elements change
  watch(() => yElements.toArray(), (elements) => {
    const state = exportState()
    localStorage.setItem(`whiteboard:${whiteboardId}`, JSON.stringify(state))
  }, { deep: true })

  // Update local cursor position
  function updateCursor(x: number, y: number, tool?: DrawingTool) {
    yCursors.set(userId, {
      id: userId,
      name: userName,
      color: getUserColor(userId),
      cursor: { x, y },
      tool,
      lastSeen: Date.now(),
    })
  }

  // Add element to canvas
  function addElement(element: CanvasElement) {
    ydoc.transact(() => {
      yElements.push([element])
    }, userId)
  }

  // Update element
  function updateElement(elementId: string, updates: Partial<CanvasElement>) {
    const index = yElements.toArray().findIndex(el => el.id === elementId)
    if (index !== -1) {
      ydoc.transact(() => {
        const current = yElements.get(index)!
        yElements.delete(index, 1)
        yElements.insert(index, [{ ...current, ...updates }])
      }, userId)
    }
  }

  // Delete element
  function deleteElement(elementId: string) {
    const index = yElements.toArray().findIndex(el => el.id === elementId)
    if (index !== -1) {
      ydoc.transact(() => {
        yElements.delete(index, 1)
      }, userId)
    }
  }

  // Clear all elements
  function clearCanvas() {
    ydoc.transact(() => {
      yElements.delete(0, yElements.length)
    }, userId)
  }

  // Undo
  function undo() {
    undoManager.undo()
  }

  // Redo
  function redo() {
    undoManager.redo()
  }

  // Get all elements
  function getElements(): CanvasElement[] {
    return yElements.toArray()
  }

  // Export canvas state
  function exportState() {
    return {
      version: yMeta.get('version') || 1,
      elements: getElements(),
    }
  }

  // Import canvas state (for initial load)
  function importState(state: { version: number; elements: CanvasElement[] }) {
    ydoc.transact(() => {
      yElements.delete(0, yElements.length)
      yElements.insert(0, state.elements)
      yMeta.set('version', state.version)
    }, 'import')
  }

  // Get current shared viewport state from yMeta
  function getViewport(): SharedViewportState {
    const stored = yMeta.get('viewport') as SharedViewportState | undefined
    return stored || { x: 0, y: 0, zoom: 1, lastUpdatedBy: '', timestamp: 0 }
  }

  // Sync local viewport changes to all connected users
  function syncViewport(viewport: ViewportState) {
    const stored = getViewport()
    // Only sync if viewport actually changed (avoid redundant updates)
    if (stored.x === viewport.x && stored.y === viewport.y && stored.zoom === viewport.zoom) {
      return
    }
    ydoc.transact(() => {
      yMeta.set('viewport', {
        ...viewport,
        lastUpdatedBy: userId,
        timestamp: Date.now(),
      })
    }, userId)
  }

  // Observe remote viewport changes from other users
  function observeViewport(callback: (viewport: SharedViewportState) => void): () => void {
    const handler = (event: Y.YMapEvent<any>) => {
      // Check if viewport key changed
      if (event.changes.keys.has('viewport')) {
        const viewport = yMeta.get('viewport') as SharedViewportState
        // Only apply remote changes (ignore own updates to prevent loop)
        if (viewport && viewport.lastUpdatedBy !== userId) {
          callback(viewport)
        }
      }
    }
    yMeta.observe(handler)
    // Return cleanup function
    return () => {
      yMeta.unobserve(handler)
    }
  }

  // Cleanup on unmount
  function cleanup() {
    yCursors.delete(userId)
    if (wsProvider) {
      wsProvider.disconnect()
    }
    undoManager.destroy()
    ydoc.destroy()
  }

  return {
    // State
    isConnected,
    connectionStatus,
    currentUser,
    connectedUsers,
    elements: computed(() => getElements()),
    canUndo: computed(() => undoManager.canUndo()),
    canRedo: computed(() => undoManager.canRedo()),

    // Methods
    updateCursor,
    addElement,
    updateElement,
    deleteElement,
    clearCanvas,
    undo,
    redo,
    exportState,
    importState,
    cleanup,

    // Viewport sync methods
    getViewport,
    syncViewport,
    observeViewport,

    // Raw instances for advanced usage
    ydoc,
    yElements,
    yMeta,
    wsProvider,
  }
}

// Helper: Get consistent color for user
function getUserColor(userId: string): string {
  const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899']
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}
