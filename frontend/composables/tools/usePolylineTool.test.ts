import { describe, expect, it, vi } from 'vitest'
import { createMockToolContext } from './__tests__/mockToolContext'
import { usePolylineTool } from './usePolylineTool'

describe('usePolylineTool', () => {
  it('first click starts polyline and adds first point', () => {
    const ctx = createMockToolContext()
    const tool = usePolylineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 200 })
    expect(tool.state?.isDrawing?.value).toBe(true)
    expect(tool.state?.vertices?.value).toHaveLength(1)
    expect(tool.state?.vertices?.value[0]).toEqual({ x: 100, y: 200 })
  })

  it('second click adds second point', () => {
    const ctx = createMockToolContext()
    const tool = usePolylineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    expect(tool.state?.vertices?.value).toHaveLength(2)
    expect(tool.state?.vertices?.value[1]).toEqual({ x: 200, y: 200 })
  })

  it('Enter key finishes and emits element', () => {
    const ctx = createMockToolContext()
    const tool = usePolylineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    const handled = tool.onKeyDown?.({ key: 'Enter' } as KeyboardEvent)
    expect(handled).toBe(true)
    expect(ctx.emitElementAdd).toHaveBeenCalledOnce()
    expect(vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]!.type).toBe('polyline')
  })

  it('Escape key cancels without emitting', () => {
    const ctx = createMockToolContext()
    const tool = usePolylineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    const handled = tool.onKeyDown?.({ key: 'Escape' } as KeyboardEvent)
    expect(handled).toBe(true)
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
    expect(tool.state?.vertices?.value).toHaveLength(0)
  })

  it('Backspace removes last point', () => {
    const ctx = createMockToolContext()
    const tool = usePolylineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    tool.onMouseDown?.({}, { x: 300, y: 300 })
    const handled = tool.onKeyDown?.({ key: 'Backspace' } as KeyboardEvent)
    expect(handled).toBe(true)
    expect(tool.state?.vertices?.value).toHaveLength(2)
  })

  it('Backspace on last vertex cancels polyline', () => {
    const ctx = createMockToolContext()
    const tool = usePolylineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    const handled = tool.onKeyDown?.({ key: 'Backspace' } as KeyboardEvent)
    expect(handled).toBe(true)
    expect(tool.state?.isDrawing?.value).toBe(false)
  })

  it('C key closes polyline and emits with closed=true', () => {
    const ctx = createMockToolContext()
    const tool = usePolylineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseDown?.({}, { x: 200, y: 100 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    const handled = tool.onKeyDown?.({ key: 'c' } as KeyboardEvent)
    expect(handled).toBe(true)
    expect(ctx.emitElementAdd).toHaveBeenCalledOnce()
    expect((vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]! as any).data.closed).toBe(true)
  })

  it('C key on <3 vertices does nothing', () => {
    const ctx = createMockToolContext()
    const tool = usePolylineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    const handled = tool.onKeyDown?.({ key: 'c' } as KeyboardEvent)
    expect(handled).toBe(true)
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
  })

  it('double-click near last vertex finishes polyline', () => {
    const ctx = createMockToolContext()
    const tool = usePolylineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    tool.onMouseDown?.({}, { x: 201, y: 201 })
    expect(ctx.emitElementAdd).toHaveBeenCalledOnce()
  })

  it('each click respects constrainPoint after first vertex', () => {
    const ctx = createMockToolContext()
    const tool = usePolylineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    expect(ctx.constrainPoint).toHaveBeenCalledWith({ x: 100, y: 100 }, { x: 200, y: 200 })
  })

  it('deactivate with >=2 points finishes and emits', () => {
    const ctx = createMockToolContext()
    const tool = usePolylineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    tool.deactivate?.()
    expect(ctx.emitElementAdd).toHaveBeenCalledOnce()
  })

  it('deactivate with <2 points resets without emitting', () => {
    const ctx = createMockToolContext()
    const tool = usePolylineTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.deactivate?.()
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
    expect(tool.state?.vertices?.value).toHaveLength(0)
  })
})
