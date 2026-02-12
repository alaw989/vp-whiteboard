import { ref, computed, watch, onUnmounted, readonly } from 'vue'
import * as Y from 'yjs'

// Stroke point type: [x, y, pressure]
type StrokePoint = [number, number, number]

/**
 * Composable for real-time collaborative drawing
 *
 * Manages active stroke state in a separate Y.Map (yActiveStrokes)
 * Broadcasts stroke points incrementally during drawing for real-time sync
 * Ends stroke by moving completed element from active to permanent yElements array
 *
 */
export function useRealtimeStrokes(ydoc: Y.Doc, userId: string, userName: string) {
  // Shared Y.Map for active strokes (separate from yElements to avoid polluting undo history)
  const yActiveStrokes = ydoc.getMap<Record<string, StrokePoint[]>>('activeStrokes')

  // Local refs
  const currentStrokeId = ref<string | null>(null)
  const isDrawing = ref(false)
  const currentTool = ref<string | null>(null)

  // Throttle settings (16ms = ~60fps max)
  const BROADCAST_THROTTLE_MS = 16
  const STROKE_THROTTLE_COUNT = 8 // Broadcast every Nth point (N=8 provides 60fps)

  // Get Yjs awareness for cursor broadcasting
  const wsProvider = (ydoc as any).share?.get('wsProvider') || null

  // Expose methods
  const currentStrokePoints = ref<StrokePoint[]>([])

  // Active stroke ref - for observing yActiveStrokes
  const activeStrokesRef = ref<Record<string, StrokePoint[]>>({})

  // Observe remote active strokes
  yActiveStrokes.observe((event) => {
    event.changes.keys.forEach((key) => {
      const strokeId = key as unknown as string
      const points = yActiveStrokes.get(strokeId)

      if (points) {
        // Render preview of remote stroke in progress
        renderActiveStroke(strokeId, points as unknown as StrokePoint[])
      } else {
        // Remote stroke ended - clear preview
        clearActiveStroke(strokeId)
      }
    })
  })

  /**
   * Start a new active stroke
   * Generates unique stroke ID and initializes empty points array
   */
  function startActiveStroke(tool: string): string {
    const strokeId = `${userId}-stroke-${Date.now()}`

    // Initialize empty points in yActiveStrokes
    yActiveStrokes.set(strokeId, [] as unknown as Record<string, StrokePoint[]>)

    currentStrokeId.value = strokeId
    isDrawing.value = true

    return strokeId
  }

  /**
   * Broadcast a stroke point during drawing
   * Throttled to prevent excessive network traffic
   *
   * @param strokeId - The stroke ID from startActiveStroke()
   * @param point - [x, y, pressure] coordinates
   */
  function broadcastStrokePoint(strokeId: string, point: [number, number, number]) {
    // Skip if not currently drawing
    if (!isDrawing.value || !currentStrokeId.value) return

    const points = yActiveStrokes.get(currentStrokeId.value) || []

    // Add point with throttling (every Nth point, not every point)
    const pointCount = (points as StrokePoint[]).length
    if (pointCount > 0 && pointCount % STROKE_THROTTLE_COUNT === 0) {
      // Throttle: only broadcast every 8th point (network optimization)
      ydoc.transact(() => {
        yActiveStrokes.set(currentStrokeId.value!, [...(points as StrokePoint[]), point] as unknown as Record<string, StrokePoint[]>)
      }, userId)
    }
  }

  /**
   * End the current active stroke
   * Moves completed stroke from yActiveStrokes to permanent yElements array
   * NOTE: This function is a stub - the real implementation is in useCollaborativeCanvas.ts
   */
  function endActiveStroke(): void {
    const strokeId = currentStrokeId.value
    if (!strokeId) return

    // Get current points from yActiveStrokes
    const points = yActiveStrokes.get(strokeId) || []

    if (points.length === 0) return

    // Clear from active strokes
    yActiveStrokes.delete(strokeId)
    currentStrokeId.value = null
    isDrawing.value = false

    // NOTE: Actual element creation is handled by useCollaborativeCanvas
    // This composable only manages the active strokes state
  }

  /**
   * Clear preview for an active stroke
   */
  function clearActiveStroke(strokeId: string): void {
    // Delete from yActiveStrokes Map
    yActiveStrokes.delete(strokeId)

    // Reset local currentStrokePoints
    currentStrokePoints.value = []
  }

  /**
   * Render active stroke preview on canvas
   * This would update the canvas rendering
   */
  function renderActiveStroke(strokeId: string, points: StrokePoint[]): void {
    // Update reactive ref for template rendering
    // Currently managed by WhiteboardCanvas component
    // This composable provides the state, canvas rendering is separate concern
  }

  /**
   * Get current active stroke ID
   */
  function getCurrentStrokeId(): string | null {
    return currentStrokeId.value
  }

  /**
   * Check if currently drawing
   */
  function isCurrentlyDrawing(): boolean {
    return isDrawing.value && !!currentStrokeId.value
  }

  /**
   * Throttle helper - ensures minimum 16ms between broadcasts
   */
  let lastBroadcastTime = 0
  function shouldThrottleBroadcast(): boolean {
    const now = Date.now()
    if (now - lastBroadcastTime >= BROADCAST_THROTTLE_MS) {
      lastBroadcastTime = now
      return false
    }
    lastBroadcastTime = now
    return true
  }

  /**
   * Cleanup on unmount
   */
  onUnmounted(() => {
    // Stop observing active strokes
    // Clear current stroke ID
    currentStrokeId.value = null
    isDrawing.value = false
  })

  return {
    // Exposed for parent components
    startActiveStroke,
    broadcastStrokePoint,
    endActiveStroke,
    getCurrentStrokeId,
    isCurrentlyDrawing,
    // Internal refs (read-only for external inspection)
    currentStrokeId: readonly(() => currentStrokeId.value),
    activeStrokes: readonly(() => activeStrokesRef.value),
    currentStrokePoints: readonly(() => currentStrokePoints.value),
    // Methods
    shouldThrottleBroadcast,
    // Yjs instances for advanced usage
    ydoc,
    yActiveStrokes,
  }
}

/**
 * Stroke type for real-time strokes
 * Extends StrokePoint type with tool info
 */
export interface ActiveStrokePoint extends StrokePoint {
  tool: string // pen or highlighter
  color: string
  size: number
  pressure: number // 0-0.5 (pressure sensitivity)
}

/**
 * Active stroke record for canvas preview
 */
export interface ActiveStrokePreview {
  strokeId: string
  points: StrokePoint[]
}
