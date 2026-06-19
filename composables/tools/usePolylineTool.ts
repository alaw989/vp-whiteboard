import type { CanvasElement, PolylineElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function usePolylineTool(ctx: ToolContext): ToolHandler {
  const vertices = ref<PointerPosition[]>([])
  const currentVertex = ref<PointerPosition | null>(null)
  const isDrawing = ref(false)

  function reset() {
    vertices.value = []
    currentVertex.value = null
    isDrawing.value = false
  }

  function finishPolyline() {
    if (vertices.value.length < 2) {
      reset()
      return
    }

    const points: [number, number][] = vertices.value.map(v => [v.x, v.y])

    const element: CanvasElement = {
      id: `${ctx.userId}-${Date.now()}`,
      type: 'polyline',
      userId: ctx.userId,
      userName: ctx.userName,
      timestamp: Date.now(),
      data: {
        points,
        color: ctx.currentColor,
        size: ctx.currentSize,
        closed: false,
      } as PolylineElement,
    }
    ctx.emitElementAdd(element)
    reset()
  }

  function cancelPolyline() {
    reset()
  }

  return {
    state: { vertices, currentVertex, isDrawing: isDrawing },
    onMouseDown(_event: any, pos: PointerPosition) {
      // Check for double-click (finish polyline)
      if (isDrawing.value && vertices.value.length >= 2) {
        const lastVertex = vertices.value[vertices.value.length - 1]!
        const dist = Math.hypot(pos.x - lastVertex.x, pos.y - lastVertex.y)
        if (dist < 10) {
          finishPolyline()
          return
        }
      }

      const constrained = vertices.value.length > 0
        ? ctx.constrainPoint(vertices.value[vertices.value.length - 1]!, pos)
        : pos

      vertices.value.push(constrained)
      isDrawing.value = true
      currentVertex.value = constrained
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (!isDrawing.value || vertices.value.length === 0) return
      currentVertex.value = ctx.constrainPoint(vertices.value[vertices.value.length - 1]!, pos)
    },
    onMouseUp() {
      // Polyline uses clicks, not drag — no action on mouseup
    },
    onKeyDown(event: KeyboardEvent): boolean {
      if (!isDrawing.value) return false

      if (event.key === 'Enter') {
        finishPolyline()
        return true
      } else if (event.key === 'Escape') {
        cancelPolyline()
        return true
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        // Remove last vertex
        if (vertices.value.length > 1) {
          vertices.value.pop()
          currentVertex.value = vertices.value[vertices.value.length - 1]!
        } else {
          cancelPolyline()
        }
        return true
      } else if (event.key === 'c' || event.key === 'C') {
        // Close the polyline
        if (vertices.value.length >= 3) {
          const points: [number, number][] = vertices.value.map(v => [v.x, v.y])
          const element: CanvasElement = {
            id: `${ctx.userId}-${Date.now()}`,
            type: 'polyline',
            userId: ctx.userId,
            userName: ctx.userName,
            timestamp: Date.now(),
            data: {
              points,
              color: ctx.currentColor,
              size: ctx.currentSize,
              closed: true,
            } as PolylineElement,
          }
          ctx.emitElementAdd(element)
          reset()
        }
        return true
      }
      return false
    },
    deactivate() {
      // If polyline is in progress with enough points, finish it
      if (isDrawing.value && vertices.value.length >= 2) {
        finishPolyline()
      } else {
        reset()
      }
    },
  }
}
