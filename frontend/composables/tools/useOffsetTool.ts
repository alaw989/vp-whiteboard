import { ref } from 'vue'
import type { CanvasElement, LineElement, PolylineElement, RectangleElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'
import {
  type Point,
  parallelSegment,
  offsetPolyline,
  findNearestElementSegment,
} from '~/utils/geometryUtils'

export function useOffsetTool(ctx: ToolContext): ToolHandler {
  const offsetDistance = ref(10)
  const previewResult = ref<{ element: CanvasElement; offsetEl: CanvasElement } | null>(null)
  const step = ref<'distance' | 'select'>('distance')

  function reset() {
    previewResult.value = null
    step.value = 'distance'
  }

  function createOffsetElement(element: CanvasElement, offset: number, side: Point): CanvasElement | null {
    switch (element.type) {
      case 'line': {
        const ld = element.data as LineElement
        const seg = { start: { x: ld.start[0], y: ld.start[1] }, end: { x: ld.end[0], y: ld.end[1] } }
        const dir = { x: ld.end[0] - ld.start[0], y: ld.end[1] - ld.start[1] }
        const n = { x: -dir.y, y: dir.x }
        const len = Math.hypot(n.x, n.y)
        if (len === 0) return null
        n.x /= len
        n.y /= len
        const toClick = { x: side.x - ld.start[0], y: side.y - ld.start[1] }
        const dot = toClick.x * n.x + toClick.y * n.y
        const signedOffset = dot >= 0 ? offset : -offset

        const offsetSeg = parallelSegment(seg, signedOffset)
        return {
          id: `${ctx.userId}-${Date.now()}`,
          type: 'line',
          userId: ctx.userId,
          userName: ctx.userName,
          timestamp: Date.now(),
          data: {
            start: [offsetSeg.start.x, offsetSeg.start.y],
            end: [offsetSeg.end.x, offsetSeg.end.y],
            color: ctx.currentColor,
            size: ctx.currentSize,
          } as LineElement,
        }
      }
      case 'polyline': {
        const pd = element.data as PolylineElement
        const pts: Point[] = pd.points.map((p: number[]) => ({ x: p[0]!, y: p[1]! }))
        if (pts.length < 2) return null
        const firstDir = { x: pts[1]!.x - pts[0]!.x, y: pts[1]!.y - pts[0]!.y }
        const n = { x: -firstDir.y, y: firstDir.x }
        const len = Math.hypot(n.x, n.y)
        if (len === 0) return null
        n.x /= len
        n.y /= len
        const toClick = { x: side.x - pts[0]!.x, y: side.y - pts[0]!.y }
        const dot = toClick.x * n.x + toClick.y * n.y
        const signedOffset = dot >= 0 ? offset : -offset

        const offsetPts = offsetPolyline(pts, signedOffset)
        return {
          id: `${ctx.userId}-${Date.now()}`,
          type: 'polyline',
          userId: ctx.userId,
          userName: ctx.userName,
          timestamp: Date.now(),
          data: {
            points: offsetPts.map(p => [p.x, p.y] as [number, number]),
            color: ctx.currentColor,
            size: ctx.currentSize,
            closed: pd.closed,
          } as PolylineElement,
        }
      }
      case 'rectangle': {
        const rd = element.data as RectangleElement
        const cx = rd.x + rd.width / 2
        const cy = rd.y + rd.height / 2
        const outward = (side.x - rd.x) * (cx - rd.x) + (side.y - rd.y) * (cy - rd.y) > 0
        const s = outward ? 1 : -1
        return {
          id: `${ctx.userId}-${Date.now()}`,
          type: 'rectangle',
          userId: ctx.userId,
          userName: ctx.userName,
          timestamp: Date.now(),
          data: {
            x: rd.x - s * offset,
            y: rd.y - s * offset,
            width: rd.width + s * offset * 2,
            height: rd.height + s * offset * 2,
            stroke: ctx.currentColor,
            strokeWidth: ctx.currentSize,
            fill: rd.fill,
          } as RectangleElement,
        }
      }
      default:
        return null
    }
  }

  function isOffsetableType(el: CanvasElement): boolean {
    return el.type === 'line' || el.type === 'polyline' || el.type === 'rectangle'
  }

  return {
    state: { offsetDistance, previewResult, step },
    activate() {
      reset()
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (step.value !== 'select') return

      const snap = ctx.findSnapPoint(pos, ctx.elements)
      ctx.currentSnapPoint.value = snap || null
      const nearest = findNearestElementSegment(pos, ctx.elements)
      if (!nearest || !isOffsetableType(nearest.element)) {
        previewResult.value = null
        return
      }

      const offsetEl = createOffsetElement(nearest.element, offsetDistance.value, pos)
      if (offsetEl) {
        previewResult.value = { element: nearest.element, offsetEl }
      }
    },
    onMouseDown(_event: any, pos: PointerPosition) {
      if (step.value === 'distance') {
        const nearest = findNearestElementSegment(pos, ctx.elements)
        if (nearest && isOffsetableType(nearest.element)) {
          offsetDistance.value = Math.round(nearest.distance * 10) / 10
          step.value = 'select'
        }
        return
      }

      if (!previewResult.value) return

      ctx.emitElementAdd(previewResult.value.offsetEl)
      previewResult.value = null
    },
    onKeyDown(event: KeyboardEvent): boolean {
      if (event.key === 'Escape') {
        if (step.value === 'select') {
          reset()
          return true
        }
        return false
      }
      return false
    },
    deactivate() {
      reset()
    },
  }
}
