import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import * as Y from 'yjs'
import { useMeasurements } from './useMeasurements'
import type { CanvasElement, MeasurementDistanceElement, MeasurementAreaElement } from '~/types'

describe('useMeasurements', () => {
  function setup(options?: Partial<{ pixelsPerInch: number; unit: 'inches' | 'feet' }>) {
    const ydoc = new Y.Doc()
    const yElements = ydoc.getArray('elements')
    const pixelsPerInch = ref(options?.pixelsPerInch ?? 96)
    const measurementUnit = options?.unit ? ref(options.unit) : undefined
    const m = useMeasurements({
      yElements,
      userId: 'user-a',
      userName: 'Alice',
      pixelsPerInch,
      measurementUnit,
    })
    return { ydoc, yElements, pixelsPerInch, m }
  }

  const distanceElement = (overrides: Partial<MeasurementDistanceElement> = {}, elementId = 'd1'): CanvasElement => ({
    id: elementId,
    type: 'measurement-distance',
    userId: 'user-a',
    userName: 'Alice',
    timestamp: 100,
    data: {
      start: [0, 0],
      end: [96, 0],
      pixelsPerInch: 96,
      unit: 'inches',
      precision: 4,
      value: 1,
      ...overrides,
    } as MeasurementDistanceElement,
  })

  const areaElement = (overrides: Partial<MeasurementAreaElement> = {}, elementId = 'a1'): CanvasElement => ({
    id: elementId,
    type: 'measurement-area',
    userId: 'user-a',
    userName: 'Alice',
    timestamp: 200,
    data: {
      targetElementId: 'rect-1',
      pixelsPerInch: 96,
      unit: 'sq-inches',
      precision: 4,
      value: 2,
      ...overrides,
    } as MeasurementAreaElement,
  })

  it('startDistanceMeasurement sets start, end and activates measuring mode', () => {
    const { m } = setup()
    m.startDistanceMeasurement([10, 20])
    expect(m.isMeasuring.value).toBe(true)
    expect(m.measurementStart.value).toEqual([10, 20])
    expect(m.currentMeasurementEnd.value).toEqual([10, 20])
  })

  it('updateMeasurementPreview updates the end only while measuring', () => {
    const { m } = setup()
    m.updateMeasurementPreview([50, 60])
    expect(m.currentMeasurementEnd.value).toBeNull()
    m.startDistanceMeasurement([10, 10])
    m.updateMeasurementPreview([50, 60])
    expect(m.currentMeasurementEnd.value).toEqual([50, 60])
  })

  it('completeDistanceMeasurement returns null without a start point', () => {
    const { m } = setup()
    expect(m.completeDistanceMeasurement([10, 10], '#000')).toBeNull()
  })

  it('completeDistanceMeasurement pushes an inches measurement element and resets state', () => {
    const { yElements, m } = setup()
    m.startDistanceMeasurement([0, 0])
    const element = m.completeDistanceMeasurement([96, 0], '#3B82F6')
    expect(element).not.toBeNull()
    expect(element!.type).toBe('measurement-distance')
    const data = element!.data as MeasurementDistanceElement
    expect(data.value).toBeCloseTo(1)
    expect(data.pixelsPerInch).toBe(96)
    expect(data.unit).toBe('inches')
    expect(yElements.toArray()).toHaveLength(1)
    expect(m.isMeasuring.value).toBe(false)
    expect(m.measurementStart.value).toBeNull()
    expect(m.currentMeasurementEnd.value).toBeNull()
  })

  it('completeDistanceMeasurement converts to feet when the unit is feet', () => {
    const { yElements, m } = setup({ unit: 'feet' })
    m.startDistanceMeasurement([0, 0])
    const element = m.completeDistanceMeasurement([96, 0], '#000')
    const data = element!.data as MeasurementDistanceElement
    // 1 inch => 1/12 feet
    expect(data.value).toBeCloseTo(1 / 12)
    expect(data.unit).toBe('feet')
    expect(yElements.toArray()).toHaveLength(1)
  })

  it('cancelMeasurement resets all measurement state', () => {
    const { m } = setup()
    m.startDistanceMeasurement([0, 0])
    m.cancelMeasurement()
    expect(m.isMeasuring.value).toBe(false)
    expect(m.measurementStart.value).toBeNull()
    expect(m.currentMeasurementEnd.value).toBeNull()
  })

  it('calculateDistance uses Math.hypot', () => {
    const { m } = setup()
    expect(m.calculateDistance([0, 0], [3, 4])).toBe(5)
    expect(m.calculateDistance([1, 1], [1, 1])).toBe(0)
  })

  it('formatDistanceMeasurement renders feet with apostrophe and inches with double-quote', () => {
    const { m } = setup()
    expect(m.formatDistanceMeasurement(12, 4, 'feet')).toBe("1.0000'")
    expect(m.formatDistanceMeasurement(1, 4, 'inches')).toBe('1.0000"')
    expect(m.formatDistanceMeasurement(126.51234, 2, 'inches')).toBe('126.51"')
  })

  it('getMeasurementLabel returns empty for non-distance elements', () => {
    const { m } = setup()
    expect(m.getMeasurementLabel({ id: 'x', type: 'line', userId: 'u', userName: 'a', timestamp: 1, data: {} } as unknown as CanvasElement)).toBe('')
  })

  it('getMeasurementLabel uses cached value when present', () => {
    const { m } = setup()
    expect(m.getMeasurementLabel(distanceElement({ value: 5.5 }))).toBe('5.5000"')
  })

  it('getMeasurementLabel falls back to computing from points when value is missing', () => {
    const { m } = setup()
    const el = distanceElement({ value: undefined, start: [0, 0], end: [192, 0], pixelsPerInch: 96 })
    expect(m.getMeasurementLabel(el)).toBe('2.0000"')
  })

  it('previewLine is null when not measuring or no points', () => {
    const { m } = setup()
    expect(m.previewLine.value).toBeNull()
    m.startDistanceMeasurement([0, 0])
    m.updateMeasurementPreview([10, 10])
    expect(m.previewLine.value).not.toBeNull()
  })

  it('previewLine computes points, dash, label and inches conversion', () => {
    const { m } = setup()
    m.startDistanceMeasurement([0, 0])
    m.updateMeasurementPreview([48, 0])
    const preview = m.previewLine.value!
    expect(preview.points).toEqual([0, 0, 48, 0])
    expect(preview.dash).toEqual([5, 5])
    expect(preview.label).toBe('0.5000"')
  })

  it('previewLine uses feet unit when configured', () => {
    const { m } = setup({ unit: 'feet' })
    m.startDistanceMeasurement([0, 0])
    m.updateMeasurementPreview([96, 0])
    expect(m.previewLine.value!.label).toBe("0.0833'")
  })

  it('calculateArea dispatches rectangle to pixel-to-inch conversion', () => {
    const { m } = setup()
    const el: CanvasElement = { id: 'r', type: 'rectangle', userId: 'u', userName: 'a', timestamp: 1, data: { x: 0, y: 0, width: 192, height: 96, stroke: '#000', strokeWidth: 1 } }
    expect(m.calculateArea(el, 96)).toBeCloseTo(2)
  })

  it('calculateArea uses pi * r^2 for circles', () => {
    const { m } = setup()
    const el: CanvasElement = { id: 'c', type: 'circle', userId: 'u', userName: 'a', timestamp: 1, data: { cx: 0, cy: 0, radius: 96, stroke: '#000', strokeWidth: 1 } }
    expect(m.calculateArea(el, 96)).toBeCloseTo(Math.PI)
  })

  it('calculateArea uses pi * a * b for ellipses', () => {
    const { m } = setup()
    const el: CanvasElement = { id: 'e', type: 'ellipse', userId: 'u', userName: 'a', timestamp: 1, data: { x: 0, y: 0, radiusX: 96, radiusY: 48, rotation: 0, stroke: '#000', strokeWidth: 1 } }
    expect(m.calculateArea(el, 96)).toBeCloseTo(Math.PI * 0.5)
  })

  it('calculateArea returns null when a polyline is not closed or too few points', () => {
    const { m } = setup()
    const open: CanvasElement = { id: 'p', type: 'polyline', userId: 'u', userName: 'a', timestamp: 1, data: { points: [[0, 0], [10, 10]], color: '#000', size: 1, closed: false } }
    expect(m.calculateArea(open, 96)).toBeNull()
    const short: CanvasElement = { id: 'p2', type: 'polyline', userId: 'u', userName: 'a', timestamp: 1, data: { points: [[0, 0], [10, 10]], color: '#000', size: 1, closed: true } }
    expect(m.calculateArea(short, 96)).toBeNull()
  })

  it('calculateArea uses the shoelace formula for closed polylines', () => {
    const { m } = setup()
    // Unit square in inches at 96 ppi: 192x192 px => 2x2 in = 4 sq in
    const el: CanvasElement = { id: 'p', type: 'polyline', userId: 'u', userName: 'a', timestamp: 1, data: { points: [[0, 0], [192, 0], [192, 192], [0, 192]], color: '#000', size: 1, closed: true } }
    expect(m.calculateArea(el, 96)).toBeCloseTo(4)
  })

  it('calculateArea returns null for revision-cloud with fewer than 3 points', () => {
    const { m } = setup()
    const el: CanvasElement = { id: 'rc', type: 'revision-cloud', userId: 'u', userName: 'a', timestamp: 1, data: { points: [[0, 0], [10, 0]], arcLength: 5, color: '#000', size: 1, closed: true } }
    expect(m.calculateArea(el, 96)).toBeNull()
  })

  it('calculateArea approximates revision-cloud area as a closed polyline', () => {
    const { m } = setup()
    const el: CanvasElement = { id: 'rc', type: 'revision-cloud', userId: 'u', userName: 'a', timestamp: 1, data: { points: [[0, 0], [192, 0], [192, 192], [0, 192]], arcLength: 5, color: '#000', size: 1, closed: true } }
    expect(m.calculateArea(el, 96)).toBeCloseTo(4)
  })

  it('calculateArea returns null for an arc without start/through/end', () => {
    const { m } = setup()
    const el: CanvasElement = { id: 'arc', type: 'arc', userId: 'u', userName: 'a', timestamp: 1, data: { start: [0, 0], through: [10, 10], end: [20, 0], color: '#000', size: 1 } }
    expect(m.calculateArea({ ...el, data: { start: undefined, through: [10, 10], end: [20, 0] } } as unknown as CanvasElement, 96)).toBeNull()
    expect(m.calculateArea(el, 96)).not.toBeNull()
  })

  it('calculateArea computes arc triangle area in square inches', () => {
    const { m } = setup()
    const el: CanvasElement = { id: 'arc', type: 'arc', userId: 'u', userName: 'a', timestamp: 1, data: { start: [0, 0], through: [96, 96], end: [192, 0], color: '#000', size: 1 } }
    // base 2in, height 1in => area 1 sq in
    expect(m.calculateArea(el, 96)).toBeCloseTo(1)
  })

  it('calculateArea returns null for a stroke with fewer than 2 points', () => {
    const { m } = setup()
    const el: CanvasElement = { id: 's', type: 'stroke', userId: 'u', userName: 'a', timestamp: 1, data: { points: [[0, 0, 0.5]], color: '#000', size: 1, tool: 'pen', smooth: true } }
    expect(m.calculateArea(el, 96)).toBeNull()
  })

  it('calculateArea computes bounding-box area for strokes', () => {
    const { m } = setup()
    const el: CanvasElement = { id: 's', type: 'stroke', userId: 'u', userName: 'a', timestamp: 1, data: { points: [[0, 0, 0.5], [192, 96, 0.5], [-48, 48, 0.5]], color: '#000', size: 1, tool: 'pen', smooth: true } }
    // bbox: width 240px, height 96px => 2.5 x 1 in = 2.5 sq in
    expect(m.calculateArea(el, 96)).toBeCloseTo(2.5)
  })

  it('calculateArea returns null for unsupported element types', () => {
    const { m } = setup()
    const line: CanvasElement = { id: 'l', type: 'line', userId: 'u', userName: 'a', timestamp: 1, data: { start: [0, 0], end: [10, 10], color: '#000', size: 1 } }
    expect(m.calculateArea(line, 96)).toBeNull()
  })

  it('formatAreaMeasurement renders sq-inches by default and sq-feet on request', () => {
    const { m } = setup()
    expect(m.formatAreaMeasurement(2)).toBe('2.0000 sq in')
    expect(m.formatAreaMeasurement(144, 2)).toBe('144.00 sq in')
    expect(m.formatAreaMeasurement(144, 2, 'sq-feet')).toBe('1.00 sq ft')
  })

  it('measureArea returns false when the target element is missing', () => {
    const { m } = setup()
    expect(m.measureArea('nope', '#000')).toBe(false)
  })

  it('measureArea warns and returns false for an unsupported element type', () => {
    const { yElements, m } = setup()
    const line: CanvasElement = { id: 'l', type: 'line', userId: 'u', userName: 'a', timestamp: 1, data: { start: [0, 0], end: [10, 10], color: '#000', size: 1 } }
    yElements.push([line])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(m.measureArea('l', '#000')).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('measureArea creates a measurement-area element for a rectangle', () => {
    const { yElements, m } = setup()
    const rect: CanvasElement = { id: 'rect-1', type: 'rectangle', userId: 'u', userName: 'a', timestamp: 1, data: { x: 0, y: 0, width: 192, height: 96, stroke: '#000', strokeWidth: 1 } }
    yElements.push([rect])
    expect(m.measureArea('rect-1', '#3B82F6')).toBe(true)
    const stored = yElements.toArray()[1] as CanvasElement
    expect(stored.type).toBe('measurement-area')
    const data = stored.data as MeasurementAreaElement
    expect(data.targetElementId).toBe('rect-1')
    expect(data.value).toBeCloseTo(2)
  })

  it('findAreaMeasurementsFor returns ids of linked measurement-area elements', () => {
    const { yElements, m } = setup()
    yElements.push([areaElement({ targetElementId: 'rect-1' }, 'a1'), areaElement({ targetElementId: 'other' }, 'a2'), distanceElement({}, 'd1')])
    expect(m.findAreaMeasurementsFor('rect-1')).toEqual(['a1'])
    expect(m.findAreaMeasurementsFor('missing')).toEqual([])
  })

  it('getShapeCenter handles rectangle, circle, ellipse and falls back to origin', () => {
    const { m } = setup()
    const rect: CanvasElement = { id: 'r', type: 'rectangle', userId: 'u', userName: 'a', timestamp: 1, data: { x: 10, y: 20, width: 100, height: 40, stroke: '#000', strokeWidth: 1 } }
    expect(m.getShapeCenter(rect)).toEqual({ x: 60, y: 40 })
    const circle: CanvasElement = { id: 'c', type: 'circle', userId: 'u', userName: 'a', timestamp: 1, data: { cx: 50, cy: 25, radius: 10, stroke: '#000', strokeWidth: 1 } }
    expect(m.getShapeCenter(circle)).toEqual({ x: 50, y: 25 })
    const ellipse: CanvasElement = { id: 'e', type: 'ellipse', userId: 'u', userName: 'a', timestamp: 1, data: { x: 5, y: 6, radiusX: 10, radiusY: 10, rotation: 0, stroke: '#000', strokeWidth: 1 } }
    expect(m.getShapeCenter(ellipse)).toEqual({ x: 5, y: 6 })
    const line: CanvasElement = { id: 'l', type: 'line', userId: 'u', userName: 'a', timestamp: 1, data: { start: [0, 0], end: [10, 10], color: '#000', size: 1 } }
    expect(m.getShapeCenter(line)).toEqual({ x: 0, y: 0 })
  })

  it('getAreaLabel returns empty for non-area elements and formatted value otherwise', () => {
    const { m } = setup()
    expect(m.getAreaLabel(distanceElement())).toBe('')
    expect(m.getAreaLabel(areaElement({ value: 2 }))).toBe('2.0000 sq in')
    expect(m.getAreaLabel(areaElement({ value: undefined, unit: 'sq-feet', precision: 2 }))).toBe('0.00 sq ft')
  })

  it('isMeasurementStale returns false for non-measurement elements', () => {
    const { m } = setup()
    const line: CanvasElement = { id: 'l', type: 'line', userId: 'u', userName: 'a', timestamp: 1, data: { start: [0, 0], end: [10, 10], color: '#000', size: 1 } }
    expect(m.isMeasurementStale(line, 96)).toBe(false)
  })

  it('isMeasurementStale returns false when current ppi is null', () => {
    const { m } = setup()
    expect(m.isMeasurementStale(distanceElement(), null)).toBe(false)
  })

  it('isMeasurementStale flags measurements whose stored scale differs by >1%', () => {
    const { m } = setup()
    expect(m.isMeasurementStale(distanceElement({ pixelsPerInch: 96 }), 96)).toBe(false)
    expect(m.isMeasurementStale(distanceElement({ pixelsPerInch: 96 }), 192)).toBe(true)
    // Within 1% tolerance => not stale (96/96.9 = 0.9907, diff 0.0093 < 0.01)
    expect(m.isMeasurementStale(areaElement({ pixelsPerInch: 96 }), 96.9)).toBe(false)
    expect(m.isMeasurementStale(areaElement({ pixelsPerInch: 96 }), 100)).toBe(true)
  })

  it('getStaleMeasurements filters to stale measurements only', () => {
    const { yElements, m } = setup()
    yElements.push([
      distanceElement({ pixelsPerInch: 192 }, 'fresh'),
      distanceElement({ pixelsPerInch: 96 }, 'stale'),
      { id: 'line', type: 'line', userId: 'u', userName: 'a', timestamp: 1, data: { start: [0, 0], end: [10, 10], color: '#000', size: 1 } },
    ])
    const stale = m.getStaleMeasurements(192)
    expect(stale.map(el => el.id)).toEqual(['stale'])
    expect(m.getStaleMeasurements(null)).toEqual([])
  })

  it('updateMeasurementEndpoint is a no-op for a missing or non-distance element', () => {
    const { yElements, m } = setup()
    yElements.push([distanceElement(), { id: 'line', type: 'line', userId: 'u', userName: 'a', timestamp: 1, data: { start: [0, 0], end: [10, 10], color: '#000', size: 1 } }])
    m.updateMeasurementEndpoint('nope', 'end', [5, 5], 96)
    m.updateMeasurementEndpoint('line', 'end', [5, 5], 96)
    expect((yElements.toArray()[0] as CanvasElement).id).toBe('d1')
    expect((yElements.toArray()[1] as CanvasElement).type).toBe('line')
  })

  it('updateMeasurementEndpoint replaces the element with a recalculated value', () => {
    const { yElements, m } = setup()
    yElements.push([distanceElement()])
    m.updateMeasurementEndpoint('d1', 'end', [192, 0], 96)
    const updated = yElements.toArray()[0] as CanvasElement
    const data = updated.data as MeasurementDistanceElement
    expect(data.end).toEqual([192, 0])
    expect(data.value).toBeCloseTo(2)
    expect(yElements.toArray()).toHaveLength(1)
  })

  it('updateMeasurementEndpoint updates the start point while keeping the end', () => {
    const { yElements, m } = setup()
    yElements.push([distanceElement()])
    m.updateMeasurementEndpoint('d1', 'start', [96, 0], 96)
    const data = (yElements.toArray()[0] as CanvasElement).data as MeasurementDistanceElement
    expect(data.start).toEqual([96, 0])
    expect(data.end).toEqual([96, 0])
    expect(data.value).toBeCloseTo(0)
  })

  it('updateMeasurementValue is a no-op for a missing element', () => {
    const { yElements, m } = setup()
    m.updateMeasurementValue('nope', 5)
    expect(yElements.toArray()).toHaveLength(0)
  })

  it('updateMeasurementValue replaces the stored value', () => {
    const { yElements, m } = setup()
    yElements.push([distanceElement()])
    m.updateMeasurementValue('d1', 7.5)
    const data = (yElements.toArray()[0] as CanvasElement).data as MeasurementDistanceElement
    expect(data.value).toBe(7.5)
  })

  it('getAreaLabelPosition returns origin when target is missing', () => {
    const { yElements, m } = setup()
    yElements.push([areaElement({ targetElementId: 'ghost' })])
    expect(m.getAreaLabelPosition(yElements.toArray()[0] as CanvasElement)).toEqual({ x: 0, y: 0 })
  })

  it('getAreaLabelPosition offsets the target center above the shape', () => {
    const { yElements, m } = setup()
    yElements.push([
      { id: 'rect-1', type: 'rectangle', userId: 'u', userName: 'a', timestamp: 1, data: { x: 10, y: 20, width: 100, height: 40, stroke: '#000', strokeWidth: 1 } },
      areaElement({ targetElementId: 'rect-1' }),
    ])
    const position = m.getAreaLabelPosition(yElements.toArray()[1] as CanvasElement)
    expect(position).toEqual({ x: 60, y: 20 })
  })
})
