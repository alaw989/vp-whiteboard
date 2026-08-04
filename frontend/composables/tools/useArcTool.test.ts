import { describe, expect, it, vi } from 'vitest'
import { createMockToolContext } from './__tests__/mockToolContext'
import { useArcTool } from './useArcTool'

describe('useArcTool', () => {
  it('first click adds start point', () => {
    const ctx = createMockToolContext()
    const tool = useArcTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    expect(tool.state?.clickPoints?.value).toEqual([[100, 100]])
    expect(tool.state?.isDrawing?.value).toBe(true)
  })

  it('second click adds through point', () => {
    const ctx = createMockToolContext()
    const tool = useArcTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseDown?.({}, { x: 150, y: 200 })
    expect(tool.state?.clickPoints?.value).toEqual([[100, 100], [150, 200]])
  })

  it('third click emits element of type arc', () => {
    const ctx = createMockToolContext()
    const tool = useArcTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseDown?.({}, { x: 150, y: 200 })
    tool.onMouseDown?.({}, { x: 300, y: 100 })
    expect(ctx.emitElementAdd).toHaveBeenCalledOnce()
    expect(vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]!.type).toBe('arc')
  })

  it('collinear guard keeps first 2 points and does not emit', () => {
    const ctx = createMockToolContext()
    const tool = useArcTool(ctx)
    tool.onMouseDown?.({}, { x: 0, y: 0 })
    tool.onMouseDown?.({}, { x: 50, y: 0 })
    tool.onMouseDown?.({}, { x: 100, y: 0 })
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
    expect(tool.state?.clickPoints?.value).toHaveLength(2)
    expect(tool.state?.clickPoints?.value[0]).toEqual([0, 0])
    expect(tool.state?.clickPoints?.value[1]).toEqual([50, 0])
  })

  it('zero-length guard when start equals end resets without emitting', () => {
    const ctx = createMockToolContext()
    const tool = useArcTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
    expect(tool.state?.clickPoints?.value).toHaveLength(0)
  })

  it('each click calls findSnapPoint', () => {
    const findSnapPoint = vi.fn(() => null)
    const ctx = createMockToolContext({ findSnapPoint })
    const tool = useArcTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    expect(findSnapPoint).toHaveBeenCalledTimes(1)
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    expect(findSnapPoint).toHaveBeenCalledTimes(2)
  })

  it('deactivate resets state', () => {
    const ctx = createMockToolContext()
    const tool = useArcTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.deactivate?.()
    expect(tool.state?.clickPoints?.value).toHaveLength(0)
    expect(tool.state?.isDrawing?.value).toBe(false)
  })
})
