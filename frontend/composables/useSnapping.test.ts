import { describe, expect, it, vi } from 'vitest'
import { useSnapping } from './useSnapping'
import type { CanvasElement } from '~/types'

function lineEl(over: Partial<Record<string, any>> = {}): CanvasElement {
  return {
    id: 'el-1',
    type: 'line',
    userId: 'u1',
    userName: 'U1',
    timestamp: 0,
    data: {
      start: [100, 100],
      end: [200, 200],
      color: '#000',
      size: 2,
    },
    ...over,
  } as unknown as CanvasElement
}

describe('useSnapping', () => {
  it('returns expected interface', () => {
    const snap = useSnapping()
    expect(snap).toHaveProperty('findSnapPoint')
    expect(snap).toHaveProperty('snapEnabled')
    expect(snap).toHaveProperty('toggleSnap')
    expect(snap).toHaveProperty('getElementSnapPoints')
    expect(snap).toHaveProperty('isNearSnapPoint')
  })

  it('findSnapPoint finds endpoint of a line element', () => {
    const snap = useSnapping({ threshold: 10 })
    const element = lineEl()
    const result = snap.findSnapPoint({ x: 101, y: 101 }, [element])
    expect(result).not.toBeNull()
    expect(result!.x).toBe(100)
    expect(result!.y).toBe(100)
    expect(result!.type).toBe('endpoint')
  })

  it('findSnapPoint returns null when cursor is far from any point', () => {
    const snap = useSnapping({ threshold: 10 })
    const result = snap.findSnapPoint({ x: 999, y: 999 }, [lineEl()])
    expect(result).toBeNull()
  })

  it('toggleSnap toggles snapEnabled', () => {
    const snap = useSnapping()
    expect(snap.snapEnabled.value).toBe(true)
    snap.toggleSnap()
    expect(snap.snapEnabled.value).toBe(false)
    snap.toggleSnap()
    expect(snap.snapEnabled.value).toBe(true)
  })

  it('findSnapPoint returns null when snapEnabled is false', () => {
    const snap = useSnapping()
    snap.toggleSnap()
    expect(snap.findSnapPoint({ x: 101, y: 101 }, [lineEl()])).toBeNull()
  })

  it('getElementSnapPoints returns endpoints and midpoint for a line', () => {
    const snap = useSnapping()
    const points = snap.getElementSnapPoints(lineEl())
    expect(points).toHaveLength(3)
    expect(points[0]).toMatchObject({ x: 100, y: 100, type: 'endpoint' })
    expect(points[1]).toMatchObject({ x: 200, y: 200, type: 'endpoint' })
    expect(points[2]).toMatchObject({ type: 'midpoint' })
  })

  it('getElementSnapPoints returns empty for non-line elements', () => {
    const snap = useSnapping()
    const textEl = {
      id: 't1',
      type: 'text',
      userId: 'u1',
      userName: 'U1',
      timestamp: 0,
      data: { text: 'hi', color: '#000', size: 12, x: 0, y: 0 },
    } as unknown as CanvasElement
    expect(snap.getElementSnapPoints(textEl)).toEqual([])
  })

  describe('getElementSnapPoints per type', () => {
    const snap = useSnapping()

    it('rectangle: 4 corners + 4 edge midpoints + center', () => {
      const el = {
        id: 'r1',
        type: 'rectangle',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { x: 0, y: 0, width: 100, height: 50, stroke: '#000', strokeWidth: 2 },
      } as unknown as CanvasElement
      const points = snap.getElementSnapPoints(el)
      expect(points).toHaveLength(9)
      expect(points).toContainEqual(expect.objectContaining({ x: 0, y: 0, type: 'corner' }))
      expect(points).toContainEqual(expect.objectContaining({ x: 100, y: 0, type: 'corner' }))
      expect(points).toContainEqual(expect.objectContaining({ x: 0, y: 50, type: 'corner' }))
      expect(points).toContainEqual(expect.objectContaining({ x: 100, y: 50, type: 'corner' }))
      expect(points).toContainEqual(expect.objectContaining({ x: 50, y: 0, type: 'midpoint' }))
      expect(points).toContainEqual(expect.objectContaining({ x: 50, y: 50, type: 'midpoint' }))
      expect(points).toContainEqual(expect.objectContaining({ x: 0, y: 25, type: 'midpoint' }))
      expect(points).toContainEqual(expect.objectContaining({ x: 100, y: 25, type: 'midpoint' }))
      expect(points).toContainEqual(expect.objectContaining({ x: 50, y: 25, type: 'center' }))
    })

    it('circle: center + 4 cardinal endpoints when radius > 0', () => {
      const el = {
        id: 'c1',
        type: 'circle',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { cx: 10, cy: 20, radius: 30, stroke: '#000', strokeWidth: 2 },
      } as unknown as CanvasElement
      const points = snap.getElementSnapPoints(el)
      expect(points).toHaveLength(5)
      expect(points[0]).toMatchObject({ x: 10, y: 20, type: 'center' })
      expect(points).toContainEqual(expect.objectContaining({ x: 40, y: 20, type: 'endpoint' }))
      expect(points).toContainEqual(expect.objectContaining({ x: -20, y: 20, type: 'endpoint' }))
      expect(points).toContainEqual(expect.objectContaining({ x: 10, y: 50, type: 'endpoint' }))
      expect(points).toContainEqual(expect.objectContaining({ x: 10, y: -10, type: 'endpoint' }))
    })

    it('circle with radius 0: center only (no cardinal points)', () => {
      const el = {
        id: 'c2',
        type: 'circle',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { cx: 5, cy: 6, radius: 0, stroke: '#000', strokeWidth: 2 },
      } as unknown as CanvasElement
      const points = snap.getElementSnapPoints(el)
      expect(points).toEqual([{ x: 5, y: 6, type: 'center', elementId: 'c2' }])
    })

    it('ellipse: center only', () => {
      const el = {
        id: 'e1',
        type: 'ellipse',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { x: 3, y: 4, radiusX: 10, radiusY: 5, rotation: 0, stroke: '#000', strokeWidth: 2 },
      } as unknown as CanvasElement
      expect(snap.getElementSnapPoints(el)).toEqual([{ x: 3, y: 4, type: 'center', elementId: 'e1' }])
    })

    it('stroke: first + last point endpoints', () => {
      const el = {
        id: 's1',
        type: 'stroke',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { points: [[0, 0, 1], [5, 5, 1], [10, 0, 1]], color: '#000', size: 2, tool: 'pen', smooth: true },
      } as unknown as CanvasElement
      const points = snap.getElementSnapPoints(el)
      expect(points).toEqual([
        { x: 0, y: 0, type: 'endpoint', elementId: 's1' },
        { x: 10, y: 0, type: 'endpoint', elementId: 's1' },
      ])
    })

    it('stroke with no points: empty', () => {
      const el = {
        id: 's2',
        type: 'stroke',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { points: [], color: '#000', size: 2, tool: 'pen', smooth: true },
      } as unknown as CanvasElement
      expect(snap.getElementSnapPoints(el)).toEqual([])
    })

    it('polyline: endpoints + segment midpoints, plus closing midpoint when closed', () => {
      const el = {
        id: 'p1',
        type: 'polyline',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { points: [[0, 0], [10, 0], [10, 10]], color: '#000', size: 2, closed: false },
      } as unknown as CanvasElement
      const open = snap.getElementSnapPoints(el)
      expect(open).toHaveLength(5)
      expect(open).toContainEqual(expect.objectContaining({ x: 5, y: 0, type: 'midpoint' }))
      expect(open).toContainEqual(expect.objectContaining({ x: 10, y: 5, type: 'midpoint' }))
      expect(open.some(p => p.x === 5 && p.y === 5)).toBe(false)

      const closedEl = {
        ...el,
        data: { ...el.data, closed: true },
      }
      const closed = snap.getElementSnapPoints(closedEl as unknown as CanvasElement)
      expect(closed).toHaveLength(6)
      expect(closed).toContainEqual(expect.objectContaining({ x: 5, y: 5, type: 'midpoint' }))
    })

    it('polyline with no points: empty', () => {
      const el = {
        id: 'p2',
        type: 'polyline',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { points: [], color: '#000', size: 2, closed: false },
      } as unknown as CanvasElement
      expect(snap.getElementSnapPoints(el)).toEqual([])
    })

    it('arc: start + through + end', () => {
      const el = {
        id: 'a1',
        type: 'arc',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { start: [0, 0], through: [5, 5], end: [10, 0], color: '#000', size: 2 },
      } as unknown as CanvasElement
      const points = snap.getElementSnapPoints(el)
      expect(points).toEqual([
        { x: 0, y: 0, type: 'endpoint', elementId: 'a1' },
        { x: 10, y: 0, type: 'endpoint', elementId: 'a1' },
        { x: 5, y: 5, type: 'midpoint', elementId: 'a1' },
      ])
    })

    it('fillet-arc: start/end from angle math + center', () => {
      const el = {
        id: 'f1',
        type: 'fillet-arc',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { center: [5, 5], radius: 10, startAngle: 0, endAngle: Math.PI / 2, color: '#000', size: 2 },
      } as unknown as CanvasElement
      const points = snap.getElementSnapPoints(el)
      expect(points).toHaveLength(3)
      expect(points[0]!.x).toBeCloseTo(15)
      expect(points[0]!.y).toBeCloseTo(5)
      expect(points[1]!.x).toBeCloseTo(5)
      expect(points[1]!.y).toBeCloseTo(15)
      expect(points[2]).toMatchObject({ x: 5, y: 5, type: 'center' })
    })

    it('dimension: start + end endpoints', () => {
      const el = {
        id: 'd1',
        type: 'dimension',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { start: [1, 2], end: [3, 4], offset: 10, pixelsPerInch: 96, unit: 'inches', precision: 1, style: 'linear', color: '#000', size: 2 },
      } as unknown as CanvasElement
      const points = snap.getElementSnapPoints(el)
      expect(points).toEqual([
        { x: 1, y: 2, type: 'endpoint', elementId: 'd1' },
        { x: 3, y: 4, type: 'endpoint', elementId: 'd1' },
      ])
    })

    it('revision-cloud: each vertex as endpoint', () => {
      const el = {
        id: 'rc1',
        type: 'revision-cloud',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { points: [[0, 0], [10, 0], [10, 10]], arcLength: 5, color: '#000', size: 2, closed: true },
      } as unknown as CanvasElement
      const points = snap.getElementSnapPoints(el)
      expect(points).toHaveLength(3)
      expect(points[0]).toMatchObject({ x: 0, y: 0, type: 'endpoint' })
      expect(points[2]).toMatchObject({ x: 10, y: 10, type: 'endpoint' })
    })

    it('revision-cloud with no points: empty', () => {
      const el = {
        id: 'rc2',
        type: 'revision-cloud',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { points: [], arcLength: 5, color: '#000', size: 2, closed: true },
      } as unknown as CanvasElement
      expect(snap.getElementSnapPoints(el)).toEqual([])
    })
  })

  describe('enhanced snaps (perpendicular / tangent / nearest)', () => {
    it('finds the perpendicular foot on a line segment', () => {
      const snap = useSnapping({ threshold: 10 })
      const el = {
        id: 'l1',
        type: 'line',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { start: [0, 0], end: [100, 0], color: '#000', size: 2 },
      } as unknown as CanvasElement
      // Cursor sits 8px above a non-special point on the line; no standard snap
      // point is within threshold, so the second (perpendicular) pass wins.
      const result = snap.findSnapPoint({ x: 70, y: 8 }, [el])
      expect(result).not.toBeNull()
      expect(result!.type).toBe('perpendicular')
      expect(result!.x).toBeCloseTo(70)
      expect(result!.y).toBeCloseTo(0)
    })

    it('finds the perpendicular foot on a rectangle edge', () => {
      const snap = useSnapping({ threshold: 10 })
      const el = {
        id: 'r1',
        type: 'rectangle',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { x: 0, y: 0, width: 100, height: 50, stroke: '#000', strokeWidth: 2 },
      } as unknown as CanvasElement
      const result = snap.findSnapPoint({ x: 100, y: 40 }, [el])
      expect(result).not.toBeNull()
      expect(result!.type).toBe('perpendicular')
      expect(result!.x).toBeCloseTo(100)
      expect(result!.y).toBeCloseTo(40)
    })

    it('finds the perpendicular foot on a stroke segment', () => {
      const snap = useSnapping({ threshold: 10 })
      const el = {
        id: 's1',
        type: 'stroke',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { points: [[0, 0, 1], [100, 0, 1]], color: '#000', size: 2, tool: 'pen', smooth: true },
      } as unknown as CanvasElement
      const result = snap.findSnapPoint({ x: 70, y: 8 }, [el])
      expect(result).not.toBeNull()
      expect(result!.type).toBe('perpendicular')
      expect(result!.x).toBeCloseTo(70)
      expect(result!.y).toBeCloseTo(0)
    })

    it('finds the perpendicular foot on a polyline segment', () => {
      const snap = useSnapping({ threshold: 10 })
      const el = {
        id: 'p1',
        type: 'polyline',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { points: [[0, 0], [100, 0]], color: '#000', size: 2, closed: false },
      } as unknown as CanvasElement
      const result = snap.findSnapPoint({ x: 70, y: 8 }, [el])
      expect(result).not.toBeNull()
      expect(result!.type).toBe('perpendicular')
      expect(result!.x).toBeCloseTo(70)
      expect(result!.y).toBeCloseTo(0)
    })

    it('falls through to tangent snap for a circle when cursor is near a tangent point', () => {
      const snap = useSnapping({ threshold: 10 })
      const el = {
        id: 'c1',
        type: 'circle',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { cx: 100, cy: 100, radius: 50, stroke: '#000', strokeWidth: 2 },
      } as unknown as CanvasElement
      // Cursor sits 5px off the circle along the tangent line at the 30° point:
      // the nearest tangent point lands ~4.5px away, well inside threshold.
      const theta = Math.PI / 6
      const tx = 100 + 50 * Math.cos(theta)
      const ty = 100 + 50 * Math.sin(theta)
      const cx = tx - 5 * Math.sin(theta)
      const cy = ty + 5 * Math.cos(theta)
      const result = snap.findSnapPoint({ x: cx, y: cy }, [el])
      expect(result).not.toBeNull()
      expect(result!.type).toBe('tangent')
      expect(result!.elementId).toBe('c1')
      // Tangent points lie on the circle boundary.
      const distToCenter = Math.hypot(result!.x - 100, result!.y - 100)
      expect(distToCenter).toBeCloseTo(50, 0)
    })

    it('falls through to nearest snap for a circle boundary point', () => {
      const snap = useSnapping({ threshold: 10 })
      const el = {
        id: 'c2',
        type: 'circle',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { cx: 100, cy: 100, radius: 50, stroke: '#000', strokeWidth: 2 },
      } as unknown as CanvasElement
      // Cursor sits just inside the circle at the 45° boundary direction — not
      // a cardinal point, and d < radius so tangentPoints returns [] (tangent
      // pass fails) → the nearest pass lands on the boundary ~1px away.
      const cursorX = 100 + 49 * Math.cos(Math.PI / 4)
      const cursorY = 100 + 49 * Math.sin(Math.PI / 4)
      const result = snap.findSnapPoint({ x: cursorX, y: cursorY }, [el])
      expect(result).not.toBeNull()
      expect(result!.type).toBe('nearest')
      expect(result!.elementId).toBe('c2')
      // Nearest point lies on the circle boundary.
      const distToCenter = Math.hypot(result!.x - 100, result!.y - 100)
      expect(distToCenter).toBeCloseTo(50, 0)
    })

    it('nearest snap handles a far line (closest point at endpoint, out of threshold)', () => {
      const snap = useSnapping({ threshold: 10 })
      const el = {
        id: 'l2',
        type: 'line',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { start: [0, 0], end: [100, 0], color: '#000', size: 2 },
      } as unknown as CanvasElement
      expect(snap.findSnapPoint({ x: 50, y: 50 }, [el])).toBeNull()
    })

    it('returns null when perpendicular foot falls outside the segment (beyond the end)', () => {
      const snap = useSnapping({ threshold: 10 })
      const el = {
        id: 'l3',
        type: 'line',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { start: [0, 0], end: [100, 0], color: '#000', size: 2 },
      } as unknown as CanvasElement
      // Cursor beyond the end of the segment (out of endpoint threshold): foot
      // is not on the segment, so perpendicular fails; nearest clamps to (100,0)
      // but is out of threshold.
      expect(snap.findSnapPoint({ x: 120, y: 0 }, [el])).toBeNull()
    })

    it('ignores zero-length segments in the perpendicular pass', () => {
      const snap = useSnapping({ threshold: 5 })
      const el = {
        id: 'l4',
        type: 'line',
        userId: 'u1',
        userName: 'U1',
        timestamp: 0,
        data: { start: [0, 0], end: [0, 0], color: '#000', size: 2 },
      } as unknown as CanvasElement
      // perpendicularFoot returns null for a zero-length segment; cursor is out
      // of threshold for the endpoint, so nothing snaps.
      expect(snap.findSnapPoint({ x: 5, y: 5 }, [el])).toBeNull()
    })

    it('isNearSnapPoint reflects whether a snap point exists', () => {
      const snap = useSnapping({ threshold: 10 })
      expect(snap.isNearSnapPoint({ x: 101, y: 101 }, [lineEl()])).toBe(true)
      expect(snap.isNearSnapPoint({ x: 999, y: 999 }, [lineEl()])).toBe(false)
    })

    it('findSnapPointThrottled resolves to a snap point after the throttle window', async () => {
      vi.useFakeTimers()
      const snap = useSnapping({ threshold: 10, throttleMs: 33 })
      const promise = snap.findSnapPointThrottled({ x: 101, y: 101 }, [lineEl()])
      vi.advanceTimersByTime(40)
      const result = await promise
      expect(result).not.toBeNull()
      expect(result!.type).toBe('endpoint')
      vi.useRealTimers()
    })
  })

  it('respects a custom threshold option', () => {
    const snap = useSnapping({ threshold: 1 })
    const horizontal = {
      id: 'h1',
      type: 'line',
      userId: 'u1',
      userName: 'U1',
      timestamp: 0,
      data: { start: [0, 0], end: [100, 0], color: '#000', size: 2 },
    } as unknown as CanvasElement
    expect(snap.threshold).toBe(1)
    expect(snap.findSnapPoint({ x: 50, y: 2 }, [horizontal])).toBeNull()
    expect(snap.findSnapPoint({ x: 50, y: 0.5 }, [horizontal])).not.toBeNull()
  })
})
