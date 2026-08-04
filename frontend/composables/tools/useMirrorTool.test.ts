import { describe, expect, it } from 'vitest'
import { createMockToolContext, createSampleElement } from './__tests__/mockToolContext'
import { useMirrorTool } from './useMirrorTool'

describe('useMirrorTool', () => {
  const el1 = createSampleElement({ id: 'e1' })

  it('step 1 (select): click on element toggles it in selectedIds', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useMirrorTool(ctx)
    tool.onMouseDown?.(null, { x: 150, y: 150 })
    expect(tool.state!.selectedIds.value).toEqual(['e1'])
    tool.onMouseDown?.(null, { x: 150, y: 150 })
    expect(tool.state!.selectedIds.value).toEqual([])
  })

  it('step 1: click on empty space with selections advances to axis-first', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useMirrorTool(ctx)
    tool.state!.selectedIds.value = ['e1']
    tool.onMouseDown?.(null, { x: 0, y: 0 })
    expect(tool.state!.step.value).toBe('axis-first')
  })

  it('step 1: click on empty space with NO selections stays', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useMirrorTool(ctx)
    tool.onMouseDown?.(null, { x: 0, y: 0 })
    expect(tool.state!.step.value).toBe('select')
  })

  it('step 2 (axis-first): click sets axisFirst and advances to axis-second', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useMirrorTool(ctx)
    tool.state!.step.value = 'axis-first'
    tool.onMouseDown?.(null, { x: 300, y: 300 })
    expect(tool.state!.axisFirst.value).toEqual({ x: 300, y: 300 })
    expect(tool.state!.step.value).toBe('axis-second')
  })

  it('step 2: findSnapPoint is called for axis-first click', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useMirrorTool(ctx)
    tool.state!.step.value = 'axis-first'
    tool.onMouseDown?.(null, { x: 300, y: 300 })
    expect(ctx.findSnapPoint).toHaveBeenCalled()
  })

  it('step 3 (axis-second): click emits mirrored copy via ctx.emitElementAdd then resets', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useMirrorTool(ctx)
    tool.state!.selectedIds.value = ['e1']
    tool.state!.step.value = 'axis-second'
    tool.state!.axisFirst.value = { x: 0, y: 200 }
    tool.onMouseDown?.(null, { x: 300, y: 200 })
    expect(ctx.emitElementAdd).toHaveBeenCalled()
    const added = (ctx.emitElementAdd as any).mock.calls[0][0]
    expect(added.id).toMatch(/^test-user-\d+-[a-z0-9]{4}$/)
    expect(added.type).toBe('line')
    expect(tool.state!.selecteIds?.value ?? tool.state!.selectedIds.value).toEqual([])
    expect(tool.state!.step.value).toBe('select')
  })

  it('preview updates in onMouseMove during axis-second step', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useMirrorTool(ctx)
    tool.state!.selectedIds.value = ['e1']
    tool.state!.step.value = 'axis-second'
    tool.state!.axisFirst.value = { x: 0, y: 200 }
    tool.onMouseMove?.(null, { x: 300, y: 200 })
    expect(tool.state!.previewElements.value.length).toBeGreaterThan(0)
  })

  it('Escape from axis-second goes back to axis-first and clears preview', () => {
    const ctx = createMockToolContext({ elements: [el1] })
    const tool = useMirrorTool(ctx)
    tool.state!.step.value = 'axis-second'
    tool.state!.axisFirst.value = { x: 0, y: 200 }
    tool.state!.axisSecond.value = { x: 100, y: 200 }
    tool.state!.previewElements.value = [createSampleElement({ id: 'prev' })]
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.step.value).toBe('axis-first')
    expect(tool.state!.axisSecond.value).toBeNull()
    expect(tool.state!.previewElements.value).toEqual([])
  })

  it('Escape from axis-first goes back to select', () => {
    const ctx = createMockToolContext()
    const tool = useMirrorTool(ctx)
    tool.state!.step.value = 'axis-first'
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.step.value).toBe('select')
  })

  it('Escape from select with selections resets', () => {
    const ctx = createMockToolContext()
    const tool = useMirrorTool(ctx)
    tool.state!.selectedIds.value = ['e1']
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.selectedIds.value).toEqual([])
    expect(tool.state!.step.value).toBe('select')
  })

  it('Enter from select with selections advances to axis-first', () => {
    const ctx = createMockToolContext()
    const tool = useMirrorTool(ctx)
    tool.state!.selectedIds.value = ['e1']
    const event = new KeyboardEvent('keydown', { key: 'Enter' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.step.value).toBe('axis-first')
  })

  it('deactivate resets all state', () => {
    const ctx = createMockToolContext()
    const tool = useMirrorTool(ctx)
    tool.state!.selectedIds.value = ['e1']
    tool.state!.step.value = 'axis-second'
    tool.state!.axisFirst.value = { x: 0, y: 0 }
    tool.state!.axisSecond.value = { x: 100, y: 100 }
    tool.deactivate?.()
    expect(tool.state!.selectedIds.value).toEqual([])
    expect(tool.state!.axisFirst.value).toBeNull()
    expect(tool.state!.axisSecond.value).toBeNull()
    expect(tool.state!.previewElements.value).toEqual([])
    expect(tool.state!.step.value).toBe('select')
  })

  it('state exposes selectedIds, axisFirst, axisSecond, previewElements, step', () => {
    const ctx = createMockToolContext()
    const tool = useMirrorTool(ctx)
    expect(tool.state).toHaveProperty('selectedIds')
    expect(tool.state).toHaveProperty('axisFirst')
    expect(tool.state).toHaveProperty('axisSecond')
    expect(tool.state).toHaveProperty('previewElements')
    expect(tool.state).toHaveProperty('step')
  })
})
