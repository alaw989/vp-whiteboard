import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useSelectTool } from './useSelectTool'
import { createMockToolContext } from './__tests__/mockToolContext'

describe('useSelectTool', () => {
  it('onMouseDown on an element calls selectElementAtPosition with correct position', () => {
    const ctx = createMockToolContext({
      getStagePointerPos: vi.fn(() => ({ x: 150, y: 250 })),
      selectElementAtPosition: vi.fn(() => true),
    })
    const handler = useSelectTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(ctx.getStagePointerPos).toHaveBeenCalled()
    expect(ctx.selectElementAtPosition).toHaveBeenCalledWith(150, 250, false)
  })

  it('onMouseDown with shiftKey passes shiftKey: true', () => {
    const ctx = createMockToolContext({
      getStagePointerPos: vi.fn(() => ({ x: 150, y: 250 })),
      selectElementAtPosition: vi.fn(() => true),
    })
    const handler = useSelectTool(ctx)

    handler.onMouseDown?.({ shiftKey: true }, { x: 100, y: 200 })

    expect(ctx.selectElementAtPosition).toHaveBeenCalledWith(150, 250, true)
  })

  it('onMouseDown on empty space without shift starts rubber band', () => {
    const ctx = createMockToolContext({
      getStagePointerPos: vi.fn(() => ({ x: 150, y: 250 })),
      selectElementAtPosition: vi.fn(() => false),
    })
    const handler = useSelectTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(ctx.startRubberBand).toHaveBeenCalledWith(150, 250)
  })

  it('onMouseDown on empty space with shift does NOT start rubber band', () => {
    const ctx = createMockToolContext({
      getStagePointerPos: vi.fn(() => ({ x: 150, y: 250 })),
      selectElementAtPosition: vi.fn(() => false),
    })
    const handler = useSelectTool(ctx)

    handler.onMouseDown?.({ shiftKey: true }, { x: 100, y: 200 })

    expect(ctx.startRubberBand).not.toHaveBeenCalled()
  })

  it('onMouseMove while rubber banding calls updateRubberBand', () => {
    const ctx = createMockToolContext({
      isRubberBanding: ref(true),
      getStagePointerPos: vi.fn(() => ({ x: 300, y: 400 })),
    })
    const handler = useSelectTool(ctx)

    handler.onMouseMove?.({}, { x: 200, y: 300 })

    expect(ctx.updateRubberBand).toHaveBeenCalledWith(300, 400)
  })

  it('onMouseMove while NOT rubber banding does nothing', () => {
    const ctx = createMockToolContext({
      isRubberBanding: ref(false),
    })
    const handler = useSelectTool(ctx)

    handler.onMouseMove?.({}, { x: 200, y: 300 })

    expect(ctx.updateRubberBand).not.toHaveBeenCalled()
  })

  it('onMouseUp while rubber banding calls endRubberBand', () => {
    const ctx = createMockToolContext({
      isRubberBanding: ref(true),
    })
    const handler = useSelectTool(ctx)

    handler.onMouseUp?.({}, { x: 200, y: 300 })

    expect(ctx.endRubberBand).toHaveBeenCalled()
  })

  it('onMouseUp while NOT rubber banding does nothing', () => {
    const ctx = createMockToolContext({
      isRubberBanding: ref(false),
    })
    const handler = useSelectTool(ctx)

    handler.onMouseUp?.({}, { x: 200, y: 300 })

    expect(ctx.endRubberBand).not.toHaveBeenCalled()
  })
})
