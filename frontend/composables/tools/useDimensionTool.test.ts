import { describe, expect, it, vi } from 'vitest'
import { useDimensionTool } from './useDimensionTool'
import { createMockToolContext } from './__tests__/mockToolContext'

describe('useDimensionTool', () => {
  it('click 1 sets start point', () => {
    const ctx = createMockToolContext()
    const handler = useDimensionTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(handler.state.startPoint.value).toEqual([100, 200])
    expect(handler.state.step.value).toBe('end')
    expect(ctx.isDrawing.value).toBe(true)
  })

  it('click 2 sets end point', () => {
    const ctx = createMockToolContext()
    const handler = useDimensionTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })
    handler.onMouseDown?.({}, { x: 400, y: 200 })

    expect(handler.state.endPoint.value).toEqual([400, 200])
    expect(handler.state.step.value).toBe('offset')
  })

  it('click 3 sets offset distance and emits dimension element', () => {
    const ctx = createMockToolContext({ pixelsPerInch: 96, measurementUnit: 'inches' })
    const handler = useDimensionTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })
    handler.onMouseDown?.({}, { x: 400, y: 200 })
    handler.state.previewOffset.value = 50
    handler.onMouseDown?.({}, { x: 250, y: 100 })

    expect(ctx.emitElementAdd).toHaveBeenCalledTimes(1)
    const emitted = ctx.emitElementAdd.mock.calls[0][0]
    expect(emitted.type).toBe('dimension')
    expect(emitted.data.start).toEqual([100, 200])
    expect(emitted.data.end).toEqual([400, 200])
    expect(emitted.data.offset).toBe(50)
    expect(emitted.data.style).toBe('linear')
  })

  it('zero-length guard on start→end resets to start step', () => {
    const ctx = createMockToolContext()
    const handler = useDimensionTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })
    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(handler.state.step.value).toBe('start')
    expect(handler.state.startPoint.value).toBeNull()
    expect(ctx.isDrawing.value).toBe(false)
  })

  it('uses pixelsPerInch and measurementUnit from context', () => {
    const ctx = createMockToolContext({ pixelsPerInch: 300, measurementUnit: 'feet' })
    const handler = useDimensionTool(ctx)

    handler.onMouseDown?.({}, { x: 0, y: 0 })
    handler.onMouseDown?.({}, { x: 300, y: 0 })
    handler.state.previewOffset.value = 20
    handler.onMouseDown?.({}, { x: 150, y: 50 })

    const emitted = ctx.emitElementAdd.mock.calls[0][0]
    expect(emitted.data.pixelsPerInch).toBe(300)
    expect(emitted.data.unit).toBe('feet')
    expect(emitted.data.value).toBeCloseTo(0.0833, 4)
  })

  it('deactivate resets state', () => {
    const ctx = createMockToolContext()
    const handler = useDimensionTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })
    handler.deactivate()

    expect(handler.state.step.value).toBe('start')
    expect(handler.state.startPoint.value).toBeNull()
    expect(handler.state.endPoint.value).toBeNull()
    expect(ctx.isDrawing.value).toBe(false)
  })

  it('Escape from offset step resets to start', () => {
    const ctx = createMockToolContext()
    const handler = useDimensionTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })
    handler.onMouseDown?.({}, { x: 400, y: 200 })
    expect(handler.state.step.value).toBe('offset')

    const consumed = handler.onKeyDown?.({ key: 'Escape' } as KeyboardEvent)
    expect(consumed).toBe(true)
    expect(handler.state.step.value).toBe('start')
    expect(handler.state.startPoint.value).toBeNull()
    expect(handler.state.endPoint.value).toBeNull()
  })

  it('findSnapPoint called on both first and second click', () => {
    const ctx = createMockToolContext()
    const handler = useDimensionTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })
    handler.onMouseDown?.({}, { x: 400, y: 200 })

    expect(ctx.findSnapPoint).toHaveBeenCalledTimes(2)
    expect(ctx.findSnapPoint).toHaveBeenNthCalledWith(1, { x: 100, y: 200 }, ctx.elements)
    expect(ctx.findSnapPoint).toHaveBeenNthCalledWith(2, { x: 400, y: 200 }, ctx.elements)
  })
})
