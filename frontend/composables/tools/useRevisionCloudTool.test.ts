import { describe, expect, it, vi } from 'vitest'
import { createMockToolContext } from './__tests__/mockToolContext'
import { useRevisionCloudTool } from './useRevisionCloudTool'

describe('useRevisionCloudTool', () => {
  it('first click starts cloud and adds first vertex', () => {
    const ctx = createMockToolContext()
    const tool = useRevisionCloudTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    expect(tool.state?.isDrawing?.value).toBe(true)
    expect(tool.state?.vertices?.value).toHaveLength(1)
    expect(tool.state?.vertices?.value[0]).toEqual({ x: 100, y: 100 })
  })

  it('second click adds second vertex', () => {
    const ctx = createMockToolContext()
    const tool = useRevisionCloudTool(ctx)
    tool.onMouseDown?.({}, { x: 0, y: 0 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    expect(tool.state?.vertices?.value).toHaveLength(2)
  })

  it('Enter finishes and emits element of type revision-cloud', () => {
    const ctx = createMockToolContext()
    const tool = useRevisionCloudTool(ctx)
    tool.onMouseDown?.({}, { x: 0, y: 0 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    const handled = tool.onKeyDown?.({ key: 'Enter' } as KeyboardEvent)
    expect(handled).toBe(true)
    expect(ctx.emitElementAdd).toHaveBeenCalledOnce()
    expect(vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]!.type).toBe('revision-cloud')
  })

  it('Escape cancels without emitting', () => {
    const ctx = createMockToolContext()
    const tool = useRevisionCloudTool(ctx)
    tool.onMouseDown?.({}, { x: 0, y: 0 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    const handled = tool.onKeyDown?.({ key: 'Escape' } as KeyboardEvent)
    expect(handled).toBe(true)
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
    expect(tool.state?.vertices?.value).toHaveLength(0)
  })

  it('Backspace removes last vertex', () => {
    const ctx = createMockToolContext()
    const tool = useRevisionCloudTool(ctx)
    tool.onMouseDown?.({}, { x: 0, y: 0 })
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    const handled = tool.onKeyDown?.({ key: 'Backspace' } as KeyboardEvent)
    expect(handled).toBe(true)
    expect(tool.state?.vertices?.value).toHaveLength(2)
  })

  it('Backspace on only vertex cancels', () => {
    const ctx = createMockToolContext()
    const tool = useRevisionCloudTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    const handled = tool.onKeyDown?.({ key: 'Backspace' } as KeyboardEvent)
    expect(handled).toBe(true)
    expect(tool.state?.isDrawing?.value).toBe(false)
  })

  it('near-start click closes the cloud and emits', () => {
    const ctx = createMockToolContext()
    const tool = useRevisionCloudTool(ctx)
    tool.onMouseDown?.({}, { x: 100, y: 100 })
    tool.onMouseDown?.({}, { x: 200, y: 100 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    tool.onMouseDown?.({}, { x: 101, y: 101 })
    expect(ctx.emitElementAdd).toHaveBeenCalledOnce()
  })

  it('emitted element has data.closed = true', () => {
    const ctx = createMockToolContext()
    const tool = useRevisionCloudTool(ctx)
    tool.onMouseDown?.({}, { x: 0, y: 0 })
    tool.onMouseDown?.({}, { x: 200, y: 200 })
    tool.onKeyDown?.({ key: 'Enter' } as KeyboardEvent)
    expect((vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]! as any).data.closed).toBe(true)
  })

  it('deactivate resets state', () => {
    const ctx = createMockToolContext()
    const tool = useRevisionCloudTool(ctx)
    tool.onMouseDown?.({}, { x: 0, y: 0 })
    tool.deactivate?.()
    expect(tool.state?.vertices?.value).toHaveLength(0)
  })
})
