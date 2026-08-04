import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMockToolContext } from './mockToolContext'
import { useLineTool } from '../useLineTool'

describe('Line tool — draw workflow', () => {
  it('draws a line through mousedown mousemove mouseup and ignores stray clicks', () => {
    const ctx = createMockToolContext()
    const tool = useLineTool(ctx)

    expect(ctx.isDrawing.value).toBe(false)
    expect(tool.state!.lineStart.value).toBeNull()

    tool.onMouseDown!({}, { x: 100, y: 100 })
    expect(ctx.isDrawing.value).toBe(true)
    expect(tool.state!.lineStart.value).toStrictEqual({ x: 100, y: 100 })
    expect(tool.state!.currentLineEnd.value).toStrictEqual({ x: 100, y: 100 })

    tool.onMouseMove!({}, { x: 200, y: 150 })
    expect(ctx.constrainPoint).toHaveBeenCalledWith({ x: 100, y: 100 }, { x: 200, y: 150 })
    expect(tool.state!.currentLineEnd.value).toStrictEqual({ x: 200, y: 150 })

    tool.onMouseUp!({}, { x: 200, y: 150 })
    expect(ctx.emitElementAdd).toHaveBeenCalledTimes(1)
    const el = vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]!
    expect(el.type).toBe('line')
    expect((el as any).data.start).toStrictEqual([100, 100])
    expect((el as any).data.end).toStrictEqual([200, 150])
    expect((el as any).data.color).toBe('#000000')
    expect((el as any).data.size).toBe(2)
    expect(ctx.isDrawing.value).toBe(false)
    expect(tool.state!.lineStart.value).toBeNull()

    vi.mocked(ctx.emitElementAdd).mockClear()
    tool.onMouseDown!({}, { x: 50, y: 50 })
    tool.onMouseUp!({}, { x: 50, y: 50 })
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
    expect(ctx.isDrawing.value).toBe(false)
    expect(tool.state!.lineStart.value).toBeNull()
  })
})
