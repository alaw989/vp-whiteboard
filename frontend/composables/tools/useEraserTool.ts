import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useEraserTool(ctx: ToolContext): ToolHandler {
  function eraseElementAt(stageX: number, stageY: number) {
    const stage = ctx.stageRef.value?.getNode()
    if (!stage) return

    const shapes = stage.getAllIntersections({ x: stageX, y: stageY })

    const canvasShapes = shapes.filter((shape: any) => {
      const parent = shape.getParent()
      const layer = parent?.getParent()
      return layer?.name !== 'documentLayer'
    })

    for (const shape of canvasShapes) {
      let elementId = shape.id()

      if (!elementId) {
        const parent = shape.getParent()
        if (parent && parent !== stage) {
          elementId = parent.id()
        }
      }

      if (!elementId && shape.attrs?.id) {
        elementId = shape.attrs.id
      }

      if (elementId) {
        ctx.emitElementDelete(elementId)
        break
      }
    }
  }

  return {
    onMouseDown(_event: any, _pos: PointerPosition) {
      const stagePos = ctx.getStagePointerPos()
      eraseElementAt(stagePos.x, stagePos.y)
    },
    onMouseMove(_event: any, _pos: PointerPosition) {
      if (!ctx.isDrawing.value) return
      const stagePos = ctx.getStagePointerPos()
      eraseElementAt(stagePos.x, stagePos.y)
    },
    activate() {
      ctx.setCursor('crosshair')
    },
    deactivate() {
      ctx.clearCursor()
    },
  }
}
