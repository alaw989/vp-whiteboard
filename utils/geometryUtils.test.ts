import { describe, expect, it } from 'vitest'
import {
  distance,
  getElementGeometry,
  nearestPointOnSegment,
  type LineSegment,
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
