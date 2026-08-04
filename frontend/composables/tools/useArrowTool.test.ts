import { describe, expect, it, vi } from 'vitest'
import { createMockToolContext } from './__tests__/mockToolContext'
import { useArrowTool } from './useArrowTool'

describe('useArrowTool', () => {
  it('onMouseDown sets isDrawing and arrowStart', () => {
    const ctx = createMockToolContext()
    const tool = useArrowTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 200 })
    expect(ctx.isDrawing.value).toBe(true)
    expect(tool.state?.arrowStart?.value).toEqual({ x: 100, y: 200 })
  })

  it('onMouseMove updates currentArrowEnd via constrainPoint', () => {
    const ctx = createMockToolContext()
    const tool = useArrowTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseMove?.({}, { x: 300, y: 400 })
    expect(ctx.constrainPoint).toHaveBeenCalledWith({ x: 100, y: 100 }, { x: 300, y: 400 })
  })

  it('onMouseUp emits element of type arrow', () => {
    const ctx = createMockToolContext()
    const tool = useArrowTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseMove?.({}, { x: 300, y: 300 })
    tool.onMouseUp?.({}, { x: 300, y: 300 })
    expect(ctx.emitElementAdd).toHaveBeenCalledOnce()
    expect(vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]!.type).toBe('arrow')
  })

  it('zero-length guard does not emit', () => {
    const ctx = createMockToolContext()
    const tool = useArrowTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseUp?.({}, { x: 100, y: 100 })
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
  })

  it('deactivate resets state', () => {
    const ctx = createMockToolContext()
    const tool = useArrowTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.deactivate?.()
    expect(tool.state?.arrowStart?.value).toBeNull()
    expect(tool.state?.currentArrowEnd?.value).toBeNull()
  })
})
