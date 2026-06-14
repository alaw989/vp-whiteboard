import type { CanvasElement, LineElement, FilletArcElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'
import {
  type Point,
  calculateFillet,
  nearestPointOnSegment,
  distance,
  lineLineIntersection,
  direction,
  getElementGeometry,
} from '~/utils/geometryUtils'

export function useFilletTool(ctx: ToolContext): ToolHandler {
  const filletRadius = ctx.filletRadius
  const firstLineId = ref<string | null>(null)
  const step = ref<'first-line' | 'second-line'>('first-line')
  const highlightId = ref<string | null>(null)

  function reset() {
    firstLineId.value = null
    step.value = 'first-line'
    highlightId.value = null
  }

  function findLineAtPosition(pos: PointerPosition): CanvasElement | null {
    const threshold = 8 / ctx.viewport.value.zoom
    let best: { element: CanvasElement; dist: number } | null = null

    for (const el of ctx.elements) {
      if (el.type !== 'line') continue
      const data = el.data as LineElement
      const start: Point = { x: data.start[0], y: data.start[1] }
      const end: Point = { x: data.end[0], y: data.end[1] }
      const near = { x: 0, y: 0 }
      // Simple nearest on segment
      const dx = end.x - start.x
      const dy = end.y - start.y
      const lenSq = dx * dx + dy * dy
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((pos.x - start.x) * dx + (pos.y - start.y) * dy) / lenSq))
      near.x = start.x + dx * t
      near.y = start.y + dy * t
      const d = distance(pos, near)
      if (d < threshold && (!best || d < best.dist)) {
        best = { element: el, dist: d }
      }
    }

    return best?.element ?? null
  }

  function applyFillet(line1: CanvasElement, line2: CanvasElement) {
    const d1 = line1.data as LineElement
    const d2 = line2.data as LineElement

    const a1: Point = { x: d1.start[0], y: d1.start[1] }
    const a2: Point = { x: d1.end[0], y: d1.end[1] }
    const b1: Point = { x: d2.start[0], y: d2.start[1] }
    const b2: Point = { x: d2.end[0], y: d2.end[1] }

    const result = calculateFillet(a1, a2, b1, b2, filletRadius.value)
    if (!result) return

    // Shorten whichever end of each line is nearer its tangent point (the
    // correct corner side is resolved inside calculateFillet).
    const trimLineData = (data: LineElement, tangent: Point): LineElement =>
      distance(tangent, { x: data.start[0], y: data.start[1] }) <
      distance(tangent, { x: data.end[0], y: data.end[1] })
        ? { ...data, start: [tangent.x, tangent.y] }
        : { ...data, end: [tangent.x, tangent.y] }

    ctx.emitElementUpdate(line1.id, { data: trimLineData(d1, result.tangentA) })
    ctx.emitElementUpdate(line2.id, { data: trimLineData(d2, result.tangentB) })

    // Create arc element for the fillet
    // Calculate angles for the arc
    const startAngle = Math.atan2(result.tangentA.y - result.center.y, result.tangentA.x - result.center.x)
    const endAngle = Math.atan2(result.tangentB.y - result.center.y, result.tangentB.x - result.center.x)

    const arcElement: CanvasElement = {
      id: `${ctx.userId}-${Date.now()}`,
      type: 'fillet-arc',
      userId: ctx.userId,
      userName: ctx.userName,
      timestamp: Date.now(),
      data: {
        center: [result.center.x, result.center.y],
        radius: result.radius,
        startAngle,
        endAngle,
        color: ctx.currentColor,
        size: ctx.currentSize,
      } as FilletArcElement,
    }
    ctx.emitElementAdd(arcElement)

    // Reset for next fillet
    firstLineId.value = null
    step.value = 'first-line'
  }

  return {
    state: { filletRadius, firstLineId, step, highlightId },
    activate() {
      reset()
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      const el = findLineAtPosition(pos)
      highlightId.value = el?.id ?? null
    },
    onMouseDown(_event: any, pos: PointerPosition) {
      const el = findLineAtPosition(pos)
      if (!el) return

      if (step.value === 'first-line') {
        firstLineId.value = el.id
        step.value = 'second-line'
        highlightId.value = null
        return
      }

      // Second line
      if (el.id === firstLineId.value) return

      const firstLine = ctx.elements.find(e => e.id === firstLineId.value)
      if (!firstLine) return

      applyFillet(firstLine, el)
    },
    onKeyDown(event: KeyboardEvent): boolean {
      if (event.key === 'Escape') {
        if (step.value === 'second-line') {
          firstLineId.value = null
          step.value = 'first-line'
          return true
        } else if (firstLineId.value) {
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
