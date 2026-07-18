import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMockToolContext, createSampleElement } from './mockToolContext'
import { useSelectTool } from '../useSelectTool'

describe('Select tool — nav workflow', () => {
  it('selects elements and rubber-bands on empty space', () => {
    const el1 = createSampleElement({
      type: 'rectangle' as const,
      data: { x: 100, y: 100, width: 200, height: 200, fill: '#fff', stroke: '#000', strokeWidth: 2 },
    })
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useSelectTool(ctx)

    ctx.getStagePointerPos = vi.fn()
      .mockReturnValueOnce({ x: 150, y: 150 })
      .mockReturnValueOnce({ x: 10, y: 10 })
      .mockReturnValue({ x: 300, y: 300 })

    ctx.selectElementAtPosition = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValue(false)

    tool.onMouseDown({}, { x: 150, y: 150 })
    expect(ctx.selectElementAtPosition).toHaveBeenCalledWith(150, 150, false)
    expect(ctx.startRubberBand).not.toHaveBeenCalled()

    tool.onMouseDown({}, { x: 10, y: 10 })
    expect(ctx.startRubberBand).toHaveBeenCalledWith(10, 10)

    ctx.isRubberBanding.value = true
    tool.onMouseMove({}, { x: 300, y: 300 })
    expect(ctx.updateRubberBand).toHaveBeenCalledWith(300, 300)

    tool.onMouseUp({}, { x: 300, y: 300 })
    expect(ctx.endRubberBand).toHaveBeenCalled()
  })
})
