import { describe, expect, it, vi, beforeAll } from 'vitest'
import { useStampTool } from './useStampTool'
import { createMockToolContext } from './__tests__/mockToolContext'

const mockCanvasCtx = {
  font: '',
  measureText: vi.fn(() => ({ width: 50 })),
}

beforeAll(() => {
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      return {
        getContext: vi.fn(() => mockCanvasCtx),
      } as any
    }
    return document.createElement(tag)
  })
})

describe('useStampTool', () => {
  it('single click places stamp element', () => {
    const ctx = createMockToolContext({ currentStampType: 'APPROVED' })
    const handler = useStampTool(ctx)

    handler.onMouseDown?.({}, { x: 200, y: 150 })

    expect(ctx.emitElementAdd).toHaveBeenCalledTimes(1)
  })

  it('emitted element has type stamp', () => {
    const ctx = createMockToolContext({ currentStampType: 'APPROVED' })
    const handler = useStampTool(ctx)

    handler.onMouseDown?.({}, { x: 200, y: 150 })

    const emitted = ctx.emitElementAdd.mock.calls[0][0]
    expect(emitted.type).toBe('stamp')
  })

  it('emitted element has stampType from ctx.currentStampType', () => {
    const ctx = createMockToolContext({ currentStampType: 'REVISED' })
    const handler = useStampTool(ctx)

    handler.onMouseDown?.({}, { x: 200, y: 150 })

    const emitted = ctx.emitElementAdd.mock.calls[0][0]
    expect(emitted.data.stampType).toBe('REVISED')
    expect(emitted.data.text).toBe('REVISED')
  })

  it('default stampType APPROVED places APPROVED stamp', () => {
    const ctx = createMockToolContext({ currentStampType: 'APPROVED' })
    const handler = useStampTool(ctx)

    handler.onMouseDown?.({}, { x: 200, y: 150 })

    const emitted = ctx.emitElementAdd.mock.calls[0][0]
    expect(emitted.data.stampType).toBe('APPROVED')
    expect(emitted.data.text).toBe('APPROVED')
  })

  it('findSnapPoint is called', () => {
    const ctx = createMockToolContext({ currentStampType: 'NOTE' })
    const handler = useStampTool(ctx)

    handler.onMouseDown?.({}, { x: 200, y: 150 })

    expect(ctx.findSnapPoint).toHaveBeenCalledWith({ x: 200, y: 150 }, ctx.elements)
  })

  it('stamp centered on snap point when snap is found', () => {
    const snapPoint = { x: 300, y: 100 }
    const ctx = createMockToolContext({
      currentStampType: 'NOTE',
      findSnapPoint: vi.fn(() => snapPoint),
    })
    const handler = useStampTool(ctx)

    handler.onMouseDown?.({}, { x: 200, y: 150 })

    const emitted = ctx.emitElementAdd.mock.calls[0][0]
    expect(emitted.data.x).toBeLessThan(300)
    expect(emitted.data.y).toBeLessThan(100)
  })

  it('does nothing when currentStampType is not set', () => {
    const ctx = createMockToolContext({ currentStampType: undefined })
    const handler = useStampTool(ctx)

    handler.onMouseDown?.({}, { x: 200, y: 150 })

    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
  })
})
