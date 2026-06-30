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

/**
 * Base64 helpers for shipping Yjs binary payloads (state vectors, updates)
 * inside JSON envelopes over the WebSocket (text-as-binary) transport.
 *
 * `fromCharCode` is chunked at 0x8000 so large updates (e.g. a board with
 * uploaded PDFs) don't blow the call stack the way a single
 * `String.fromCharCode(...hugeArray)` would.
 */
function toB64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function fromB64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function useCollaborativeCanvas(whiteboardId: string, userId: string, userName: string) {
  const config = useRuntimeConfig()
  const wsUrl = config.public.wsUrl as string

  // Initialize Yjs document
  const ydoc = new Y.Doc()

  // WebSocket connection (native, no external provider library)
  let ws: WebSocket | null = null
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  // Minimal wsProvider-like object for compatibility with useCursors
  const wsProvider = {
    awareness: {
      getStates: () => [],
      on: () => {},
      off: () => {},
      setLocalStateField: () => {},
    },
  }

  /**
   * Initialize WebSocket connection with Yjs sync
   */
  function initWebSocket() {
    if (ws?.readyState === WebSocket.OPEN) return

    try {
      // Build WebSocket URL with room and user info
      const url = new URL(wsUrl)
      url.pathname = `/whiteboard:${whiteboardId}`
      url.searchParams.set('userId', userId)
      url.searchParams.set('userName', userName)

      ws = new WebSocket(url.toString())

      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        console.log('[Yjs WS] ✅ Connected to room:', whiteboardId)
        connectionStatus.value = 'connected'
        isConnected.value = true

        // Request initial sync from peers (broadcast our Yjs state vector)
        sendSyncStep1()

        // Clear any pending reconnect
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout)
          reconnectTimeout = null
        }
      }

      ws.onclose = () => {
        console.log('[Yjs WS] ❌ Disconnected')
        connectionStatus.value = 'disconnected'
        isConnected.value = false
        yCursors.delete(userId)

        // Schedule reconnection with exponential backoff
        scheduleReconnect()
      }

      ws.onerror = (error) => {
        console.error('[Yjs WS] ⚠️ Error:', error)
      }

      ws.onmessage = async (event) => {
        try {
          const data = new Uint8Array(event.data)
          await handleIncomingMessage(data)
        } catch (e) {
          console.error('[Yjs WS] Failed to handle message:', e)
        }
      }
    } catch (e) {
      console.error('[Yjs WS] Failed to create WebSocket:', e)
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  function scheduleReconnect() {
    if (reconnectTimeout) return

    const backoff = createExponentialBackoff({
      baseDelay: 1000,
      maxDelay: 30000,
      maxAttempts: 100,
      jitter: true,
    })

    reconnectTimeout = setTimeout(() => {
      const delay = backoff.nextDelay()
      console.log(`[Yjs WS] Reconnecting in ${(delay / 1000).toFixed(1)}s...`)
      connectionStatus.value = 'connecting'
      initWebSocket()
      reconnectTimeout = null
    }, 2000) // Initial 2s delay
  }

  /**
   * Send sync-step1: broadcast our Yjs state vector so peers can compute the
   * diff they hold and reply with sync-step2. Called on WS open, and again on
   * receiving a peer's sync-step1 (the counter-request that makes sync
   * bidirectional — without it a newcomer's local state would never reach the
   * already-connected peer).
   */
  function sendSyncStep1() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const sv = Y.encodeStateVector(ydoc)
    ws.send(JSON.stringify({ type: 'sync-step1', sv: toB64(sv) }))
  }

  /**
   * Handle incoming Yjs message
   */
  async function handleIncomingMessage(data: Uint8Array) {
    // JSON envelope (sync handshake) — the relay normalizes all frames to
    // binary, so JSON arrives as UTF-8 bytes and is recoverable via TextDecoder.
    try {
      const text = new TextDecoder().decode(data)
      const message = JSON.parse(text)

      if (message.type === 'sync-step1') {
        // Peer wants the diff it's missing. Reply with sync-step2 if non-empty.
        const theirSV = fromB64(message.sv)
        const update = Y.encodeStateAsUpdate(ydoc, theirSV)
        if (update.length > 1 && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'sync-step2', update: toB64(update) }))
        }
        // Counter-request so THIS peer also learns the newcomer's state. Safe:
        // once both peers are synced the diffs are empty and this goes quiet.
        sendSyncStep1()
        return
      }

      if (message.type === 'sync-step2') {
        // Merge the peer's diff. No origin arg → origin is null, which (unlike
        // the local userId) does NOT trip the dirty-flag observers, so a freshly
        // bootstrapped board is never written back as empty.
        Y.applyUpdate(ydoc, fromB64(message.update))
        return
      }

      // Unknown JSON type: fall through to applyUpdate (defensive).
    } catch {
      // Not JSON — treat as a raw binary Yjs update (live edits).
    }

    // Apply binary Yjs update (CRDT merge — additive, never clears)
    try {
      Y.applyUpdate(ydoc, data)
    } catch (e) {
      console.error('[Yjs WS] Failed to apply Yjs update:', e)
    }
  }

  /**
   * Send binary data over WebSocket
   */
  function sendBinary(data: Uint8Array) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  }

  /**
   * Cleanup WebSocket on unmount
   */
  function cleanupWebSocket() {
    if (ws) {
      ws.close()
      ws = null
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
  }

  // Initialize WebSocket immediately when composable is called
  initWebSocket()

  // Get shared data structures
  const yElements = ydoc.getArray<CanvasElement>('elements')
  const yCursors = ydoc.getMap<UserPresence>('cursors')
  const yMeta = ydoc.getMap<any>('meta')

  // Document layers - shared so all users see same PDFs/images
  const yDocumentLayers = ydoc.getMap<any>('documentLayers')

  // Active strokes map for real-time stroke broadcasting
  // Strokes are stored here while being drawn, moved to yElements on completion
  const yActiveStrokes = ydoc.getMap<[number, number, number][]>('activeStrokes')

  // Local reactive ref for observing remote active strokes (filtered to exclude own strokes)
  const activeStrokes = ref<Record<string, [number, number, number][]>>({})

  // Local reactive ref for elements - updated by Yjs observer
  const elements = ref<CanvasElement[]>([])

  // Track last broadcast time for throttling stroke points
  // STROKE_THROTTLE_MS = 16ms (~60fps max) provides consistent real-time feel
  // while preventing excessive network traffic during rapid drawing
  const STROKE_THROTTLE_MS = 16 // ~60fps max
  const lastBroadcastTime = new Map<string, number>()

  // Local state
  const isConnected = ref(false)
  // Autosave dirty flag — true only when there are unsaved LOCAL edits (see the
  // origin-gated observers below). Consumers flush via exportState()/markSaved().
  const isDirty = ref(false)
  const connectionStatus = ref<'connecting' | 'connected' | 'disconnected'>('disconnected')
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

  // Watch for elements changes - update reactive ref when Yjs array changes
  // This ensures Vue reactivity works with Yjs CRDT
  yElements.observe(() => {
    elements.value = yElements.toArray()
  })

  // Initialize elements ref with current state
  elements.value = yElements.toArray()

  let stopGarbageCollection: (() => void) | null = null

  // The database is the single source of truth on load (importState is called
  // from pages/whiteboard/[id].vue once the GET resolves). We deliberately do
  // NOT re-seed from localStorage: a stale localStorage snapshot (which goes
  // stale for large PDFs once exportState exceeds the ~5MB localStorage cap)
  // would race the DB load and overwrite the freshly-restored document layers.
  onMounted(() => {
    // Start garbage collection on mount (10-minute default)
    // This prevents unbounded memory growth during long sessions
    stopGarbageCollection = startGarbageCollection()
  })

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

  // Export canvas state (includes document layers if present)
  function exportState() {
    const documentLayers = getDocumentLayers()
    return {
      version: yMeta.get('version') || 1,
      elements: getElements(),
      // Persist shared PDF/image layers so they survive a reload. Omitted when
      // empty to keep the stored canvas_state shape clean.
      ...(documentLayers.length ? { documentLayers } : {}),
    }
  }

  // Mark the document as saved (resets the autosave dirty flag)
  function markSaved() {
    isDirty.value = false
  }

  // Import canvas state (for initial load)
  function importState(state: { version: number; elements: CanvasElement[]; documentLayers?: any[] }) {
    ydoc.transact(() => {
      yElements.delete(0, yElements.length)
      yElements.insert(0, state.elements)
      yMeta.set('version', state.version)
      // Restore shared document layers (PDFs/images). Runs under the 'import'
      // origin so the dirty-flag observers below do not treat this as an edit.
      yDocumentLayers.clear()
      for (const layer of state.documentLayers || []) {
        if (layer?.id) yDocumentLayers.set(layer.id, layer)
      }
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
    // Clean up WebSocket connection
    cleanupWebSocket()

    // Stop garbage collection interval
    if (stopGarbageCollection) {
      stopGarbageCollection()
      stopGarbageCollection = null
    }

    yCursors.delete(userId)
    undoManager.destroy()
    ydoc.destroy()
  }

  /**
   * Broadcast Yjs document update to all connected clients
   */
  function broadcastUpdate(update: Uint8Array) {
    sendBinary(update)
  }

  /**
   * Observe Yjs document changes and broadcast them
   */
  yElements.observe((event) => {
    // Get the update and broadcast it
    const update = Y.encodeStateAsUpdate(ydoc)
    sendBinary(update)
  })

  /**
   * Observe yMeta changes (viewport, scale, document layers)
   */
  yMeta.observe((event) => {
    const update = Y.encodeStateAsUpdate(ydoc)
    sendBinary(update)
  })

  /**
   * Observe yDocumentLayers changes
   */
  yDocumentLayers.observe(() => {
    const update = Y.encodeStateAsUpdate(ydoc)
    sendBinary(update)
  })

  // ---- Dirty-flag tracking for autosave ----
  // Mark dirty only for LOCAL user edits (origin === userId). Loads
  // (origin 'import'), compaction, and remote peer updates (origin = a peer's
  // userId) do NOT mark dirty. This prevents the empty-doc-overwrite race — a
  // freshly loaded board being written back as {elements:[]} — and avoids
  // wasteful save-on-load. clearCanvas() uses origin userId, so an intentional
  // clear still marks dirty and saves.
  yElements.observe((event) => {
    if (event.transaction.origin === userId) isDirty.value = true
  })
  yMeta.observe((event) => {
    if (event.transaction.origin === userId) isDirty.value = true
  })
  yDocumentLayers.observe((event) => {
    if (event.transaction.origin === userId) isDirty.value = true
  })

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

  // ============================================
  // Document Layer Methods (for shared PDFs/images)
  // ============================================

  /**
   * Add a document layer (PDF or image) to shared state
   * All users will see this layer appear
   */
  function addDocumentLayer(layer: any) {
    ydoc.transact(() => {
      yDocumentLayers.set(layer.id, layer)
    }, userId)
  }

  /**
   * Update a document layer's properties (position, scale, etc.)
   */
  function updateDocumentLayer(layerId: string, updates: Partial<any>) {
    const existing = yDocumentLayers.get(layerId)
    if (existing) {
      ydoc.transact(() => {
        yDocumentLayers.set(layerId, { ...existing, ...updates })
      }, userId)
    }
  }

  /**
   * Remove a document layer from shared state
   */
  function removeDocumentLayer(layerId: string) {
    ydoc.transact(() => {
      yDocumentLayers.delete(layerId)
    }, userId)
  }

  /**
   * Get all document layers as an array
   */
  function getDocumentLayers(): any[] {
    return Array.from(yDocumentLayers.values())
  }

  /**
   * Observe changes to document layers from other users
   * Returns cleanup function to stop observing
   */
  function observeDocumentLayers(callback: (layers: any[]) => void): () => void {
    const handler = () => {
      callback(Array.from(yDocumentLayers.values()))
    }
    yDocumentLayers.observe(handler)
    // Call immediately with current state
    handler()
    // Return cleanup function
    return () => {
      yDocumentLayers.unobserve(handler)
    }
  }

  return {
    // State
    isConnected,
    isDirty,
    connectionStatus,
    currentUser,
    connectedUsers,
    elements,
    canUndo: computed(() => { elements.value; const v = undoManager.canUndo(); return v }),
    canRedo: computed(() => { elements.value; const v = undoManager.canRedo(); return v }),
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
    markSaved,
    cleanup,

    // Active stroke methods for real-time broadcasting
    startActiveStroke,
    broadcastStrokePoint,
    endActiveStroke,

    // Viewport sync methods
    getViewport,
    syncViewport,
    observeViewport,

    // Document layer methods (shared PDFs/images)
    addDocumentLayer,
    updateDocumentLayer,
    removeDocumentLayer,
    getDocumentLayers,
    observeDocumentLayers,

    // CRDT garbage collection methods
    compactDocument,
    startGarbageCollection,

    // Raw instances for advanced usage
    ydoc,
    yElements,
    yMeta,
    yDocumentLayers,
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
