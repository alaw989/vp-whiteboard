import type { CanvasElement, RectangleElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useRectangleTool(ctx: ToolContext): ToolHandler {
  const shapeStart = ref<PointerPosition | null>(null)
  const currentShapeEnd = ref<PointerPosition | null>(null)

  function reset() {
    shapeStart.value = null
    currentShapeEnd.value = null
  }

  return {
    state: { shapeStart, currentShapeEnd },
    onMouseDown(_event: any, pos: PointerPosition) {
      ctx.isDrawing.value = true
      shapeStart.value = pos
      currentShapeEnd.value = pos
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (!ctx.isDrawing.value) return
      currentShapeEnd.value = pos
    },
    onMouseUp(_event: any, _pos: PointerPosition) {
      if (!ctx.isDrawing.value || !shapeStart.value || !currentShapeEnd.value) return

      const start = shapeStart.value
      const end = currentShapeEnd.value

      const x = Math.min(start.x, end.x)
      const y = Math.min(start.y, end.y)
      const width = Math.abs(end.x - start.x)
      const height = Math.abs(end.y - start.y)

      if (width > 5 && height > 5) {
        const element: CanvasElement = {
          id: `${ctx.userId}-${Date.now()}`,
          type: 'rectangle',
          userId: ctx.userId,
          userName: ctx.userName,
          timestamp: Date.now(),
          data: {
            x,
            y,
            width,
            height,
            stroke: ctx.currentColor,
            strokeWidth: ctx.currentSize,
            fill: 'transparent',
          } as RectangleElement,
        }
        ctx.emitElementAdd(element)
      }

      reset()
      ctx.isDrawing.value = false
    },
    deactivate() {
      reset()
    },
  }
}
