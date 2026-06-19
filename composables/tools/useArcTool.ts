import type { CanvasElement, ArcElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useArcTool(ctx: ToolContext): ToolHandler {
  // Three-click arc: start, through, end
  const clickPoints = ref<[number, number][]>([])
  const currentCursor = ref<PointerPosition | null>(null)
  const isDrawing = ref(false)

  function reset() {
    clickPoints.value = []
    currentCursor.value = null
    isDrawing.value = false
  }

  function finishArc() {
    if (clickPoints.value.length !== 3) {
      reset()
      return
    }

    const [start, through, end] = clickPoints.value as [[number, number], [number, number], [number, number]]

    const element: CanvasElement = {
      id: `${ctx.userId}-${Date.now()}`,
      type: 'arc',
      userId: ctx.userId,
      userName: ctx.userName,
      timestamp: Date.now(),
      data: {
        start,
        through,
        end,
        color: ctx.currentColor,
        size: ctx.currentSize,
      } as ArcElement,
    }
    ctx.emitElementAdd(element)
    reset()
  }

  return {
    state: { clickPoints, currentCursor, isDrawing },
    onMouseDown(_event: any, pos: PointerPosition) {
      if (clickPoints.value.length >= 3) {
        reset()
      }

      clickPoints.value.push([pos.x, pos.y])
      isDrawing.value = true

      if (clickPoints.value.length === 3) {
        finishArc()
      }
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (!isDrawing.value) return
      currentCursor.value = pos
    },
    onMouseUp() {
      // Arc uses clicks, not drag
    },
    onKeyDown(event: KeyboardEvent): boolean {
      if (!isDrawing.value) return false

      if (event.key === 'Escape') {
        reset()
        return true
      }
      return false
    },
    deactivate() {
      reset()
    },
  }
}
