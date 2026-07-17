import { toastError } from '~/composables/useToast'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

export function useMeasureAreaTool(ctx: ToolContext): ToolHandler {
  return {
    onMouseDown(_event: any, _pos: PointerPosition) {
      const stage = ctx.stageRef.value?.getNode()
      if (!stage) return

      const stagePos = ctx.getStagePointerPos()
      const allShapes = stage.getAllIntersections({ x: stagePos.x, y: stagePos.y })
      const canvasShapes = allShapes.filter((shape: any) => {
        const parent = shape.getParent()
        const layer = parent?.getParent()
        return layer?.name() !== 'documentLayer'
      })

      let measured = false
      for (const shape of canvasShapes) {
        const elementId = shape.id() || shape.getParent()?.id()
        if (elementId) {
          const targetElement = ctx.elements.find(el => el.id === elementId)
          if (targetElement && ctx.measureArea(elementId, ctx.currentColor)) {
            measured = true
            break
          }
        }
      }
      if (!measured) {
        toastError('Click on a rectangle, circle, ellipse, or closed polyline to measure its area')
      }
    },
    onMouseMove(_event: any, _pos: PointerPosition) {
      const stage = ctx.stageRef.value?.getNode()
      const container = stage?.container()
      if (!stage || !container) return

      const stagePos = ctx.getStagePointerPos()
      const shapes = stage.getAllIntersections({ x: stagePos.x, y: stagePos.y })
      const canvasShapes = shapes.filter((shape: any) => {
        const parent = shape.getParent()
        const layer = parent?.getParent()
        return layer?.name() !== 'documentLayer'
      })

      let overMeasurable = false
      for (const shape of canvasShapes) {
        const elementId = shape.id() || shape.getParent()?.id()
        if (elementId) {
          const el = ctx.elements.find(e => e.id === elementId)
          if (el && (el.type === 'rectangle' || el.type === 'circle' || el.type === 'ellipse' || el.type === 'polyline' || el.type === 'revision-cloud' || el.type === 'arc' || el.type === 'stroke')) {
            overMeasurable = true
            break
          }
        }
      }
      container.style.cursor = overMeasurable ? 'pointer' : 'crosshair'
    },
    activate() {
      ctx.setCursor('crosshair')
    },
    deactivate() {
      ctx.clearCursor()
    },
  }
}
