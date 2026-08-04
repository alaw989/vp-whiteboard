import { describe, expect, it, vi } from 'vitest'
import { createMockToolContext } from './__tests__/mockToolContext'
import { useLineTool } from './useLineTool'

describe('useLineTool', () => {
  it('onMouseDown sets lineStart and isDrawing', () => {
    const ctx = createMockToolContext()
    const tool = useLineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 200 })
    expect(ctx.isDrawing.value).toBe(true)
    expect(tool.state?.lineStart?.value).toEqual({ x: 100, y: 200 })
  })

  it('onMouseDown respects snap point from findSnapPoint', () => {
    const findSnapPoint = vi.fn(() => ({ x: 50, y: 50 }))
    const ctx = createMockToolContext({ findSnapPoint })
    const tool = useLineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 200 })
    expect(findSnapPoint).toHaveBeenCalled()
    expect(tool.state?.lineStart?.value).toEqual({ x: 50, y: 50 })
  })

  it('onMouseMove updates currentLineEnd via constrainPoint', () => {
    const ctx = createMockToolContext()
    const tool = useLineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseMove?.({}, { x: 200, y: 200 })
    expect(ctx.constrainPoint).toHaveBeenCalledWith({ x: 100, y: 100 }, { x: 200, y: 200 })
    expect(tool.state?.currentLineEnd?.value).toEqual({ x: 200, y: 200 })
  })

  it('onMouseUp with valid distance emits element with correct start/end', () => {
    const ctx = createMockToolContext()
    const tool = useLineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseMove?.({}, { x: 200, y: 200 })
    tool.onMouseUp?.({}, { x: 200, y: 200 })
    expect(ctx.emitElementAdd).toHaveBeenCalledOnce()
    const el = vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]!
    expect(el.type).toBe('line')
    expect((el as any).data.start).toEqual([100, 100])
    expect((el as any).data.end).toEqual([200, 200])
  })

  it('onMouseUp with zero-length does NOT emit', () => {
    const ctx = createMockToolContext()
    const tool = useLineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseUp?.({}, { x: 100, y: 100 })
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
  })

  it('deactivate resets state', () => {
    const ctx = createMockToolContext()
    const tool = useLineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.deactivate?.()
    expect(tool.state?.lineStart?.value).toBeNull()
    expect(tool.state?.currentLineEnd?.value).toBeNull()
  })

  it('exposes state via state.lineStart and state.currentLineEnd', () => {
    const ctx = createMockToolContext()
    const tool = useLineTool(ctx)
    expect(tool.state?.lineStart).toBeDefined()
    expect(tool.state?.currentLineEnd).toBeDefined()
  })
})
