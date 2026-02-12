import * as Y from 'yjs'
import type { CanvasElement, UserPresence, DrawingTool, ViewportState, SharedViewportState } from '~/types'

/**
 * Exponential backoff configuration for WebSocket reconnection
 */
interface ReconnectConfig {
  baseDelay: number    // Starting delay in milliseconds (1000ms = 1 second)
  maxDelay: number     // Maximum delay in milliseconds (30000ms = 30 seconds)
  maxAttempts: number  // Maximum number of reconnection attempts
  jitter: boolean      // Add random jitter to prevent thundering herd
}

/**
 * Creates an exponential backoff controller for WebSocket reconnection.
 *
 * Benefits of exponential backoff:
 * - Reduces server load during outages by spacing out retry attempts
 * - Prevents tight retry loops that consume network bandwidth
 * - Allows time for network issues to be resolved
 * - Jitter prevents synchronized reconnection attempts from multiple clients
 *
 * @param config - Backoff configuration
 * @returns Object with nextDelay(), reset(), and shouldRetry() methods
 */
function createExponentialBackoff(config: ReconnectConfig) {
  let attempt = 0

  return {
    /**
     * Calculate the next delay using exponential backoff with optional jitter.
     * Pattern: min(baseDelay * 2^attempt, maxDelay) + jitter
     *
     * Progression (with baseDelay=1000ms, maxDelay=30000ms):
     * - Attempt 0: 1s (±250ms jitter)
     * - Attempt 1: 2s (±500ms jitter)
     * - Attempt 2: 4s (±1s jitter)
     * - Attempt 3: 8s (±2s jitter)
     * - Attempt 4: 16s (±4s jitter)
     * - Attempt 5+: 30s (±7.5s jitter, capped at max)
     *
     * @returns Delay in milliseconds before next reconnection attempt
     */
    nextDelay(): number {
      const exponential = Math.min(
        config.baseDelay * Math.pow(2, attempt),
        config.maxDelay
      )
      // Add jitter: +/- 25% of delay to prevent thundering herd
      const jitterAmount = config.jitter ? exponential * 0.25 : 0
      const jitter = (Math.random() - 0.5) * 2 * jitterAmount

      attempt++
      return Math.max(exponential + jitter, config.baseDelay)
    },

    /**
     * Reset the attempt counter to zero.
     * Call this when a successful connection is established.
     */
    reset(): void {
      attempt = 0
    },

    /**
     * Check if we should continue attempting reconnection.
     * @returns true if we haven't exceeded maxAttempts
     */
    shouldRetry(): boolean {
      return attempt < config.maxAttempts
    },

    /**
     * Get the current attempt number (1-indexed for display purposes)
     */
    getAttempt(): number {
      return attempt + 1
    },
  }
}

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
      }
    )

    // Configure exponential backoff reconnection (override y-websocket default)
    // Replaces instant retry with graceful backoff for better UX and reduced server load
    if (wsProvider.wsconnecting) {
      const originalConnect = wsProvider.connect
      const backoff = createExponentialBackoff({
        baseDelay: 1000,      // Start with 1 second
        maxDelay: 30000,      // Cap at 30 seconds
        maxAttempts: 100,     // Retry many times but not forever
        jitter: true,         // Add randomness to prevent thundering herd
      })

      // Override connection close handler for exponential backoff retry
      wsProvider.on('connection-close', () => {
        connectionStatus.value = 'disconnected'
        isConnected.value = false
        yCursors.delete(userId)

        // Exponential backoff retry with jitter
        if (backoff.shouldRetry()) {
          const delay = backoff.nextDelay()
          const delaySeconds = (delay / 1000).toFixed(1)
          const attempt = backoff.getAttempt()

          console.log(`[WebSocket] Reconnecting in ${delaySeconds}s... (attempt ${attempt})`)

          // Schedule reconnection with calculated delay
          setTimeout(() => {
            if (!isConnected.value && wsProvider && !wsProvider.wsconnected) {
              connectionStatus.value = 'connecting'
              originalConnect.call(wsProvider)
            }
          }, delay)
        } else {
          console.warn('[WebSocket] Max reconnection attempts reached. Giving up.')
          connectionStatus.value = 'disconnected'
        }
      })

      // Reset backoff on successful connection
      wsProvider.on('sync', () => {
        backoff.reset()
      })
    }
  } catch (e) {
    console.warn('WebSocket provider not available, running in local mode')
  }

  // Get shared data structures
  const yElements = ydoc.getArray<CanvasElement>('elements')
  const yCursors = ydoc.getMap<UserPresence>('cursors')
  const yMeta = ydoc.getMap<any>('meta')

  // Active strokes map for real-time stroke broadcasting
  // Strokes are stored here while being drawn, moved to yElements on completion
  const yActiveStrokes = ydoc.getMap<[number, number, number][]>('activeStrokes')

  // Local reactive ref for observing remote active strokes (filtered to exclude own strokes)
  const activeStrokes = ref<Record<string, [number, number, number][]>>({})

  // Track last broadcast time for throttling stroke points
  // STROKE_THROTTLE_MS = 16ms (~60fps max) provides consistent real-time feel
  // while preventing excessive network traffic during rapid drawing
  const STROKE_THROTTLE_MS = 16 // ~60fps max
  const lastBroadcastTime = new Map<string, number>()

  // Local state
  const isConnected = ref(wsProvider !== null)
  const connectionStatus = ref(wsProvider !== null ? 'connected' : 'disconnected')
  const currentUser = ref({ id: userId, name: userName, color: getUserColor(userId) })
  const connectedUsers = ref<Map<string, UserPresence>>(new Map())

  // Undo/redo manager
  const undoManager = new Y.UndoManager([yElements], {
    trackedOrigins: new Set([userId]),
  })

  /**
   * CRDT Garbage Collection
   *
   * Yjs accumulates tombstone records for deleted items, and the UndoManager
   * retains full history. Over long sessions, this causes memory growth.
   *
   * Strategy:
   * - Clear undo manager history periodically to release tombstone references
   * - We do NOT compact yElements array directly because:
   *   1. It would break collaborative context for other users
   *   2. Active users may have references to old elements
   *   3. Memory impact of tombstones is minimal compared to active data
   *
   * Trade-offs:
   * - Memory: Bounded growth (undo history is primary memory consumer)
   * - UX: Undo history is cleared on compaction (users lose redo ability)
   *
   * When to manually trigger:
   * - After user action (e.g., saving document)
   * - During idle time (debounced user inactivity)
   * - When memory pressure detected (if available)
   */

  /**
   * Compact the CRDT document by clearing undo history.
   * This invalidates undo/redo but frees memory from accumulated tombstones.
   */
  function compactDocument() {
    console.log('[CRDT] Compacting document - undo history will be cleared')

    ydoc.transact(() => {
      // Clear undo manager history to release tombstone references
      // This is the primary source of memory growth in long-running sessions
      if (undoManager.canUndo()) {
        undoManager.clear()
      }

      // Note: We do NOT delete elements from yElements because:
      // - It would break collaborative state for other users
      // - Active elements must remain for all participants
      // - The tombstones cleared by undoManager.clear() are the real memory concern
    }, 'compaction')
  }

  /**
   * Start periodic garbage collection for the CRDT document.
   *
   * @param intervalMs - Interval between compaction runs (default: 10 minutes)
   * @returns Cleanup function to stop the garbage collection
   */
  let gcInterval: ReturnType<typeof setInterval> | null = null

  function startGarbageCollection(intervalMs: number = 10 * 60 * 1000) {
    // Default: 10 minutes
    if (gcInterval) {
      clearInterval(gcInterval)
    }

    gcInterval = setInterval(() => {
      compactDocument()
    }, intervalMs)

    console.log(`[CRDT] Garbage collection started (interval: ${intervalMs}ms)`)

    // Return cleanup function
    return () => {
      if (gcInterval) {
        clearInterval(gcInterval)
        gcInterval = null
        console.log('[CRDT] Garbage collection stopped')
      }
    }
  }

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

    // Watch for remote active strokes (in-progress drawings from other users)
    // Filter out own strokes to avoid rendering duplicate
    yActiveStrokes.observe((event) => {
      event.changes.keys.forEach((change, key) => {
        const strokeId = key as string
        // Skip if this is our own stroke
        if (strokeId.startsWith(userId)) {
          return
        }

        const points = yActiveStrokes.get(strokeId)
        if (points && points.length! > 0) {
          // Add or update remote active stroke
          activeStrokes.value[strokeId] = points!
        } else {
          // Remove stroke (completed or deleted)
          delete activeStrokes.value[strokeId]
        }
      })
    })

    // Note: connection-close handler for reconnection is registered earlier
    // Cursor cleanup is handled there as well to avoid duplicate handlers
  }

  // Load from localStorage for persistence
  let stopGarbageCollection: (() => void) | null = null

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

    // Start garbage collection on mount (10-minute default)
    // This prevents unbounded memory growth during long sessions
    stopGarbageCollection = startGarbageCollection()
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
    // Stop garbage collection interval
    if (stopGarbageCollection) {
      stopGarbageCollection()
      stopGarbageCollection = null
    }

    yCursors.delete(userId)
    if (wsProvider) {
      wsProvider.disconnect()
    }
    undoManager.destroy()
    ydoc.destroy()
  }

  /**
   * Start a new active stroke for real-time broadcasting
   * Creates empty array in yActiveStrokes for this stroke ID
   */
  function startActiveStroke(strokeId: string) {
    ydoc.transact(() => {
      yActiveStrokes.set(strokeId, [] as [number, number, number][])
    }, userId)
  }

  /**
   * Broadcast a stroke point in real-time with throttling
   *
   * Throttling Strategy:
   * - Time-based throttling (16ms minimum = ~60fps max)
   * - Provides consistent real-time feel regardless of drawing speed
   * - Count-based throttling would lose points during fast drawing
   *
   * Appends point to existing stroke array in yActiveStrokes
   */
  function broadcastStrokePoint(strokeId: string, point: [number, number, number]) {
    const now = Date.now()
    const lastBroadcast = lastBroadcastTime.get(strokeId) || 0

    // Throttle: only broadcast if at least 16ms have passed (~60fps max)
    if (now - lastBroadcast < STROKE_THROTTLE_MS) {
      return
    }

    lastBroadcastTime.set(strokeId, now)

    ydoc.transact(() => {
      const existing = yActiveStrokes.get(strokeId) || []
      yActiveStrokes.set(strokeId, [...(existing as [number, number, number][]), point])
    }, userId)
  }

  /**
   * End an active stroke and move it to permanent elements
   * Removes from yActiveStrokes and adds to yElements
   */
  function endActiveStroke(strokeId: string, element: CanvasElement) {
    ydoc.transact(() => {
      yActiveStrokes.delete(strokeId)
      yElements.push([element])
    }, userId)
    // Clean up throttling state
    lastBroadcastTime.delete(strokeId)
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
    activeStrokes,

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

    // Active stroke methods for real-time broadcasting
    startActiveStroke,
    broadcastStrokePoint,
    endActiveStroke,

    // Viewport sync methods
    getViewport,
    syncViewport,
    observeViewport,

    // CRDT garbage collection methods
    compactDocument,
    startGarbageCollection,

    // Raw instances for advanced usage
    ydoc,
    yElements,
    yMeta,
    wsProvider,
  }
}

// Helper: Get consistent color for user
function getUserColor(userId: string): string {
  const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'] as const
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]!
}
