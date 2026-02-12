import { ref, computed, type Ref } from 'vue'
import type { CanvasElement, MeasurementDistanceElement, MeasurementAreaElement, RectangleElement, CircleElement, EllipseElement } from '~/types'

export interface UseMeasurementsOptions {
  yElements: any
  userId: string
  userName: string
  pixelsPerInch: Ref<number>
}

export function useMeasurements(options: UseMeasurementsOptions) {
  const { yElements, userId, userName, pixelsPerInch } = options

  // Helper to get current elements array from yElements
  function elementsArray(): CanvasElement[] {
    return yElements.toArray() as CanvasElement[]
  }

  // Measurement state
  const isMeasuring = ref(false)
  const measurementStart = ref<[number, number] | null>(null)
  const currentMeasurementEnd = ref<[number, number] | null>(null)

  /**
   * Start a distance measurement
   * Sets the start point and activates measurement mode
   */
  function startDistanceMeasurement(point: [number, number]) {
    measurementStart.value = point
    currentMeasurementEnd.value = point
    isMeasuring.value = true
  }

  /**
   * Update the measurement preview line
   * Called during mousemove while measuring
   */
  function updateMeasurementPreview(point: [number, number]) {
    if (isMeasuring.value) {
      currentMeasurementEnd.value = point
    }
  }

  /**
   * Complete a distance measurement
   * Creates a measurement element and adds it to yElements
   */
  function completeDistanceMeasurement(
    point: [number, number],
    color: string
  ): CanvasElement | null {
    if (!measurementStart.value) return null

    const start = measurementStart.value
    const end = point

    // Calculate pixel distance using Math.hypot
    const pixelDistance = Math.hypot(end[0] - start[0], end[1] - start[1])

    // Convert to real-world units using pixelsPerInch
    const inches = pixelDistance / pixelsPerInch.value

    // Create measurement element
    const element: CanvasElement = {
      id: `${userId}-${Date.now()}`,
      type: 'measurement-distance',
      userId,
      userName,
      timestamp: Date.now(),
      data: {
        start,
        end,
        pixelsPerInch: pixelsPerInch.value,
        unit: 'inches',
        precision: 4,
        value: inches,
      } as MeasurementDistanceElement,
    }

    // Add to yElements
    yElements.push([element])

    // Reset measurement state
    measurementStart.value = null
    currentMeasurementEnd.value = null
    isMeasuring.value = false

    return element
  }

  /**
   * Cancel the current measurement
   */
  function cancelMeasurement() {
    measurementStart.value = null
    currentMeasurementEnd.value = null
    isMeasuring.value = false
  }

  /**
   * Calculate pixel distance between two points
   */
  function calculateDistance(p1: [number, number], p2: [number, number]): number {
    return Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
  }

  /**
   * Format distance measurement as string
   * Returns decimal inches (e.g., "126.5000\"") or feet (e.g., "10.5417'")
   */
  function formatDistanceMeasurement(
    inches: number,
    precision: number,
    unit: 'inches' | 'feet'
  ): string {
    if (unit === 'feet') {
      const feet = inches / 12
      return `${feet.toFixed(precision)}'`
    }
    return `${inches.toFixed(precision)}"`
  }

  /**
   * Get formatted label for a measurement element
   */
  function getMeasurementLabel(element: CanvasElement): string {
    if (element.type !== 'measurement-distance') return ''
    const data = element.data as MeasurementDistanceElement
    const inches = data.value ?? calculateDistance(data.start, data.end) / data.pixelsPerInch
    return formatDistanceMeasurement(inches, data.precision, data.unit)
  }

  // Computed for preview line config
  const previewLine = computed(() => {
    if (!isMeasuring.value || !measurementStart.value || !currentMeasurementEnd.value) {
      return null
    }

    const start = measurementStart.value
    const end = currentMeasurementEnd.value
    const pixelDistance = calculateDistance(start, end)
    const inches = pixelDistance / pixelsPerInch.value

    return {
      points: [start[0], start[1], end[0], end[1]],
      stroke: '#3B82F6',
      strokeWidth: 2,
      dash: [5, 5],
      label: formatDistanceMeasurement(inches, 4, 'inches'),
    }
  })

  /**
   * Calculate the area of a rectangle in square inches
   */
  function calculateRectangleArea(element: CanvasElement, pixelsPerInch: number): number {
    const data = element.data as RectangleElement
    const widthInches = data.width / pixelsPerInch
    const heightInches = data.height / pixelsPerInch
    return widthInches * heightInches  // Square inches
  }

  /**
   * Calculate the area of a circle in square inches
   */
  function calculateCircleArea(element: CanvasElement, pixelsPerInch: number): number {
    const data = element.data as CircleElement
    const radiusInches = data.radius / pixelsPerInch
    return Math.PI * radiusInches * radiusInches  // Square inches (pi * r^2)
  }

  /**
   * Calculate the area of an ellipse in square inches
   */
  function calculateEllipseArea(element: CanvasElement, pixelsPerInch: number): number {
    const data = element.data as EllipseElement
    const radiusXInches = data.radiusX / pixelsPerInch
    const radiusYInches = data.radiusY / pixelsPerInch
    return Math.PI * radiusXInches * radiusYInches  // Square inches (pi * a * b)
  }

  /**
   * Calculate area for any supported shape element
   * Returns null for unsupported element types
   */
  function calculateArea(element: CanvasElement, pixelsPerInch: number): number | null {
    switch (element.type) {
      case 'rectangle':
        return calculateRectangleArea(element, pixelsPerInch)
      case 'circle':
        return calculateCircleArea(element, pixelsPerInch)
      case 'ellipse':
        return calculateEllipseArea(element, pixelsPerInch)
      default:
        return null  // Unsupported type
    }
  }

  /**
   * Format area measurement as a string with appropriate unit
   * @param sqInches - Area value in square inches
   * @param precision - Decimal places (default 4)
   * @param unit - 'sq-inches' or 'sq-feet'
   */
  function formatAreaMeasurement(
    sqInches: number,
    precision: number = 4,
    unit: 'sq-inches' | 'sq-feet' = 'sq-inches'
  ): string {
    if (unit === 'sq-feet') {
      const sqFeet = sqInches / 144  // 12^2 = 144 sq inches per sq foot
      return `${sqFeet.toFixed(precision)} sq ft`
    }
    return `${sqInches.toFixed(precision)} sq in`
  }

  /**
   * Create an area measurement element for a target shape
   * @param targetElementId - ID of the shape to measure
   * @param color - Color for the label text
   */
  function measureArea(
    targetElementId: string,
    color: string
  ): CanvasElement | null {
    const element = elementsArray().find(el => el.id === targetElementId)
    if (!element) return null

    const areaInches = calculateArea(element, pixelsPerInch.value)
    if (areaInches === null) {
      console.warn(`Cannot measure area for element type: ${element.type}`)
      return null
    }

    // Create measurement-area element
    const measurementElement: CanvasElement = {
      id: `${userId}-area-${Date.now()}`,
      type: 'measurement-area',
      userId,
      userName,
      timestamp: Date.now(),
      data: {
        targetElementId,
        pixelsPerInch: pixelsPerInch.value,
        unit: 'sq-inches',
        precision: 4,
        value: areaInches
      } as MeasurementAreaElement
    }

    // Add to yElements
    yElements.push([measurementElement])

    return measurementElement
  }

  /**
   * Find all area measurements linked to a target element
   * Used when a shape is deleted to clean up associated measurements
   */
  function findAreaMeasurementsFor(targetElementId: string): string[] {
    const allElements = elementsArray()
    return allElements
      .filter(el => el.type === 'measurement-area')
      .filter(el => (el.data as MeasurementAreaElement).targetElementId === targetElementId)
      .map(el => el.id)
  }

  /**
   * Get the center point of a shape element
   */
  function getShapeCenter(element: CanvasElement): { x: number; y: number } {
    switch (element.type) {
      case 'rectangle': {
        const data = element.data as RectangleElement
        return {
          x: data.x + data.width / 2,
          y: data.y + data.height / 2
        }
      }
      case 'circle': {
        const data = element.data as CircleElement
        return { x: data.cx, y: data.cy }
      }
      case 'ellipse': {
        const data = element.data as EllipseElement
        return { x: data.x, y: data.y }
      }
      default:
        return { x: 0, y: 0 }
    }
  }

  /**
   * Get formatted area label text for a measurement element
   */
  function getAreaLabel(element: CanvasElement): string {
    if (element.type !== 'measurement-area') return ''
    const data = element.data as MeasurementAreaElement
    const value = data.value ?? 0
    return formatAreaMeasurement(value, data.precision, data.unit)
  }

  /**
   * Check if a measurement is stale (scale changed significantly)
   * If scale differs by more than 1%, consider stale
   */
  function isMeasurementStale(element: CanvasElement, currentPixelsPerInch: number | null): boolean {
    if (element.type !== 'measurement-distance' && element.type !== 'measurement-area') return false
    if (!currentPixelsPerInch) return false

    const data = element.data as MeasurementDistanceElement | MeasurementAreaElement
    // If scale differs by more than 1%, consider stale
    const ratio = data.pixelsPerInch / currentPixelsPerInch
    return Math.abs(ratio - 1) > 0.01
  }

  /**
   * Get all stale measurements for current scale
   */
  function getStaleMeasurements(currentPixelsPerInch: number | null): CanvasElement[] {
    const allElements = elementsArray()
    return allElements.filter(el => isMeasurementStale(el, currentPixelsPerInch))
  }

  /**
   * Update measurement endpoint for distance measurements
   * @param elementId - ID of measurement to update
   * @param endpoint - 'start' or 'end' point to update
   * @param newPoint - New coordinate for endpoint
   * @param currentPixelsPerInch - Current scale for recalculation
   */
  function updateMeasurementEndpoint(
    elementId: string,
    endpoint: 'start' | 'end',
    newPoint: [number, number],
    currentPixelsPerInch: number
  ): void {
    const element = elementsArray().find(el => el.id === elementId)
    if (!element || element.type !== 'measurement-distance') return

    const data = element.data as MeasurementDistanceElement

    if (endpoint === 'start') {
      data.start = newPoint
    } else {
      data.end = newPoint
    }

    // Recalculate value with current scale
    const pixelDist = calculateDistance(data.start, data.end)
    data.value = pixelDist / currentPixelsPerInch

    // Update in yElements
    const index = yElements.toArray().findIndex((el: CanvasElement) => el.id === elementId)
    if (index !== -1) {
      yElements.delete(index, 1)
      yElements.insert([element], index)
    }
  }

  /**
   * Update measurement value directly
   * Used when user manually edits the measurement value
   */
  function updateMeasurementValue(elementId: string, newValue: number): void {
    const element = elementsArray().find(el => el.id === elementId)
    if (!element) return

    if (element.type === 'measurement-distance') {
      const data = element.data as MeasurementDistanceElement
      data.value = newValue
    } else if (element.type === 'measurement-area') {
      const data = element.data as MeasurementAreaElement
      data.value = newValue
    }

    // Update in yElements
    const index = yElements.toArray().findIndex((el: CanvasElement) => el.id === elementId)
    if (index !== -1) {
      yElements.delete(index, 1)
      yElements.insert([element], index)
    }
  }

  /**
   * Get the label position for an area measurement
   * Positions the label above the center of the target shape
   */
  function getAreaLabelPosition(measurementElement: CanvasElement): { x: number; y: number } {
    const data = measurementElement.data as MeasurementAreaElement
    const target = elementsArray().find(el => el.id === data.targetElementId)
    if (!target) return { x: 0, y: 0 }

    // Get center position of target shape
    const center = getShapeCenter(target)

    // Offset label above the shape (20px vertical offset)
    return {
      x: center.x,
      y: center.y - 20
    }
  }

  return {
    // State
    isMeasuring,
    measurementStart,
    currentMeasurementEnd,
    previewLine,

    // Actions
    startDistanceMeasurement,
    updateMeasurementPreview,
    completeDistanceMeasurement,
    cancelMeasurement,
    calculateDistance,
    formatDistanceMeasurement,
    getMeasurementLabel,

    // Area measurement functions
    measureArea,
    calculateArea,
    formatAreaMeasurement,
    findAreaMeasurementsFor,
    getShapeCenter,
    getAreaLabel,
    getAreaLabelPosition,

    // Editing and stale detection (Plan 07-04)
    isMeasurementStale,
    getStaleMeasurements,
    updateMeasurementEndpoint,
    updateMeasurementValue,
  }
}
