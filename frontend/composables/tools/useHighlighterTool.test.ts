import { describe, expect, it } from 'vitest'
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
    expect(ctx.emitElementAdd.mock.calls[0][0].data.tool).toBe('highlighter')
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
})
