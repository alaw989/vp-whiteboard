import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useSelectTool(ctx: ToolContext): ToolHandler {
  return {
    onMouseDown(event: any, _pos: PointerPosition) {
      const stagePos = ctx.getStagePointerPos()
      const shiftKey = event?.shiftKey || false

      // Try to select an element at position (with shift for multi-select)
      const found = ctx.selectElementAtPosition(stagePos.x, stagePos.y, shiftKey)

      if (!found && !shiftKey) {
        // Started drag on empty space — begin rubber-band selection
        ctx.startRubberBand(stagePos.x, stagePos.y)
      }
    },
    onMouseMove(_event: any, _pos: PointerPosition) {
      if (ctx.isRubberBanding) {
        const stagePos = ctx.getStagePointerPos()
        ctx.updateRubberBand(stagePos.x, stagePos.y)
      }
    },
    onMouseUp(_event: any, _pos: PointerPosition) {
      if (ctx.isRubberBanding) {
        ctx.endRubberBand()
      }
    },
  }
}
