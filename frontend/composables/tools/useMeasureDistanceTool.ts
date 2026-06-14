import { toastError } from '~/composables/useToast'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useMeasureDistanceTool(ctx: ToolContext): ToolHandler {
  return {
    onMouseDown(_event: any, pos: PointerPosition) {
      if (!ctx.isMeasuring.value) {
        const snap = ctx.findSnapPoint(pos, ctx.elements)
        const startPoint: [number, number] = snap ? [snap.x, snap.y] : [pos.x, pos.y]
        ctx.startDistanceMeasurement(startPoint)
      } else {
        const snap = ctx.findSnapPoint(pos, ctx.elements)
        const endPoint: [number, number] = snap ? [snap.x, snap.y] : [pos.x, pos.y]
        ctx.completeDistanceMeasurement(endPoint, ctx.currentColor)
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
