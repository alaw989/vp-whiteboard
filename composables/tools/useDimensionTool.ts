import { ref } from 'vue'
import type { CanvasElement, DimensionElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useDimensionTool(ctx: ToolContext): ToolHandler {
  const step = ref<'start' | 'end' | 'offset'>('start')
  const startPoint = ref<[number, number] | null>(null)
  const endPoint = ref<[number, number] | null>(null)
  const previewOffset = ref<number>(0)
  const currentPos = ref<PointerPosition | null>(null)

  function reset() {
    step.value = 'start'
    startPoint.value = null
    endPoint.value = null
    previewOffset.value = 0
    currentPos.value = null
    ctx.isDrawing.value = false
  }

  function createDimensionElement(): CanvasElement {
    const start = startPoint.value!
    const end = endPoint.value!
    const offset = previewOffset.value

    // Calculate the distance value
    const dx = end[0] - start[0]
    const dy = end[1] - start[1]
    const pixelDist = Math.sqrt(dx * dx + dy * dy)
    const pixelsPerInch = 96
    const value = +(pixelDist / pixelsPerInch).toFixed(4)

    const data: DimensionElement = {
      start,
      end,
      offset,
      pixelsPerInch,
      unit: 'inches',
      precision: 4,
      style: 'linear',
      color: ctx.currentColor,
      size: ctx.currentSize || 1,
      value,
    }

    return {
      id: `dimension-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'dimension',
      userId: ctx.userId,
      userName: ctx.userName,
      timestamp: Date.now(),
      data,
    }
  }

  return {
    state: {
      step,
      startPoint,
      endPoint,
      previewOffset,
      currentPos,
    },

    activate() {
      reset()
      ctx.setCursor('crosshair')
    },

    deactivate() {
      reset()
      ctx.clearCursor()
    },

    onMouseDown(_event: any, pos: PointerPosition) {
      const snap = ctx.findSnapPoint(pos, ctx.elements)
      const pt: PointerPosition = snap || pos

      if (step.value === 'start') {
        startPoint.value = [pt.x, pt.y]
        step.value = 'end'
        ctx.isDrawing.value = true
      } else if (step.value === 'end') {
        endPoint.value = [pt.x, pt.y]
        step.value = 'offset'
      } else if (step.value === 'offset') {
        // Finalize
        ctx.emitElementAdd(createDimensionElement())
        reset()
        step.value = 'start'
      }
    },

    onMouseMove(_event: any, pos: PointerPosition) {
      currentPos.value = pos

      if (step.value === 'end' && startPoint.value) {
        const snap = ctx.findSnapPoint(pos, ctx.elements)
        ctx.currentSnapPoint.value = snap || null
      }

      if (step.value === 'offset' && startPoint.value && endPoint.value) {
        // Calculate perpendicular distance from cursor to the start-end line
        const [sx, sy] = startPoint.value
        const [ex, ey] = endPoint.value
        const dx = ex - sx
        const dy = ey - sy
        const lenSq = dx * dx + dy * dy
        if (lenSq > 0) {
          // Signed perpendicular distance (positive = left side of line direction)
          previewOffset.value = ((pos.x - sx) * dy - (pos.y - sy) * dx) / Math.sqrt(lenSq)
        }
      }
    },

    onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        reset()
      }
    },
  }
}
