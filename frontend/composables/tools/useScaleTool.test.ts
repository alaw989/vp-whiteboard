import { describe, expect, it } from 'vitest'
import { createMockToolContext, createSampleElement } from './__tests__/mockToolContext'
import { useScaleTool } from './useScaleTool'

describe('useScaleTool', () => {
  const el1 = createSampleElement({ id: 'e1' })

  it('step 1 (select): click toggles selection', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useScaleTool(ctx)
    tool.onMouseDown?.(null, { x: 150, y: 150 })
    expect(tool.state!.selectedIds.value).toEqual(['e1'])
    tool.onMouseDown?.(null, { x: 150, y: 150 })
    expect(tool.state!.selectedIds.value).toEqual([])
  })

  it('step 2 (basepoint): click sets basepoint and advances to scale', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useScaleTool(ctx)
    tool.state!.selectedIds.value = ['e1']
    tool.state!.step.value = 'basepoint'
    tool.onMouseDown?.(null, { x: 150, y: 150 })
    expect(tool.state!.basepoint.value).toEqual({ x: 150, y: 150 })
    expect(tool.state!.step.value).toBe('scale')
  })

  it('step 2: bounding-box diagonal used as reference distance', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useScaleTool(ctx)
    tool.state!.selectedIds.value = ['e1']
    tool.state!.step.value = 'basepoint'
    tool.onMouseDown?.(null, { x: 150, y: 150 })
    const diag = Math.hypot(200 - 100, 200 - 100)
    const centroidDist = 0
    const expectedRef = Math.max(centroidDist, diag * 0.05, 1)
    expect(tool.state!.referenceDist.value).toBe(expectedRef)
  })

  it('step 3 (factor): click emits scaled elements and deletes originals', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useScaleTool(ctx)
    tool.state!.selectedIds.value = ['e1']
    tool.state!.step.value = 'scale'
    tool.state!.basepoint.value = { x: 150, y: 150 }
    tool.state!.referenceDist.value = 100
    tool.onMouseDown?.(null, { x: 200, y: 150 })
    expect(ctx.emitElementAdd).toHaveBeenCalled()
    expect(ctx.emitElementDelete).toHaveBeenCalledWith('e1')
  })

  it('Escape from scale goes back to basepoint', () => {
    const ctx = createMockToolContext()
    const tool = useScaleTool(ctx)
    tool.state!.step.value = 'scale'
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.step.value).toBe('basepoint')
  })

  it('Escape from basepoint goes back to select', () => {
    const ctx = createMockToolContext()
    const tool = useScaleTool(ctx)
    tool.state!.step.value = 'basepoint'
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.step.value).toBe('select')
  })

  it('Escape from select with selections resets', () => {
    const ctx = createMockToolContext()
    const tool = useScaleTool(ctx)
    tool.state!.selectedIds.value = ['e1']
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.selectedIds.value).toEqual([])
  })

  it('Enter from select with selections advances to basepoint', () => {
    const ctx = createMockToolContext()
    const tool = useScaleTool(ctx)
    tool.state!.selectedIds.value = ['e1']
    const event = new KeyboardEvent('keydown', { key: 'Enter' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.step.value).toBe('basepoint')
  })

  it('deactivate resets all state', () => {
    const ctx = createMockToolContext()
    const tool = useScaleTool(ctx)
    tool.state!.selectedIds.value = ['e1']
    tool.state!.step.value = 'scale'
    tool.state!.basepoint.value = { x: 100, y: 100 }
    tool.deactivate?.()
    expect(tool.state!.selectedIds.value).toEqual([])
    expect(tool.state!.basepoint.value).toBeNull()
    expect(tool.state!.currentCursor.value).toBeNull()
    expect(tool.state!.referenceDist.value).toBe(1)
    expect(tool.state!.step.value).toBe('select')
  })

  it('state exposes selectedIds, basepoint, currentCursor, currentScale, referenceDist, previewElements, step', () => {
    const ctx = createMockToolContext()
    const tool = useScaleTool(ctx)
    expect(tool.state).toHaveProperty('selectedIds')
    expect(tool.state).toHaveProperty('basepoint')
    expect(tool.state).toHaveProperty('currentCursor')
    expect(tool.state).toHaveProperty('currentScale')
    expect(tool.state).toHaveProperty('referenceDist')
    expect(tool.state).toHaveProperty('previewElements')
    expect(tool.state).toHaveProperty('step')
  })
})
