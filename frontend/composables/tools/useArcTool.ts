import type { CanvasElement, ArcElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useArcTool(ctx: ToolContext): ToolHandler {
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

    // Discard if start and end are the same (zero-length)
    const sx = end[0] - start[0]
    const sy = end[1] - start[1]
    if (sx * sx + sy * sy < 1) {
      reset()
      return
    }

    // Discard if points are collinear (degenerate arc)
    const cross = (through[0] - start[0]) * (end[1] - start[1]) - (through[1] - start[1]) * (end[0] - start[0])
    if (Math.abs(cross) < 1) {
      reset()
      return
    }

    ctx.emitElementAdd({
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
    })
    reset()
  }

  return {
    state: { clickPoints, currentCursor, isDrawing },
    onMouseDown(_event: any, pos: PointerPosition) {
      if (clickPoints.value.length >= 3) {
        reset()
      }

      const snap = ctx.findSnapPoint(pos, ctx.elements)
      const pt: [number, number] = snap ? [snap.x, snap.y] : [pos.x, pos.y]
      clickPoints.value.push(pt)
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
