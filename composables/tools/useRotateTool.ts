import type { CanvasElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'
import {
  type Point,
  angleOf,
  distance,
  nearestPointOnSegment,
  getElementGeometry,
  rotatePointAroundOrigin,
  transformElement,
} from '~/utils/geometryUtils'

/**
 * Rotate tool (AutoCAD `ROTATE`).
 *
 * Flow: click elements to build a selection → Enter to confirm → click the
 * rotation base point (pivot) → move to preview, click to set the angle.
 *
 * The rotation angle is the absolute angle of the ray from the base point to
 * the cursor (`atan2`), measured from the +x axis — i.e. the selection swings
 * around the pivot to follow the cursor, like a rotation handle. The transform
 * is baked into element coordinates (see `transformElement`); a non-90°
 * rotation of a rectangle becomes a closed polyline so geometry is preserved.
 */
export function useRotateTool(ctx: ToolContext): ToolHandler {
  const selectedIds = ref<string[]>([])
  const basepoint = ref<Point | null>(null)
  const currentCursor = ref<Point | null>(null)
  const currentAngle = ref(0)
  const previewElements = ref<CanvasElement[]>([])
  const step = ref<'select' | 'basepoint' | 'angle'>('select')

  function reset() {
    selectedIds.value = []
    basepoint.value = null
    currentCursor.value = null
    currentAngle.value = 0
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

  function rotateSelected(angle: number): CanvasElement[] {
    const out: CanvasElement[] = []
    const origin = basepoint.value!
    for (const id of selectedIds.value) {
      const el = ctx.elements.find(e => e.id === id)
      if (!el) continue
      const rotated = transformElement(
        el,
        p => rotatePointAroundOrigin(p, origin, angle),
        makeId,
        { rotationDelta: angle },
      )
      if (rotated) out.push(rotated)
    }
    return out
  }

  function updatePreview() {
    if (step.value !== 'angle' || !basepoint.value || !currentCursor.value) {
      previewElements.value = []
      return
    }
    previewElements.value = rotateSelected(currentAngle.value)
  }

  return {
    state: { selectedIds, basepoint, currentCursor, currentAngle, previewElements, step },
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
        step.value = 'angle'
        return
      }

      if (step.value === 'angle') {
        // Commit at the precise click point (don't trust the last move frame).
        currentAngle.value = angleOf(basepoint.value!, pos)
        for (const el of rotateSelected(currentAngle.value)) {
          ctx.emitElementAdd(el)
        }
        reset()
        return
      }
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (step.value === 'angle' && basepoint.value) {
        currentCursor.value = pos
        currentAngle.value = angleOf(basepoint.value, pos)
        updatePreview()
      }
    },
    onKeyDown(event: KeyboardEvent): boolean {
      if (event.key === 'Escape') {
        if (step.value === 'angle') {
          step.value = 'basepoint'
          currentCursor.value = null
          currentAngle.value = 0
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
