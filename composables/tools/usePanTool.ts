import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function usePanTool(ctx: ToolContext): ToolHandler {
  return {
    onMouseDown(_event: any, _pos: PointerPosition) {
      ctx.isDrawing.value = true
    },
    onMouseUp(_event: any, _pos: PointerPosition) {
      ctx.isDrawing.value = false
    },
    activate() {
      ctx.setCursor('grab')
    },
    deactivate() {
      ctx.clearCursor()
      ctx.panStartPointer.value = null
      ctx.panStartViewport.value = null
    },
  }
}
