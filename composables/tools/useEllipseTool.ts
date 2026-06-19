import type { CanvasElement, EllipseElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useEllipseTool(ctx: ToolContext): ToolHandler {
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
      } else {
        currentShapeEnd.value = pos
        ctx.currentSnapPoint.value = null
      }
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
          type: 'ellipse',
          userId: ctx.userId,
          userName: ctx.userName,
          timestamp: Date.now(),
          data: {
            x: x + width / 2,
            y: y + height / 2,
            radiusX: width / 2,
            radiusY: height / 2,
            rotation: 0,
            stroke: ctx.currentColor,
            strokeWidth: ctx.currentSize,
            fill: 'transparent',
          } as EllipseElement,
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
