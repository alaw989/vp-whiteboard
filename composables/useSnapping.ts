import { useDebounceFn } from '@vueuse/core'
import type { CanvasElement, LineElement, RectangleElement, CircleElement, EllipseElement, StrokeElement } from '~/types'

export interface SnapPoint {
  x: number
  y: number
  type: 'endpoint' | 'midpoint' | 'center' | 'corner' | 'intersection'
  elementId: string
}

export interface SnappingOptions {
  threshold?: number  // Snap threshold in pixels (default 10)
  throttleMs?: number  // Throttle delay for performance (default 33ms for ~30fps)
}

/**
 * Snap composable for geometric feature detection
 * Enables measurements to snap to endpoints, corners, centers of existing elements
 */
export function useSnapping(options: SnappingOptions = {}) {
  const { threshold = 10, throttleMs = 33 } = options

  /**
   * Extract snap points from a line element
   */
  function getLineSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'line') return []

    const data = element.data as LineElement
    const points: SnapPoint[] = [
      {
        x: data.start[0],
        y: data.start[1],
        type: 'endpoint',
        elementId: element.id,
      },
      {
        x: data.end[0],
        y: data.end[1],
        type: 'endpoint',
        elementId: element.id,
      },
    ]

    // Add midpoint
    const midX = (data.start[0] + data.end[0]) / 2
    const midY = (data.start[1] + data.end[1]) / 2
    points.push({
      x: midX,
      y: midY,
      type: 'midpoint',
      elementId: element.id,
    })

    return points
  }

  /**
   * Extract snap points from a rectangle element
   */
  function getRectangleSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'rectangle') return []

    const data = element.data as RectangleElement
    const { x, y, width, height } = data

    return [
      { x: x, y: y, type: 'corner' as const, elementId: element.id },
      { x: x + width, y: y, type: 'corner' as const, elementId: element.id },
      { x: x, y: y + height, type: 'corner' as const, elementId: element.id },
      { x: x + width, y: y + height, type: 'corner' as const, elementId: element.id },
      // Center point
      { x: x + width / 2, y: y + height / 2, type: 'center' as const, elementId: element.id },
    ]
  }

  /**
   * Extract snap points from a circle element
   */
  function getCircleSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'circle') return []

    const data = element.data as CircleElement
    return [
      {
        x: data.cx,
        y: data.cy,
        type: 'center',
        elementId: element.id,
      },
    ]
  }

  /**
   * Extract snap points from an ellipse element
   */
  function getEllipseSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'ellipse') return []

    const data = element.data as EllipseElement
    return [
      {
        x: data.x,
        y: data.y,
        type: 'center',
        elementId: element.id,
      },
    ]
  }

  /**
   * Extract snap points from a stroke (freehand drawing)
   * Returns first and last points as endpoints
   */
  function getStrokeSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'stroke') return []

    const data = element.data as StrokeElement
    if (data.points.length === 0) return []

    const firstPoint = data.points[0]
    const lastPoint = data.points[data.points.length - 1]

    return [
      {
        x: firstPoint[0],
        y: firstPoint[1],
        type: 'endpoint',
        elementId: element.id,
      },
      {
        x: lastPoint[0],
        y: lastPoint[1],
        type: 'endpoint',
        elementId: element.id,
      },
    ]
  }

  /**
   * Get all snap points from an element based on its type
   */
  function getElementSnapPoints(element: CanvasElement): SnapPoint[] {
    switch (element.type) {
      case 'line':
        return getLineSnapPoints(element)
      case 'rectangle':
        return getRectangleSnapPoints(element)
      case 'circle':
        return getCircleSnapPoints(element)
      case 'ellipse':
        return getEllipseSnapPoints(element)
      case 'stroke':
        return getStrokeSnapPoints(element)
      default:
        return []
    }
  }

  /**
   * Calculate distance between two points
   */
  function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y)
  }

  /**
   * Find the nearest snap point to the cursor
   * Returns null if no snap point is within threshold
   */
  function findSnapPoint(
    cursor: { x: number; y: number },
    elements: CanvasElement[]
  ): SnapPoint | null {
    let nearest: SnapPoint | null = null
    let minDist = threshold

    // Collect all snap points from all elements
    for (const element of elements) {
      const points = getElementSnapPoints(element)

      for (const point of points) {
        const dist = distance(cursor, point)

        if (dist < minDist) {
          minDist = dist
          nearest = point
        }
      }
    }

    return nearest
  }

  /**
   * Throttled version of findSnapPoint for performance
   * Prevents excessive calculations on every mousemove
   */
  const findSnapPointThrottled = useDebounceFn(findSnapPoint, throttleMs)

  /**
   * Check if a position is near any snap point
   * Returns true if within threshold, false otherwise
   */
  function isNearSnapPoint(
    cursor: { x: number; y: number },
    elements: CanvasElement[]
  ): boolean {
    return findSnapPoint(cursor, elements) !== null
  }

  return {
    findSnapPoint,
    findSnapPointThrottled,
    isNearSnapPoint,
    getElementSnapPoints,
    threshold,
  }
}
