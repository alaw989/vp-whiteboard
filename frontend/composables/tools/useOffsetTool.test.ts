import { describe, expect, it } from 'vitest'
import type { CanvasElement } from '~/types'
import { createMockToolContext, createSampleElement } from './__tests__/mockToolContext'
import { useOffsetTool } from './useOffsetTool'

describe('useOffsetTool', () => {
  it('step 1 (distance): click near element sets offsetDistance and switches to select', () => {
    const el = createSampleElement({ id: 'e1' })
    const ctx = createMockToolContext({ elements: [el] })
    const tool = useOffsetTool(ctx)
    tool.onMouseDown?.(null, { x: 150, y: 150 })
    expect(tool.state!.step.value).toBe('select')
    expect(tool.state!.offsetDistance.value).toBe(0)
  })

  it('step 1 (distance): click on empty space does nothing', () => {
    const ctx = createMockToolContext({ elements: [] })
    const tool = useOffsetTool(ctx)
    tool.onMouseDown?.(null, { x: 150, y: 150 })
    expect(tool.state!.step.value).toBe('distance')
  })

  it('step 2 (select): click emits offset element via ctx.emitElementAdd', () => {
    const el = createSampleElement({ id: 'e1' })
    const ctx = createMockToolContext({ elements: [el] })
    const tool = useOffsetTool(ctx)
    tool.state!.step.value = 'select'
    const offsetEl = createSampleElement({ id: 'offset-1' })
    tool.state!.previewResult.value = { element: el, offsetEl }
    tool.onMouseDown?.(null, { x: 200, y: 200 })
    expect(ctx.emitElementAdd).toHaveBeenCalledWith(offsetEl)
    expect(tool.state!.previewResult.value).toBeNull()
  })

  it('step 2: preview updates in onMouseMove near an offsetable element', () => {
    const el = createSampleElement({ id: 'e1' })
    const ctx = createMockToolContext({ elements: [el] })
    const tool = useOffsetTool(ctx)
    tool.state!.step.value = 'select'
    tool.onMouseMove?.(null, { x: 150, y: 150 })
    expect(tool.state!.previewResult.value).not.toBeNull()
    expect(tool.state!.previewResult.value!.element.id).toBe('e1')
  })

  it('preview is null when mouse is not near an offsetable element', () => {
    const circleEl = {
      ...createSampleElement({ id: 'c1' }),
      type: 'circle' as const,
      data: { cx: 150, cy: 150, radius: 50, stroke: '#000', strokeWidth: 2 },
    }
    const ctx = createMockToolContext({ elements: [circleEl] })
    const tool = useOffsetTool(ctx)
    tool.state!.step.value = 'select'
    tool.onMouseMove?.(null, { x: 150, y: 150 })
    expect(tool.state!.previewResult.value).toBeNull()
  })

  it('Escape while in select resets to distance', () => {
    const ctx = createMockToolContext()
    const tool = useOffsetTool(ctx)
    tool.state!.step.value = 'select'
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(true)
    expect(tool.state!.step.value).toBe('distance')
    expect(tool.state!.previewResult.value).toBeNull()
  })

  it('Escape while in distance returns false', () => {
    const ctx = createMockToolContext()
    const tool = useOffsetTool(ctx)
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const result = tool.onKeyDown?.(event)
    expect(result).toBe(false)
  })

  it('deactivate resets step to distance and clears preview', () => {
    const ctx = createMockToolContext()
    const tool = useOffsetTool(ctx)
    tool.state!.step.value = 'select'
    tool.state!.previewResult.value = { element: createSampleElement(), offsetEl: createSampleElement() }
    tool.deactivate?.()
    expect(tool.state!.step.value).toBe('distance')
    expect(tool.state!.previewResult.value).toBeNull()
  })

  it('state exposes offsetDistance, step, and previewResult', () => {
    const ctx = createMockToolContext()
    const tool = useOffsetTool(ctx)
    expect(tool.state).toHaveProperty('offsetDistance')
    expect(tool.state).toHaveProperty('step')
    expect(tool.state).toHaveProperty('previewResult')
  })

  it('unsupported types (circle, ellipse, arc) do not produce offset preview', () => {
    const circ = {
      ...createSampleElement({ id: 'c1' }),
      type: 'circle' as const,
      data: { cx: 0, cy: 0, radius: 50, stroke: '#000', strokeWidth: 2 },
    }
    const ell = {
      ...createSampleElement({ id: 'e1' }),
      type: 'ellipse' as const,
      data: { x: 0, y: 0, radiusX: 40, radiusY: 20, rotation: 0, stroke: '#000', strokeWidth: 2 },
    }
    const arc = {
      ...createSampleElement({ id: 'a1' }),
      type: 'arc' as const,
      data: { start: [0, 0], through: [50, 50], end: [100, 0], color: '#000', size: 2 },
    }
    for (const el of [circ, ell, arc] as CanvasElement[]) {
      const ctx = createMockToolContext({ elements: [el] })
      const tool = useOffsetTool(ctx)
      tool.state!.step.value = 'select'
      tool.onMouseMove?.(null, { x: 0, y: 0 })
      expect(tool.state!.previewResult.value).toBeNull()
    }
  })
})
