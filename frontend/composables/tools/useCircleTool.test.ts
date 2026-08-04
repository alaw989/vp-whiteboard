import { describe, expect, it, vi } from 'vitest'
import { createMockToolContext } from './__tests__/mockToolContext'
import { useCircleTool } from './useCircleTool'

describe('useCircleTool', () => {
  it('onMouseDown sets shapeStart and isDrawing', () => {
    const ctx = createMockToolContext()
    const tool = useCircleTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    expect(ctx.isDrawing.value).toBe(true)
    expect(tool.state?.shapeStart?.value).toEqual({ x: 100, y: 100 })
  })

  it('onMouseUp with valid radius emits element of type circle with cx, cy, radius', () => {
    const ctx = createMockToolContext()
    const tool = useCircleTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseMove?.({}, { x: 130, y: 100 })
    tool.onMouseUp?.({}, { x: 130, y: 100 })
    expect(ctx.emitElementAdd).toHaveBeenCalledOnce()
    const el = vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]!
    expect(el.type).toBe('circle')
    expect((el as any).data.cx).toBe(100)
    expect((el as any).data.cy).toBe(100)
    expect((el as any).data.radius).toBe(30)
  })

  it('min-radius guard (5px) does NOT emit', () => {
    const ctx = createMockToolContext()
    const tool = useCircleTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseUp?.({}, { x: 100, y: 100 })
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
  })

  it('deactivate resets state', () => {
    const ctx = createMockToolContext()
    const tool = useCircleTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.deactivate?.()
    expect(tool.state?.shapeStart?.value).toBeNull()
    expect(tool.state?.currentShapeEnd?.value).toBeNull()
  })
})
