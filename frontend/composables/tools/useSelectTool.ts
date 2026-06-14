import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useSelectTool(ctx: ToolContext): ToolHandler {
  return {
    onMouseDown(_event: any, pos: PointerPosition) {
      const stagePos = ctx.getStagePointerPos()
      ctx.selectElementAtPosition(stagePos.x, stagePos.y)
    },
  }
}
