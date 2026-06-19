import type { CanvasElement, ArrowElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useArrowTool(ctx: ToolContext): ToolHandler {
  const arrowStart = ref<PointerPosition | null>(null)
  const currentArrowEnd = ref<PointerPosition | null>(null)

  function reset() {
    arrowStart.value = null
    currentArrowEnd.value = null
  }

  return {
    state: { arrowStart, currentArrowEnd },
    onMouseDown(_event: any, pos: PointerPosition) {
      ctx.isDrawing.value = true
      const snap = ctx.findSnapPoint(pos, ctx.elements)
      const start = snap ? { x: snap.x, y: snap.y } : pos
      arrowStart.value = start
      currentArrowEnd.value = start
      ctx.currentSnapPoint.value = snap || null
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (!ctx.isDrawing.value || !arrowStart.value) return
      // OSNAP takes priority; otherwise apply ortho/polar/grid constraint.
      const snap = ctx.findSnapPoint(pos, ctx.elements)
      if (snap) {
        currentArrowEnd.value = { x: snap.x, y: snap.y }
        ctx.currentSnapPoint.value = snap
      } else {
        currentArrowEnd.value = ctx.constrainPoint(arrowStart.value, pos)
        ctx.currentSnapPoint.value = null
      }
    },
    onMouseUp(_event: any, _pos: PointerPosition) {
      if (!ctx.isDrawing.value || !arrowStart.value || !currentArrowEnd.value) return

      const start = arrowStart.value
      const end = currentArrowEnd.value

      const element: CanvasElement = {
        id: `${ctx.userId}-${Date.now()}`,
        type: 'arrow',
        userId: ctx.userId,
        userName: ctx.userName,
        timestamp: Date.now(),
        data: {
          points: [[start.x, start.y], [end.x, end.y]],
          pointerLength: 10,
          pointerWidth: 10,
          stroke: ctx.currentColor,
          strokeWidth: ctx.currentSize,
          fill: ctx.currentColor,
        } as ArrowElement,
      }
      ctx.emitElementAdd(element)

      reset()
      ctx.isDrawing.value = false
    },
    deactivate() {
      reset()
    },
  }
}
