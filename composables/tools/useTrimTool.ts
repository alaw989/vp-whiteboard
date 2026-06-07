import type { CanvasElement, LineElement, PolylineElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'
import {
  type Point,
  segmentSegmentIntersection,
  nearestPointOnSegment,
  distance,
  getElementGeometry,
} from '~/utils/geometryUtils'

export function useTrimTool(ctx: ToolContext): ToolHandler {
  const cuttingEdgeId = ref<string | null>(null)
  const step = ref<'cutting-edge' | 'trim'>('cutting-edge')
  const highlightId = ref<string | null>(null)

  function reset() {
    cuttingEdgeId.value = null
    step.value = 'cutting-edge'
    highlightId.value = null
  }

  function findElementAtPosition(pos: PointerPosition): CanvasElement | null {
    const threshold = 8 / ctx.viewport.value.zoom
    let best: { element: CanvasElement; dist: number } | null = null

    for (const el of ctx.elements) {
      const geo = getElementGeometry(el)
      if (!geo?.segments) continue

      for (const seg of geo.segments) {
        const near = nearestPointOnSegment(seg.start, seg.end, pos)
        const d = distance(pos, near)
        if (d < threshold && (!best || d < best.dist)) {
          best = { element: el, dist: d }
        }
      }
    }

    return best?.element ?? null
  }

  /** Trim an element at intersection points with the cutting edge */
  function trimElement(element: CanvasElement, cuttingEdge: CanvasElement, clickPos: PointerPosition) {
    const elGeo = getElementGeometry(element)
    const cutGeo = getElementGeometry(cuttingEdge)
    if (!elGeo?.segments || !cutGeo?.segments) return

    // Find all intersection points
    const intersections: { segIdx: number; point: Point }[] = []
    for (let i = 0; i < elGeo.segments.length; i++) {
      const elSeg = elGeo.segments[i]!
      for (const cutSeg of cutGeo.segments) {
        const ip = segmentSegmentIntersection(
          elSeg.start, elSeg.end,
          cutSeg.start, cutSeg.end,
        )
        if (ip) {
          intersections.push({ segIdx: i, point: ip })
        }
      }
    }

    if (intersections.length === 0) return

    if (element.type === 'line') {
      trimLine(element, intersections, clickPos)
    } else if (element.type === 'polyline') {
      trimPolyline(element, intersections, clickPos)
    }
  }

  function trimLine(element: CanvasElement, intersections: { segIdx: number; point: Point }[], clickPos: PointerPosition) {
    const data = element.data as LineElement
    const start: Point = { x: data.start[0], y: data.start[1] }
    const end: Point = { x: data.end[0], y: data.end[1] }

    // Determine which part to keep based on which end is closer to click
    const ip = intersections[0]!.point
    const distToStart = distance(clickPos, start)
    const distToEnd = distance(clickPos, end)

    if (distToStart < distToEnd) {
      // Keep start, trim from intersection to end
      ctx.emitElementUpdate(element.id, {
        data: { ...data, end: [ip.x, ip.y] },
      })
    } else {
      // Keep end, trim from start to intersection
      ctx.emitElementUpdate(element.id, {
        data: { ...data, start: [ip.x, ip.y] },
      })
    }
  }

  function trimPolyline(element: CanvasElement, intersections: { segIdx: number; point: Point }[], clickPos: PointerPosition) {
    const data = element.data as PolylineElement
    const pts: Point[] = data.points.map((p: number[]) => ({ x: p[0]!, y: p[1]! }))

    const firstIp = intersections[0]!
    const ip = firstIp.point

    const distToStart = distance(clickPos, pts[0]!)
    const distToEnd = distance(clickPos, pts[pts.length - 1]!)

    if (distToStart < distToEnd) {
      const newPts = pts.slice(0, firstIp.segIdx + 1).concat([ip])
      ctx.emitElementUpdate(element.id, {
        data: { ...data, points: newPts.map(p => [p.x, p.y] as [number, number]) },
      })
    } else {
      const newPts = [ip].concat(pts.slice(firstIp.segIdx + 1))
      ctx.emitElementUpdate(element.id, {
        data: { ...data, points: newPts.map(p => [p.x, p.y] as [number, number]) },
      })
    }
  }

  return {
    state: { cuttingEdgeId, step, highlightId },
    activate() {
      reset()
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      const el = findElementAtPosition(pos)
      highlightId.value = el?.id ?? null
    },
    onMouseDown(_event: any, pos: PointerPosition) {
      const el = findElementAtPosition(pos)
      if (!el) return

      if (step.value === 'cutting-edge') {
        // Select the cutting edge
        cuttingEdgeId.value = el.id
        step.value = 'trim'
        highlightId.value = null
        return
      }

      // Trim mode — trim this element at the cutting edge
      if (el.id === cuttingEdgeId.value) return

      const cuttingEdge = ctx.elements.find(e => e.id === cuttingEdgeId.value)
      if (!cuttingEdge) return

      trimElement(el, cuttingEdge, pos)
    },
    onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (step.value === 'trim') {
          // Go back to selecting cutting edge
          cuttingEdgeId.value = null
          step.value = 'cutting-edge'
        } else {
          reset()
        }
      }
    },
    deactivate() {
      reset()
    },
  }
}
