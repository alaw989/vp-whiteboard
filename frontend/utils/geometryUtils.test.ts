import { describe, expect, it } from 'vitest'
import {
  angleOf,
  arcToPolylinePoints,
  calculateFillet,
  centroidOfPoints,
  circleCircleIntersection,
  circleLineIntersection,
  direction,
  distance,
  findNearestElementSegment,
  getElementGeometry,
  lerp,
  lineLineIntersection,
  lineSegmentIntersection,
  midpoint,
  mirrorPoint,
  mirrorSegment,
  nearestPointOnSegment,
  normal,
  offsetPolyline,
  parallelSegment,
  pointToSegmentDistance,
  projectPointOnLine,
  revisionCloudPath,
  rotatePointAroundOrigin,
  scalePointFromOrigin,
  segmentSegmentIntersection,
  signedArea,
  transformElement,
  type LineSegment,
  type Point,
} from '~/utils/geometryUtils'

// These tests pin down the geometry that the modify-tools' selection hit-testing
// relies on (useRotateTool/useScaleTool/useMirrorTool `findElementAtPosition`).
// A rectangle exposes its 4 EDGE segments — clicks must land near an edge, not in
// the fill. This is the exact runtime behaviour the Ralph loop could not verify by
// screenshot (it kept clicking the fill and seeing "0 selected"), so it is expressed
// here as a runnable assertion instead.

describe('getElementGeometry', () => {
  it('returns 4 edge segments for a rectangle', () => {
    const geo = getElementGeometry({
      type: 'rectangle',
      data: { x: 100, y: 200, width: 300, height: 400 },
    })
    expect(geo?.type).toBe('rectangle')
    expect(geo?.segments).toHaveLength(4)
  })

  it('returns 1 segment for a line', () => {
    const geo = getElementGeometry({
      type: 'line',
      data: { start: [0, 0], end: [10, 10] },
    })
    expect(geo?.type).toBe('line')
    expect(geo?.segments).toHaveLength(1)
  })

  it('returns null when there is no data', () => {
    expect(getElementGeometry({ type: 'rectangle' })).toBeNull()
  })
})

// Mirror findElementAtPosition: nearest distance from a point to any segment.
const nearestDistance = (segments: LineSegment[], point: { x: number; y: number }) =>
  Math.min(
    ...segments.map((seg) => distance(point, nearestPointOnSegment(seg.start, seg.end, point))),
  )

describe('selection hit-testing (edges, not fill)', () => {
  const rect = getElementGeometry({
    type: 'rectangle',
    data: { x: 100, y: 200, width: 300, height: 400 },
  })!
  const threshold = 8 // 8 / zoom at zoom = 1

  it('registers a click on the top edge (within the hit band)', () => {
    const onTopEdge = { x: 250, y: 200 } // midpoint of the top edge
    expect(nearestDistance(rect.segments!, onTopEdge)).toBeLessThan(threshold)
  })

  it('does NOT register a click in the interior fill', () => {
    const inFill = { x: 250, y: 400 } // dead centre of the rectangle
    expect(nearestDistance(rect.segments!, inFill)).toBeGreaterThan(threshold)
  })
})

describe('distance', () => {
  it('computes Euclidean distance correctly', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5)
  })
})

describe('midpoint', () => {
  it('averages two points', () => {
    const m = midpoint({ x: 0, y: 0 }, { x: 2, y: 4 })
    expect(m.x).toBe(1)
    expect(m.y).toBe(2)
  })
})

describe('lerp', () => {
  it('returns a at t=0', () => {
    const p = lerp({ x: 0, y: 0 }, { x: 10, y: 10 }, 0)
    expect(p.x).toBe(0); expect(p.y).toBe(0)
  })
  it('returns midpoint at t=0.5', () => {
    const p = lerp({ x: 0, y: 0 }, { x: 10, y: 10 }, 0.5)
    expect(p.x).toBe(5); expect(p.y).toBe(5)
  })
  it('returns b at t=1', () => {
    const p = lerp({ x: 0, y: 0 }, { x: 10, y: 10 }, 1)
    expect(p.x).toBe(10); expect(p.y).toBe(10)
  })
})

describe('direction', () => {
  it('returns unit vector from a to b', () => {
    const d = direction({ x: 0, y: 0 }, { x: 3, y: 4 })
    expect(d.x).toBeCloseTo(0.6); expect(d.y).toBeCloseTo(0.8)
  })
  it('returns {x:1,y:0} for zero-length input', () => {
    const d = direction({ x: 1, y: 2 }, { x: 1, y: 2 })
    expect(d.x).toBe(1); expect(d.y).toBe(0)
  })
})

describe('normal', () => {
  it('returns perpendicular CCW', () => {
    const n = normal({ x: 5, y: -3 })
    expect(n.x).toBe(3); expect(n.y).toBe(5)
  })
})

describe('angleOf', () => {
  it('returns 0 for horizontal rightward line', () => {
    expect(angleOf({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0)
  })
  it('returns PI/2 for vertical downward line', () => {
    expect(angleOf({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2)
  })
})

describe('lineLineIntersection', () => {
  it('returns intersection point for crossing lines', () => {
    const p = lineLineIntersection({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: -1 })
    expect(p).not.toBeNull()
    expect(p!.x).toBeCloseTo(0.5); expect(p!.y).toBeCloseTo(0.5)
  })
  it('returns null for parallel lines', () => {
    expect(lineLineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 })).toBeNull()
  })
})

describe('segmentSegmentIntersection', () => {
  it('returns point for crossing segments', () => {
    const p = segmentSegmentIntersection({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 })
    expect(p).not.toBeNull()
    expect(p!.x).toBeCloseTo(1); expect(p!.y).toBeCloseTo(1)
  })
  it('returns null for non-crossing segments', () => {
    expect(segmentSegmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 })).toBeNull()
  })
  it('returns null for collinear segments', () => {
    expect(segmentSegmentIntersection({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 })).toBeNull()
  })
})

describe('lineSegmentIntersection', () => {
  it('returns point when line intersects segment', () => {
    const p = lineSegmentIntersection({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 5 }, { x: 1, y: 5 })
    expect(p).not.toBeNull()
    expect(p!.x).toBeCloseTo(0); expect(p!.y).toBeCloseTo(5)
  })
  it('returns null when line misses segment', () => {
    expect(lineSegmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 5 }, { x: 1, y: 5 })).toBeNull()
  })
})

describe('nearestPointOnSegment', () => {
  it('returns midpoint of segment for point at center', () => {
    const p = nearestPointOnSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 })
    expect(p.x).toBe(5); expect(p.y).toBe(0)
  })
  it('clamps to endpoint when point is beyond', () => {
    const p = nearestPointOnSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 5 })
    expect(p.x).toBe(10); expect(p.y).toBe(0)
  })
  it('returns start when point is before start', () => {
    const p = nearestPointOnSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: -5, y: 5 })
    expect(p.x).toBe(0); expect(p.y).toBe(0)
  })
})

describe('pointToSegmentDistance', () => {
  it('computes perpendicular distance from point to segment', () => {
    expect(pointToSegmentDistance({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5)
  })
  it('computes distance to endpoint for point beyond', () => {
    expect(pointToSegmentDistance({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5)
  })
})

describe('projectPointOnLine', () => {
  it('projects point perpendicularly onto infinite line', () => {
    const p = projectPointOnLine({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    expect(p.x).toBeCloseTo(5); expect(p.y).toBeCloseTo(0)
  })
})

describe('parallelSegment', () => {
  it('offsets a segment by distance to the left', () => {
    const result = parallelSegment({ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }, 5)
    expect(result.start.x).toBe(0); expect(result.start.y).toBe(5)
    expect(result.end.x).toBe(10); expect(result.end.y).toBe(5)
  })
})

describe('offsetPolyline', () => {
  it('offsets a 2-point polyline', () => {
    const result = offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 5)
    expect(result).toHaveLength(2)
    expect(result[0]!.y).toBeCloseTo(5); expect(result[1]!.y).toBeCloseTo(5)
  })
  it('offsets a 3-point polyline with interior vertex', () => {
    const result = offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 5)
    expect(result).toHaveLength(3)
  })
})

describe('mirrorPoint', () => {
  it('reflects a point across x-axis', () => {
    const p = mirrorPoint({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 1, y: 0 })
    expect(p.x).toBeCloseTo(2); expect(p.y).toBeCloseTo(-3)
  })
})

describe('mirrorSegment', () => {
  it('reflects a segment across x-axis', () => {
    const s = mirrorSegment({ start: { x: 1, y: 2 }, end: { x: 3, y: 4 } }, { x: 0, y: 0 }, { x: 1, y: 0 })
    expect(s.start.y).toBeCloseTo(-2); expect(s.end.y).toBeCloseTo(-4)
  })
})

describe('rotatePointAroundOrigin', () => {
  it('rotates 90 degrees clockwise', () => {
    const p = rotatePointAroundOrigin({ x: 1, y: 0 }, { x: 0, y: 0 }, Math.PI / 2)
    expect(p.x).toBeCloseTo(0); expect(p.y).toBeCloseTo(1)
  })
  it('rotates 180 degrees', () => {
    const p = rotatePointAroundOrigin({ x: 1, y: 0 }, { x: 0, y: 0 }, Math.PI)
    expect(p.x).toBeCloseTo(-1); expect(p.y).toBeCloseTo(0)
  })
})

describe('scalePointFromOrigin', () => {
  it('scales point by factor 2', () => {
    const p = scalePointFromOrigin({ x: 3, y: 4 }, { x: 0, y: 0 }, 2)
    expect(p.x).toBe(6); expect(p.y).toBe(8)
  })
  it('scales point by factor 0.5', () => {
    const p = scalePointFromOrigin({ x: 4, y: 6 }, { x: 0, y: 0 }, 0.5)
    expect(p.x).toBe(2); expect(p.y).toBe(3)
  })
})

describe('centroidOfPoints', () => {
  it('returns origin for empty array', () => {
    expect(centroidOfPoints([])).toEqual({ x: 0, y: 0 })
  })
  it('returns the point itself for single point', () => {
    expect(centroidOfPoints([{ x: 5, y: 7 }])).toEqual({ x: 5, y: 7 })
  })
  it('computes centroid of three points', () => {
    const c = centroidOfPoints([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 6 }])
    expect(c.x).toBeCloseTo(2); expect(c.y).toBeCloseTo(2)
  })
})

describe('circleCircleIntersection', () => {
  it('returns one point for externally tangent circles', () => {
    const pts = circleCircleIntersection({ center: { x: 0, y: 0 }, radius: 5 }, { center: { x: 10, y: 0 }, radius: 5 })
    expect(pts).toHaveLength(1)
    expect(pts[0]!.x).toBeCloseTo(5); expect(pts[0]!.y).toBeCloseTo(0)
  })
  it('returns two points for intersecting circles', () => {
    const pts = circleCircleIntersection({ center: { x: 0, y: 0 }, radius: 5 }, { center: { x: 6, y: 0 }, radius: 5 })
    expect(pts).toHaveLength(2)
  })
  it('returns empty for non-intersecting circles', () => {
    const pts = circleCircleIntersection({ center: { x: 0, y: 0 }, radius: 5 }, { center: { x: 20, y: 0 }, radius: 5 })
    expect(pts).toHaveLength(0)
  })
  it('returns empty for concentric circles', () => {
    const pts = circleCircleIntersection({ center: { x: 0, y: 0 }, radius: 5 }, { center: { x: 0, y: 0 }, radius: 10 })
    expect(pts).toHaveLength(0)
  })
})

describe('circleLineIntersection', () => {
  it('returns two points for line through circle', () => {
    const pts = circleLineIntersection({ x: 0, y: 0 }, 5, { x: -10, y: 3 }, { x: 10, y: 3 })
    expect(pts).toHaveLength(2)
    expect(pts[0]!.x).toBeCloseTo(4); expect(pts[0]!.y).toBeCloseTo(3)
    expect(pts[1]!.x).toBeCloseTo(-4); expect(pts[1]!.y).toBeCloseTo(3)
  })
  it('returns one tangent point', () => {
    const pts = circleLineIntersection({ x: 0, y: 0 }, 5, { x: -10, y: 5 }, { x: 10, y: 5 })
    expect(pts).toHaveLength(1)
    expect(pts[0]!.x).toBeCloseTo(0); expect(pts[0]!.y).toBeCloseTo(5)
  })
  it('returns empty for non-intersecting line', () => {
    const pts = circleLineIntersection({ x: 0, y: 0 }, 5, { x: -10, y: 6 }, { x: 10, y: 6 })
    expect(pts).toHaveLength(0)
  })
})

describe('calculateFillet', () => {
  it('returns a valid fillet for a 90-degree corner', () => {
    const r = calculateFillet({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, 5)
    expect(r).not.toBeNull()
    expect(r!.radius).toBe(5)
    expect(r!.tangentA).toBeDefined()
    expect(r!.tangentB).toBeDefined()
  })
  it('returns null when radius is too large', () => {
    const r = calculateFillet({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, 100)
    expect(r).toBeNull()
  })
  it('returns null for parallel lines', () => {
    const r = calculateFillet({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, 5)
    expect(r).toBeNull()
  })
})

describe('findNearestElementSegment', () => {
  it('finds nearest edge of a line element', () => {
    const r = findNearestElementSegment({ x: 5, y: 1 }, [{ id: 'l1', type: 'line', data: { start: [0, 0], end: [10, 0], color: '#000', size: 1 } }])
    expect(r?.element.id).toBe('l1')
    expect(r?.segmentIndex).toBe(0)
    expect(r?.distance).toBeCloseTo(1)
  })
  it('handles circle elements with segmentIndex -1', () => {
    const r = findNearestElementSegment({ x: 10, y: 0 }, [{ id: 'c1', type: 'circle', data: { cx: 0, cy: 0, radius: 5, stroke: '#000', strokeWidth: 1 } }])
    expect(r?.element.id).toBe('c1')
    expect(r?.segmentIndex).toBe(-1)
  })
  it('excludes elements by id', () => {
    const r = findNearestElementSegment({ x: 5, y: 1 }, [
      { id: 'l1', type: 'line', data: { start: [0, 0], end: [10, 0] } },
      { id: 'l2', type: 'line', data: { start: [0, 10], end: [10, 10] } },
    ], ['l1'])
    expect(r?.element.id).toBe('l2')
  })
})

describe('signedArea', () => {
  it('returns positive for counter-clockwise winding', () => {
    expect(signedArea([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBeGreaterThan(0)
  })
  it('returns negative for clockwise winding', () => {
    expect(signedArea([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }])).toBeLessThan(0)
  })
})

describe('revisionCloudPath', () => {
  it('produces points for 2 points (open)', () => {
    const path = revisionCloudPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], 50, false)
    expect(path.length).toBeGreaterThan(0)
    expect(path.length % 2).toBe(0)
  })
  it('produces points for 3+ points closed', () => {
    const path = revisionCloudPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }], 80, true)
    expect(path.length).toBeGreaterThan(0)
    expect(path.length % 2).toBe(0)
  })
  it('produces points for 3+ points open', () => {
    const path = revisionCloudPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }], 80, false)
    expect(path.length).toBeGreaterThan(0)
    expect(path.length % 2).toBe(0)
  })
})

describe('arcToPolylinePoints', () => {
  it('converts a semicircle to polyline points', () => {
    const pts = arcToPolylinePoints([10, 0], [0, 10], [-10, 0])
    expect(pts.length).toBeGreaterThan(2)
    expect(pts[0]).toEqual({ x: 10, y: 0 })
    expect(pts[pts.length - 1]!.x).toBeCloseTo(-10)
    expect(pts[pts.length - 1]!.y).toBeCloseTo(0)
  })
  it('returns start/end for collinear points', () => {
    const pts = arcToPolylinePoints([0, 0], [5, 0], [10, 0])
    expect(pts).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }])
  })
})

describe('transformElement', () => {
  const makeId = () => 'new-id'
  const tp = (p: Point) => mirrorPoint(p, { x: 0, y: 0 }, { x: 1, y: 0 })

  it('mirrors a line element', () => {
    const el = {
      id: 'l1', type: 'line', userId: '', userName: '', timestamp: 0,
      data: { start: [0, 1] as [number, number], end: [2, 3] as [number, number], color: '#000', size: 1 },
    }
    const r = transformElement(el as any, tp, makeId)
    expect((r as any)?.data.start).toEqual([0, -1])
    expect((r as any)?.data.end).toEqual([2, -3])
  })

  it('rotates a circle (radius unchanged)', () => {
    const r = transformElement(
      { id: 'c1', type: 'circle', userId: '', userName: '', timestamp: 0, data: { cx: 10, cy: 0, radius: 5, stroke: '#000', strokeWidth: 1 } } as any,
      (p) => rotatePointAroundOrigin(p, { x: 0, y: 0 }, Math.PI / 2),
      makeId,
    )
    expect((r as any)?.data.cx).toBeCloseTo(0)
    expect((r as any)?.data.cy).toBeCloseTo(10)
    expect((r as any)?.data.radius).toBe(5)
  })

  it('converts rotated rectangle to polyline for non-right-angle', () => {
    const r = transformElement(
      { id: 'r1', type: 'rectangle', userId: '', userName: '', timestamp: 0, data: { x: 0, y: 0, width: 100, height: 50, stroke: '#000', strokeWidth: 1 } } as any,
      (p) => rotatePointAroundOrigin(p, { x: 0, y: 0 }, Math.PI / 4),
      makeId,
      { rotationDelta: Math.PI / 4 },
    )
    expect(r?.type).toBe('polyline')
    const pd = r as any
    expect(pd.data.points).toHaveLength(4)
    expect(pd.data.closed).toBe(true)
  })

  it('preserves rectangle type on right-angle rotation', () => {
    const r = transformElement(
      { id: 'r2', type: 'rectangle', userId: '', userName: '', timestamp: 0, data: { x: 10, y: 20, width: 30, height: 40, stroke: '#000', strokeWidth: 1 } } as any,
      (p) => scalePointFromOrigin(p, { x: 0, y: 0 }, 2),
      makeId,
    )
    expect(r?.type).toBe('rectangle')
    const rd = r as any
    expect(rd.data.x).toBe(20); expect(rd.data.y).toBe(40)
    expect(rd.data.width).toBe(60); expect(rd.data.height).toBe(80)
  })

  it('returns null for unsupported types', () => {
    expect(transformElement(
      { id: 't1', type: 'text', userId: '', userName: '', timestamp: 0, data: { text: 'hello', x: 0, y: 0, fontSize: 16, color: '#000', fontFamily: 'Arial' } } as any,
      (p) => p,
      makeId,
    )).toBeNull()
  })
})

describe('getElementGeometry (additional types)', () => {
  it('returns circle geometry with center and radius', () => {
    const g = getElementGeometry({ type: 'circle', data: { cx: 10, cy: 20, radius: 30, stroke: '#000', strokeWidth: 1 } })
    expect(g?.type).toBe('circle')
    expect(g?.circle).toEqual({ center: { x: 10, y: 20 }, radius: 30 })
  })
  it('returns a single segment for an arrow', () => {
    const g = getElementGeometry({ type: 'arrow', data: { points: [[0, 0], [10, 10]], pointerLength: 10, pointerWidth: 5, stroke: '#000', strokeWidth: 1, fill: '#000' } })
    expect(g?.type).toBe('line')
    expect(g?.segments).toHaveLength(1)
  })
  it('returns polyline segments for a stroke', () => {
    const g = getElementGeometry({ type: 'stroke', data: { points: [[0, 0, 0.5], [10, 10, 0.8], [20, 5, 0.6]], color: '#000', size: 2, tool: 'pen', smooth: false } })
    expect(g?.type).toBe('polyline')
    expect(g?.segments).toHaveLength(2)
  })
  it('returns arc geometry with sampled segments', () => {
    const g = getElementGeometry({ type: 'arc', data: { start: [0, 0], through: [10, 10], end: [20, 0], color: '#000', size: 2 } })
    expect(g?.type).toBe('arc')
    expect(g?.segments!.length).toBeGreaterThan(1)
  })
  it('returns ellipse as polyline with 48 segments', () => {
    const g = getElementGeometry({ type: 'ellipse', data: { x: 50, y: 50, radiusX: 30, radiusY: 20, rotation: 0, stroke: '#000', strokeWidth: 1 } })
    expect(g?.type).toBe('polyline')
    expect(g?.segments).toHaveLength(48)
  })
  it('returns fillet-arc with sampled segments', () => {
    const g = getElementGeometry({ type: 'fillet-arc', data: { center: [0, 0], radius: 10, startAngle: 0, endAngle: Math.PI, color: '#000', size: 1 } })
    expect(g?.type).toBe('arc')
    expect(g?.segments!.length).toBeGreaterThan(1)
  })
  it('returns a single segment for a dimension', () => {
    const g = getElementGeometry({ type: 'dimension', data: { start: [0, 0], end: [100, 50], offset: 20, pixelsPerInch: 96, unit: 'inches', precision: 2, style: 'linear', color: '#000', size: 1 } })
    expect(g?.type).toBe('line')
    expect(g?.segments).toHaveLength(1)
  })
  it('returns polyline segments for an open revision-cloud', () => {
    const g = getElementGeometry({ type: 'revision-cloud', data: { points: [[0, 0], [50, 0], [50, 50], [0, 50]], arcLength: 24, color: '#000', size: 2, closed: false } })
    expect(g?.type).toBe('polyline')
    expect(g?.segments).toHaveLength(3)
  })
  it('returns polyline segments for a closed revision-cloud', () => {
    const g = getElementGeometry({ type: 'revision-cloud', data: { points: [[0, 0], [50, 0], [50, 50], [0, 50]], arcLength: 24, color: '#000', size: 2, closed: true } })
    expect(g?.type).toBe('polyline')
    expect(g?.segments).toHaveLength(4)
  })
})
