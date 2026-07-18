import { describe, expect, it, vi } from 'vitest'
import { createMockToolContext } from './__tests__/mockToolContext'
import { useEraserTool } from './useEraserTool'

function makeCanvasShape(id: string) {
  return {
    id: vi.fn(() => id),
    getParent: vi.fn(() => ({
      id: vi.fn(() => ''),
      getParent: vi.fn(() => ({
        name: vi.fn(() => 'regularLayer'),
        getParent: vi.fn(() => null),
      })),
    })),
    attrs: {},
  }
}

function makeDocLayerShape(id: string) {
  return {
    id: vi.fn(() => id),
    getParent: vi.fn(() => ({
      id: vi.fn(() => ''),
      getParent: vi.fn(() => ({
        name: vi.fn(() => 'documentLayer'),
        getParent: vi.fn(() => null),
      })),
    })),
    attrs: {},
  }
}

describe('useEraserTool', () => {
  it('onMouseDown sets isDrawing=true and calls emitElementDelete if element at position', () => {
    const stageRef = {
      value: { getNode: vi.fn(() => ({ getAllIntersections: vi.fn(() => [makeCanvasShape('el-1')]) })) },
    }
    const ctx = createMockToolContext({
      stageRef,
      getStagePointerPos: vi.fn(() => ({ x: 100, y: 100 })),
    })
    const tool = useEraserTool(ctx)
    tool.onMouseDown?.(null, { x: 100, y: 100 })
    expect(ctx.isDrawing.value).toBe(true)
    expect(ctx.emitElementDelete).toHaveBeenCalledWith('el-1')
  })

  it('onMouseMove while drawing erases element at position', () => {
    const stageRef = {
      value: { getNode: vi.fn(() => ({ getAllIntersections: vi.fn(() => [makeCanvasShape('el-2')]) })) },
    }
    const ctx = createMockToolContext({
      stageRef,
      getStagePointerPos: vi.fn(() => ({ x: 200, y: 200 })),
    })
    const tool = useEraserTool(ctx)
    ctx.isDrawing.value = true
    tool.onMouseMove?.(null, { x: 200, y: 200 })
    expect(ctx.emitElementDelete).toHaveBeenCalledWith('el-2')
  })

  it('onMouseMove while NOT drawing does nothing', () => {
    const getAllIntersections = vi.fn()
    const stageRef = {
      value: { getNode: vi.fn(() => ({ getAllIntersections })) },
    }
    const ctx = createMockToolContext({
      stageRef,
      getStagePointerPos: vi.fn(() => ({ x: 100, y: 100 })),
    })
    const tool = useEraserTool(ctx)
    ctx.isDrawing.value = false
    tool.onMouseMove?.(null, { x: 100, y: 100 })
    expect(getAllIntersections).not.toHaveBeenCalled()
    expect(ctx.emitElementDelete).not.toHaveBeenCalled()
  })

  it('onMouseUp sets isDrawing to false', () => {
    const ctx = createMockToolContext()
    const tool = useEraserTool(ctx)
    ctx.isDrawing.value = true
    tool.onMouseUp?.(null, { x: 0, y: 0 })
    expect(ctx.isDrawing.value).toBe(false)
  })

  it('activate sets cursor to crosshair', () => {
    const ctx = createMockToolContext()
    const tool = useEraserTool(ctx)
    tool.activate?.()
    expect(ctx.setCursor).toHaveBeenCalledWith('crosshair')
  })

  it('deactivate clears cursor', () => {
    const ctx = createMockToolContext()
    const tool = useEraserTool(ctx)
    tool.deactivate?.()
    expect(ctx.clearCursor).toHaveBeenCalled()
  })

  it('filters out document layer shapes', () => {
    const stageRef = {
      value: { getNode: vi.fn(() => ({ getAllIntersections: vi.fn(() => [makeDocLayerShape('doc-shape')]) })) },
    }
    const ctx = createMockToolContext({
      stageRef,
      getStagePointerPos: vi.fn(() => ({ x: 100, y: 100 })),
    })
    const tool = useEraserTool(ctx)
    tool.onMouseDown?.(null, { x: 100, y: 100 })
    expect(ctx.emitElementDelete).not.toHaveBeenCalled()
  })
})
