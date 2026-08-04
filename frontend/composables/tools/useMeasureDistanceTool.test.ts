import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useMeasureDistanceTool } from './useMeasureDistanceTool'
import { createMockToolContext } from './__tests__/mockToolContext'

describe('useMeasureDistanceTool', () => {
  it('first click starts measurement when not yet measuring', () => {
    const ctx = createMockToolContext({ isMeasuring: ref(false) })
    const handler = useMeasureDistanceTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(ctx.startDistanceMeasurement).toHaveBeenCalledWith([100, 200])
    expect(handler.state!.startPoint.value).toEqual([100, 200])
  })

  it('second click completes measurement', () => {
    const ctx = createMockToolContext({ isMeasuring: ref(true) })
    const handler = useMeasureDistanceTool(ctx)

    handler.state!.startPoint.value = [100, 200]
    handler.onMouseDown?.({}, { x: 400, y: 200 })

    expect(ctx.completeDistanceMeasurement).toHaveBeenCalledWith([400, 200], ctx.currentColor)
    expect(handler.state!.startPoint.value).toBeNull()
  })

  it('calls findSnapPoint on first click', () => {
    const ctx = createMockToolContext({ isMeasuring: ref(false) })
    const handler = useMeasureDistanceTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(ctx.findSnapPoint).toHaveBeenCalledWith({ x: 100, y: 200 }, ctx.elements)
  })

  it('calls findSnapPoint on second click', () => {
    const ctx = createMockToolContext({ isMeasuring: ref(true) })
    const handler = useMeasureDistanceTool(ctx)

    handler.state!.startPoint.value = [100, 200]
    handler.onMouseDown?.({}, { x: 400, y: 200 })

    expect(ctx.findSnapPoint).toHaveBeenCalledWith({ x: 400, y: 200 }, ctx.elements)
  })

  it('deactivate calls cancelMeasurement', () => {
    const ctx = createMockToolContext()

    const handler = useMeasureDistanceTool(ctx)
    handler.deactivate?.()

    expect(ctx.cancelMeasurement).toHaveBeenCalled()
  })

  it('zero-length guard cancels measurement and resets startPoint', () => {
    const ctx = createMockToolContext({ isMeasuring: ref(true) })
    const handler = useMeasureDistanceTool(ctx)

    handler.state!.startPoint.value = [100, 200]
    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(ctx.cancelMeasurement).toHaveBeenCalled()
    expect(handler.state!.startPoint.value).toBeNull()
    expect(ctx.completeDistanceMeasurement).not.toHaveBeenCalled()
  })

  it('first click uses snapped point when findSnapPoint returns a value', () => {
    const snapPoint = { x: 150, y: 250 }
    const ctx = createMockToolContext({
      isMeasuring: ref(false),
      findSnapPoint: vi.fn(() => snapPoint),
    })
    const handler = useMeasureDistanceTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(ctx.startDistanceMeasurement).toHaveBeenCalledWith([150, 250])
  })
})
