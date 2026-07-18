import { describe, expect, it, vi } from 'vitest'
import { useMeasureAreaTool } from './useMeasureAreaTool'
import { createMockToolContext, createSampleElement } from './__tests__/mockToolContext'

function createStageMock(intersectingShapes: any[] = []) {
  const stage = {
    getAllIntersections: vi.fn(() => intersectingShapes),
    container: vi.fn(() => ({ style: { cursor: '' } })),
    getNode: vi.fn(function () { return this }),
  }
  return stage
}

function createShapeMock(overrides: Partial<any> = {}) {
  const shape = {
    id: vi.fn(() => 'el-1'),
    getParent: vi.fn(() => ({
      id: vi.fn(() => 'el-1'),
      getParent: vi.fn(() => ({
        name: vi.fn(() => 'canvasLayer'),
      })),
      className: 'Shape',
    })),
    ...overrides,
  }
  return shape
}

describe('useMeasureAreaTool', () => {
  it('calls measureArea with element id at position', () => {
    const shape = createShapeMock()
    const stage = createStageMock([shape])
    const ctx = createMockToolContext({
      stageRef: { value: stage },
      getStagePointerPos: vi.fn(() => ({ x: 100, y: 200 })),
      elements: [createSampleElement({ id: 'el-1', type: 'rectangle' })],
      measureArea: vi.fn(() => true),
    })
    const handler = useMeasureAreaTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(ctx.getStagePointerPos).toHaveBeenCalled()
    expect(stage.getAllIntersections).toHaveBeenCalledWith({ x: 100, y: 200 })
    expect(ctx.measureArea).toHaveBeenCalledWith('el-1', ctx.currentColor)
  })

  it('does nothing when stageRef is null', () => {
    const ctx = createMockToolContext({
      stageRef: { value: null },
    })
    const handler = useMeasureAreaTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(ctx.getStagePointerPos).not.toHaveBeenCalled()
  })

  it('returns true from measureArea when element is measurable', () => {
    const shape = createShapeMock()
    const stage = createStageMock([shape])
    const ctx = createMockToolContext({
      stageRef: { value: stage },
      getStagePointerPos: vi.fn(() => ({ x: 100, y: 200 })),
      elements: [createSampleElement({ id: 'el-1', type: 'rectangle' })],
      measureArea: vi.fn(() => true),
    })
    const handler = useMeasureAreaTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(ctx.measureArea).toHaveReturnedWith(true)
  })

  it('returns false from measureArea when area measurement fails', () => {
    const shape = createShapeMock()
    const stage = createStageMock([shape])
    const ctx = createMockToolContext({
      stageRef: { value: stage },
      getStagePointerPos: vi.fn(() => ({ x: 100, y: 200 })),
      elements: [createSampleElement({ id: 'el-1', type: 'rectangle' })],
      measureArea: vi.fn(() => false),
    })
    const handler = useMeasureAreaTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(ctx.measureArea).toHaveReturnedWith(false)
  })

  it('deactivate clears cursor', () => {
    const ctx = createMockToolContext()
    const handler = useMeasureAreaTool(ctx)

    handler.deactivate?.()

    expect(ctx.clearCursor).toHaveBeenCalled()
  })

  it('activate sets cursor to crosshair', () => {
    const ctx = createMockToolContext()
    const handler = useMeasureAreaTool(ctx)

    handler.activate?.()

    expect(ctx.setCursor).toHaveBeenCalledWith('crosshair')
  })
})
