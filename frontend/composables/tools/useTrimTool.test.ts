import { describe, expect, it } from 'vitest'
import { createMockToolContext, createSampleElement } from './__tests__/mockToolContext'
import { useTrimTool } from './useTrimTool'

describe('useTrimTool', () => {
  it('step 1 (cutting edge): click near element selects it as cutting edge', () => {
    const el = createSampleElement({ id: 'cut-line' })
    const ctx = createMockToolContext({ elements: [el] })
    const tool = useTrimTool(ctx)
    tool.onMouseDown?.(null, { x: 150, y: 150 })
    expect(tool.state!.cuttingEdgeId.value).toBe('cut-line')
    expect(tool.state!.step.value).toBe('trim')
  })

  it('step 2 (side to trim): click near element trims it and calls emitElementUpdate', () => {
    const cuttingEdge = createSampleElement({
      id: 'cut-edge',
      data: { start: [0, 100], end: [300, 100], color: '#000', size: 2 },
    })
    const toTrim = createSampleElement({
      id: 'to-trim',
      data: { start: [100, 0], end: [100, 200], color: '#000', size: 2 },
    })
    const ctx = createMockToolContext({ elements: [cuttingEdge, toTrim] })
    const tool = useTrimTool(ctx)
    tool.state!.cuttingEdgeId.value = 'cut-edge'
    tool.state!.step.value = 'trim'
    tool.onMouseDown?.(null, { x: 100, y: 50 })
    expect(ctx.emitElementUpdate).toHaveBeenCalledWith('to-trim', expect.objectContaining({
      data: expect.objectContaining({ start: [100, 100] }),
    }))
  })

  it('click on non-line/polyline does nothing', () => {
    const cuttingEdge = createSampleElement({
      id: 'cut-edge',
      data: { start: [0, 100], end: [300, 100], color: '#000', size: 2 },
    })
    const rect = {
      ...createSampleElement({ id: 'rect' }),
      type: 'rectangle' as const,
      data: { x: 0, y: 0, width: 50, height: 50, stroke: '#000', strokeWidth: 2 },
    }
    const ctx = createMockToolContext({ elements: [cuttingEdge, rect] })
    const tool = useTrimTool(ctx)
    tool.state!.cuttingEdgeId.value = 'cut-edge'
    tool.state!.step.value = 'trim'
    const update = ctx.emitElementUpdate
    tool.onMouseDown?.(null, { x: 25, y: 25 })
    expect(update).not.toHaveBeenCalled()
  })

  it('Escape from trim goes back to cutting-edge step', () => {
    const ctx = createMockToolContext()
    const tool = useTrimTool(ctx)
    tool.state!.step.value = 'trim'
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.step.value).toBe('cutting-edge')
    expect(tool.state!.cuttingEdgeId.value).toBeNull()
  })

  it('Escape from cutting-edge step resets', () => {
    const ctx = createMockToolContext()
    const tool = useTrimTool(ctx)
    tool.state!.cuttingEdgeId.value = 'some-edge'
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.cuttingEdgeId.value).toBeNull()
    expect(tool.state!.step.value).toBe('cutting-edge')
  })

  it('deactivate resets all state', () => {
    const ctx = createMockToolContext()
    const tool = useTrimTool(ctx)
    tool.state!.cuttingEdgeId.value = 'some-edge'
    tool.state!.step.value = 'trim'
    tool.deactivate?.()
    expect(tool.state!.cuttingEdgeId.value).toBeNull()
    expect(tool.state!.step.value).toBe('cutting-edge')
    expect(tool.state!.highlightId.value).toBeNull()
  })

  it('preview/highlight on mouse move', () => {
    const el = createSampleElement({ id: 'e1' })
    const ctx = createMockToolContext({ elements: [el] })
    const tool = useTrimTool(ctx)
    tool.onMouseMove?.(null, { x: 150, y: 150 })
    expect(tool.state!.highlightId.value).toBe('e1')
  })

  it('state exposes cuttingEdgeId, step, highlightId', () => {
    const ctx = createMockToolContext()
    const tool = useTrimTool(ctx)
    expect(tool.state).toHaveProperty('cuttingEdgeId')
    expect(tool.state).toHaveProperty('step')
    expect(tool.state).toHaveProperty('highlightId')
  })
})
