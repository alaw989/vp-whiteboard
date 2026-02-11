import { ref, computed, readonly, type Ref, type ComputedRef } from 'vue'
import type { ViewportState } from '~/types'

export interface ViewportOptions {
  stageRef: Ref<any>
  containerRef: Ref<HTMLDivElement | null>
  minZoom?: number
  maxZoom?: number
  onViewportChange?: (viewport: ViewportState) => void
}

export function useViewport(options: ViewportOptions) {
  const {
    stageRef,
    containerRef,
    minZoom = 0.1,
    maxZoom = 5.0,
    onViewportChange,
  } = options

  // Viewport state (x, y, zoom)
  const viewport = ref<ViewportState>({
    x: 0,
    y: 0,
    zoom: 1,
  })

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

    // Notify callback if provided
    if (onViewportChange) {
      onViewportChange(viewport.value)
    }
  }

  /**
   * Enable panning by making the stage draggable
   */
  function startPan() {
    const stage = stageRef.value?.getNode()
    if (stage) {
      stage.draggable(true)
    }
  }

  /**
   * Disable panning and capture final position
   */
  function stopPan() {
    const stage = stageRef.value?.getNode()
    if (stage) {
      stage.draggable(false)

      // Capture final position after dragging
      viewport.value.x = stage.x()
      viewport.value.y = stage.y()

      // Notify callback if provided
      if (onViewportChange) {
        onViewportChange(viewport.value)
      }
    }
  }

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

    if (onViewportChange) {
      onViewportChange(viewport.value)
    }
  }

  return {
    // State (readonly for external use)
    viewport: readonly(viewport),
    stageConfig,
    zoomPercent,
    canZoomIn,
    canZoomOut,

    // Actions
    handleWheel,
    startPan,
    stopPan,
    zoomIn,
    zoomOut,
    resetZoom,
    setViewport,
  }
}

export type UseViewportReturn = ReturnType<typeof useViewport>
