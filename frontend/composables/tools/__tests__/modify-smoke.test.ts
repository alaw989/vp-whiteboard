import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMockToolContext, createSampleElement } from './mockToolContext'
import { useOffsetTool } from '../useOffsetTool'

describe('Offset tool — modify workflow', () => {
  it('selects a line and creates an offset copy', () => {
    const lineEl = createSampleElement({
      id: 'target-line',
      data: { start: [0, 0] as [number, number], end: [100, 0] as [number, number], color: '#000000', size: 2 },
    })
    const ctx = createMockToolContext({ elements: [lineEl] })
    const tool = useOffsetTool(ctx)

    expect(tool.state!.step.value).toBe('distance')
    expect(tool.state!.previewResult.value).toBeNull()

    tool.onMouseDown!({}, { x: 50, y: 5 })
    expect(tool.state!.step.value).toBe('select')
    expect(tool.state!.offsetDistance.value).toBe(5)

    tool.onMouseMove!({}, { x: 50, y: 15 })
    expect(tool.state!.previewResult.value).not.toBeNull()

    tool.onMouseDown!({}, { x: 50, y: 15 })
    expect(ctx.emitElementAdd).toHaveBeenCalledTimes(1)
    expect(tool.state!.previewResult.value).toBeNull()
  })
})
