import { describe, expect, it, vi } from 'vitest'
import { useTextAnnotationTool } from './useTextAnnotationTool'
import { createMockToolContext, createSampleElement } from './__tests__/mockToolContext'

describe('useTextAnnotationTool', () => {
  it('onMouseDown sets leader start and enables drawing', () => {
    const ctx = createMockToolContext()
    const handler = useTextAnnotationTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(ctx.isDrawing.value).toBe(true)
    expect(handler.state!.textAnnotationStart.value).toEqual({ x: 100, y: 200 })
    expect(handler.state!.currentLeaderLineEnd.value).toEqual({ x: 100, y: 200 })
  })

  it('onMouseDown respects findSnapPoint', () => {
    const snapPoint = { x: 150, y: 250 }
    const ctx = createMockToolContext({ findSnapPoint: vi.fn(() => snapPoint) })
    const handler = useTextAnnotationTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(ctx.findSnapPoint).toHaveBeenCalledWith({ x: 100, y: 200 }, ctx.elements)
    expect(handler.state!.textAnnotationStart.value).toEqual(snapPoint)
    expect(ctx.currentSnapPoint.value).toEqual(snapPoint)
  })

  it('onMouseUp creates annotation input with leader line', () => {
    const ctx = createMockToolContext()
    const handler = useTextAnnotationTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 100 })
    handler.onMouseMove?.({}, { x: 300, y: 200 })
    handler.onMouseUp?.({}, { x: 300, y: 200 })

    expect(handler.state!.showAnnotationInput.value).toBe(true)
    expect(handler.state!.pendingAnnotationText.value).toBe('')
    expect(handler.state!.annotationInputPosition.value).toEqual({ x: 100, y: 100 })
    expect(handler.state!.pendingLeaderLine.value).toEqual({
      start: [100, 100],
      end: [300, 200],
    })
    expect(ctx.isDrawing.value).toBe(false)
  })

  it('onMouseUp respects findSnapPoint for leader end', () => {
    const snapPoint = { x: 300, y: 200 }
    const ctx = createMockToolContext({ findSnapPoint: vi.fn(() => snapPoint) })
    const handler = useTextAnnotationTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 100 })
    handler.onMouseMove?.({}, { x: 310, y: 210 })
    handler.onMouseUp?.({}, { x: 310, y: 210 })

    expect(ctx.findSnapPoint).toHaveBeenLastCalledWith({ x: 310, y: 210 }, ctx.elements)
    expect(handler.state!.pendingLeaderLine.value!.end).toEqual([300, 200])
  })

  it('confirmAnnotation emits element with leader and text', () => {
    const ctx = createMockToolContext()
    const handler = useTextAnnotationTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 100 })
    handler.onMouseMove?.({}, { x: 300, y: 200 })
    handler.onMouseUp?.({}, { x: 300, y: 200 })
    handler.state!.pendingAnnotationText.value = 'Hello'
    handler.state!.confirmAnnotation()

    expect(ctx.emitElementAdd).toHaveBeenCalledTimes(1)
    const emitted = vi.mocked(ctx.emitElementAdd).mock.calls[0]![0]!
    expect(emitted.type).toBe('text-annotation')
    expect((emitted as any).data.text).toBe('Hello')
    expect((emitted as any).data.leaderLine).toEqual({ start: [300, 200], end: [100, 100] })
    expect((emitted as any).data.x).toBe(100)
    expect((emitted as any).data.y).toBe(100)
  })

  it('confirmAnnotation does not emit when text is empty', () => {
    const ctx = createMockToolContext()
    const handler = useTextAnnotationTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 100 })
    handler.onMouseUp?.({}, { x: 300, y: 200 })
    handler.state!.pendingAnnotationText.value = '   '
    handler.state!.confirmAnnotation()

    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
    expect(handler.state!.showAnnotationInput.value).toBe(false)
  })

  it('deactivate resets state and cancels annotation', () => {
    const ctx = createMockToolContext()
    const handler = useTextAnnotationTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })
    handler.deactivate!()

    expect(handler.state!.textAnnotationStart.value).toBeNull()
    expect(handler.state!.currentLeaderLineEnd.value).toBeNull()
    expect(handler.state!.showAnnotationInput.value).toBe(false)
    expect(handler.state!.pendingAnnotationText.value).toBe('')
  })

  it('zero-length leader line is not guarded (tool allows any length)', () => {
    const ctx = createMockToolContext()
    const handler = useTextAnnotationTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 100 })
    handler.onMouseUp?.({}, { x: 100, y: 100 })

    expect(handler.state!.pendingLeaderLine.value).toEqual({
      start: [100, 100],
      end: [100, 100],
    })
  })

  it('onMouseMove updates leader end while drawing', () => {
    const ctx = createMockToolContext()
    const handler = useTextAnnotationTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 100 })
    handler.onMouseMove?.({}, { x: 250, y: 180 })

    expect(handler.state!.currentLeaderLineEnd.value).toEqual({ x: 250, y: 180 })
  })

  it('onMouseMove does nothing when not drawing', () => {
    const ctx = createMockToolContext()
    const handler = useTextAnnotationTool(ctx)

    handler.state!.currentLeaderLineEnd.value = { x: 0, y: 0 }
    handler.onMouseMove?.({}, { x: 250, y: 180 })

    expect(handler.state!.currentLeaderLineEnd.value).toEqual({ x: 0, y: 0 })
  })
})
