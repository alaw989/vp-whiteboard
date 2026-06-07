import type { CanvasElement, TextAnnotationElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useTextAnnotationTool(ctx: ToolContext): ToolHandler {
  const textAnnotationStart = ref<PointerPosition | null>(null)
  const currentLeaderLineEnd = ref<PointerPosition | null>(null)
  const showAnnotationInput = ref(false)
  const pendingAnnotationText = ref('')
  const annotationInputPosition = ref<PointerPosition>({ x: 0, y: 0 })

  function reset() {
    textAnnotationStart.value = null
    currentLeaderLineEnd.value = null
  }

  function confirmAnnotation() {
    const text = pendingAnnotationText.value.trim()
    if (!text) {
      showAnnotationInput.value = false
      return
    }

    const leaderLine = (window as any).__pendingLeaderLine
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
    delete (window as any).__pendingLeaderLine
  }

  function cancelAnnotation() {
    showAnnotationInput.value = false
    pendingAnnotationText.value = ''
    delete (window as any).__pendingLeaderLine
  }

  return {
    state: { textAnnotationStart, currentLeaderLineEnd, showAnnotationInput, pendingAnnotationText, annotationInputPosition, confirmAnnotation, cancelAnnotation },
    onMouseDown(_event: any, pos: PointerPosition) {
      ctx.isDrawing.value = true
      textAnnotationStart.value = pos
      currentLeaderLineEnd.value = pos
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      if (!ctx.isDrawing.value) return
      currentLeaderLineEnd.value = pos
    },
    onMouseUp(_event: any, _pos: PointerPosition) {
      if (!ctx.isDrawing.value || !textAnnotationStart.value || !currentLeaderLineEnd.value) return

      const start = textAnnotationStart.value

      annotationInputPosition.value = { x: start.x, y: start.y }
      pendingAnnotationText.value = ''
      showAnnotationInput.value = true

      ;(window as any).__pendingLeaderLine = {
        start: [start.x, start.y],
        end: [currentLeaderLineEnd.value.x, currentLeaderLineEnd.value.y],
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
