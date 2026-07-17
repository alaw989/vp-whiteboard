import type { CanvasElement, StampElement } from '~/types'
import type { ToolHandler, ToolContext, PointerPosition } from '../useToolHandlers'

const STAMP_CONFIGS = {
  APPROVED: {
    text: 'APPROVED',
    backgroundColor: '#10B981',
    textColor: '#FFFFFF',
    borderColor: '#059669',
    fontSize: 24,
    padding: 12,
    borderRadius: 4,
  },
  REVISED: {
    text: 'REVISED',
    backgroundColor: '#F59E0B',
    textColor: '#FFFFFF',
    borderColor: '#D97706',
    fontSize: 24,
    padding: 12,
    borderRadius: 4,
  },
  NOTE: {
    text: 'NOTE',
    backgroundColor: '#3B82F6',
    textColor: '#FFFFFF',
    borderColor: '#2563EB',
    fontSize: 20,
    padding: 10,
    borderRadius: 4,
  },
  'FOR REVIEW': {
    text: 'FOR REVIEW',
    backgroundColor: '#EF4444',
    textColor: '#FFFFFF',
    borderColor: '#DC2626',
    fontSize: 20,
    padding: 10,
    borderRadius: 4,
  },
} as const

export type StampType = keyof typeof STAMP_CONFIGS

export function useStampTool(ctx: ToolContext): ToolHandler {
  function snapPosition(pos: PointerPosition): { x: number; y: number } {
    const snap = ctx.findSnapPoint(pos, ctx.elements)
    ctx.currentSnapPoint.value = snap || null
    if (snap) return { x: snap.x, y: snap.y }
    return { x: pos.x, y: pos.y }
  }

  return {
    onMouseDown(_event: any, pos: PointerPosition) {
      if (!ctx.currentStampType) return
      const snapped = snapPosition(pos)
      const stampType = ctx.currentStampType as StampType
      const config = STAMP_CONFIGS[stampType]
      const fontSize = config.fontSize

      const canvas = document.createElement('canvas')
      const canvasCtx = canvas.getContext('2d')!
      canvasCtx.font = `bold ${fontSize}px Arial, sans-serif`
      const textWidth = canvasCtx.measureText(config.text).width
      const width = textWidth + config.padding * 2
      const height = fontSize + config.padding * 2

      const element: CanvasElement = {
        id: `${ctx.userId}-${Date.now()}`,
        type: 'stamp',
        userId: ctx.userId,
        userName: ctx.userName,
        timestamp: Date.now(),
        data: {
          stampType,
          text: config.text,
          x: snapped.x - width / 2,
          y: snapped.y - height / 2,
          width,
          height,
          backgroundColor: config.backgroundColor,
          textColor: config.textColor,
          borderColor: config.borderColor,
          fontSize,
          padding: config.padding,
          borderRadius: config.borderRadius,
        } as StampElement,
      }

      ctx.emitElementAdd(element)
    },
    onMouseMove(_event: any, pos: PointerPosition) {
      const snap = ctx.findSnapPoint(pos, ctx.elements)
      ctx.currentSnapPoint.value = snap || null
    },
  }
}
