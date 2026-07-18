import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
vi.mock('~/composables/useToast', () => ({ toastError: vi.fn() }))
import { createMockToolContext } from './mockToolContext'
import { useMeasureDistanceTool } from '../useMeasureDistanceTool'

describe('Measure Distance tool — measure workflow', () => {
  it('records two clicks and completes a distance measurement', () => {
    const ctx = createMockToolContext()
    const tool = useMeasureDistanceTool(ctx)

    expect(tool.state.startPoint.value).toBeNull()

    tool.onMouseDown({}, { x: 100, y: 100 })
    expect(ctx.startDistanceMeasurement).toHaveBeenCalledWith([100, 100])
    expect(tool.state.startPoint.value).toStrictEqual([100, 100])

    ctx.isMeasuring.value = true

    tool.onMouseMove({}, { x: 200, y: 200 })
    expect(ctx.updateMeasurementPreview).toHaveBeenCalledWith([200, 200])

    tool.onMouseDown({}, { x: 200, y: 200 })
    expect(ctx.completeDistanceMeasurement).toHaveBeenCalledWith([200, 200], '#000000')
    expect(tool.state.startPoint.value).toBeNull()
  })
})
