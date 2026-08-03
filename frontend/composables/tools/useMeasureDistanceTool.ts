import { ref } from 'vue'
import { toastError } from '~/composables/useToast'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useMeasureDistanceTool(ctx: ToolContext): ToolHandler {
  const startPoint = ref<[number, number] | null>(null)

  return {
    state: { startPoint },
    onMouseDown(_event: any, pos: PointerPosition) {
      if (!ctx.isMeasuring.value) {
        const snap = ctx.findSnapPoint(pos, ctx.elements)
        const pt: [number, number] = snap ? [snap.x, snap.y] : [pos.x, pos.y]
        startPoint.value = pt
        ctx.startDistanceMeasurement(pt)
      } else {
        const snap = ctx.findSnapPoint(pos, ctx.elements)
        const endPoint: [number, number] = snap ? [snap.x, snap.y] : [pos.x, pos.y]

        // Discard zero-length measurement
        if (startPoint.value) {
          const dx = endPoint[0] - startPoint.value[0]
          const dy = endPoint[1] - startPoint.value[1]
          if (dx * dx + dy * dy < 1) {
            ctx.cancelMeasurement()
            startPoint.value = null
            return
          }
        }

        ctx.completeDistanceMeasurement(endPoint, ctx.currentColor)
        startPoint.value = null
      }
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (!ctx.isMeasuring.value) return

      const snap = ctx.findSnapPoint(pos, ctx.elements)
      const updatePos: [number, number] = snap ? [snap.x, snap.y] : [pos.x, pos.y]
      ctx.updateMeasurementPreview(updatePos)
      ctx.currentSnapPoint.value = snap || null
    },
  }
}
