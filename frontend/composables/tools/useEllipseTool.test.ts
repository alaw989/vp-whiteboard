import { describe, expect, it } from 'vitest'
import { createMockToolContext } from './__tests__/mockToolContext'
import { useEllipseTool } from './useEllipseTool'

describe('useEllipseTool', () => {
  it('onMouseDown sets shapeStart and isDrawing', () => {
    const ctx = createMockToolContext()
    const tool = useEllipseTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 200 })
    expect(ctx.isDrawing.value).toBe(true)
    expect(tool.state?.shapeStart?.value).toEqual({ x: 100, y: 200 })
  })

  it('onMouseUp with valid size emits element of type ellipse', () => {
    const ctx = createMockToolContext()
    const tool = useEllipseTool(ctx)
    tool.onMouseDown?.({}, { x: 0, y: 0 })
    tool.onMouseMove?.({}, { x: 100, y: 200 })
    tool.onMouseUp?.({}, { x: 100, y: 200 })
    expect(ctx.emitElementAdd).toHaveBeenCalledOnce()
    expect(ctx.emitElementAdd.mock.calls[0][0].type).toBe('ellipse')
  })

  it('min-size guard does NOT emit', () => {
    const ctx = createMockToolContext()
    const tool = useEllipseTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseUp?.({}, { x: 101, y: 101 })
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
  })

  it('deactivate resets state', () => {
    const ctx = createMockToolContext()
    const tool = useEllipseTool(ctx)
    tool.onMouseDown?.({}, { x: 0, y: 0 })
    tool.deactivate?.()
    expect(tool.state?.shapeStart?.value).toBeNull()
    expect(tool.state?.currentShapeEnd?.value).toBeNull()
  })
})
