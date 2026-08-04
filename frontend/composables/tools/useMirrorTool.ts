import { ref } from 'vue'
import type { CanvasElement, LineElement, PolylineElement, ArrowElement, RectangleElement, CircleElement, EllipseElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'
import {
  type Point,
  mirrorPoint,
  findElementAtPosition,
} from '~/utils/geometryUtils'

export function useMirrorTool(ctx: ToolContext): ToolHandler {
  const selectedIds = ref<string[]>([])
  const axisFirst = ref<Point | null>(null)
  const axisSecond = ref<Point | null>(null)
  const previewElements = ref<CanvasElement[]>([])
  const step = ref<'select' | 'axis-first' | 'axis-second'>('select')

  function reset() {
    selectedIds.value = []
    axisFirst.value = null
    axisSecond.value = null
    previewElements.value = []
    step.value = 'select'
  }

  function mirrorElement(element: CanvasElement, axisA: Point, axisB: Point): CanvasElement | null {
    const data = element.data
    const m = (p: [number, number]): [number, number] => {
      const mp = mirrorPoint({ x: p[0], y: p[1] }, axisA, axisB)
      return [mp.x, mp.y]
    }

    const newId = `${ctx.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    switch (element.type) {
      case 'line': {
        const ld = data as LineElement
        return {
          ...element,
          id: newId,
          data: {
            ...ld,
            start: m(ld.start),
            end: m(ld.end),
          } as LineElement,
        }
      }
      case 'polyline': {
        const pd = data as PolylineElement
        return {
          ...element,
          id: newId,
          data: {
            ...pd,
            points: pd.points.map(p => m(p as [number, number])),
          } as PolylineElement,
        }
      }
      case 'arrow': {
        const ad = data as ArrowElement
        const newPoints: [number, number][] = ad.points.map(pt => {
          const mp = mirrorPoint({ x: pt[0], y: pt[1] }, axisA, axisB)
          return [mp.x, mp.y] as [number, number]
        })
        return {
          ...element,
          id: newId,
          data: {
            ...ad,
            points: newPoints,
          } as ArrowElement,
        }
      }
      case 'rectangle': {
        const rd = data as RectangleElement
        const topLeft = mirrorPoint({ x: rd.x, y: rd.y }, axisA, axisB)
        const botRight = mirrorPoint({ x: rd.x + rd.width, y: rd.y + rd.height }, axisA, axisB)
        const minX = Math.min(topLeft.x, botRight.x)
        const minY = Math.min(topLeft.y, botRight.y)
        const maxX = Math.max(topLeft.x, botRight.x)
        const maxY = Math.max(topLeft.y, botRight.y)
        return {
          ...element,
          id: newId,
          data: {
            ...rd,
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          } as RectangleElement,
        }
      }
      case 'circle': {
        const cd = data as CircleElement
        const mirroredCenter = mirrorPoint({ x: cd.cx, y: cd.cy }, axisA, axisB)
        return {
          ...element,
          id: newId,
          data: {
            ...cd,
            cx: mirroredCenter.x,
            cy: mirroredCenter.y,
          } as CircleElement,
        }
      }
      case 'ellipse': {
        const ed = data as EllipseElement
        const mirroredCenter = mirrorPoint({ x: ed.x, y: ed.y }, axisA, axisB)
        return {
          ...element,
          id: newId,
          data: {
            ...ed,
            x: mirroredCenter.x,
            y: mirroredCenter.y,
          } as EllipseElement,
        }
      }
      case 'arc': {
        // For arc, mirror all three defining points
        const ad = data as { start: [number, number]; through: [number, number]; end: [number, number]; color: string; size: number }
        return {
          ...element,
          id: newId,
          data: {
            ...ad,
            start: m(ad.start),
            through: m(ad.through),
            end: m(ad.end),
          },
        }
      }
      default:
        return null
    }
  }

  function updatePreview() {
    if (!axisFirst.value || !axisSecond.value || selectedIds.value.length === 0) {
      previewElements.value = []
      return
    }

    const mirrored: CanvasElement[] = []
    for (const id of selectedIds.value) {
      const el = ctx.elements.find(e => e.id === id)
      if (!el) continue
      const m = mirrorElement(el, axisFirst.value!, axisSecond.value!)
      if (m) mirrored.push(m)
    }
    previewElements.value = mirrored
  }

  return {
    state: { selectedIds, axisFirst, axisSecond, previewElements, step },
    activate() {
      reset()
    },
    onMouseDown(_event: any, pos: PointerPosition) {
      if (step.value === 'select') {
        const el = findElementAtPosition(pos, ctx.elements, ctx.viewport.value.zoom)
        if (!el) {
          // Empty click confirms selection if elements are selected
          if (selectedIds.value.length > 0) {
            step.value = 'axis-first'
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

      if (step.value === 'axis-first') {
        const snap1 = ctx.findSnapPoint(pos, ctx.elements)
        axisFirst.value = snap1 ? { x: snap1.x, y: snap1.y } : pos
        step.value = 'axis-second'
        return
      }

      if (step.value === 'axis-second') {
        const snap2 = ctx.findSnapPoint(pos, ctx.elements)
        axisSecond.value = snap2 ? { x: snap2.x, y: snap2.y } : pos
        // Create mirrored copies
        for (const id of selectedIds.value) {
          const el = ctx.elements.find(e => e.id === id)
          if (!el) continue
          const mirrored = mirrorElement(el, axisFirst.value!, axisSecond.value!)
          if (mirrored) ctx.emitElementAdd(mirrored)
        }
        // Reset to select more elements
        reset()
        return
      }
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (step.value === 'axis-second' && axisFirst.value) {
        axisSecond.value = pos
        updatePreview()
      }
    },
    onKeyDown(event: KeyboardEvent): boolean {
      if (event.key === 'Escape') {
        if (step.value === 'axis-second') {
          axisSecond.value = null
          step.value = 'axis-first'
          previewElements.value = []
          return true
        } else if (step.value === 'axis-first') {
          step.value = 'select'
          return true
        } else if (selectedIds.value.length > 0) {
          reset()
          return true
        }
        return false
      }
      if (event.key === 'Enter' && step.value === 'select' && selectedIds.value.length > 0) {
        step.value = 'axis-first'
        return true
      }
      return false
    },
    deactivate() {
      reset()
    },
  }
}
