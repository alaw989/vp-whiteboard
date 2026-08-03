import { ref, readonly } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import type { CanvasElement, LineElement, RectangleElement, CircleElement, EllipseElement, StrokeElement, PolylineElement, ArcElement, FilletArcElement, DimensionElement, RevisionCloudElement } from '~/types'

export interface SnapPoint {
  x: number
  y: number
  type: 'endpoint' | 'midpoint' | 'center' | 'corner' | 'intersection' | 'perpendicular' | 'tangent' | 'nearest'
  elementId: string
}

export interface SnappingOptions {
  threshold?: number  // Snap threshold in pixels (default 10)
  throttleMs?: number  // Throttle delay for performance (default 33ms for ~30fps)
}

export function useSnapping(options: SnappingOptions = {}) {
  const { threshold = 10, throttleMs = 33 } = options
  const snapEnabled = ref(true)

  function getLineSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'line') return []

    const data = element.data as LineElement
    const points: SnapPoint[] = [
      { x: data.start[0], y: data.start[1], type: 'endpoint', elementId: element.id },
      { x: data.end[0], y: data.end[1], type: 'endpoint', elementId: element.id },
    ]

    // Midpoint
    points.push({
      x: (data.start[0] + data.end[0]) / 2,
      y: (data.start[1] + data.end[1]) / 2,
      type: 'midpoint',
      elementId: element.id,
    })

    return points
  }

  function getRectangleSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'rectangle') return []

    const data = element.data as RectangleElement
    const { x, y, width, height } = data

    return [
      { x, y, type: 'corner', elementId: element.id },
      { x: x + width, y, type: 'corner', elementId: element.id },
      { x, y: y + height, type: 'corner', elementId: element.id },
      { x: x + width, y: y + height, type: 'corner', elementId: element.id },
      // Midpoints of edges
      { x: x + width / 2, y, type: 'midpoint', elementId: element.id },
      { x: x + width / 2, y: y + height, type: 'midpoint', elementId: element.id },
      { x, y: y + height / 2, type: 'midpoint', elementId: element.id },
      { x: x + width, y: y + height / 2, type: 'midpoint', elementId: element.id },
      // Center
      { x: x + width / 2, y: y + height / 2, type: 'center', elementId: element.id },
    ]
  }

  function getCircleSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'circle') return []

    const data = element.data as CircleElement
    const { cx, cy, radius } = data
    const points: SnapPoint[] = [
      { x: cx, y: cy, type: 'center', elementId: element.id },
    ]

    // Cardinal points
    if (radius > 0) {
      points.push(
        { x: cx + radius, y: cy, type: 'endpoint', elementId: element.id },
        { x: cx - radius, y: cy, type: 'endpoint', elementId: element.id },
        { x: cx, y: cy + radius, type: 'endpoint', elementId: element.id },
        { x: cx, y: cy - radius, type: 'endpoint', elementId: element.id },
      )
    }

    return points
  }

  function getEllipseSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'ellipse') return []

    const data = element.data as EllipseElement
    return [
      { x: data.x, y: data.y, type: 'center', elementId: element.id },
    ]
  }

  function getStrokeSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'stroke') return []

    const data = element.data as StrokeElement
    if (data.points.length === 0) return []

    const firstPoint = data.points[0]!
    const lastPoint = data.points[data.points.length - 1]!

    return [
      { x: firstPoint[0], y: firstPoint[1], type: 'endpoint', elementId: element.id },
      { x: lastPoint[0], y: lastPoint[1], type: 'endpoint', elementId: element.id },
    ]
  }

  function getPolylineSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'polyline') return []

    const data = element.data as PolylineElement
    if (data.points.length === 0) return []

    const points: SnapPoint[] = []

    // Endpoints of each segment
    for (const pt of data.points) {
      points.push({ x: pt[0], y: pt[1], type: 'endpoint', elementId: element.id })
    }

    // Midpoints of each segment
    for (let i = 0; i < data.points.length - 1; i++) {
      const a = data.points[i]!
      const b = data.points[i + 1]!
      points.push({
        x: (a[0] + b[0]) / 2,
        y: (a[1] + b[1]) / 2,
        type: 'midpoint',
        elementId: element.id,
      })
    }

    // If closed, also add midpoint of closing segment
    if (data.closed && data.points.length >= 3) {
      const first = data.points[0]!
      const last = data.points[data.points.length - 1]!
      points.push({
        x: (first[0] + last[0]) / 2,
        y: (first[1] + last[1]) / 2,
        type: 'midpoint',
        elementId: element.id,
      })
    }

    return points
  }

  function getArcSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'arc') return []

    const data = element.data as ArcElement
    return [
      { x: data.start[0], y: data.start[1], type: 'endpoint', elementId: element.id },
      { x: data.end[0], y: data.end[1], type: 'endpoint', elementId: element.id },
      { x: data.through[0], y: data.through[1], type: 'midpoint', elementId: element.id },
    ]
  }

  function getFilletArcSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'fillet-arc') return []
    const data = element.data as FilletArcElement
    const startPoint = {
      x: data.center[0] + data.radius * Math.cos(data.startAngle),
      y: data.center[1] + data.radius * Math.sin(data.startAngle),
    }
    const endPoint = {
      x: data.center[0] + data.radius * Math.cos(data.endAngle),
      y: data.center[1] + data.radius * Math.sin(data.endAngle),
    }
    return [
      { x: startPoint.x, y: startPoint.y, type: 'endpoint', elementId: element.id },
      { x: endPoint.x, y: endPoint.y, type: 'endpoint', elementId: element.id },
      { x: data.center[0], y: data.center[1], type: 'center', elementId: element.id },
    ]
  }

  function getDimensionSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'dimension') return []
    const data = element.data as DimensionElement
    return [
      { x: data.start[0], y: data.start[1], type: 'endpoint', elementId: element.id },
      { x: data.end[0], y: data.end[1], type: 'endpoint', elementId: element.id },
    ]
  }

  function getRevisionCloudSnapPoints(element: CanvasElement): SnapPoint[] {
    if (element.type !== 'revision-cloud') return []
    const data = element.data as RevisionCloudElement
    if (data.points.length === 0) return []
    // Vertex endpoints (these are the meaningful snap targets on a cloud)
    return data.points.map(pt => ({
      x: pt[0],
      y: pt[1],
      type: 'endpoint' as const,
      elementId: element.id,
    }))
  }

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
      case 'polyline':
        return getPolylineSnapPoints(element)
      case 'arc':
        return getArcSnapPoints(element)
      case 'fillet-arc':
        return getFilletArcSnapPoints(element)
      case 'dimension':
        return getDimensionSnapPoints(element)
      case 'revision-cloud':
        return getRevisionCloudSnapPoints(element)
      default:
        return []
    }
  }

  function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y)
  }

  // --- Enhanced snap types ---

  /**
   * Find the perpendicular foot from cursor to a line segment.
   */
  function findPerpendicularSnap(
    cursor: { x: number; y: number },
    elements: CanvasElement[]
  ): SnapPoint | null {
    let nearest: SnapPoint | null = null
    let minDist = threshold

    for (const el of elements) {
      if (el.type === 'line') {
        const data = el.data as LineElement
        const foot = perpendicularFoot(cursor, { x: data.start[0], y: data.start[1] }, { x: data.end[0], y: data.end[1] })
        if (foot && isPointOnSegment(foot, { x: data.start[0], y: data.start[1] }, { x: data.end[0], y: data.end[1] })) {
          const dist = distance(cursor, foot)
          if (dist < minDist) {
            minDist = dist
            nearest = { x: foot.x, y: foot.y, type: 'perpendicular', elementId: el.id }
          }
        }
      } else if (el.type === 'rectangle') {
        const data = el.data as RectangleElement
        const corners = [
          { x: data.x, y: data.y },
          { x: data.x + data.width, y: data.y },
          { x: data.x + data.width, y: data.y + data.height },
          { x: data.x, y: data.y + data.height },
        ]
        for (let i = 0; i < 4; i++) {
          const a = corners[i]!
          const b = corners[(i + 1) % 4]!
          const foot = perpendicularFoot(cursor, a, b)
          if (foot && isPointOnSegment(foot, a, b)) {
            const dist = distance(cursor, foot)
            if (dist < minDist) {
              minDist = dist
              nearest = { x: foot.x, y: foot.y, type: 'perpendicular', elementId: el.id }
            }
          }
        }
      } else if (el.type === 'stroke') {
        const data = el.data as StrokeElement
        for (let i = 0; i < data.points.length - 1; i++) {
          const a = { x: data.points[i]![0], y: data.points[i]![1] }
          const b = { x: data.points[i + 1]![0], y: data.points[i + 1]![1] }
          const foot = perpendicularFoot(cursor, a, b)
          if (foot && isPointOnSegment(foot, a, b)) {
            const dist = distance(cursor, foot)
            if (dist < minDist) {
              minDist = dist
              nearest = { x: foot.x, y: foot.y, type: 'perpendicular', elementId: el.id }
            }
          }
        }
      } else if (el.type === 'polyline') {
        const data = el.data as PolylineElement
        for (let i = 0; i < data.points.length - 1; i++) {
          const a = { x: data.points[i]![0], y: data.points[i]![1] }
          const b = { x: data.points[i + 1]![0], y: data.points[i + 1]![1] }
          const foot = perpendicularFoot(cursor, a, b)
          if (foot && isPointOnSegment(foot, a, b)) {
            const dist = distance(cursor, foot)
            if (dist < minDist) {
              minDist = dist
              nearest = { x: foot.x, y: foot.y, type: 'perpendicular', elementId: el.id }
            }
          }
        }
      }
    }

    return nearest
  }

  /**
   * Find tangent snap points from cursor to circles.
   */
  function findTangentSnap(
    cursor: { x: number; y: number },
    elements: CanvasElement[]
  ): SnapPoint | null {
    let nearest: SnapPoint | null = null
    let minDist = threshold

    for (const el of elements) {
      if (el.type !== 'circle') continue
      const data = el.data as CircleElement
      const tangents = tangentPoints(cursor, { x: data.cx, y: data.cy }, data.radius)
      for (const tp of tangents) {
        const dist = distance(cursor, tp)
        if (dist < minDist) {
          minDist = dist
          nearest = { x: tp.x, y: tp.y, type: 'tangent', elementId: el.id }
        }
      }
    }

    return nearest
  }

  /**
   * Find the nearest point on any element geometry to the cursor.
   */
  function findNearestSnap(
    cursor: { x: number; y: number },
    elements: CanvasElement[]
  ): SnapPoint | null {
    let nearest: SnapPoint | null = null
    let minDist = threshold

    for (const el of elements) {
      if (el.type === 'line') {
        const data = el.data as LineElement
        const pt = closestPointOnSegment(cursor, { x: data.start[0], y: data.start[1] }, { x: data.end[0], y: data.end[1] })
        const dist = distance(cursor, pt)
        if (dist < minDist) {
          minDist = dist
          nearest = { x: pt.x, y: pt.y, type: 'nearest', elementId: el.id }
        }
      } else if (el.type === 'rectangle') {
        const data = el.data as RectangleElement
        const corners = [
          { x: data.x, y: data.y },
          { x: data.x + data.width, y: data.y },
          { x: data.x + data.width, y: data.y + data.height },
          { x: data.x, y: data.y + data.height },
        ]
        for (let i = 0; i < 4; i++) {
          const a = corners[i]!
          const b = corners[(i + 1) % 4]!
          const pt = closestPointOnSegment(cursor, a, b)
          const dist = distance(cursor, pt)
          if (dist < minDist) {
            minDist = dist
            nearest = { x: pt.x, y: pt.y, type: 'nearest', elementId: el.id }
          }
        }
      } else if (el.type === 'circle') {
        const data = el.data as CircleElement
        const dx = cursor.x - data.cx
        const dy = cursor.y - data.cy
        const d = Math.hypot(dx, dy)
        if (d > 0) {
          const pt = { x: data.cx + (dx / d) * data.radius, y: data.cy + (dy / d) * data.radius }
          const dist = distance(cursor, pt)
          if (dist < minDist) {
            minDist = dist
            nearest = { x: pt.x, y: pt.y, type: 'nearest', elementId: el.id }
          }
        }
      } else if (el.type === 'stroke') {
        const data = el.data as StrokeElement
        for (let i = 0; i < data.points.length - 1; i++) {
          const a = { x: data.points[i]![0], y: data.points[i]![1] }
          const b = { x: data.points[i + 1]![0], y: data.points[i + 1]![1] }
          const pt = closestPointOnSegment(cursor, a, b)
          const dist = distance(cursor, pt)
          if (dist < minDist) {
            minDist = dist
            nearest = { x: pt.x, y: pt.y, type: 'nearest', elementId: el.id }
          }
        }
      } else if (el.type === 'polyline') {
        const data = el.data as PolylineElement
        for (let i = 0; i < data.points.length - 1; i++) {
          const a = { x: data.points[i]![0], y: data.points[i]![1] }
          const b = { x: data.points[i + 1]![0], y: data.points[i + 1]![1] }
          const pt = closestPointOnSegment(cursor, a, b)
          const dist = distance(cursor, pt)
          if (dist < minDist) {
            minDist = dist
            nearest = { x: pt.x, y: pt.y, type: 'nearest', elementId: el.id }
          }
        }
      }
    }

    return nearest
  }

  // --- Geometry helpers ---

  function perpendicularFoot(
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number }
  ): { x: number; y: number } | null {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return null
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
    return { x: a.x + t * dx, y: a.y + t * dy }
  }

  function isPointOnSegment(
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
    tolerance = 0.5
  ): boolean {
    const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)
    if (Math.abs(cross) > tolerance * Math.hypot(b.x - a.x, b.y - a.y)) return false
    const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)
    const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    return dot >= -tolerance && dot <= lenSq + tolerance
  }

  function closestPointOnSegment(
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number }
  ): { x: number; y: number } {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return a
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
    return { x: a.x + t * dx, y: a.y + t * dy }
  }

  function tangentPoints(
    p: { x: number; y: number },
    center: { x: number; y: number },
    radius: number
  ): { x: number; y: number }[] {
    const dx = p.x - center.x
    const dy = p.y - center.y
    const d = Math.hypot(dx, dy)
    if (d <= radius) return [] // Inside or on circle, no tangent
    const angle = Math.atan2(dy, dx)
    const alpha = Math.acos(radius / d)
    return [
      { x: center.x + radius * Math.cos(angle + alpha), y: center.y + radius * Math.sin(angle + alpha) },
      { x: center.x + radius * Math.cos(angle - alpha), y: center.y + radius * Math.sin(angle - alpha) },
    ]
  }

  /**
   * Find the nearest snap point to the cursor.
   * Priority: endpoint/midpoint/center/corner > perpendicular > tangent > nearest
   */
  function findSnapPoint(
    cursor: { x: number; y: number },
    elements: CanvasElement[]
  ): SnapPoint | null {
    // First pass: standard snap points (endpoints, midpoints, centers, corners)
    let nearest: SnapPoint | null = null
    let minDist = threshold

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

    if (nearest) return nearest

    // Second pass: perpendicular snap
    const perpSnap = findPerpendicularSnap(cursor, elements)
    if (perpSnap) return perpSnap

    // Third pass: tangent snap
    const tanSnap = findTangentSnap(cursor, elements)
    if (tanSnap) return tanSnap

    // Fourth pass: nearest point
    const nearSnap = findNearestSnap(cursor, elements)
    if (nearSnap) return nearSnap

    return null
  }

  const findSnapPointThrottled = useDebounceFn(findSnapPoint, throttleMs)

  function isNearSnapPoint(
    cursor: { x: number; y: number },
    elements: CanvasElement[]
  ): boolean {
    return findSnapPoint(cursor, elements) !== null
  }

  function toggleSnap() {
    snapEnabled.value = !snapEnabled.value
  }

  return {
    findSnapPoint: (pos: { x: number; y: number }, elements: CanvasElement[]) => {
      if (!snapEnabled.value) return null
      return findSnapPoint(pos, elements)
    },
    findSnapPointThrottled,
    isNearSnapPoint,
    getElementSnapPoints,
    threshold,
    snapEnabled: readonly(snapEnabled),
    toggleSnap,
  }
}
