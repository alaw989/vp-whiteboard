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

  // Parameter of point p along segment a→b, clamped to [0, 1].
  function paramOnSeg(a: Point, b: Point, p: Point): number {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return 0
    return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  }

  function trimLine(element: CanvasElement, intersections: { segIdx: number; point: Point }[], clickPos: PointerPosition) {
    const data = element.data as LineElement
    const start: Point = { x: data.start[0], y: data.start[1] }
    const end: Point = { x: data.end[0], y: data.end[1] }

    // Sort all intersection points by position along start→end; drop ones at the
    // exact endpoints (nothing to trim there).
    type Cut = { t: number; point: Point }
    const cuts: Cut[] = intersections
      .map(i => ({ t: paramOnSeg(start, end, i.point), point: i.point }))
      .filter(c => c.t > 1e-4 && c.t < 1 - 1e-4)
      .sort((a, b) => a.t - b.t)
    if (cuts.length === 0) return

    const tClick = paramOnSeg(start, end, clickPos)

    // Find the piece [lo, hi] (in parameter space) that contains the click and
    // remove it — the side the click lands on, not the longer piece.
    let lo: Cut | null = null
    let hi: Cut | null = null
    for (const c of cuts) {
      if (c.t <= tClick) lo = c
      if (c.t >= tClick && !hi) hi = c
    }
    if (lo && hi && lo === hi) return // click exactly on a cut: nothing to remove

    if (!lo && hi) {
      // Remove the start piece → keep [hi, end].
      ctx.emitElementUpdate(element.id, { data: { ...data, start: [hi.point.x, hi.point.y] } })
    } else if (lo && !hi) {
      // Remove the end piece → keep [start, lo].
      ctx.emitElementUpdate(element.id, { data: { ...data, end: [lo.point.x, lo.point.y] } })
    } else if (lo && hi) {
      // Remove a middle piece → split into two line elements.
      ctx.emitElementDelete(element.id)
      ctx.emitElementAdd({
        ...element,
        id: `${ctx.userId}-${Date.now()}`,
        data: { ...data, start: [start.x, start.y], end: [lo.point.x, lo.point.y] } as LineElement,
      })
      ctx.emitElementAdd({
        ...element,
        id: `${ctx.userId}-${Date.now()}`,
        data: { ...data, start: [hi.point.x, hi.point.y], end: [end.x, end.y] } as LineElement,
      })
    }
  }

  function trimPolyline(element: CanvasElement, intersections: { segIdx: number; point: Point }[], clickPos: PointerPosition) {
    const data = element.data as PolylineElement
    const pts: Point[] = data.points.map((p: number[]) => ({ x: p[0]!, y: p[1]! }))
    if (pts.length < 2) return

    // Cumulative arc length lets us order cuts and the click consistently.
    const cum: number[] = [0]
    for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1]! + distance(pts[i - 1]!, pts[i]!)
    const arcOf = (segIdx: number, t: number) => cum[segIdx]! + t * (cum[segIdx + 1]! - cum[segIdx]!)

    type Cut = { segIdx: number; t: number; point: Point }
    const cuts: Cut[] = intersections
      .map(i => ({
        segIdx: i.segIdx,
        t: paramOnSeg(pts[i.segIdx]!, pts[i.segIdx + 1]!, i.point),
        point: i.point,
      }))
      .sort((a, b) => arcOf(a.segIdx, a.t) - arcOf(b.segIdx, b.t))
    if (cuts.length === 0) return

    // Click position along the polyline (nearest segment).
    let clickSeg = 0
    let clickT = 0
    let bestD = Infinity
    for (let i = 0; i < pts.length - 1; i++) {
      const near = nearestPointOnSegment(pts[i]!, pts[i + 1]!, clickPos)
      const d = distance(clickPos, near)
      if (d < bestD) {
        bestD = d
        clickSeg = i
        clickT = paramOnSeg(pts[i]!, pts[i + 1]!, near)
      }
    }
    const clickArc = arcOf(clickSeg, clickT)

    let lo: Cut | null = null
    let hi: Cut | null = null
    for (const c of cuts) {
      if (arcOf(c.segIdx, c.t) <= clickArc) lo = c
      if (arcOf(c.segIdx, c.t) >= clickArc && !hi) hi = c
    }
    if (lo && hi && lo === hi) return

    if (!lo && hi) {
      // Remove the start piece → keep from hi onward.
      const newPts = [hi.point, ...pts.slice(hi.segIdx + 1)]
      ctx.emitElementUpdate(element.id, { data: { ...data, points: newPts.map(p => [p.x, p.y] as [number, number]) } })
    } else if (lo && !hi) {
      // Remove the end piece → keep start through lo.
      const newPts = [...pts.slice(0, lo.segIdx + 1), lo.point]
      ctx.emitElementUpdate(element.id, { data: { ...data, points: newPts.map(p => [p.x, p.y] as [number, number]) } })
    } else if (lo && hi) {
      // Remove a middle piece → split into two polylines.
      const partA = [...pts.slice(0, lo.segIdx + 1), lo.point]
      const partB = [hi.point, ...pts.slice(hi.segIdx + 1)]
      ctx.emitElementDelete(element.id)
      ctx.emitElementAdd({
        ...element,
        id: `${ctx.userId}-${Date.now()}`,
        data: { ...data, points: partA.map(p => [p.x, p.y] as [number, number]) } as PolylineElement,
      })
      ctx.emitElementAdd({
        ...element,
        id: `${ctx.userId}-${Date.now()}`,
        data: { ...data, points: partB.map(p => [p.x, p.y] as [number, number]) } as PolylineElement,
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
    onKeyDown(event: KeyboardEvent): boolean {
      if (event.key === 'Escape') {
        if (step.value === 'trim') {
          // Go back to selecting cutting edge
          cuttingEdgeId.value = null
          step.value = 'cutting-edge'
          return true
        } else if (cuttingEdgeId.value) {
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
