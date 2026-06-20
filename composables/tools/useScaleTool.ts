import type { CanvasElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'
import {
  type Point,
  distance,
  nearestPointOnSegment,
  getElementGeometry,
  scalePointFromOrigin,
  centroidOfPoints,
  transformElement,
} from '~/utils/geometryUtils'

/**
 * Scale tool (AutoCAD `SCALE`).
 *
 * Flow: click elements to build a selection → Enter to confirm → click the
 * scale base point (pivot) → move to preview, click to set the scale factor.
 *
 * The factor is `distance(base, cursor) / distance(base, centroid)` — i.e. the
 * selection's own centroid radius from the pivot is the 1× reference, so the
 * cursor at that radius leaves the shape unchanged; drag outward to enlarge,
 * inward to shrink. Uniform scale preserves axis-alignment, so rectangles and
 * circles stay their own type. The transform is baked into element coordinates
 * (see `transformElement`).
 */
export function useScaleTool(ctx: ToolContext): ToolHandler {
  const selectedIds = ref<string[]>([])
  const basepoint = ref<Point | null>(null)
  const currentCursor = ref<Point | null>(null)
  const currentScale = ref(1)
  const referenceDist = ref(1)
  const previewElements = ref<CanvasElement[]>([])
  const step = ref<'select' | 'basepoint' | 'scale'>('select')

  function reset() {
    selectedIds.value = []
    basepoint.value = null
    currentCursor.value = null
    currentScale.value = 1
    referenceDist.value = 1
    previewElements.value = []
    step.value = 'select'
  }

  function makeId(): string {
    return `${ctx.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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

  /** Representative geometry points of an element, for centroid calculation. */
  function elementPoints(el: CanvasElement): Point[] {
    const geo = getElementGeometry(el)
    if (!geo) return []
    if (geo.points && geo.points.length) return geo.points
    if (geo.circle) return [geo.circle.center]
    if (geo.segments) return geo.segments.flatMap(s => [s.start, s.end])
    return []
  }

  function selectionCentroid(): Point {
    const pts: Point[] = []
    for (const id of selectedIds.value) {
      const el = ctx.elements.find(e => e.id === id)
      if (el) pts.push(...elementPoints(el))
    }
    return centroidOfPoints(pts)
  }

  function scaleSelected(factor: number): CanvasElement[] {
    const out: CanvasElement[] = []
    const origin = basepoint.value!
    for (const id of selectedIds.value) {
      const el = ctx.elements.find(e => e.id === id)
      if (!el) continue
      const scaled = transformElement(
        el,
        p => scalePointFromOrigin(p, origin, factor),
        makeId,
        { scaleFactor: factor },
      )
      if (scaled) out.push(scaled)
    }
    return out
  }

  function updatePreview() {
    if (step.value !== 'scale' || !basepoint.value || !currentCursor.value) {
      previewElements.value = []
      return
    }
    previewElements.value = scaleSelected(currentScale.value)
  }

  return {
    state: { selectedIds, basepoint, currentCursor, currentScale, referenceDist, previewElements, step },
    activate() {
      reset()
    },
    onMouseDown(_event: any, pos: PointerPosition) {
      if (step.value === 'select') {
        const el = findElementAtPosition(pos)
        if (!el) {
          // Empty click confirms selection if elements are selected
          if (selectedIds.value.length > 0) {
            step.value = 'basepoint'
          }
          return
        }
        const idx = selectedIds.value.indexOf(el.id)
        if (idx >= 0) {
          selectedIds.value.splice(idx, 1)
        } else {
          selectedIds.value.push(el.id)
        }
        return
      }

      if (step.value === 'basepoint') {
        basepoint.value = pos
        // 1× reference = the selection centroid's distance from the pivot.
        const ref = distance(pos, selectionCentroid())
        referenceDist.value = ref > 1 ? ref : 1
        step.value = 'scale'
        return
      }

      if (step.value === 'scale') {
        // Commit at the precise click point (don't trust the last move frame).
        currentScale.value = distance(basepoint.value!, pos) / referenceDist.value
        for (const el of scaleSelected(currentScale.value)) {
          ctx.emitElementAdd(el)
        }
        reset()
        return
      }
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (step.value === 'scale' && basepoint.value) {
        currentCursor.value = pos
        currentScale.value = distance(basepoint.value, pos) / referenceDist.value
        updatePreview()
      }
    },
    onKeyDown(event: KeyboardEvent): boolean {
      if (event.key === 'Escape') {
        if (step.value === 'scale') {
          step.value = 'basepoint'
          currentCursor.value = null
          currentScale.value = 1
          previewElements.value = []
          return true
        } else if (step.value === 'basepoint') {
          step.value = 'select'
          basepoint.value = null
          return true
        } else if (selectedIds.value.length > 0) {
          reset()
          return true
        }
        return false
      }
      if (event.key === 'Enter' && step.value === 'select' && selectedIds.value.length > 0) {
        step.value = 'basepoint'
        return true
      }
      return false
    },
    deactivate() {
      reset()
    },
  }
}
