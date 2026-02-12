import { ref, computed, type Ref } from 'vue'
import type { CanvasElement, MeasurementDistanceElement } from '~/types'

export interface UseMeasurementsOptions {
  yElements: any
  userId: string
  userName: string
  pixelsPerInch: Ref<number>
}

export function useMeasurements(options: UseMeasurementsOptions) {
  const { yElements, userId, userName, pixelsPerInch } = options

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
  }
}
