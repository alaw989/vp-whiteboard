import { describe, expect, it } from 'vitest'
import { useOrthoMode } from './useOrthoMode'

describe('useOrthoMode', () => {
  it('constrainPoint with ortho enabled snaps to horizontal when dx >= dy', () => {
    const ortho = useOrthoMode({ enabled: true })
    const result = ortho.constrainPoint({ x: 0, y: 0 }, { x: 100, y: 50 })
    expect(result).toEqual({ x: 100, y: 0 })
  })

  it('constrainPoint with ortho enabled snaps to vertical when dy > dx', () => {
    const ortho = useOrthoMode({ enabled: true })
    const result = ortho.constrainPoint({ x: 0, y: 0 }, { x: 30, y: 100 })
    expect(result).toEqual({ x: 0, y: 100 })
  })

  it('constrainPoint with ortho enabled on equal deltas snaps horizontal', () => {
    const ortho = useOrthoMode({ enabled: true })
    const result = ortho.constrainPoint({ x: 0, y: 0 }, { x: 50, y: 50 })
    expect(result).toEqual({ x: 50, y: 0 })
  })

  it('constrainPoint with ortho disabled passes through unchanged', () => {
    const ortho = useOrthoMode({ enabled: false })
    const result = ortho.constrainPoint({ x: 0, y: 0 }, { x: 100, y: 50 })
    expect(result).toEqual({ x: 100, y: 50 })
  })

  it('toggle flips isOrthoEnabled', () => {
    const ortho = useOrthoMode({ enabled: false })
    expect(ortho.isOrthoEnabled.value).toBe(false)
    ortho.toggle()
    expect(ortho.isOrthoEnabled.value).toBe(true)
    ortho.toggle()
    expect(ortho.isOrthoEnabled.value).toBe(false)
  })

  it('enable and disable work correctly', () => {
    const ortho = useOrthoMode({ enabled: false })
    ortho.enable()
    expect(ortho.isOrthoEnabled.value).toBe(true)
    ortho.disable()
    expect(ortho.isOrthoEnabled.value).toBe(false)
  })
})
