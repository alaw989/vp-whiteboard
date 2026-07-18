import { ref, computed, readonly } from 'vue'
import * as Y from 'yjs'
import type { LayerDefinition } from '~/types'

const LAYER_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#64748B',
]

export function useLayers(yMeta: Y.Map<any>, ydoc: Y.Doc, userId: string) {
  const layers = ref<LayerDefinition[]>([])
  const activeLayerId = ref<string>('default')
  const LAYERS_KEY = 'layers'

  // Ensure default layer exists
  function ensureDefault() {
    const stored = yMeta.get(LAYERS_KEY) as LayerDefinition[] | undefined
    if (!stored || stored.length === 0) {
      const defaultLayer: LayerDefinition = {
        id: 'default',
        name: 'Layer 0',
        color: '#3B82F6',
        visible: true,
        locked: false,
        order: 0,
      }
      ydoc.transact(() => {
        yMeta.set(LAYERS_KEY, [defaultLayer])
      }, userId)
      layers.value = [defaultLayer]
      activeLayerId.value = defaultLayer.id
    } else {
      layers.value = stored
      if (!stored.some(l => l.id === activeLayerId.value)) {
        activeLayerId.value = stored[0]?.id || 'default'
      }
    }
  }

  // Observe remote layer changes
  function observeLayers(): () => void {
    const handler = (event: Y.YMapEvent<any>) => {
      if (event.changes.keys.has(LAYERS_KEY)) {
        const stored = yMeta.get(LAYERS_KEY) as LayerDefinition[] | undefined
        if (stored) {
          layers.value = stored
          if (!stored.some(l => l.id === activeLayerId.value)) {
            activeLayerId.value = stored[0]?.id || 'default'
          }
        }
      }
    }
    yMeta.observe(handler)
    ensureDefault()
    return () => yMeta.unobserve(handler)
  }

  function syncToYjs() {
    ydoc.transact(() => {
      yMeta.set(LAYERS_KEY, [...layers.value])
    }, userId)
  }

  function addLayer(name?: string): LayerDefinition {
    const order = layers.value.length
    const id = `layer-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const layer: LayerDefinition = {
      id,
      name: name || `Layer ${order}`,
      color: LAYER_COLORS[order % LAYER_COLORS.length] || '#64748B',
      visible: true,
      locked: false,
      order,
    }
    layers.value = [...layers.value, layer]
    syncToYjs()
    activeLayerId.value = id
    return layer
  }

  function removeLayer(layerId: string) {
    if (layerId === 'default') return
    const idx = layers.value.findIndex(l => l.id === layerId)
    if (idx === -1) return
    layers.value = layers.value.filter(l => l.id !== layerId)
    if (activeLayerId.value === layerId) {
      activeLayerId.value = layers.value[0]?.id || 'default'
    }
    syncToYjs()
  }

  function renameLayer(layerId: string, name: string) {
    layers.value = layers.value.map(l =>
      l.id === layerId ? { ...l, name } : l
    )
    syncToYjs()
  }

  function toggleLayerVisibility(layerId: string) {
    layers.value = layers.value.map(l =>
      l.id === layerId ? { ...l, visible: !l.visible } : l
    )
    syncToYjs()
  }

  function toggleLayerLock(layerId: string) {
    layers.value = layers.value.map(l =>
      l.id === layerId ? { ...l, locked: !l.locked } : l
    )
    syncToYjs()
  }

  function setLayerColor(layerId: string, color: string) {
    layers.value = layers.value.map(l =>
      l.id === layerId ? { ...l, color } : l
    )
    syncToYjs()
  }

  function setActiveLayer(layerId: string) {
    const exists = layers.value.some(l => l.id === layerId)
    if (exists) {
      activeLayerId.value = layerId
    }
  }

  function reorderLayers(orderedIds: string[]) {
    const layerMap = new Map(layers.value.map(l => [l.id, l]))
    layers.value = orderedIds
      .map((id, i) => {
        const layer = layerMap.get(id)
        return layer ? { ...layer, order: i } : null
      })
      .filter(Boolean) as LayerDefinition[]
    syncToYjs()
  }

  function getActiveLayer(): LayerDefinition | undefined {
    return layers.value.find(l => l.id === activeLayerId.value)
  }

  function isLayerVisible(layerId: string | undefined): boolean {
    if (!layerId) return true
    const layer = layers.value.find(l => l.id === layerId)
    return layer ? layer.visible : true
  }

  function isLayerLocked(layerId: string | undefined): boolean {
    if (!layerId) return false
    const layer = layers.value.find(l => l.id === layerId)
    return layer ? layer.locked : false
  }

  function getLayerColor(layerId: string | undefined): string | undefined {
    if (!layerId) return undefined
    const layer = layers.value.find(l => l.id === layerId)
    return layer?.color
  }

  const sortedLayers = computed(() =>
    [...layers.value].sort((a, b) => a.order - b.order)
  )

  const hiddenLayerIds = computed(() =>
    new Set(layers.value.filter(l => !l.visible).map(l => l.id))
  )

  return {
    layers: readonly(layers),
    sortedLayers,
    activeLayerId,
    hiddenLayerIds,
    observeLayers,
    addLayer,
    removeLayer,
    renameLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    setLayerColor,
    setActiveLayer,
    reorderLayers,
    getActiveLayer,
    isLayerVisible,
    isLayerLocked,
    getLayerColor,
  }
}
