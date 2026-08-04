import { describe, expect, it } from 'vitest'
import { createMockToolContext, createSampleElement } from './__tests__/mockToolContext'
import { useFilletTool } from './useFilletTool'

describe('useFilletTool', () => {
  it('step 1: click near first line selects it', () => {
    const line1 = createSampleElement({
      id: 'line1',
      data: { start: [0, 100], end: [200, 100], color: '#000', size: 2 },
    })
    const ctx = createMockToolContext({ elements: [line1] })
    const tool = useFilletTool(ctx)
    tool.onMouseDown?.(null, { x: 100, y: 100 })
    expect(tool.state!.firstLineId.value).toBe('line1')
    expect(tool.state!.step.value).toBe('second-line')
  })

  it('step 2: click near second line creates fillet-arc element and updates both lines', () => {
    const line1 = createSampleElement({
      id: 'line1',
      data: { start: [0, 100], end: [200, 100], color: '#000', size: 2 },
    })
    const line2 = createSampleElement({
      id: 'line2',
      data: { start: [100, 0], end: [100, 200], color: '#000', size: 2 },
    })
    const ctx = createMockToolContext({ elements: [line1, line2] })
    const tool = useFilletTool(ctx)
    tool.state!.firstLineId.value = 'line1'
    tool.state!.step.value = 'second-line'
    tool.onMouseDown?.(null, { x: 100, y: 0 })
    expect(ctx.emitElementUpdate).toHaveBeenCalledTimes(2)
    expect(ctx.emitElementAdd).toHaveBeenCalled()
    const arcEl = (ctx.emitElementAdd as any).mock.calls[0][0]
    expect(arcEl.type).toBe('fillet-arc')
    expect(tool.state!.firstLineId.value).toBeNull()
    expect(tool.state!.step.value).toBe('first-line')
  })

  it('lines that do not intersect create no fillet', () => {
    const line1 = createSampleElement({
      id: 'line1',
      data: { start: [0, 100], end: [200, 100], color: '#000', size: 2 },
    })
    const line2 = createSampleElement({
      id: 'line2',
      data: { start: [0, 200], end: [200, 200], color: '#000', size: 2 },
    })
    const ctx = createMockToolContext({ elements: [line1, line2] })
    const tool = useFilletTool(ctx)
    tool.state!.firstLineId.value = 'line1'
    tool.state!.step.value = 'second-line'
    tool.onMouseDown?.(null, { x: 100, y: 200 })
    expect(ctx.emitElementUpdate).not.toHaveBeenCalled()
    expect(ctx.emitElementAdd).not.toHaveBeenCalled()
  })

  it('Escape from second-line goes back to first-line', () => {
    const ctx = createMockToolContext()
    const tool = useFilletTool(ctx)
    tool.state!.step.value = 'second-line'
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.step.value).toBe('first-line')
    expect(tool.state!.firstLineId.value).toBeNull()
  })

  it('Escape from first-line with line selected resets', () => {
    const ctx = createMockToolContext()
    const tool = useFilletTool(ctx)
    tool.state!.firstLineId.value = 'some-line'
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.firstLineId.value).toBeNull()
    expect(tool.state!.step.value).toBe('first-line')
  })

  it('deactivate resets all state', () => {
    const ctx = createMockToolContext()
    const tool = useFilletTool(ctx)
    tool.state!.firstLineId.value = 'some-line'
    tool.state!.step.value = 'second-line'
    tool.deactivate?.()
    expect(tool.state!.firstLineId.value).toBeNull()
    expect(tool.state!.step.value).toBe('first-line')
    expect(tool.state!.highlightId.value).toBeNull()
  })

  it('preview/highlight on mouse move', () => {
    const line1 = createSampleElement({
      id: 'line1',
      data: { start: [0, 100], end: [200, 100], color: '#000', size: 2 },
    })
    const ctx = createMockToolContext({ elements: [line1] })
    const tool = useFilletTool(ctx)
    tool.onMouseMove?.(null, { x: 100, y: 100 })
    expect(tool.state!.highlightId.value).toBe('line1')
  })

  it('state exposes filletRadius, firstLineId, step, highlightId', () => {
    const ctx = createMockToolContext()
    const tool = useFilletTool(ctx)
    expect(tool.state).toHaveProperty('filletRadius')
    expect(tool.state).toHaveProperty('firstLineId')
    expect(tool.state).toHaveProperty('step')
    expect(tool.state).toHaveProperty('highlightId')
  })
})
