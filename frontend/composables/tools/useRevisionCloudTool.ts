import type { CanvasElement, RevisionCloudElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

/** Default chord length (px) per cloud lobe. Shared with the canvas preview. */
export const DEFAULT_REVISION_CLOUD_ARC_LENGTH = 26

// Click within this distance of the first/last vertex finishes the cloud.
const FINISH_THRESHOLD = 10

export function useRevisionCloudTool(ctx: ToolContext): ToolHandler {
  const vertices = ref<PointerPosition[]>([])
  const currentVertex = ref<PointerPosition | null>(null)
  const isDrawing = ref(false)

  function reset() {
    vertices.value = []
    currentVertex.value = null
    isDrawing.value = false
  }

  // Revision clouds are always closed (puffy loop) — matches AutoCAD's default.
  function finishCloud() {
    if (vertices.value.length < 2) {
      reset()
      return
    }

    const points: [number, number][] = vertices.value.map(v => [v.x, v.y])

    const element: CanvasElement = {
      id: `${ctx.userId}-${Date.now()}`,
      type: 'revision-cloud',
      userId: ctx.userId,
      userName: ctx.userName,
      timestamp: Date.now(),
      data: {
        points,
        arcLength: DEFAULT_REVISION_CLOUD_ARC_LENGTH,
        color: ctx.currentColor,
        size: ctx.currentSize,
        closed: true,
      } as RevisionCloudElement,
    }
    ctx.emitElementAdd(element)
    reset()
  }

  function cancelCloud() {
    reset()
  }

  return {
    state: { vertices, currentVertex, isDrawing: isDrawing },
    onMouseDown(_event: any, pos: PointerPosition) {
      // Finish (closed) when clicking near the start point or the last vertex
      if (isDrawing.value && vertices.value.length >= 2) {
        const first = vertices.value[0]!
        if (Math.hypot(pos.x - first.x, pos.y - first.y) < FINISH_THRESHOLD) {
          finishCloud()
          return
        }
        const last = vertices.value[vertices.value.length - 1]!
        if (Math.hypot(pos.x - last.x, pos.y - last.y) < FINISH_THRESHOLD) {
          finishCloud()
          return
        }
      }

      const snap = ctx.findSnapPoint(pos, ctx.elements)
      ctx.currentSnapPoint.value = snap || null

      const next = snap
        ? { x: snap.x, y: snap.y } as PointerPosition
        : vertices.value.length > 0
          ? ctx.constrainPoint(vertices.value[vertices.value.length - 1]!, pos)
          : pos

      vertices.value.push(next)
      isDrawing.value = true
      currentVertex.value = next
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (!isDrawing.value || vertices.value.length === 0) return
      const snap = ctx.findSnapPoint(pos, ctx.elements)
      ctx.currentSnapPoint.value = snap || null
      currentVertex.value = snap
        ? { x: snap.x, y: snap.y } as PointerPosition
        : ctx.constrainPoint(vertices.value[vertices.value.length - 1]!, pos)
    },
    onMouseUp() {
      // Revision cloud uses clicks, not drag — no action on mouseup
    },
    onKeyDown(event: KeyboardEvent): boolean {
      if (!isDrawing.value) return false

      if (event.key === 'Enter') {
        finishCloud()
        return true
      } else if (event.key === 'Escape') {
        cancelCloud()
        return true
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        if (vertices.value.length > 1) {
          vertices.value.pop()
          currentVertex.value = vertices.value[vertices.value.length - 1]!
        } else {
          cancelCloud()
        }
        return true
      } else if (event.key === 'c' || event.key === 'C') {
        finishCloud()
        return true
      }
      return false
    },
    deactivate() {
      // Finish if enough vertices, otherwise discard
      if (isDrawing.value && vertices.value.length >= 2) {
        finishCloud()
      } else {
        reset()
      }
    },
  }
}
