import { describe, expect, it } from 'vitest'
import { useSnapping } from './useSnapping'

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
    const element = {
      id: 'el-1',
      type: 'line' as const,
      userId: 'u1',
      userName: 'U1',
      timestamp: 0,
      data: {
        start: [100, 100] as [number, number],
        end: [200, 200] as [number, number],
        color: '#000',
        size: 2,
      },
    }
    const result = snap.findSnapPoint({ x: 101, y: 101 }, [element])
    expect(result).not.toBeNull()
    expect(result!.x).toBe(100)
    expect(result!.y).toBe(100)
    expect(result!.type).toBe('endpoint')
  })

  it('findSnapPoint returns null when cursor is far from any point', () => {
    const snap = useSnapping({ threshold: 10 })
    const element = {
      id: 'el-1',
      type: 'line' as const,
      userId: 'u1',
      userName: 'U1',
      timestamp: 0,
      data: {
        start: [100, 100] as [number, number],
        end: [200, 200] as [number, number],
        color: '#000',
        size: 2,
      },
    }
    const result = snap.findSnapPoint({ x: 999, y: 999 }, [element])
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
    const element = {
      id: 'el-1',
      type: 'line' as const,
      userId: 'u1',
      userName: 'U1',
      timestamp: 0,
      data: {
        start: [100, 100] as [number, number],
        end: [200, 200] as [number, number],
        color: '#000',
        size: 2,
      },
    }
    expect(snap.findSnapPoint({ x: 101, y: 101 }, [element])).toBeNull()
  })

  it('getElementSnapPoints returns endpoints and midpoint for a line', () => {
    const snap = useSnapping()
    const el = {
      id: 'l1',
      type: 'line' as const,
      userId: 'u1',
      userName: 'U1',
      timestamp: 0,
      data: {
        start: [10, 20] as [number, number],
        end: [30, 40] as [number, number],
        color: '#000',
        size: 2,
      },
    }
    const points = snap.getElementSnapPoints(el)
    expect(points).toHaveLength(3)
    expect(points[0]).toMatchObject({ x: 10, y: 20, type: 'endpoint' })
    expect(points[1]).toMatchObject({ x: 30, y: 40, type: 'endpoint' })
    expect(points[2]).toMatchObject({ type: 'midpoint' })
  })
})
