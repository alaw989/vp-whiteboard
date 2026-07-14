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
      const snap = ctx.findSnapPoint(pos, ctx.elements)
      const start = snap ? { x: snap.x, y: snap.y } : pos
      shapeStart.value = start
      currentShapeEnd.value = start
      ctx.currentSnapPoint.value = snap || null
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (!ctx.isDrawing.value) return
      const snap = ctx.findSnapPoint(pos, ctx.elements)
      if (snap) {
        currentShapeEnd.value = { x: snap.x, y: snap.y }
        ctx.currentSnapPoint.value = snap
      } else if (shapeStart.value) {
        currentShapeEnd.value = ctx.constrainPoint(shapeStart.value, pos)
        ctx.currentSnapPoint.value = null
      }
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
