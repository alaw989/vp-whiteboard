import { ref } from 'vue'
import { getStroke } from 'perfect-freehand'
import type { CanvasElement, StrokeElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function usePenTool(ctx: ToolContext): ToolHandler {
  const currentStrokePoints = ref<[number, number, number][]>([])
  const currentStrokeId = ref<string | null>(null)

  function reset() {
    currentStrokePoints.value = []
    currentStrokeId.value = null
  }

  return {
    state: { currentStrokePoints, currentStrokeId },
    onMouseDown(_event: any, pos: PointerPosition) {
      ctx.isDrawing.value = true
      currentStrokePoints.value = [[pos.x, pos.y, ctx.currentPressure.value]]

      // Start broadcasting active stroke
      if (ctx.startActiveStroke) {
        currentStrokeId.value = `${ctx.userId}-${Date.now()}`
        ctx.startActiveStroke(currentStrokeId.value)
      }
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (!ctx.isDrawing.value) return

      currentStrokePoints.value.push([pos.x, pos.y, ctx.currentPressure.value])

      // Broadcast stroke point
      if (currentStrokeId.value && ctx.broadcastStrokePoint) {
        ctx.broadcastStrokePoint(currentStrokeId.value, [pos.x, pos.y, ctx.currentPressure.value])
      }
    },
    onMouseUp(_event: any, _pos: PointerPosition) {
      if (!ctx.isDrawing.value) return

      if (currentStrokePoints.value.length > 1) {
        const element: CanvasElement = {
          id: currentStrokeId.value || `${ctx.userId}-${Date.now()}`,
          type: 'stroke',
          userId: ctx.userId,
          userName: ctx.userName,
          timestamp: Date.now(),
          data: {
            points: currentStrokePoints.value,
            color: ctx.currentColor,
            size: ctx.currentSize,
            tool: ctx.currentTool as 'pen' | 'highlighter',
            smooth: true,
          } as StrokeElement,
        }

        if (currentStrokeId.value && ctx.endActiveStroke) {
          ctx.endActiveStroke(currentStrokeId.value, element)
        } else {
          ctx.emitElementAdd(element)
        }
      }

      ctx.isDrawing.value = false
      reset()
    },
    cancel() {
      // Abort the in-flight stroke (e.g. a two-finger gesture interrupted it)
      // without committing it. Clears the remote active-stroke preview so
      // collaborators don't see a stuck stroke.
      if (currentStrokeId.value && ctx.cancelActiveStroke) {
        ctx.cancelActiveStroke(currentStrokeId.value)
      }
      reset()
    },
  }
}
