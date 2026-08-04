import { ref } from 'vue'
import type { CanvasElement, LineElement, PolylineElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'
import {
  type Point,
  lineSegmentIntersection,
  nearestPointOnSegment,
  distance,
  direction,
  getElementGeometry,
  findElementAtPosition,
} from '~/utils/geometryUtils'

export function useExtendTool(ctx: ToolContext): ToolHandler {
  const boundaryId = ref<string | null>(null)
  const step = ref<'boundary' | 'extend'>('boundary')
  const highlightId = ref<string | null>(null)

  function reset() {
    boundaryId.value = null
    step.value = 'boundary'
    highlightId.value = null
  }

  function extendElement(element: CanvasElement, boundary: CanvasElement, clickPos: PointerPosition) {
    if (element.type === 'line') {
      extendLine(element, boundary, clickPos)
    } else if (element.type === 'polyline') {
      extendPolyline(element, boundary, clickPos)
    }
  }

  function extendLine(element: CanvasElement, boundary: CanvasElement, clickPos: PointerPosition) {
    const data = element.data as LineElement
    const start: Point = { x: data.start[0], y: data.start[1] }
    const end: Point = { x: data.end[0], y: data.end[1] }
    const dir = direction(start, end)

    const boundaryGeo = getElementGeometry(boundary)
    if (!boundaryGeo?.segments) return

    // Find intersection of the line (extended) with the boundary
    let closestIntersection: Point | null = null
    let closestDist = Infinity

    for (const seg of boundaryGeo.segments) {
      const ip = lineSegmentIntersection(start, dir, seg.start, seg.end)
      if (!ip) continue

      // Must be in the forward direction from the line
      const dot = (ip.x - start.x) * dir.x + (ip.y - start.y) * dir.y
      if (dot < 0) continue // behind the start

      const d = distance(end, ip)
      // Must extend beyond current endpoint
      const dotFromEnd = (ip.x - end.x) * dir.x + (ip.y - end.y) * dir.y
      if (dotFromEnd < 0) continue

      if (d < closestDist) {
        closestDist = d
        closestIntersection = ip
      }
    }

    if (!closestIntersection) return

    // Determine which end to extend — the one closer to click
    const distToStart = distance(clickPos, start)
    const distToEnd = distance(clickPos, end)

    if (distToEnd < distToStart) {
      // Extend end to intersection
      ctx.emitElementUpdate(element.id, {
        data: { ...data, end: [closestIntersection.x, closestIntersection.y] },
      })
    } else {
      // Extend start to intersection (reverse direction)
      const revDir = { x: -dir.x, y: -dir.y }
      let closestRev: Point | null = null
      let closestRevDist = Infinity

      for (const seg of boundaryGeo.segments) {
        const ip = lineSegmentIntersection(end, revDir, seg.start, seg.end)
        if (!ip) continue
        const dot = (ip.x - end.x) * revDir.x + (ip.y - end.y) * revDir.y
        if (dot < 0) continue
        const dotFromStart = (ip.x - start.x) * revDir.x + (ip.y - start.y) * revDir.y
        if (dotFromStart < 0) continue
        const d = distance(start, ip)
        if (d < closestRevDist) {
          closestRevDist = d
          closestRev = ip
        }
      }

      if (closestRev) {
        ctx.emitElementUpdate(element.id, {
          data: { ...data, start: [closestRev.x, closestRev.y] },
        })
      }
    }
  }

  function extendPolyline(element: CanvasElement, boundary: CanvasElement, clickPos: PointerPosition) {
    const data = element.data as PolylineElement
    const pts: Point[] = data.points.map((p: number[]) => ({ x: p[0]!, y: p[1]! }))
    if (pts.length < 2) return

    const boundaryGeo = getElementGeometry(boundary)
    if (!boundaryGeo?.segments) return

    const distToStart = distance(clickPos, pts[0]!)
    const distToEnd = distance(clickPos, pts[pts.length - 1]!)

    if (distToEnd < distToStart) {
      const last = pts[pts.length - 1]!
      const prev = pts[pts.length - 2]!
      const dir = direction(prev, last)

      let closest: Point | null = null
      let closestDist = Infinity
      for (const seg of boundaryGeo.segments) {
        const ip = lineSegmentIntersection(last, dir, seg.start, seg.end)
        if (!ip) continue
        const dotVal = (ip.x - last.x) * dir.x + (ip.y - last.y) * dir.y
        if (dotVal < 0) continue
        const d = distance(last, ip)
        if (d < closestDist) {
          closestDist = d
          closest = ip
        }
      }

      if (closest) {
        const newPts = [...pts, closest]
        ctx.emitElementUpdate(element.id, {
          data: { ...data, points: newPts.map(p => [p.x, p.y] as [number, number]) },
        })
      }
    } else {
      const first = pts[0]!
      const second = pts[1]!
      const dir = direction(second, first)

      let closest: Point | null = null
      let closestDist = Infinity
      for (const seg of boundaryGeo.segments) {
        const ip = lineSegmentIntersection(first, dir, seg.start, seg.end)
        if (!ip) continue
        const dotVal = (ip.x - first.x) * dir.x + (ip.y - first.y) * dir.y
        if (dotVal < 0) continue
        const d = distance(first, ip)
        if (d < closestDist) {
          closestDist = d
          closest = ip
        }
      }

      if (closest) {
        const newPts = [closest, ...pts]
        ctx.emitElementUpdate(element.id, {
          data: { ...data, points: newPts.map(p => [p.x, p.y] as [number, number]) },
        })
      }
    }
  }

  return {
    state: { boundaryId, step, highlightId },
    activate() {
      reset()
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      const snap = ctx.findSnapPoint(pos, ctx.elements)
      ctx.currentSnapPoint.value = snap || null
      const el = findElementAtPosition(pos, ctx.elements, ctx.viewport.value.zoom)
      highlightId.value = el?.id ?? null
    },
    onMouseDown(_event: any, pos: PointerPosition) {
      const snap = ctx.findSnapPoint(pos, ctx.elements)
      ctx.currentSnapPoint.value = snap || null
      const el = findElementAtPosition(pos, ctx.elements, ctx.viewport.value.zoom)
      if (!el) return
      if (step.value === 'boundary') {
        boundaryId.value = el.id
        step.value = 'extend'
        highlightId.value = null
        return
      }
      if (el.id === boundaryId.value) return

      const boundary = ctx.elements.find(e => e.id === boundaryId.value)
      if (!boundary) return

      extendElement(el, boundary, pos)
    },
    onKeyDown(event: KeyboardEvent): boolean {
      if (event.key === 'Escape') {
        if (step.value === 'extend') {
          boundaryId.value = null
          step.value = 'boundary'
          return true
        } else if (boundaryId.value) {
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
