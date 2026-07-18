import { describe, expect, it } from 'vitest'
import { createMockToolContext, createSampleElement } from './__tests__/mockToolContext'
import { useRotateTool } from './useRotateTool'

describe('useRotateTool', () => {
  const el1 = createSampleElement({ id: 'e1' })

  it('step 1 (select): click on element toggles selection', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useRotateTool(ctx)
    tool.onMouseDown?.(null, { x: 150, y: 150 })
    expect(tool.state.selectedIds.value).toEqual(['e1'])
    tool.onMouseDown?.(null, { x: 150, y: 150 })
    expect(tool.state.selectedIds.value).toEqual([])
  })

  it('step 2 (basepoint): click sets basepoint and advances to angle', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useRotateTool(ctx)
    tool.state.step.value = 'basepoint'
    tool.onMouseDown?.(null, { x: 150, y: 150 })
    expect(tool.state.basepoint.value).toEqual({ x: 150, y: 150 })
    expect(tool.state.step.value).toBe('angle')
  })

  it('step 3 (angle): click emits rotated elements and deletes originals', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useRotateTool(ctx)
    tool.state.selectedIds.value = ['e1']
    tool.state.step.value = 'angle'
    tool.state.basepoint.value = { x: 150, y: 150 }
    tool.onMouseDown?.(null, { x: 200, y: 100 })
    expect(ctx.emitElementAdd).toHaveBeenCalled()
    expect(ctx.emitElementDelete).toHaveBeenCalledWith('e1')
  })

  it('empty click in select with selections advances to basepoint', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useRotateTool(ctx)
    tool.state.selectedIds.value = ['e1']
    tool.onMouseDown?.(null, { x: 0, y: 0 })
    expect(tool.state.step.value).toBe('basepoint')
  })

  it('Escape from angle goes back to basepoint', () => {
    const ctx = createMockToolContext()
    const tool = useRotateTool(ctx)
    tool.state.step.value = 'angle'
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state.step.value).toBe('basepoint')
  })

  it('Escape from basepoint goes back to select', () => {
    const ctx = createMockToolContext()
    const tool = useRotateTool(ctx)
    tool.state.step.value = 'basepoint'
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state.step.value).toBe('select')
  })

  it('Escape from select with selections resets', () => {
    const ctx = createMockToolContext()
    const tool = useRotateTool(ctx)
    tool.state.selectedIds.value = ['e1']
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state.selectedIds.value).toEqual([])
  })

  it('Enter from select with selections advances to basepoint', () => {
    const ctx = createMockToolContext()
    const tool = useRotateTool(ctx)
    tool.state.selectedIds.value = ['e1']
    const event = new KeyboardEvent('keydown', { key: 'Enter' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state.step.value).toBe('basepoint')
  })

  it('deactivate resets all state', () => {
    const ctx = createMockToolContext()
    const tool = useRotateTool(ctx)
    tool.state.selectedIds.value = ['e1']
    tool.state.step.value = 'angle'
    tool.state.basepoint.value = { x: 100, y: 100 }
    tool.deactivate?.()
    expect(tool.state.selectedIds.value).toEqual([])
    expect(tool.state.basepoint.value).toBeNull()
    expect(tool.state.currentCursor.value).toBeNull()
    expect(tool.state.step.value).toBe('select')
  })

  it('preview updates on mouse move in angle step', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useRotateTool(ctx)
    tool.state.selectedIds.value = ['e1']
    tool.state.step.value = 'angle'
    tool.state.basepoint.value = { x: 150, y: 150 }
    tool.onMouseMove?.(null, { x: 200, y: 100 })
    expect(tool.state.previewElements.value.length).toBeGreaterThan(0)
  })
})
