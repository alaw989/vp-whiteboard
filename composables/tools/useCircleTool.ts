import type { CanvasElement, CircleElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useCircleTool(ctx: ToolContext): ToolHandler {
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

      const dx = end.x - start.x
      const dy = end.y - start.y
      const radius = Math.sqrt(dx * dx + dy * dy)

      if (radius > 5) {
        const element: CanvasElement = {
          id: `${ctx.userId}-${Date.now()}`,
          type: 'circle',
          userId: ctx.userId,
          userName: ctx.userName,
          timestamp: Date.now(),
          data: {
            cx: start.x,
            cy: start.y,
            radius,
            stroke: ctx.currentColor,
            strokeWidth: ctx.currentSize,
            fill: 'transparent',
          } as CircleElement,
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
