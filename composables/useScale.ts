import { ref, computed, readonly, type Ref, type ComputedRef } from 'vue'
import * as Y from 'yjs'
import type { ScaleState } from '~/types'

export interface UseScaleOptions {
  yMeta: Y.Map<any>
  ydoc: Y.Doc
  userId: string
  documentId?: string  // For per-document scale support
}

export function useScale(options: UseScaleOptions) {
  const { yMeta, ydoc, userId, documentId } = options

  // Current scale state (null means no scale set)
  const currentScale = ref<ScaleState | null>(null)

  // Generate scale key for per-document storage
  // Format: scale:{documentId} or scale if no documentId
  const scaleKey = documentId ? `scale:${documentId}` : 'scale'

  /**
   * Generate a human-readable label for the scale
   * e.g., "1\" = 10'" or "1\" = 100'"
   */
  function generateScaleLabel(pixelsPerInch: number, unit: 'inches' | 'feet'): string {
    if (unit === 'inches') {
      // For inches-only display, show the direct ratio
      // pixelsPerInch is how many pixels equal 1 inch in real world
      return `1" = 1"`
    }

    // For feet display, calculate how many feet 1 inch represents
    // If pixelsPerInch = 9.6, that means 9.6px = 1 inch in real world
    // If drawing is 1" and real world is 10', then 1" on screen = 10' in reality
    // So pixelsPerInch represents the drawing-to-real-world ratio

    // For "1 inch = X feet" scale:
    // If user enters "1 inch" drawing and "10 feet" real world:
    // We need to store that 1 inch drawing = 120 inches real world (10 * 12)
    // So pixelsPerInch stays 96 (standard), but the label shows the ratio
    return `1" = 1'"`
  }

  /**
   * Display format for the scale badge
   * Shows the current scale or "No scale set"
   */
  const displayFormat: ComputedRef<string> = computed(() => {
    if (!currentScale.value) {
      return 'No scale set'
    }
    return currentScale.value.label
  })

  /**
   * Default pixels per inch (standard screen DPI)
   */
  const pixelsPerInch: ComputedRef<number> = computed(() => {
    return currentScale.value?.pixelsPerInch ?? 96
  })

  /**
   * Load scale from yMeta storage
   */
  function getScale(): ScaleState | null {
    const stored = yMeta.get(scaleKey) as ScaleState | undefined
    if (stored) {
      currentScale.value = stored
      return stored
    }
    currentScale.value = null
    return null
  }

  /**
   * Set scale based on drawing units and real-world units
   *
   * @param drawingUnits - Number of drawing units (e.g., 1 inch)
   * @param drawingUnit - Type of drawing unit (currently only 'inches')
   * @param realWorldUnits - Number of real-world units
   * @param realWorldUnit - Type of real-world unit ('feet' or 'inches')
   */
  function setScale(
    drawingUnits: number,
    drawingUnit: 'inches',
    realWorldUnits: number,
    realWorldUnit: 'feet' | 'inches'
  ): void {
    // Convert real-world units to inches for calculation
    let realWorldInches = realWorldUnits
    if (realWorldUnit === 'feet') {
      realWorldInches = realWorldUnits * 12
    }

    // Calculate pixels per inch
    // If 1 drawing inch = 10 feet (120 inches) in real world
    // Then pixelsPerInch = 96 * (1 / 120) = 0.8
    // Wait, that's backwards...
    //
    // Actually:
    // - drawingUnits = 1 (inch on paper/screen)
    // - realWorldInches = 120 (10 feet in real world)
    // - Standard DPI = 96 pixels per screen inch
    //
    // For measurements:
    // - 96 pixels on screen = 1 screen inch
    // - 1 screen inch = 120 real inches (at 1" = 10' scale)
    // - So 96 pixels = 120 real inches
    // - pixelsPerInch = 96 / 120 = 0.8 pixels per real inch
    //
    // Actually, let's think of it differently:
    // - We want to convert canvas pixels to real-world inches
    // - If 1" on drawing = 10' (120") in real world
    // - Then 96 pixels (1" on screen) = 120 real inches
    // - So 1 pixel = 120/96 = 1.25 real inches
    // - So pixelsPerInch = 96/120 = 0.8 (this is the conversion factor)

    // Standard screen DPI
    const standardDPI = 96

    // Calculate the conversion factor
    // pixelsPerInch = (standardDPI * drawingUnits) / realWorldInches
    const calculatedPixelsPerInch = (standardDPI * drawingUnits) / realWorldInches

    // Generate label
    let label: string
    if (realWorldUnit === 'feet') {
      const feet = realWorldUnits
      label = `1" = ${feet}'`
    } else {
      label = `1" = ${realWorldUnits}"`
    }

    // Store in yMeta
    ydoc.transact(() => {
      const scaleState: ScaleState = {
        pixelsPerInch: calculatedPixelsPerInch,
        unit: realWorldUnit === 'feet' ? 'feet' : 'inches',
        label,
        lastUpdatedBy: userId,
        timestamp: Date.now(),
      }
      yMeta.set(scaleKey, scaleState)
      currentScale.value = scaleState
    })
  }

  /**
   * Observe remote scale changes from other users
   * Returns a cleanup function
   */
  function observeScale(callback: (scale: ScaleState) => void): () => void {
    const handler = (event: Y.YMapEvent<any>) => {
      // Check if our scale key changed
      if (event.changes.keys.has(scaleKey)) {
        const scale = yMeta.get(scaleKey) as ScaleState
        // Only apply remote changes (ignore own updates to prevent loop)
        if (scale && scale.lastUpdatedBy !== userId) {
          currentScale.value = scale
          callback(scale)
        }
      }
    }
    yMeta.observe(handler)
    // Return cleanup function
    return () => {
      yMeta.unobserve(handler)
    }
  }

  /**
   * Convert pixels to inches based on current scale
   */
  function pixelsToInches(pixels: number): number {
    const ppi = currentScale.value?.pixelsPerInch ?? 96
    // If we have a custom scale, use it
    // Otherwise use standard 96 DPI
    if (currentScale.value) {
      // pixels / (pixelsPerInch) gives us inches in real world
      return pixels / ppi
    }
    // No scale set, return raw pixels
    return pixels / 96
  }

  /**
   * Convert inches to feet
   */
  function inchesToFeet(inches: number): number {
    return inches / 12
  }

  /**
   * Format a measurement in inches for display
   * @param inches - Measurement in inches
   * @param precision - Number of decimal places (default 4 for .0001 precision)
   * @returns Formatted string like "126.5""
   */
  function formatMeasurement(inches: number, precision: number = 4): string {
    const rounded = Number(inches.toFixed(precision))
    return `${rounded}"`
  }

  /**
   * Format a measurement in feet and inches
   * @param inches - Measurement in inches
   * @returns Formatted string like "10' 6.5""
   */
  function formatFeetAndInches(inches: number): string {
    const feet = Math.floor(inches / 12)
    const remain = inches % 12
    return `${feet}' ${remain.toFixed(1)}"`
  }

  /**
   * Format measurement based on current scale unit preference
   */
  function formatScaledMeasurement(pixels: number): string {
    const inches = pixelsToInches(pixels)
    if (currentScale.value?.unit === 'feet') {
      return formatFeetAndInches(inches)
    }
    return formatMeasurement(inches)
  }

  /**
   * Initialize: load scale from storage
   */
  function init() {
    getScale()
  }

  // Initialize on creation
  init()

  return {
    // State (readonly for external use)
    currentScale: readonly(currentScale),
    displayFormat,
    pixelsPerInch,

    // Actions
    setScale,
    getScale,
    observeScale,

    // Unit conversion helpers
    pixelsToInches,
    inchesToFeet,
    formatMeasurement,
    formatFeetAndInches,
    formatScaledMeasurement,

    // Re-initialize (for document switching)
    init,
  }
}

export type UseScaleReturn = ReturnType<typeof useScale>
