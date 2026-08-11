import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { useScale } from './useScale'
import type { ScaleState } from '~/types'

describe('useScale', () => {
  function setup(documentId?: string) {
    const ydoc = new Y.Doc()
    const yMeta = ydoc.getMap('meta')
    return { ydoc, yMeta, scale: useScale({ yMeta, ydoc, userId: 'user-a', documentId }) }
  }

  it('has default display format and pixels per inch when no scale is set', () => {
    const { scale } = setup()
    expect(scale.displayFormat.value).toBe('No scale set')
    expect(scale.pixelsPerInch.value).toBe(96)
    expect(scale.currentScale.value).toBeNull()
  })

  it('getScale returns null when nothing is stored', () => {
    const { scale } = setup()
    expect(scale.getScale()).toBeNull()
  })

  it('setScale with feet stores a feet-based scale state', () => {
    const { ydoc, yMeta, scale } = setup()
    scale.setScale(1, 'inches', 10, 'feet')
    const stored = yMeta.get('scale') as ScaleState
    expect(stored.unit).toBe('feet')
    expect(stored.label).toBe('1" = 10\'')
    // 1 drawing inch = 10 feet = 120 real inches => ppi = 96/120 = 0.8
    expect(stored.pixelsPerInch).toBeCloseTo(0.8)
    expect(stored.lastUpdatedBy).toBe('user-a')
    expect(stored.timestamp).toBeGreaterThan(0)
    expect(scale.currentScale.value).toEqual(stored)
    expect(ydoc.transact).toBeDefined()
  })

  it('setScale with inches stores an inches-based scale state', () => {
    const { yMeta, scale } = setup()
    scale.setScale(2, 'inches', 4, 'inches')
    const stored = yMeta.get('scale') as ScaleState
    expect(stored.unit).toBe('inches')
    expect(stored.label).toBe('1" = 4"')
    // 2 drawing inches = 4 real inches => ppi = (96*2)/4 = 48
    expect(stored.pixelsPerInch).toBeCloseTo(48)
  })

  it('getScale returns the stored scale and refreshes currentScale', () => {
    const { yMeta, scale } = setup()
    scale.setScale(1, 'inches', 10, 'feet')
    const fetched = scale.getScale()
    expect(fetched).not.toBeNull()
    expect(fetched!.label).toBe('1" = 10\'')
    expect(scale.currentScale.value).toEqual(fetched)
    // ydoc.transact is called lazily; getScale after set should reflect storage
    expect(scale.pixelsPerInch.value).toBeCloseTo(0.8)
  })

  it('displayFormat reflects the current scale label', () => {
    const { scale } = setup()
    scale.setScale(1, 'inches', 5, 'feet')
    expect(scale.displayFormat.value).toBe('1" = 5\'')
  })

  it('pixelsToInches uses the scale ppi when set, else standard 96', () => {
    const { scale } = setup()
    // No scale => pixels / 96
    expect(scale.pixelsToInches(96)).toBe(1)
    scale.setScale(1, 'inches', 10, 'feet') // ppi = 0.8
    expect(scale.pixelsToInches(0.8)).toBeCloseTo(1)
    expect(scale.pixelsToInches(96)).toBeCloseTo(120)
  })

  it('inchesToFeet converts inches to feet', () => {
    const { scale } = setup()
    expect(scale.inchesToFeet(120)).toBe(10)
    expect(scale.inchesToFeet(0)).toBe(0)
  })

  it('formatMeasurement rounds to the requested precision with inch suffix', () => {
    const { scale } = setup()
    expect(scale.formatMeasurement(126.51234)).toBe('126.5123"')
    expect(scale.formatMeasurement(126.51234, 2)).toBe('126.51"')
    expect(scale.formatMeasurement(12)).toBe('12"')
  })

  it('formatFeetAndInches splits into feet and remaining inches', () => {
    const { scale } = setup()
    expect(scale.formatFeetAndInches(126.5)).toBe('10\' 6.5"')
    expect(scale.formatFeetAndInches(12)).toBe('1\' 0.0"')
    expect(scale.formatFeetAndInches(6)).toBe('0\' 6.0"')
  })

  it('formatScaledMeasurement switches on the stored unit', () => {
    const { scale } = setup()
    // No scale => inches display
    expect(scale.formatScaledMeasurement(96)).toBe('1"')
    scale.setScale(1, 'inches', 10, 'feet') // feet unit, ppi 0.8
    // 96px => 120 inches => 10' 0.0"
    expect(scale.formatScaledMeasurement(96)).toBe('10\' 0.0"')
  })

  it('observeScale fires on remote updates and ignores own updates', () => {
    const { yMeta, scale } = setup()
    const callback = vi.fn()
    scale.observeScale(callback)

    // Own update (same userId) => not called
    scale.setScale(1, 'inches', 10, 'feet')
    expect(callback).not.toHaveBeenCalled()

    // Remote update (different userId) => called
    const remote: ScaleState = {
      pixelsPerInch: 48,
      unit: 'inches',
      label: '1" = 2"',
      lastUpdatedBy: 'user-b',
      timestamp: Date.now(),
    }
    yMeta.set('scale', remote)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(remote)
    expect(scale.currentScale.value).toEqual(remote)

    // Non-scale key changes are ignored
    yMeta.set('other', { foo: 'bar' })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('observeScale cleanup stops future callbacks', () => {
    const { yMeta, scale } = setup()
    const callback = vi.fn()
    const cleanup = scale.observeScale(callback)
    cleanup()
    yMeta.set('scale', {
      pixelsPerInch: 48,
      unit: 'inches',
      label: 'x',
      lastUpdatedBy: 'user-b',
      timestamp: 1,
    } as ScaleState)
    expect(callback).not.toHaveBeenCalled()
  })

  it('per-document scale key is used when documentId is provided', () => {
    const { yMeta, scale } = setup('doc-1')
    scale.setScale(1, 'inches', 10, 'feet')
    expect(yMeta.get('scale:doc-1')).not.toBeNull()
    expect(yMeta.get('scale')).toBeUndefined()
    // Default-instance scale remains independent
    const other = setup()
    expect(other.scale.getScale()).toBeNull()
  })

  it('init reloads the scale from storage', () => {
    const ydoc = new Y.Doc()
    const yMeta = ydoc.getMap('meta')
    const first = useScale({ yMeta, ydoc, userId: 'user-a' })
    expect(first.displayFormat.value).toBe('No scale set')

    // A second instance on the same map loads the scale on creation
    const second = useScale({ yMeta, ydoc, userId: 'user-b' })
    second.setScale(1, 'inches', 10, 'feet')

    // first's displayFormat stays stale until init() re-reads storage
    expect(first.displayFormat.value).toBe('No scale set')
    first.init()
    expect(first.displayFormat.value).toBe('1" = 10\'')
    expect(first.currentScale.value?.lastUpdatedBy).toBe('user-b')
  })
})
