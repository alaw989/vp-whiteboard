import type { CanvasElement, LineElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useLineTool(ctx: ToolContext): ToolHandler {
  const lineStart = ref<PointerPosition | null>(null)
  const currentLineEnd = ref<PointerPosition | null>(null)

  function reset() {
    lineStart.value = null
    currentLineEnd.value = null
  }

  return {
    state: { lineStart, currentLineEnd },
    onMouseDown(_event: any, pos: PointerPosition) {
      ctx.isDrawing.value = true
      const snap = ctx.findSnapPoint(pos, ctx.elements)
      const start = snap ? { x: snap.x, y: snap.y } : pos
      lineStart.value = start
      currentLineEnd.value = start
      ctx.currentSnapPoint.value = snap || null
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (!ctx.isDrawing.value || !lineStart.value) return
      // OSNAP takes priority; otherwise apply ortho/polar/grid constraint.
      const snap = ctx.findSnapPoint(pos, ctx.elements)
      if (snap) {
        currentLineEnd.value = { x: snap.x, y: snap.y }
        ctx.currentSnapPoint.value = snap
      } else {
        currentLineEnd.value = ctx.constrainPoint(lineStart.value, pos)
        ctx.currentSnapPoint.value = null
      }
    },
    onMouseUp(_event: any, _pos: PointerPosition) {
      if (!ctx.isDrawing.value || !lineStart.value || !currentLineEnd.value) return

      const start = lineStart.value
      const end = currentLineEnd.value

      // Skip zero-length lines from stray clicks (no drag)
      const dx = end.x - start.x
      const dy = end.y - start.y
      if (dx * dx + dy * dy < 1) {
        reset()
        ctx.isDrawing.value = false
        return
      }

      const element: CanvasElement = {
        id: `${ctx.userId}-${Date.now()}`,
        type: 'line',
        userId: ctx.userId,
        userName: ctx.userName,
        timestamp: Date.now(),
        data: {
          start: [start.x, start.y],
          end: [end.x, end.y],
          color: ctx.currentColor,
          size: ctx.currentSize,
        } as LineElement,
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
