import { ref, computed, type Ref } from 'vue'
import type { ViewportState } from '~/types'

export interface GridLine {
  type: 'horizontal' | 'vertical'
  position: number
}

export interface UseGridOptions {
  baseSpacing?: number
  minPixelSpacing?: number
  maxDensity?: number
}

export function useGrid(options: UseGridOptions = {}) {
  const {
    baseSpacing = 20,
    minPixelSpacing = 10,
    maxDensity = 200,
  } = options

  const gridEnabled = ref(true)
  const gridSnapEnabled = ref(false)

  function toggleGrid() {
    gridEnabled.value = !gridEnabled.value
  }

  function toggleGridSnap() {
    gridSnapEnabled.value = !gridSnapEnabled.value
  }

  // Auto-adjust spacing based on zoom level to keep grid readable
  function getEffectiveSpacing(zoom: number): number {
    let spacing = baseSpacing
    // Subdivide or multiply to keep grid lines a reasonable pixel distance apart
    while (spacing * zoom < minPixelSpacing) {
      spacing *= 5
    }
    while (spacing * zoom > minPixelSpacing * maxDensity) {
      spacing /= 5
    }
    return spacing
  }

  function getVisibleGridLines(
    viewport: ViewportState,
    containerWidth: number,
    containerHeight: number,
  ): GridLine[] {
    if (!gridEnabled.value) return []

    const { x, y, zoom } = viewport
    const spacing = getEffectiveSpacing(zoom)

    // Visible canvas bounds
    const left = -x / zoom
    const top = -y / zoom
    const right = (-x + containerWidth) / zoom
    const bottom = (-y + containerHeight) / zoom

    const lines: GridLine[] = []

    // Vertical lines
    const startX = Math.floor(left / spacing) * spacing
    for (let px = startX; px <= right; px += spacing) {
      lines.push({ type: 'vertical', position: px })
    }

    // Horizontal lines
    const startY = Math.floor(top / spacing) * spacing
    for (let py = startY; py <= bottom; py += spacing) {
      lines.push({ type: 'horizontal', position: py })
    }

    return lines
  }

  function snapToGrid(point: { x: number; y: number }, viewport: ViewportState): { x: number; y: number } {
    if (!gridSnapEnabled.value) return point
    const spacing = getEffectiveSpacing(viewport.zoom)
    return {
      x: Math.round(point.x / spacing) * spacing,
      y: Math.round(point.y / spacing) * spacing,
    }
  }

  function getEffectiveSpacingForViewport(viewport: ViewportState): number {
    return getEffectiveSpacing(viewport.zoom)
  }

  return {
    gridEnabled,
    gridSnapEnabled,
    toggleGrid,
    toggleGridSnap,
    getVisibleGridLines,
    snapToGrid,
    getEffectiveSpacing: getEffectiveSpacingForViewport,
  }
}

export type UseGridReturn = ReturnType<typeof useGrid>
