import { describe, expect, it } from 'vitest'
import { createMockToolContext, createSampleElement } from './__tests__/mockToolContext'
import { useExtendTool } from './useExtendTool'

describe('useExtendTool', () => {
  it('step 1 (boundary edge): click near element selects it as boundary', () => {
    const boundary = createSampleElement({
      id: 'boundary',
      data: { start: [150, 0], end: [150, 200], color: '#000', size: 2 },
    })
    const ctx = createMockToolContext({ elements: [boundary] })
    const tool = useExtendTool(ctx)
    tool.onMouseDown?.(null, { x: 150, y: 100 })
    expect(tool.state!.boundaryId.value).toBe('boundary')
    expect(tool.state!.step.value).toBe('extend')
  })

  it('step 2 (end to extend): click near element end extends it and calls emitElementUpdate', () => {
    const boundary = createSampleElement({
      id: 'boundary',
      data: { start: [150, 0], end: [150, 200], color: '#000', size: 2 },
    })
    const toExtend = createSampleElement({
      id: 'to-extend',
      data: { start: [0, 100], end: [100, 100], color: '#000', size: 2 },
    })
    const ctx = createMockToolContext({ elements: [boundary, toExtend] })
    const tool = useExtendTool(ctx)
    tool.state!.boundaryId.value = 'boundary'
    tool.state!.step.value = 'extend'
    tool.onMouseDown?.(null, { x: 80, y: 100 })
    expect(ctx.emitElementUpdate).toHaveBeenCalledWith('to-extend', expect.objectContaining({
      data: expect.objectContaining({ end: [150, 100] }),
    }))
  })

  it('Escape from extend goes back to boundary step', () => {
    const ctx = createMockToolContext()
    const tool = useExtendTool(ctx)
    tool.state!.step.value = 'extend'
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.step.value).toBe('boundary')
    expect(tool.state!.boundaryId.value).toBeNull()
  })

  it('Escape from boundary step resets', () => {
    const ctx = createMockToolContext()
    const tool = useExtendTool(ctx)
    tool.state!.boundaryId.value = 'some-boundary'
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.boundaryId.value).toBeNull()
    expect(tool.state!.step.value).toBe('boundary')
  })

  it('deactivate resets all state', () => {
    const ctx = createMockToolContext()
    const tool = useExtendTool(ctx)
    tool.state!.boundaryId.value = 'some-boundary'
    tool.state!.step.value = 'extend'
    tool.deactivate?.()
    expect(tool.state!.boundaryId.value).toBeNull()
    expect(tool.state!.step.value).toBe('boundary')
    expect(tool.state!.highlightId.value).toBeNull()
  })

  it('preview/highlight on mouse move', () => {
    const el = createSampleElement({ id: 'e1' })
    const ctx = createMockToolContext({ elements: [el] })
    const tool = useExtendTool(ctx)
    tool.onMouseMove?.(null, { x: 150, y: 150 })
    expect(tool.state!.highlightId.value).toBe('e1')
  })

  it('state exposes boundaryId, step, highlightId', () => {
    const ctx = createMockToolContext()
    const tool = useExtendTool(ctx)
    expect(tool.state).toHaveProperty('boundaryId')
    expect(tool.state).toHaveProperty('step')
    expect(tool.state).toHaveProperty('highlightId')
  })
})
