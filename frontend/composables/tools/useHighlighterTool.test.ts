import { describe, expect, it, vi } from 'vitest'
import { createMockToolContext } from './__tests__/mockToolContext'
import { useHighlighterTool } from './useHighlighterTool'

describe('useHighlighterTool', () => {
  it('onMouseDown sets isDrawing to true', () => {
    const ctx = createMockToolContext()
    const tool = useHighlighterTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    expect(ctx.isDrawing.value).toBe(true)
  })

  it('onMouseMove appends point when drawing', () => {
    const ctx = createMockToolContext()
    const tool = useHighlighterTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    tool.onMouseMove?.({}, { x: 30, y: 40 })
    expect(tool.state?.currentStrokePoints?.value).toHaveLength(2)
  })

  it('onMouseUp with 2+ points emits element with tool highlighter', () => {
    const ctx = createMockToolContext()
    const tool = useHighlighterTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    tool.onMouseMove?.({}, { x: 30, y: 40 })
    tool.onMouseUp?.({}, { x: 30, y: 40 })
    expect(ctx.emitElementAdd).toHaveBeenCalledOnce()
    expect((vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]! as any).data.tool).toBe('highlighter')
  })

  it('onMouseUp with single point does NOT emit', () => {
    const ctx = createMockToolContext()
    const tool = useHighlighterTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    tool.onMouseUp?.({}, { x: 10, y: 20 })
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
  })

  it('onMouseUp resets isDrawing to false', () => {
    const ctx = createMockToolContext()
    const tool = useHighlighterTool(ctx)
    tool.onMouseDown?.({}, { x: 10, y: 20 })
    tool.onMouseMove?.({}, { x: 30, y: 40 })
    tool.onMouseUp?.({}, { x: 30, y: 40 })
    expect(ctx.isDrawing.value).toBe(false)
  })

  it('cancel aborts the active stroke without committing', () => {
    const startActiveStroke = vi.fn()
    const cancelActiveStroke = vi.fn()
    const ctx = createMockToolContext({ startActiveStroke, cancelActiveStroke })
    const tool = useHighlighterTool(ctx)
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
    const tool = useHighlighterTool(ctx)
    tool.cancel?.()
    expect(cancelActiveStroke).not.toHaveBeenCalled()
  })
})
