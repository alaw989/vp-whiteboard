import { ref } from 'vue'
import type { CanvasElement, TextAnnotationElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useTextAnnotationTool(ctx: ToolContext): ToolHandler {
  const textAnnotationStart = ref<PointerPosition | null>(null)
  const currentLeaderLineEnd = ref<PointerPosition | null>(null)
  const showAnnotationInput = ref(false)
  const pendingAnnotationText = ref('')
  const annotationInputPosition = ref<PointerPosition>({ x: 0, y: 0 })
  const pendingLeaderLine = ref<{ start: [number, number]; end: [number, number] } | null>(null)

  function reset() {
    textAnnotationStart.value = null
    currentLeaderLineEnd.value = null
  }

  function confirmAnnotation() {
    const text = pendingAnnotationText.value.trim()
    if (!text) {
      showAnnotationInput.value = false
      pendingLeaderLine.value = null
      return
    }

    const leaderLine = pendingLeaderLine.value
    if (!leaderLine) {
      showAnnotationInput.value = false
      return
    }

    const element: CanvasElement = {
      id: `${ctx.userId}-${Date.now()}`,
      type: 'text-annotation',
      userId: ctx.userId,
      userName: ctx.userName,
      timestamp: Date.now(),
      data: {
        text,
        x: leaderLine.start[0],
        y: leaderLine.start[1],
        fontSize: 16,
        color: ctx.currentColor,
        fontFamily: 'Arial, sans-serif',
        leaderLine: {
          start: leaderLine.end,
          end: leaderLine.start,
        },
      } as TextAnnotationElement,
    }

    ctx.emitElementAdd(element)
    showAnnotationInput.value = false
    pendingLeaderLine.value = null
  }

  function cancelAnnotation() {
    showAnnotationInput.value = false
    pendingAnnotationText.value = ''
    pendingLeaderLine.value = null
  }

  return {
    state: { textAnnotationStart, currentLeaderLineEnd, showAnnotationInput, pendingAnnotationText, pendingLeaderLine, annotationInputPosition, confirmAnnotation, cancelAnnotation },
    onMouseDown(_event: any, pos: PointerPosition) {
      ctx.isDrawing.value = true
      const snap = ctx.findSnapPoint(pos, ctx.elements)
      const snapped = snap || pos
      textAnnotationStart.value = snapped
      currentLeaderLineEnd.value = snapped
      ctx.currentSnapPoint.value = snap || null
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (!ctx.isDrawing.value) return
      currentLeaderLineEnd.value = pos
      const snap = ctx.findSnapPoint(pos, ctx.elements)
      ctx.currentSnapPoint.value = snap || null
    },
    onMouseUp(_event: any, _pos: PointerPosition) {
      if (!ctx.isDrawing.value || !textAnnotationStart.value || !currentLeaderLineEnd.value) return

      const start = textAnnotationStart.value
      const snap = ctx.findSnapPoint(currentLeaderLineEnd.value, ctx.elements)
      const end = snap || currentLeaderLineEnd.value

      annotationInputPosition.value = { x: start.x, y: start.y }
      pendingAnnotationText.value = ''
      showAnnotationInput.value = true

      pendingLeaderLine.value = {
        start: [start.x, start.y],
        end: [end.x, end.y],
      }

      reset()
      ctx.isDrawing.value = false
    },
    deactivate() {
      reset()
      cancelAnnotation()
    },
  }
}
