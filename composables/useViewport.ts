import { ref, computed, readonly, watch, nextTick, type Ref, type ComputedRef } from 'vue'
import type { ViewportState } from '~/types'
import { useDebounceFn } from '@vueuse/core'

export interface ViewportOptions {
  stageRef: Ref<any>
  containerRef: Ref<HTMLDivElement | null>
  minZoom?: number
  maxZoom?: number
  onViewportChange?: (viewport: ViewportState) => void
  // Yjs sync options
  userId?: string
  syncViewport?: (viewport: ViewportState) => void
  applyRemoteViewport?: (viewport: ViewportState) => void
}

export function useViewport(options: ViewportOptions) {
  const {
    stageRef,
    containerRef,
    minZoom = 0.1,
    maxZoom = 5.0,
    onViewportChange,
    userId,
    syncViewport,
    applyRemoteViewport,
  } = options

  // Viewport state (x, y, zoom)
  const viewport = ref<ViewportState>({
    x: 0,
    y: 0,
    zoom: 1,
  })

  // Pan state tracking
  const isPanning = ref(false)

  // Remote sync state (prevents infinite loop)
  const isRemoteUpdate = ref(false)
  const lastSyncedViewport = ref<ViewportState | null>(null)

  // Stage configuration for Konva
  const stageConfig = computed(() => ({
    scaleX: viewport.value.zoom,
    scaleY: viewport.value.zoom,
    x: viewport.value.x,
    y: viewport.value.y,
    draggable: false,
  }))

  // Zoom level as percentage for UI display
  const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100))

  // Check if zoom can be increased
  const canZoomIn = computed(() => viewport.value.zoom < maxZoom)

  // Check if zoom can be decreased
  const canZoomOut = computed(() => viewport.value.zoom > minZoom)

  // Debounced sync function to avoid excessive network traffic during rapid viewport changes
  const debouncedSync = useDebounceFn((vp: ViewportState) => {
    if (syncViewport && userId && !isRemoteUpdate.value) {
      // Only sync if userId provided (collaborative mode)
      syncViewport(vp)
      lastSyncedViewport.value = { ...vp }
    }
  }, 100)

  // Internal sync caller with threshold check
  function triggerSync(vp: ViewportState) {
    if (!syncViewport || !userId || isRemoteUpdate.value) {
      return
    }

    // Check if viewport changed significantly (threshold: 5px or 0.01 zoom)
    const last = lastSyncedViewport.value
    if (!last) {
      debouncedSync(vp)
      return
    }

    const dx = Math.abs(vp.x - last.x)
    const dy = Math.abs(vp.y - last.y)
    const dz = Math.abs(vp.zoom - last.zoom)

    if (dx > 5 || dy > 5 || dz > 0.01) {
      debouncedSync(vp)
    }
  }

  /**
   * Handle mouse wheel zoom with pointer-relative scaling
   * Zooms toward the mouse pointer position
   */
  function handleWheel(event: any) {
    event.evt.preventDefault()

    const stage = stageRef.value?.getNode()
    if (!stage) return

    const oldScale = viewport.value.zoom
    const pointer = stage.getPointerPosition()

    if (!pointer) return

    // Calculate scale factor based on wheel direction
    const scaleBy = 1.1
    const newScale = event.evt.deltaY > 0
      ? oldScale / scaleBy  // Zoom out
      : oldScale * scaleBy  // Zoom in

    // Clamp zoom between min and max
    const clampedScale = Math.min(Math.max(newScale, minZoom), maxZoom)

    // Adjust position to zoom toward pointer
    // Formula: newPos = pointer - (pointer - oldPos) * (newScale / oldScale)
    viewport.value.x = pointer.x - (pointer.x - viewport.value.x) * (clampedScale / oldScale)
    viewport.value.y = pointer.y - (pointer.y - viewport.value.y) * (clampedScale / oldScale)
    viewport.value.zoom = clampedScale

    // Trigger sync for collaborative mode
    triggerSync(viewport.value)

    // Notify callback if provided
    if (onViewportChange) {
      onViewportChange(viewport.value)
    }
  }

  /**
   * Enable panning by making the stage draggable
   * Sets pan state, enables dragging, and updates cursor
   */
  function enablePan() {
    const stage = stageRef.value?.getNode()
    if (stage) {
      isPanning.value = true
      stage.draggable(true)
      stage.container()?.style.setProperty('cursor', 'grab')
    }
  }

  /**
   * Disable panning and capture final position
   * Resets pan state, disables dragging, and captures position
   */
  function disablePan() {
    const stage = stageRef.value?.getNode()
    if (stage) {
      // Capture final position after dragging
      viewport.value.x = stage.x()
      viewport.value.y = stage.y()

      stage.draggable(false)
      stage.container()?.style.removeProperty('cursor')
      isPanning.value = false

      // Trigger sync for collaborative mode (sync immediately after pan ends)
      triggerSync(viewport.value)

      // Notify callback if provided
      if (onViewportChange) {
        onViewportChange(viewport.value)
      }
    }
  }

  /**
   * Apply remote viewport change from another user
   * Sets isRemoteUpdate flag to prevent sync loop
   */
  function applyRemoteViewportInternal(remoteViewport: ViewportState) {
    isRemoteUpdate.value = true
    viewport.value = { ...remoteViewport }
    // Reset flag after next tick to allow subsequent updates
    nextTick(() => {
      isRemoteUpdate.value = false
    })
  }

  /**
   * Deprecated: Use enablePan instead
   * Kept for backward compatibility
   */
  function startPan() {
    enablePan()
  }

  /**
   * Deprecated: Use disablePan instead
   * Kept for backward compatibility
   */
  function stopPan() {
    disablePan()
  }

  /**
   * Watch stage dragmove to update viewport in real-time during pan
   */
  watch(isPanning, (panning) => {
    const stage = stageRef.value?.getNode()
    if (!stage) return

    if (panning) {
      // Listen to dragmove event for real-time viewport updates
      stage.on('dragmove', () => {
        viewport.value.x = stage.x()
        viewport.value.y = stage.y()
      })

      // Update cursor to grabbing during active drag
      stage.on('dragstart', () => {
        stage.container()?.style.setProperty('cursor', 'grabbing')
      })

      // Reset cursor on drag end
      stage.on('dragend', () => {
        stage.container()?.style.setProperty('cursor', 'grab')
      })
    } else {
      // Remove listeners when pan is disabled
      stage.off('dragmove')
      stage.off('dragstart')
      stage.off('dragend')
    }
  })

  /**
   * Zoom in toward center of viewport
   */
  function zoomIn() {
    if (!canZoomIn.value) return

    const container = containerRef.value
    const centerX = container ? container.offsetWidth / 2 : 0
    const centerY = container ? container.offsetHeight / 2 : 0

    const oldScale = viewport.value.zoom
    const scaleBy = 1.1
    const newScale = Math.min(oldScale * scaleBy, maxZoom)

    // Adjust position to zoom toward center
    viewport.value.x = centerX - (centerX - viewport.value.x) * (newScale / oldScale)
    viewport.value.y = centerY - (centerY - viewport.value.y) * (newScale / oldScale)
    viewport.value.zoom = newScale

    // Trigger sync for collaborative mode
    triggerSync(viewport.value)

    if (onViewportChange) {
      onViewportChange(viewport.value)
    }
  }

  /**
   * Zoom out toward center of viewport
   */
  function zoomOut() {
    if (!canZoomOut.value) return

    const container = containerRef.value
    const centerX = container ? container.offsetWidth / 2 : 0
    const centerY = container ? container.offsetHeight / 2 : 0

    const oldScale = viewport.value.zoom
    const scaleBy = 1.1
    const newScale = Math.max(oldScale / scaleBy, minZoom)

    // Adjust position to zoom toward center
    viewport.value.x = centerX - (centerX - viewport.value.x) * (newScale / oldScale)
    viewport.value.y = centerY - (centerY - viewport.value.y) * (newScale / oldScale)
    viewport.value.zoom = newScale

    // Trigger sync for collaborative mode
    triggerSync(viewport.value)

    if (onViewportChange) {
      onViewportChange(viewport.value)
    }
  }

  /**
   * Reset zoom to 1.0 and position to origin
   */
  function resetZoom() {
    viewport.value = {
      x: 0,
      y: 0,
      zoom: 1,
    }

    // Trigger sync for collaborative mode
    triggerSync(viewport.value)

    if (onViewportChange) {
      onViewportChange(viewport.value)
    }
  }

  /**
   * Set viewport to a specific state
   */
  function setViewport(state: Partial<ViewportState>) {
    if (state.x !== undefined) viewport.value.x = state.x
    if (state.y !== undefined) viewport.value.y = state.y
    if (state.zoom !== undefined) {
      viewport.value.zoom = Math.min(Math.max(state.zoom, minZoom), maxZoom)
    }

    // Trigger sync for collaborative mode
    triggerSync(viewport.value)

    if (onViewportChange) {
      onViewportChange(viewport.value)
    }
  }

  /**
   * Set viewport directly without triggering sync or callbacks
   * For high-frequency updates (e.g., touch gestures) to avoid network spam
   */
  function setViewportDirect(state: Partial<ViewportState>) {
    if (state.x !== undefined) viewport.value.x = state.x
    if (state.y !== undefined) viewport.value.y = state.y
    if (state.zoom !== undefined) {
      viewport.value.zoom = Math.min(Math.max(state.zoom, minZoom), maxZoom)
    }
    // Note: Does NOT call triggerSync or onViewportChange
    // Sync will happen when gesture ends (via setViewport)
  }

  return {
    // State (readonly for external use)
    viewport: readonly(viewport),
    isPanning: readonly(isPanning),
    stageConfig,
    zoomPercent,
    canZoomIn,
    canZoomOut,

    // Actions
    handleWheel,
    enablePan,
    disablePan,
    startPan,
    stopPan,
    zoomIn,
    zoomOut,
    resetZoom,
    setViewport,
    setViewportDirect,

    // Remote viewport sync
    applyRemoteViewport: applyRemoteViewportInternal,

    // Viewport bounds calculation for culling
    getViewportBounds: (width: number, height: number, padding?: number) =>
      getViewportBounds(width, height, viewport.value, padding),
  }
}

// Padding for viewport culling to ensure smooth edge transitions
export const VIEWPORT_PADDING = 100

/**
 * Calculate viewport bounds in canvas coordinates
 * Returns the visible area with optional padding for culling
 *
 * @param containerWidth - Container width in screen pixels
 * @param containerHeight - Container height in screen pixels
 * @param viewport - Current viewport state
 * @param padding - Extra padding around visible area (default: VIEWPORT_PADDING)
 * @returns Bounds in canvas coordinates { left, top, right, bottom }
 */
export function getViewportBounds(
  containerWidth: number,
  containerHeight: number,
  viewport: ViewportState,
  padding: number = VIEWPORT_PADDING
): { left: number; top: number; right: number; bottom: number } {
  const { x, y, zoom } = viewport
  return {
    left: -x / zoom - padding,
    top: -y / zoom - padding,
    right: (-x + containerWidth) / zoom + padding,
    bottom: (-y + containerHeight) / zoom + padding,
  }
}

export type UseViewportReturn = ReturnType<typeof useViewport>
