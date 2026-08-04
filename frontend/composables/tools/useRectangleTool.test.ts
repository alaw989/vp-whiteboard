import { describe, expect, it, vi } from 'vitest'
import { createMockToolContext } from './__tests__/mockToolContext'
import { useRectangleTool } from './useRectangleTool'

describe('useRectangleTool', () => {
  it('onMouseDown sets shapeStart and isDrawing', () => {
    const ctx = createMockToolContext()
    const tool = useRectangleTool(ctx)
    tool.onMouseDown?.({}, { x: 50, y: 60 })
    expect(ctx.isDrawing.value).toBe(true)
    expect(tool.state?.shapeStart?.value).toEqual({ x: 50, y: 60 })
  })

  it('onMouseMove updates currentShapeEnd via constrainPoint', () => {
    const ctx = createMockToolContext()
    const tool = useRectangleTool(ctx)
    tool.onMouseDown?.({}, { x: 0, y: 0 })
    tool.onMouseMove?.({}, { x: 100, y: 200 })
    expect(ctx.constrainPoint).toHaveBeenCalledWith({ x: 0, y: 0 }, { x: 100, y: 200 })
  })

  it('onMouseUp with valid size emits element of type rectangle', () => {
    const ctx = createMockToolContext()
    const tool = useRectangleTool(ctx)
    tool.onMouseDown?.({}, { x: 0, y: 0 })
    tool.onMouseMove?.({}, { x: 100, y: 200 })
    tool.onMouseUp?.({}, { x: 100, y: 200 })
    expect(ctx.emitElementAdd).toHaveBeenCalledOnce()
    expect(vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]!.type).toBe('rectangle')
  })

  it('zero-size guard (drag < 5px) does NOT emit', () => {
    const ctx = createMockToolContext()
    const tool = useRectangleTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseMove?.({}, { x: 103, y: 104 })
    tool.onMouseUp?.({}, { x: 103, y: 104 })
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
  })

  it('deactivate resets state', () => {
    const ctx = createMockToolContext()
    const tool = useRectangleTool(ctx)
    tool.onMouseDown?.({}, { x: 0, y: 0 })
    tool.deactivate?.()
    expect(tool.state?.shapeStart?.value).toBeNull()
    expect(tool.state?.currentShapeEnd?.value).toBeNull()
  })
})
