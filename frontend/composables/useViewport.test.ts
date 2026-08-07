import { describe, expect, it } from 'vitest'
import { computePinchViewport } from './useViewport'

describe('computePinchViewport', () => {
  it('pans by the centroid delta when finger distance is unchanged', () => {
    const result = computePinchViewport({
      startViewport: { x: 0, y: 0, zoom: 1 },
      startCenter: { x: 100, y: 100 },
      startDistance: 50,
      currentCenter: { x: 150, y: 120 },
      currentDistance: 50,
    })
    expect(result).toEqual({ x: 50, y: 20, zoom: 1 })
  })

  it('pinches toward the centroid when the fingers spread apart', () => {
    const result = computePinchViewport({
      startViewport: { x: 0, y: 0, zoom: 1 },
      startCenter: { x: 100, y: 100 },
      startDistance: 50,
      currentCenter: { x: 100, y: 100 },
      currentDistance: 100,
    })
    // Content under the fixed centroid stays under it: viewport must move to
    // compensate for the doubled zoom.
    expect(result.zoom).toBe(2)
    expect(result.x).toBeCloseTo(-100)
    expect(result.y).toBeCloseTo(-100)
  })

  it('anchors the content under the centroid from a panned/zoomed start', () => {
    const result = computePinchViewport({
      startViewport: { x: 50, y: 30, zoom: 2 },
      startCenter: { x: 150, y: 70 },
      startDistance: 40,
      currentCenter: { x: 160, y: 80 },
      currentDistance: 60,
    })
    expect(result.zoom).toBeCloseTo(3)
    expect(result.x).toBeCloseTo(10)
    expect(result.y).toBeCloseTo(20)
  })

  it('clamps zoom to maxZoom', () => {
    const result = computePinchViewport({
      startViewport: { x: 0, y: 0, zoom: 1 },
      startCenter: { x: 100, y: 100 },
      startDistance: 10,
      currentCenter: { x: 100, y: 100 },
      currentDistance: 1000,
      maxZoom: 4,
    })
    expect(result.zoom).toBe(4)
  })

  it('falls back to pan-only when the start distance is zero', () => {
    const result = computePinchViewport({
      startViewport: { x: 0, y: 0, zoom: 1 },
      startCenter: { x: 100, y: 100 },
      startDistance: 0,
      currentCenter: { x: 130, y: 140 },
      currentDistance: 0,
    })
    expect(result.zoom).toBe(1)
    expect(result.x).toBeCloseTo(30)
    expect(result.y).toBeCloseTo(40)
  })
})
