import type { CanvasElement, DrawingTool } from '~/types'
import type { Ref } from 'vue'

export interface PointerPosition {
  x: number
  y: number
}

export interface ToolContext {
  // Props
  userId: string
  userName: string
  currentTool: DrawingTool
  currentColor: string
  currentSize: number
  currentStampType?: string
  filletRadius: Ref<number>
  elements: CanvasElement[]
  // Refs
  isDrawing: Ref<boolean>
  viewport: Ref<{ x: number; y: number; zoom: number }>
  stageRef: Ref<any>
  layerRef: Ref<any>
  currentPressure: Ref<number>
  currentPointerType: Ref<'mouse' | 'pen' | 'touch'>
  // Coordinate helpers
  getPointerPos: (event: any) => PointerPosition
  getStagePointerPos: () => PointerPosition
  // Emits
  emitElementAdd: (element: CanvasElement) => void
  emitElementDelete: (elementId: string) => void
  emitElementUpdate: (elementId: string, updates: Partial<CanvasElement>) => void
  emitCursorUpdate: (x: number, y: number) => void
  // Layer
  activeLayerId: string
  // Shared state (tool-specific state lives in each handler)
  currentSnapPoint: Ref<(PointerPosition & { type?: string }) | null>
  findSnapPoint: (pos: PointerPosition, elements: CanvasElement[]) => (PointerPosition & { type?: string }) | null
  // Unified constraint pipeline: object snap > polar tracking > ortho
  constrainPoint: (origin: PointerPosition, cursor: PointerPosition) => PointerPosition
  // Polar tracking state for guide line rendering
  polarTrackingResult: Ref<{ point: PointerPosition; angle: number; snapped: boolean } | null>
  // Direct distance entry: apply distance along current angle
  applyDirectDistance?: (distance: number) => void
  // Cursor helpers
  setCursor: (cursor: string) => void
  clearCursor: () => void
  // Stroke broadcasting (optional)
  activeStrokes?: Record<string, [number, number, number][]>
  startActiveStroke?: ((strokeId: string) => void) | null
  broadcastStrokePoint?: ((strokeId: string, point: [number, number, number]) => void) | null
  endActiveStroke?: ((strokeId: string, element: CanvasElement) => void) | null
  // Measurement
  isMeasuring: Ref<boolean>
  measurementStart: Ref<[number, number] | null>
  currentMeasurementEnd: Ref<[number, number] | null>
  previewLine: Ref<any>
  startDistanceMeasurement: (start: [number, number]) => void
  updateMeasurementPreview: (pos: [number, number]) => void
  completeDistanceMeasurement: (end: [number, number], color: string) => void
  cancelMeasurement: () => void
  measureArea: (elementId: string, color: string) => void
  // Selection
  selectedId: Ref<string | null>
  selectElementAtPosition: (x: number, y: number, shiftKey?: boolean) => boolean
  isRubberBanding: Ref<boolean>
  selectionRect: Ref<{ x: number; y: number; width: number; height: number } | null>
  startRubberBand: (x: number, y: number) => void
  updateRubberBand: (x: number, y: number) => void
  endRubberBand: () => void
  // Scale / units
  pixelsPerInch: number
  measurementUnit: 'inches' | 'feet'

  // Viewport
  isPanning: Ref<boolean>
  enablePan: () => void
  disablePan: () => void
  setViewportDirect: (viewport: { x: number; y: number }) => void
  panStartPointer: Ref<PointerPosition | null>
  panStartViewport: Ref<{ x: number; y: number } | null>
}

export interface ToolHandler {
  onMouseDown?: (event: any, pos: PointerPosition) => void
  onMouseMove?: (event: any, pos: PointerPosition) => void
  onMouseUp?: (event: any, pos: PointerPosition) => void
  // Return true when the tool consumes the event (handled it). The canvas keydown
  // listener uses this to stopImmediatePropagation so the page-level shortcut
  // handler doesn't also act (e.g. switch tools, deselect).
  onKeyDown?: (event: KeyboardEvent) => boolean | void
  activate?: () => void
  deactivate?: () => void
  // Optional state exposed for template rendering
  state?: Record<string, any>
}

export interface ToolHandlerRegistry {
  register: (toolId: DrawingTool, handler: ToolHandler) => void
  get: (toolId: DrawingTool) => ToolHandler | undefined
  dispatchMouseDown: (tool: DrawingTool, event: any, pos: PointerPosition) => void
  dispatchMouseMove: (tool: DrawingTool, event: any, pos: PointerPosition) => void
  dispatchMouseUp: (tool: DrawingTool, event: any, pos: PointerPosition) => void
  dispatchKeyDown: (tool: DrawingTool, event: KeyboardEvent) => boolean
  activateTool: (tool: DrawingTool) => void
  deactivateTool: (tool: DrawingTool) => void
}

export function useToolHandlers(): ToolHandlerRegistry {
  const handlers = new Map<DrawingTool, ToolHandler>()

  function register(toolId: DrawingTool, handler: ToolHandler) {
    handlers.set(toolId, handler)
  }

  function get(toolId: DrawingTool): ToolHandler | undefined {
    return handlers.get(toolId)
  }

  function wrapError<T>(fn: () => T, context: string): T | undefined {
    try {
      return fn()
    } catch (e) {
      console.error(`[tool] ${context}:`, e)
      return undefined
    }
  }

  function dispatchMouseDown(tool: DrawingTool, event: any, pos: PointerPosition) {
    wrapError(() => handlers.get(tool)?.onMouseDown?.(event, pos), `${tool}.onMouseDown`)
  }

  function dispatchMouseMove(tool: DrawingTool, event: any, pos: PointerPosition) {
    wrapError(() => handlers.get(tool)?.onMouseMove?.(event, pos), `${tool}.onMouseMove`)
  }

  function dispatchMouseUp(tool: DrawingTool, event: any, pos: PointerPosition) {
    wrapError(() => handlers.get(tool)?.onMouseUp?.(event, pos), `${tool}.onMouseUp`)
  }

  function dispatchKeyDown(tool: DrawingTool, event: KeyboardEvent): boolean {
    const handler = handlers.get(tool)
    if (!handler?.onKeyDown) return false
    return !!wrapError(() => handler.onKeyDown!(event), `${tool}.onKeyDown`)
  }

  function activateTool(tool: DrawingTool) {
    wrapError(() => handlers.get(tool)?.activate?.(), `${tool}.activate`)
  }

  function deactivateTool(tool: DrawingTool) {
    wrapError(() => handlers.get(tool)?.deactivate?.(), `${tool}.deactivate`)
  }

  return {
    register,
    get,
    dispatchMouseDown,
    dispatchMouseMove,
    dispatchMouseUp,
    dispatchKeyDown,
    activateTool,
    deactivateTool,
  }
}
