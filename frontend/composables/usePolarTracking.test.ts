import { describe, expect, it } from 'vitest'
import { usePolarTracking } from './usePolarTracking'

describe('usePolarTracking', () => {
  it('constrainPoint snaps to nearest polar increment (45°)', () => {
    const polar = usePolarTracking({ enabled: true, threshold: 10 })
    const result = polar.constrainPoint({ x: 0, y: 0 }, { x: 100, y: -99 })
    expect(result.snapped).toBe(true)
    expect(result.angle).toBe(45)
  })

  it('constrainPoint snaps to horizontal (0°)', () => {
    const polar = usePolarTracking({ enabled: true, threshold: 5 })
    const result = polar.constrainPoint({ x: 0, y: 0 }, { x: 100, y: -3 })
    expect(result.snapped).toBe(true)
    expect(result.angle).toBe(0)
  })

  it('constrainPoint returns snapped=false when cursor is far from any tracked angle', () => {
    const polar = usePolarTracking({ enabled: true, threshold: 5 })
    const result = polar.constrainPoint({ x: 0, y: 0 }, { x: 100, y: -57 })
    expect(result.snapped).toBe(false)
    expect(result.point).toEqual({ x: 100, y: -57 })
  })

  it('toggle flips isPolarEnabled', () => {
    const polar = usePolarTracking({ enabled: false })
    expect(polar.isPolarEnabled.value).toBe(false)
    polar.toggle()
    expect(polar.isPolarEnabled.value).toBe(true)
    polar.toggle()
    expect(polar.isPolarEnabled.value).toBe(false)
  })

  it('setAngles updates tracked angles', () => {
    const polar = usePolarTracking()
    polar.setAngles([0, 90, 180, 270])
    expect(polar.trackedAngles.value).toEqual([0, 90, 180, 270])
  })
})
