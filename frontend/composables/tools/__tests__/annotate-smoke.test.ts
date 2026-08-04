import { describe, expect, it, vi, beforeAll } from 'vitest'
import { ref } from 'vue'
import { createMockToolContext } from './mockToolContext'
import { useStampTool } from '../useStampTool'

const mockCanvasCtx = {
  font: '',
  measureText: vi.fn(() => ({ width: 50 })),
}

beforeAll(() => {
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      return { getContext: vi.fn(() => mockCanvasCtx) } as any
    }
    return document.createElement(tag)
  })
})

describe('Stamp tool — annotate workflow', () => {
  it('places an APPROVED stamp on click', () => {
    const ctx = createMockToolContext({ currentStampType: 'APPROVED' })
    const tool = useStampTool(ctx)

    tool.onMouseDown!({}, { x: 300, y: 400 })
    expect(ctx.emitElementAdd).toHaveBeenCalledTimes(1)
    const el = vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]!
    expect(el.type).toBe('stamp')
    expect((el as any).data.stampType).toBe('APPROVED')
    expect((el as any).data.text).toBe('APPROVED')
    expect(typeof (el as any).data.x).toBe('number')
    expect(typeof (el as any).data.y).toBe('number')
    expect(typeof (el as any).data.width).toBe('number')
    expect(typeof (el as any).data.height).toBe('number')
    expect(typeof (el as any).data.backgroundColor).toBe('string')
    expect(typeof (el as any).data.textColor).toBe('string')
    expect(typeof (el as any).data.borderColor).toBe('string')
    expect(typeof (el as any).data.fontSize).toBe('number')
    expect(typeof (el as any).data.padding).toBe('number')
    expect(typeof (el as any).data.borderRadius).toBe('number')
  })
})
