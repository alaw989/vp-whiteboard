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
      lineStart.value = pos
      currentLineEnd.value = pos
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (!ctx.isDrawing.value) return
      currentLineEnd.value = lineStart.value ? ctx.constrainPoint(lineStart.value, pos) : pos
    },
    onMouseUp(_event: any, _pos: PointerPosition) {
      if (!ctx.isDrawing.value || !lineStart.value || !currentLineEnd.value) return

      const start = lineStart.value
      const end = currentLineEnd.value

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
