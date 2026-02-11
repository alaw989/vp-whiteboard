import { ref, computed } from 'vue'
import type { DocumentLayer, DocumentLayerState } from '~/types'
import { usePDFRendering } from './usePDFRendering'

export function useDocumentLayer() {
  const { renderPageToImage, loadPDFDocument, cleanupPDFDocument } = usePDFRendering()

  // State
  const state = ref<DocumentLayerState>({
    layers: [],
    activeLayerId: null,
    loading: false,
    error: null,
  })

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

        state.value.layers.push(layer)
        state.value.activeLayerId = layer.id
        state.value.error = null
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

      state.value.layers.push(layer)
      state.value.activeLayerId = layer.id

      // Cleanup PDF resources
      cleanupPDFDocument(pdfDocument)

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
      state.value.layers[index] = { ...state.value.layers[index], ...updates }
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
