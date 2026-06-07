// Shared geometric calculations for modification tools

export interface Point {
  x: number
  y: number
}

export interface LineSegment {
  start: Point
  end: Point
}

export interface CircleDef {
  center: Point
  radius: number
}

// --- Basics ---

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

// --- Line operations ---

/** Direction unit vector from a -> b */
export function direction(a: Point, b: Point): Point {
  const len = distance(a, b)
  if (len === 0) return { x: 1, y: 0 }
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
}

/** Left-hand normal (perpendicular, rotated 90° CCW) */
export function normal(dir: Point): Point {
  return { x: -dir.y, y: dir.x }
}

/** Angle of line a->b in radians */
export function angleOf(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

/**
 * Line-line intersection.
 * Returns intersection point or null if parallel.
 * Each line is defined by a point and direction.
 */
export function lineLineIntersection(
  p1: Point, d1: Point,
  p2: Point, d2: Point,
): Point | null {
  const cross = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(cross) < 1e-10) return null // parallel
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const t = (dx * d2.y - dy * d2.x) / cross
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t }
}

/**
 * Segment-segment intersection.
 * Returns the intersection point if it lies on both segments, else null.
 */
export function segmentSegmentIntersection(
  a1: Point, a2: Point,
  b1: Point, b2: Point,
): Point | null {
  const d1 = { x: a2.x - a1.x, y: a2.y - a1.y }
  const d2 = { x: b2.x - b1.x, y: b2.y - b1.y }
  const cross = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(cross) < 1e-10) return null
  const dx = b1.x - a1.x
  const dy = b1.y - a1.y
  const t = (dx * d2.y - dy * d2.x) / cross
  const u = (dx * d1.y - dy * d1.x) / cross
  if (t < -1e-10 || t > 1 + 1e-10 || u < -1e-10 || u > 1 + 1e-10) return null
  return { x: a1.x + d1.x * t, y: a1.y + d1.y * t }
}

/**
 * Line-segment intersection.
 * Line defined by point + direction; segment from s1 to s2.
 */
export function lineSegmentIntersection(
  linePoint: Point, lineDir: Point,
  s1: Point, s2: Point,
): Point | null {
  const d2 = { x: s2.x - s1.x, y: s2.y - s1.y }
  const cross = lineDir.x * d2.y - lineDir.y * d2.x
  if (Math.abs(cross) < 1e-10) return null
  const dx = s1.x - linePoint.x
  const dy = s1.y - linePoint.y
  const u = (dx * lineDir.y - dy * lineDir.x) / cross
  if (u < -1e-10 || u > 1 + 1e-10) return null
  return { x: s1.x + d2.x * u, y: s1.y + d2.y * u }
}

/** Nearest point on segment ab to point p */
export function nearestPointOnSegment(a: Point, b: Point, p: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return { ...a }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return { x: a.x + dx * t, y: a.y + dy * t }
}

/** Distance from point to nearest point on segment */
export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  return distance(p, nearestPointOnSegment(a, b, p))
}

/** Project point onto infinite line defined by two points */
export function projectPointOnLine(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return { ...a }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  return { x: a.x + dx * t, y: a.y + dy * t }
}

// --- Parallel / Offset ---

/** Create a parallel line segment offset by distance (positive = left side) */
export function parallelSegment(seg: LineSegment, offset: number): LineSegment {
  const dir = direction(seg.start, seg.end)
  const n = normal(dir)
  return {
    start: { x: seg.start.x + n.x * offset, y: seg.start.y + n.y * offset },
    end: { x: seg.end.x + n.x * offset, y: seg.end.y + n.y * offset },
  }
}

/** Offset a polyline by distance, returning new point array */
export function offsetPolyline(points: Point[], offset: number): Point[] {
  if (points.length < 2) return points.map(p => ({ ...p }))

  const result: Point[] = []

  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      const next = points[1]!
      const dir = direction(points[0]!, next)
      const n = normal(dir)
      result.push({ x: points[0]!.x + n.x * offset, y: points[0]!.y + n.y * offset })
    } else if (i === points.length - 1) {
      const prev = points[i - 1]!
      const cur = points[i]!
      const dir = direction(prev, cur)
      const n = normal(dir)
      result.push({ x: cur.x + n.x * offset, y: cur.y + n.y * offset })
    } else {
      const prev = points[i - 1]!
      const cur = points[i]!
      const next = points[i + 1]!
      const dir1 = direction(prev, cur)
      const dir2 = direction(cur, next)
      const n1 = normal(dir1)
      const n2 = normal(dir2)
      const offsetPrev: Point = { x: cur.x + n1.x * offset, y: cur.y + n1.y * offset }
      const offsetNext: Point = { x: cur.x + n2.x * offset, y: cur.y + n2.y * offset }
      const intersection = lineLineIntersection(
        { x: prev.x + n1.x * offset, y: prev.y + n1.y * offset }, dir1,
        offsetNext, dir2,
      )
      result.push(intersection ?? midpoint(offsetPrev, offsetNext))
    }
  }

  return result
}

// --- Mirror ---

/** Mirror a point across a line defined by two points */
export function mirrorPoint(p: Point, axisA: Point, axisB: Point): Point {
  const proj = projectPointOnLine(p, axisA, axisB)
  return { x: 2 * proj.x - p.x, y: 2 * proj.y - p.y }
}

/** Mirror a line segment across an axis */
export function mirrorSegment(seg: LineSegment, axisA: Point, axisB: Point): LineSegment {
  return {
    start: mirrorPoint(seg.start, axisA, axisB),
    end: mirrorPoint(seg.end, axisA, axisB),
  }
}

// --- Arc / Circle ---

/** Circle-circle intersection (up to 2 points) */
export function circleCircleIntersection(c1: CircleDef, c2: CircleDef): Point[] {
  const d = distance(c1.center, c2.center)
  if (d > c1.radius + c2.radius + 1e-10) return []
  if (d < Math.abs(c1.radius - c2.radius) - 1e-10) return []
  if (d < 1e-10) return []

  const a = (c1.radius * c1.radius - c2.radius * c2.radius + d * d) / (2 * d)
  const hSq = c1.radius * c1.radius - a * a
  if (hSq < -1e-10) return []
  const h = Math.sqrt(Math.max(0, hSq))

  const mid = lerp(c1.center, c2.center, a / d)
  const perpDir = normal(direction(c1.center, c2.center))

  if (h < 1e-10) return [mid]
  return [
    { x: mid.x + perpDir.x * h, y: mid.y + perpDir.y * h },
    { x: mid.x - perpDir.x * h, y: mid.y - perpDir.y * h },
  ]
}

/** Circle-line intersection (up to 2 points) */
export function circleLineIntersection(
  center: Point, radius: number,
  lineA: Point, lineB: Point,
): Point[] {
  const nearest = projectPointOnLine(center, lineA, lineB)
  const d = distance(center, nearest)
  if (d > radius + 1e-10) return []

  const along = direction(lineA, lineB)
  const offset = Math.sqrt(Math.max(0, radius * radius - d * d))

  if (offset < 1e-10) return [nearest]
  return [
    { x: nearest.x + along.x * offset, y: nearest.y + along.y * offset },
    { x: nearest.x - along.x * offset, y: nearest.y - along.y * offset },
  ]
}

// --- Fillet helpers ---

/**
 * Calculate fillet arc between two line segments.
 * Returns the arc center, radius, tangent points on each segment, or null if not possible.
 */
export interface FilletResult {
  center: Point
  radius: number
  tangentA: Point // point on segment A where fillet touches
  tangentB: Point // point on segment B where fillet touches
  newEndA: Point  // segment A should be shortened to this point
  newStartB: Point // segment B should be shortened/extended to this point
}

export function calculateFillet(
  a1: Point, a2: Point,
  b1: Point, b2: Point,
  radius: number,
): FilletResult | null {
  // Find intersection of the two lines
  const dirA = direction(a1, a2)
  const dirB = direction(b1, b2)
  const intersection = lineLineIntersection(a1, dirA, b1, dirB)
  if (!intersection) return null

  // Angle between the two lines
  const dot = dirA.x * dirB.x + dirA.y * dirB.y
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)))
  if (angle < 1e-6 || angle > Math.PI - 1e-6) return null

  // Distance from intersection to tangent point
  const halfAngle = angle / 2
  const tanDist = radius / Math.tan(halfAngle)

  // Tangent points along each line from intersection
  const tangentA: Point = {
    x: intersection.x + dirA.x * tanDist,
    y: intersection.y + dirA.y * tanDist,
  }
  const tangentB: Point = {
    x: intersection.x + dirB.x * tanDist,
    y: intersection.y + dirB.y * tanDist,
  }

  // Check tangents are on the correct side of the segments
  // Tangent A should be between intersection and a2 (or at least on the ray)
  // For now, accept and let caller validate

  // Fillet center: perpendicular from tangent point + radius
  const normalA = normal(dirA)
  const normalB = normal(dirB)
  // Center is offset from tangent in the direction toward the inside of the angle
  // Use the average normal direction to determine which side
  const centerFromA: Point = {
    x: tangentA.x + normalA.x * radius,
    y: tangentA.y + normalA.y * radius,
  }
  const centerFromB: Point = {
    x: tangentB.x + normalB.x * radius,
    y: tangentB.y + normalB.y * radius,
  }

  // Try both normal directions and pick the one where both agree
  const centerCandidate1 = lineLineIntersection(tangentA, normalA, tangentB, normalB)
  const normalA2 = { x: -normalA.x, y: -normalA.y }
  const normalB2 = { x: -normalB.x, y: -normalB.y }
  const centerCandidate2 = lineLineIntersection(tangentA, normalA2, tangentB, normalB2)

  let center: Point | null = null
  if (centerCandidate1) {
    center = centerCandidate1
  } else if (centerCandidate2) {
    center = centerCandidate2
    // Flip tangent calculations
  }

  if (!center) return null

  return {
    center,
    radius,
    tangentA,
    tangentB,
    newEndA: tangentA,
    newStartB: tangentB,
  }
}

// --- Element geometry extraction helpers ---

/** Get the geometric segments/curves of an element for intersection testing */
export function getElementGeometry(element: any): {
  type: 'line' | 'polyline' | 'circle' | 'rectangle' | 'arc'
  segments?: LineSegment[]
  circle?: CircleDef
  points?: Point[]
} | null {
  const data = element.data
  if (!data) return null

  switch (element.type) {
    case 'line':
      return {
        type: 'line',
        segments: [{
          start: { x: data.start[0], y: data.start[1] },
          end: { x: data.end[0], y: data.end[1] },
        }],
      }
    case 'polyline': {
      const pts: Point[] = data.points.map((p: number[]) => ({ x: p[0], y: p[1] }))
      const segs: LineSegment[] = []
      for (let i = 0; i < pts.length - 1; i++) {
        segs.push({ start: pts[i]!, end: pts[i + 1]! })
      }
      if (data.closed && pts.length > 2) {
        segs.push({ start: pts[pts.length - 1]!, end: pts[0]! })
      }
      return { type: 'polyline', segments: segs, points: pts }
    }
    case 'rectangle': {
      const { x, y, width, height } = data
      const corners = [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ]
      const segs: LineSegment[] = []
      for (let i = 0; i < 4; i++) {
        segs.push({ start: corners[i]!, end: corners[(i + 1) % 4]! })
      }
      return { type: 'rectangle', segments: segs, points: corners }
    }
    case 'circle':
      return {
        type: 'circle',
        circle: { center: { x: data.cx, y: data.cy }, radius: data.radius },
      }
    case 'arc': {
      // Approximate arc as polyline segments
      const pts = arcToPolylinePoints(data.start, data.through, data.end, 32)
      const segs: LineSegment[] = []
      for (let i = 0; i < pts.length - 1; i++) {
        segs.push({ start: pts[i]!, end: pts[i + 1]! })
      }
      return { type: 'arc', segments: segs, points: pts }
    }
    default:
      return null
  }
}

/** Convert 3-point arc to polyline points */
export function arcToPolylinePoints(
  start: [number, number], through: [number, number], end: [number, number],
  numSegments: number = 32,
): Point[] {
  const s = { x: start[0], y: start[1] }
  const t = { x: through[0], y: through[1] }
  const e = { x: end[0], y: end[1] }

  // Calculate circle center from three points
  const mid1 = midpoint(s, t)
  const mid2 = midpoint(t, e)
  const d1 = direction(s, t)
  const d2 = direction(t, e)
  const n1 = normal(d1)
  const n2 = normal(d2)

  const center = lineLineIntersection(mid1, n1, mid2, n2)
  if (!center) return [s, e]

  const radius = distance(center, s)
  const startAngle = Math.atan2(s.y - center.y, s.x - center.x)
  const endAngle = Math.atan2(e.y - center.y, e.x - center.x)

  // Determine sweep direction by checking which side 'through' is on
  const cross = (t.x - s.x) * (e.y - s.y) - (t.y - s.y) * (e.x - s.x)
  const ccw = cross > 0

  let sweep = endAngle - startAngle
  if (ccw && sweep < 0) sweep += 2 * Math.PI
  if (!ccw && sweep > 0) sweep -= 2 * Math.PI

  const points: Point[] = []
  for (let i = 0; i <= numSegments; i++) {
    const angle = startAngle + (sweep * i) / numSegments
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    })
  }
  return points
}

/** Find the nearest element and segment to a point */
export function findNearestElementSegment(
  pos: Point,
  elements: any[],
  excludeIds: string[] = [],
): { element: any; segmentIndex: number; distance: number; nearestPoint: Point } | null {
  let best: { element: any; segmentIndex: number; distance: number; nearestPoint: Point } | null = null

  for (const el of elements) {
    if (excludeIds.includes(el.id)) continue
    const geo = getElementGeometry(el)
    if (!geo?.segments) continue

    for (let i = 0; i < geo.segments.length; i++) {
      const seg = geo.segments[i]!
      const near = nearestPointOnSegment(seg.start, seg.end, pos)
      const d = distance(pos, near)
      if (!best || d < best.distance) {
        best = { element: el, segmentIndex: i, distance: d, nearestPoint: near }
      }
    }
  }

  return best
}
