import { describe, expect, it, vi } from 'vitest'
import { createMockToolContext } from './__tests__/mockToolContext'
import { usePenTool } from './usePenTool'

describe('usePenTool', () => {
  it('onMouseDown sets isDrawing to true', () => {
    const ctx = createMockToolContext()
    const tool = usePenTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    expect(ctx.isDrawing.value).toBe(true)
  })

  it('onMouseDown adds first point to state', () => {
    const ctx = createMockToolContext()
    const tool = usePenTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    expect(tool.state?.currentStrokePoints?.value).toEqual([[10, 20, 0.5]])
  })

  it('onMouseDown calls startActiveStroke with strokeId', () => {
    const startActiveStroke = vi.fn()
    const ctx = createMockToolContext({ startActiveStroke })
    const tool = usePenTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    expect(startActiveStroke).toHaveBeenCalledOnce()
    expect(startActiveStroke.mock.calls[0]![0]!).toMatch(/^test-user-\d+$/)
  })

  it('onMouseMove appends point when drawing', () => {
    const ctx = createMockToolContext()
    const tool = usePenTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    tool.onMouseMove?.({}, { x: 30, y: 40 })
    expect(tool.state?.currentStrokePoints?.value).toHaveLength(2)
    expect(tool.state?.currentStrokePoints?.value[1]).toEqual([30, 40, 0.5])
  })

  it('onMouseMove does nothing when not drawing', () => {
    const ctx = createMockToolContext()
    const tool = usePenTool(ctx)
    tool.onMouseMove?.({}, { x: 30, y: 40 })
    expect(tool.state?.currentStrokePoints?.value).toHaveLength(0)
  })

  it('onMouseMove calls broadcastStrokePoint', () => {
    const startActiveStroke = vi.fn()
    const broadcastStrokePoint = vi.fn()
    const ctx = createMockToolContext({ startActiveStroke, broadcastStrokePoint })
    const tool = usePenTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    tool.onMouseMove?.({}, { x: 30, y: 40 })
    expect(broadcastStrokePoint).toHaveBeenCalledWith(
      expect.stringMatching(/^test-user-\d+$/),
      [30, 40, 0.5],
    )
  })

  it('onMouseUp with 2+ points emits element', () => {
    const ctx = createMockToolContext({ currentTool: 'pen' })
    const tool = usePenTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    tool.onMouseMove?.({}, { x: 30, y: 40 })
    tool.onMouseUp?.({}, { x: 30, y: 40 })
    expect(ctx.emitElementAdd).toHaveBeenCalledOnce()
    expect(vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]!.type).toBe('stroke')
    expect((vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]! as any).data.tool).toBe('pen')
  })

  it('onMouseUp with 2+ points calls endActiveStroke', () => {
    const startActiveStroke = vi.fn()
    const endActiveStroke = vi.fn()
    const ctx = createMockToolContext({ startActiveStroke, endActiveStroke })
    const tool = usePenTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    tool.onMouseMove?.({}, { x: 30, y: 40 })
    tool.onMouseUp?.({}, { x: 30, y: 40 })
    expect(endActiveStroke).toHaveBeenCalledOnce()
    expect(endActiveStroke.mock.calls[0]![1]!.type).toBe('stroke')
  })

  it('onMouseUp with single point does NOT emit', () => {
    const ctx = createMockToolContext()
    const tool = usePenTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    tool.onMouseUp?.({}, { x: 10, y: 20 })
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
  })

  it('onMouseUp resets isDrawing to false', () => {
    const ctx = createMockToolContext()
    const tool = usePenTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    tool.onMouseMove?.({}, { x: 30, y: 40 })
    tool.onMouseUp?.({}, { x: 30, y: 40 })
    expect(ctx.isDrawing.value).toBe(false)
  })

  it('cancel aborts the active stroke without committing', () => {
    const startActiveStroke = vi.fn()
    const cancelActiveStroke = vi.fn()
    const ctx = createMockToolContext({ startActiveStroke, cancelActiveStroke })
    const tool = usePenTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    const strokeId = startActiveStroke.mock.calls[0]![0]!
    tool.onMouseMove?.({}, { x: 30, y: 40 })
    tool.cancel?.()
    expect(cancelActiveStroke).toHaveBeenCalledWith(strokeId)
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
    expect(tool.state?.currentStrokePoints?.value).toHaveLength(0)
    expect(tool.state?.currentStrokeId?.value).toBeNull()
  })

  it('cancel does not call cancelActiveStroke when no stroke is active', () => {
    const cancelActiveStroke = vi.fn()
    const ctx = createMockToolContext({ cancelActiveStroke })
    const tool = usePenTool(ctx)
    tool.cancel?.()
    expect(cancelActiveStroke).not.toHaveBeenCalled()
  })
})
