import { describe, expect, it } from 'vitest'
import { useGrid } from './useGrid'

describe('useGrid', () => {
  const viewport = { x: 0, y: 0, zoom: 1 }

  it('snapToGrid snaps to grid intersection when gridSnap is enabled', () => {
    const grid = useGrid({ baseSpacing: 20 })
    grid.toggleGridSnap()
    const result = grid.snapToGrid({ x: 37, y: 52 }, viewport)
    expect(result).toEqual({ x: 40, y: 60 })
  })

  it('snapToGrid passes through when gridSnap is disabled', () => {
    const grid = useGrid()
    const result = grid.snapToGrid({ x: 37, y: 52 }, viewport)
    expect(result).toEqual({ x: 37, y: 52 })
  })

  it('toggleGrid flips gridEnabled', () => {
    const grid = useGrid()
    expect(grid.gridEnabled.value).toBe(true)
    grid.toggleGrid()
    expect(grid.gridEnabled.value).toBe(false)
    grid.toggleGrid()
    expect(grid.gridEnabled.value).toBe(true)
  })

  it('toggleGridSnap flips gridSnapEnabled', () => {
    const grid = useGrid()
    expect(grid.gridSnapEnabled.value).toBe(false)
    grid.toggleGridSnap()
    expect(grid.gridSnapEnabled.value).toBe(true)
    grid.toggleGridSnap()
    expect(grid.gridSnapEnabled.value).toBe(false)
  })

  it('getVisibleGridLines returns empty when grid is disabled', () => {
    const grid = useGrid()
    grid.toggleGrid()
    const lines = grid.getVisibleGridLines(viewport, 800, 600)
    expect(lines).toHaveLength(0)
  })

  it('getVisibleGridLines returns lines when grid is enabled', () => {
    const grid = useGrid({ baseSpacing: 20 })
    const lines = grid.getVisibleGridLines(viewport, 100, 100)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0]).toHaveProperty('type')
    expect(lines[0]).toHaveProperty('position')
  })
})
