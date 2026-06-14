import { ref, computed, onUnmounted } from 'vue'
import type { DocumentLayer, DocumentLayerState } from '~/types'
import type { Map as YMap } from 'yjs'
import { usePDFRendering } from './usePDFRendering'

/**
 * Options for initializing useDocumentLayer with shared state
 */
interface UseDocumentLayerOptions {
  /** Yjs Map containing shared document layers */
  yDocumentLayers?: YMap<any>
  /** Callback when a layer is added (syncs to Yjs) */
  onAddLayer?: (layer: DocumentLayer) => void
  /** Callback when a layer is updated (syncs to Yjs) */
  onUpdateLayer?: (id: string, updates: Partial<DocumentLayer>) => void
  /** Callback when a layer is removed (syncs to Yjs) */
  onRemoveLayer?: (id: string) => void
}

export function useDocumentLayer(options?: UseDocumentLayerOptions) {
  const { renderPageToImage, loadPDFDocument, cleanupPDFDocument } = usePDFRendering()

  // Local state (will be kept in sync with Yjs if provided)
  const state = ref<DocumentLayerState>({
    layers: [],
    activeLayerId: null,
    loading: false,
    error: null,
  })

  // Store cleanup function for Yjs observer
  let stopObservingLayers: (() => void) | null = null

  // If Yjs map is provided, observe it and sync local state
  if (options?.yDocumentLayers) {
    stopObservingLayers = observeYjsLayers(options.yDocumentLayers)
  }

  /**
   * Observe Yjs document layers and sync to local state
   */
  function observeYjsLayers(yLayers: YMap<any>): () => void {
    const handler = () => {
      // Sync layers from Yjs to local state
      const remoteLayers = Array.from(yLayers.values())
      state.value.layers = remoteLayers

      // Preserve active layer if it still exists
      if (state.value.activeLayerId) {
        const activeExists = remoteLayers.some(l => l.id === state.value.activeLayerId)
        if (!activeExists) {
          state.value.activeLayerId = remoteLayers[0]?.id || null
        }
      }
    }

    // Initial sync
    handler()

    // Observe changes
    yLayers.observe(handler)

    // Return cleanup function
    return () => {
      yLayers.unobserve(handler)
    }
  }

  // Computed
  const activeLayer = computed(() =>
    state.value.layers.find(l => l.id === state.value.activeLayerId)
  )

  const visibleLayers = computed(() =>
    state.value.layers.filter(l => l.visible)
  )

  /**
   * Add an image document layer
   */
  async function addImageLayer(file: {
    id: string
    url: string
    name: string
  }) {
    const layer: DocumentLayer = {
      id: `layer-${file.id}-${Date.now()}`,
      type: 'image',
      fileId: file.id,
      src: file.url,
      x: 0,
      y: 0,
      width: 0,  // Will be set when image loads
      height: 0,  // Will be set when image loads
      scale: 1,
      opacity: 1,
      visible: true,
    }

    // Load image to get dimensions
    return new Promise<DocumentLayer>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        layer.width = img.width
        layer.height = img.height

        // Update local state
        state.value.layers = [...state.value.layers, layer]
        state.value.activeLayerId = layer.id
        state.value.error = null

        // Sync to Yjs if callback provided
        options?.onAddLayer?.(layer)

        resolve(layer)
      }

      img.onerror = () => {
        const error = `Failed to load image: ${file.name}`
        state.value.error = error
        reject(new Error(error))
      }

      img.src = file.url
    })
  }

  /**
   * Add a PDF document layer (renders first page)
   */
  async function addPDFLayer(
    file: {
      id: string
      url: string
      name: string
    },
    arrayBuffer: ArrayBuffer
  ) {
    state.value.loading = true
    state.value.error = null

    try {
      // Load PDF document
      const pdfDocument = await loadPDFDocument(arrayBuffer)

      // Render first page
      const page = await pdfDocument.getPage(1)
      const dataUrl = await renderPageToImage(page, { scale: 1.5 })

      // Get page dimensions for layer sizing
      const viewport = page.getViewport({ scale: 1.5 })

      const layer: DocumentLayer = {
        id: `layer-${file.id}-${Date.now()}`,
        type: 'pdf',
        fileId: file.id,
        src: dataUrl,
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height,
        scale: 1,
        opacity: 1,
        visible: true,
        pageNumber: 1,
        totalPages: pdfDocument.numPages,
      }

      // Update local state
      state.value.layers = [...state.value.layers, layer]
      state.value.activeLayerId = layer.id

      console.log('PDF layer added to state, total layers:', state.value.layers.length)

      // Cleanup PDF resources
      cleanupPDFDocument(pdfDocument)

      // Sync to Yjs if callback provided
      options?.onAddLayer?.(layer)

      return layer
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load PDF'
      state.value.error = message
      throw error
    } finally {
      state.value.loading = false
    }
  }

  /**
   * Update layer properties (position, scale, opacity, visibility)
   */
  function updateLayer(id: string, updates: Partial<DocumentLayer>) {
    const index = state.value.layers.findIndex(l => l.id === id)
    if (index !== -1) {
      const current = state.value.layers[index]
      const updated = { ...current, ...updates } as DocumentLayer
      state.value.layers[index] = updated

      // Sync to Yjs if callback provided
      options?.onUpdateLayer?.(id, updates)
    }
  }

  /**
   * Remove a layer by ID
   */
  function removeLayer(id: string) {
    state.value.layers = state.value.layers.filter(l => l.id !== id)
    if (state.value.activeLayerId === id) {
      state.value.activeLayerId = state.value.layers[0]?.id || null
    }

    // Sync to Yjs if callback provided
    options?.onRemoveLayer?.(id)
  }

  /**
   * Set the active layer
   */
  function setActiveLayer(id: string | null) {
    state.value.activeLayerId = id
  }

  /**
   * Clear all layers
   */
  function clearLayers() {
    state.value.layers = []
    state.value.activeLayerId = null
    state.value.error = null
  }

  // Cleanup observer on unmount
  onUnmounted(() => {
    if (stopObservingLayers) {
      stopObservingLayers()
      stopObservingLayers = null
    }
  })

  return {
    // State
    state,
    activeLayer,
    visibleLayers,

    // Actions
    addImageLayer,
    addPDFLayer,
    updateLayer,
    removeLayer,
    setActiveLayer,
    clearLayers,
  }
}
