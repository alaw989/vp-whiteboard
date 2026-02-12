import { useDebounceFn } from '@vueuse/core'
import type { CanvasElement } from '~/types'

/**
 * Snap point interface
 * Represents a geometric feature that measurements can snap to
 */
export interface SnapPoint {
  x: number
  y: number
  type: 'endpoint' | 'midpoint' | 'center' | 'corner' | 'intersection'
  elementId: string
}

// Snap threshold in pixels (configurable)
const SNAP_THRESHOLD = 10

/**
 * Composable for geometric snap point detection
 * Finds snap points on canvas elements for accurate measurement placement
 */
export function useSnapping() {
  let lastSnapPoint: SnapPoint | null = null

  /**
   * Extract all snap points from an element
   */
  function getElementSnapPoints(element: CanvasElement): SnapPoint[] {
    const points: SnapPoint[] = []

    switch (element.type) {
      case 'line': {
        const data = element.data as any
        // Endpoints
        points.push(
          { x: data.start[0], y: data.start[1], type: 'endpoint', elementId: element.id },
          { x: data.end[0], y: data.end[1], type: 'endpoint', elementId: element.id }
        )
        // Midpoint
        points.push({
          x: (data.start[0] + data.end[0]) / 2,
          y: (data.start[1] + data.end[1]) / 2,
          type: 'midpoint',
          elementId: element.id,
        })
        break
      }

      case 'rectangle': {
        const data = element.data as any
        // Four corners
        points.push(
          { x: data.x, y: data.y, type: 'corner', elementId: element.id },
          { x: data.x + data.width, y: data.y, type: 'corner', elementId: element.id },
          { x: data.x, y: data.y + data.height, type: 'corner', elementId: element.id },
          { x: data.x + data.width, y: data.y + data.height, type: 'corner', elementId: element.id }
        )
        break
      }

      case 'circle': {
        const data = element.data as any
        // Center point
        points.push({ x: data.cx, y: data.cy, type: 'center', elementId: element.id })
        break
      }

      case 'ellipse': {
        const data = element.data as any
        // Center point (ellipse uses x,y as center)
        points.push({ x: data.x, y: data.y, type: 'center', elementId: element.id })
        break
      }

      case 'arrow': {
        const data = element.data as any
        // Arrow points (start and end)
        if (data.points && data.points.length >= 2) {
          points.push(
            { x: data.points[0][0], y: data.points[0][1], type: 'endpoint', elementId: element.id },
            { x: data.points[1][0], y: data.points[1][1], type: 'endpoint', elementId: element.id }
          )
        }
        break
      }

      case 'measurement-distance': {
        const data = element.data as any
        // Measurement endpoints
        points.push(
          { x: data.start[0], y: data.start[1], type: 'endpoint', elementId: element.id },
          { x: data.end[0], y: data.end[1], type: 'endpoint', elementId: element.id }
        )
        break
      }
    }

    return points
  }

  /**
   * Find the nearest snap point within threshold
   * Returns null if no snap point is within threshold
   */
  function findSnapPoint(
    cursor: { x: number; y: number },
    elements: CanvasElement[]
  ): SnapPoint | null {
    let nearest: SnapPoint | null = null
    let minDistance = SNAP_THRESHOLD

    for (const element of elements) {
      const snapPoints = getElementSnapPoints(element)

      for (const point of snapPoints) {
        const distance = Math.hypot(cursor.x - point.x, cursor.y - point.y)

        if (distance < minDistance) {
          minDistance = distance
          nearest = point
        }
      }
    }

    lastSnapPoint = nearest
    return nearest
  }

  /**
   * Debounced version of findSnapPoint
   * Throttled to ~30fps (33ms) for performance
   */
  const debouncedFindSnapPoint = useDebounceFn(findSnapPoint, 33)

  /**
   * Get the last found snap point
   */
  function getLastSnapPoint(): SnapPoint | null {
    return lastSnapPoint
  }

  /**
   * Clear the last snap point
   */
  function clearSnapPoint() {
    lastSnapPoint = null
  }

  return {
    findSnapPoint,
    debouncedFindSnapPoint,
    getLastSnapPoint,
    clearSnapPoint,
    SNAP_THRESHOLD,
  }
}
