import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { useLayers } from './useLayers'
import type { LayerDefinition } from '~/types'

describe('useLayers', () => {
  function setup() {
    const ydoc = new Y.Doc()
    const yMeta = ydoc.getMap('meta')
    const layers = useLayers(yMeta, ydoc, 'user-a')
    return { ydoc, yMeta, layers }
  }

  const storedLayer = (overrides: Partial<LayerDefinition>): LayerDefinition => ({
    id: 'l1',
    name: 'Layer 1',
    color: '#EF4444',
    visible: true,
    locked: false,
    order: 0,
    ...overrides,
  })

  it('observeLayers creates the default layer when nothing is stored', () => {
    const { yMeta, layers } = setup()
    const cleanup = layers.observeLayers()
    expect(layers.layers.value).toEqual([storedLayer({ id: 'default', name: 'Layer 0', color: '#3B82F6', order: 0 })])
    expect(layers.activeLayerId.value).toBe('default')
    expect(yMeta.get('layers')).toEqual(layers.layers.value)
    cleanup()
  })

  it('observeLayers loads stored layers and falls back to first when active is missing', () => {
    const { ydoc, yMeta, layers } = setup()
    yMeta.set('layers', [storedLayer({ id: 'l1', order: 0 }), storedLayer({ id: 'l2', order: 1 })])
    ydoc.transact(() => {}, 'user-a')
    layers.observeLayers()
    expect(layers.layers.value).toHaveLength(2)
    expect(layers.activeLayerId.value).toBe('l1')
  })

  it('addLayer appends a layer, assigns a palette color and makes it active', () => {
    const { yMeta, layers } = setup()
    layers.observeLayers()
    const layer = layers.addLayer()
    expect(layer.id).not.toBe('default')
    expect(layer.name).toBe('Layer 1')
    expect(layer.color).toBe('#EF4444')
    expect(layer.order).toBe(1)
    expect(layers.activeLayerId.value).toBe(layer.id)
    expect(layers.layers.value).toHaveLength(2)
    expect(yMeta.get('layers')).toEqual(layers.layers.value)
  })

  it('addLayer uses a custom name when provided', () => {
    const { layers } = setup()
    layers.observeLayers()
    const layer = layers.addLayer('Details')
    expect(layer.name).toBe('Details')
  })

  it('removeLayer refuses to remove the default layer', () => {
    const { yMeta, layers } = setup()
    layers.observeLayers()
    layers.removeLayer('default')
    expect(yMeta.get('layers')).toHaveLength(1)
  })

  it('removeLayer is a no-op for a nonexistent layer', () => {
    const { yMeta, layers } = setup()
    layers.observeLayers()
    layers.addLayer()
    layers.removeLayer('nope')
    expect(yMeta.get('layers')).toHaveLength(2)
  })

  it('removeLayer removes the layer and reassigns active when the active one was removed', () => {
    const { yMeta, layers } = setup()
    layers.observeLayers()
    const added = layers.addLayer()
    layers.removeLayer(added.id)
    expect(layers.layers.value).toHaveLength(1)
    expect(layers.activeLayerId.value).toBe('default')
    expect(yMeta.get('layers')).toHaveLength(1)
  })

  it('renameLayer renames the matching layer and syncs to yjs', () => {
    const { yMeta, layers } = setup()
    layers.observeLayers()
    const added = layers.addLayer('Old')
    layers.renameLayer(added.id, 'New')
    const stored = yMeta.get('layers') as LayerDefinition[]
    expect(stored.find(l => l.id === added.id)?.name).toBe('New')
    expect(layers.layers.value.find(l => l.id === added.id)?.name).toBe('New')
  })

  it('toggleLayerVisibility flips the visible flag', () => {
    const { yMeta, layers } = setup()
    layers.observeLayers()
    const added = layers.addLayer()
    layers.toggleLayerVisibility(added.id)
    expect(layers.layers.value.find(l => l.id === added.id)?.visible).toBe(false)
    layers.toggleLayerVisibility(added.id)
    expect(layers.layers.value.find(l => l.id === added.id)?.visible).toBe(true)
    expect(yMeta.get('layers')).toEqual(layers.layers.value)
  })

  it('toggleLayerLock flips the locked flag', () => {
    const { layers } = setup()
    layers.observeLayers()
    const added = layers.addLayer()
    layers.toggleLayerLock(added.id)
    expect(layers.layers.value.find(l => l.id === added.id)?.locked).toBe(true)
  })

  it('setLayerColor updates the layer color', () => {
    const { yMeta, layers } = setup()
    layers.observeLayers()
    const added = layers.addLayer()
    layers.setLayerColor(added.id, '#000000')
    expect(layers.layers.value.find(l => l.id === added.id)?.color).toBe('#000000')
    expect(yMeta.get('layers')).toEqual(layers.layers.value)
  })

  it('setActiveLayer only applies when the id exists', () => {
    const { layers } = setup()
    layers.observeLayers()
    const added = layers.addLayer()
    layers.setActiveLayer('does-not-exist')
    expect(layers.activeLayerId.value).toBe(added.id)
    layers.setActiveLayer('default')
    expect(layers.activeLayerId.value).toBe('default')
  })

  it('reorderLayers reorders and assigns order by position, dropping unknown ids', () => {
    const { yMeta, layers } = setup()
    layers.observeLayers()
    const a = layers.addLayer('A')
    const b = layers.addLayer('B')
    layers.reorderLayers([b.id, a.id, 'ghost'])
    const stored = yMeta.get('layers') as LayerDefinition[]
    expect(stored.map(l => l.id)).toEqual([b.id, a.id])
    expect(stored.find(l => l.id === b.id)?.order).toBe(0)
    expect(stored.find(l => l.id === a.id)?.order).toBe(1)
  })

  it('getActiveLayer returns the active layer definition', () => {
    const { layers } = setup()
    layers.observeLayers()
    const added = layers.addLayer()
    expect(layers.getActiveLayer()?.id).toBe(added.id)
    layers.setActiveLayer('default')
    expect(layers.getActiveLayer()?.id).toBe('default')
  })

  it('isLayerVisible returns true for undefined, stored flag for existing, true for missing', () => {
    const { layers } = setup()
    layers.observeLayers()
    const added = layers.addLayer()
    expect(layers.isLayerVisible(undefined)).toBe(true)
    expect(layers.isLayerVisible(added.id)).toBe(true)
    layers.toggleLayerVisibility(added.id)
    expect(layers.isLayerVisible(added.id)).toBe(false)
    expect(layers.isLayerVisible('missing')).toBe(true)
  })

  it('isLayerLocked returns false for undefined/missing and stored flag otherwise', () => {
    const { layers } = setup()
    layers.observeLayers()
    const added = layers.addLayer()
    expect(layers.isLayerLocked(undefined)).toBe(false)
    expect(layers.isLayerLocked(added.id)).toBe(false)
    layers.toggleLayerLock(added.id)
    expect(layers.isLayerLocked(added.id)).toBe(true)
    expect(layers.isLayerLocked('missing')).toBe(false)
  })

  it('getLayerColor returns undefined for undefined/missing and color otherwise', () => {
    const { layers } = setup()
    layers.observeLayers()
    const added = layers.addLayer()
    expect(layers.getLayerColor(undefined)).toBeUndefined()
    expect(layers.getLayerColor('missing')).toBeUndefined()
    expect(layers.getLayerColor(added.id)).toBe('#EF4444')
  })

  it('sortedLayers sorts by order ascending', () => {
    const { layers } = setup()
    layers.observeLayers()
    const a = layers.addLayer('A')
    const b = layers.addLayer('B')
    layers.reorderLayers([b.id, a.id])
    expect(layers.sortedLayers.value.map(l => l.id)).toEqual([b.id, a.id])
  })

  it('hiddenLayerIds collects only invisible layers', () => {
    const { layers } = setup()
    layers.observeLayers()
    const hidden = layers.addLayer()
    layers.toggleLayerVisibility(hidden.id)
    const ids = layers.hiddenLayerIds.value
    expect(ids.has(hidden.id)).toBe(true)
    expect(ids.has('default')).toBe(false)
  })

  it('observeLayers updates layers when the layers key changes remotely', () => {
    const { yMeta, layers } = setup()
    layers.observeLayers()
    const remote = [storedLayer({ id: 'l1', order: 0 }), storedLayer({ id: 'l2', order: 1 })]
    yMeta.set('layers', remote)
    expect(layers.layers.value).toEqual(remote)
    expect(layers.activeLayerId.value).toBe('l1')
  })

  it('observeLayers ignores changes to other yMeta keys', () => {
    const { yMeta, layers } = setup()
    layers.observeLayers()
    yMeta.set('other', { x: 1 })
    expect(layers.layers.value).toHaveLength(1)
  })

  it('observeLayers cleanup stops future callbacks', () => {
    const { yMeta, layers } = setup()
    const cleanup = layers.observeLayers()
    cleanup()
    yMeta.set('layers', [storedLayer({ id: 'l1', order: 0 })])
    expect(layers.layers.value).toHaveLength(1)
  })

  it('observer handler reassigns active when a remote change drops the active layer', () => {
    const { yMeta, layers } = setup()
    layers.observeLayers()
    layers.addLayer()
    layers.setActiveLayer('default')
    yMeta.set('layers', [storedLayer({ id: 'l1', order: 0 })])
    expect(layers.activeLayerId.value).toBe('l1')
    expect(layers.layers.value).toHaveLength(1)
  })
})
