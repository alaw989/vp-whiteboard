import type { CanvasElement, ImageElement } from '~/types'
import { usePDFRendering } from './usePDFRendering'

export interface DocumentLayer {
  id: string
  name: string
  type: 'image' | 'pdf'
  url: string
  visible: boolean
  x: number
  y: number
  width: number
  height: number
  pageNumber?: number
  pageCount?: number
  elementId?: string // Reference to canvas element
}

export interface LayerState {
  layers: DocumentLayer[]
  activeLayerId: string | null
}

export interface AddImageLayerOptions {
  id: string
  url: string
  name: string
  x?: number
  y?: number
  width?: number
  height?: number
}

export interface AddPDFLayerOptions {
  id: string
  url: string
  name: string
  pageNumber?: number
  x?: number
  y?: number
  width?: number
  height?: number
}

export function useDocumentLayer() {
  const { loadPDFDocument, renderPageToImage, cleanupPDFDocument } = usePDFRendering()

  // Layer state
  const state = ref<LayerState>({
    layers: [],
    activeLayerId: null,
  })

  // Computed properties
  const visibleLayers = computed(() => state.value.layers.filter(l => l.visible))

  /**
   * Add an image layer to the canvas
   * Returns the canvas element to be added
   */
  async function addImageLayer(
    options: AddImageLayerOptions,
    elementId?: string
  ): Promise<CanvasElement | null> {
    const layer: DocumentLayer = {
      id: options.id,
      name: options.name,
      type: 'image',
      url: options.url,
      visible: true,
      x: options.x ?? 100,
      y: options.y ?? 100,
      width: options.width ?? 400,
      height: options.height ?? 300,
      elementId,
    }

    state.value.layers.push(layer)
    state.value.activeLayerId = layer.id

    // Return the canvas element for rendering
    return {
      id: elementId || `img-${layer.id}`,
      type: 'image',
      userId: 'system',
      userName: 'System',
      timestamp: Date.now(),
      data: {
        src: options.url,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        fileId: options.id,
      } as ImageElement,
    }
  }

  /**
   * Add a PDF layer to the canvas
   * Fetches the PDF, renders first page, and adds as image layer
   */
  async function addPDFLayer(
    options: AddPDFLayerOptions,
    arrayBuffer?: ArrayBuffer,
    elementId?: string
  ): Promise<CanvasElement | null> {
    try {
      let pdfArrayBuffer = arrayBuffer

      // If no ArrayBuffer provided, fetch from URL
      if (!pdfArrayBuffer) {
        const response = await fetch(options.url)
        pdfArrayBuffer = await response.arrayBuffer()
      }

      // Load PDF document
      const pdfDocument = await loadPDFDocument(pdfArrayBuffer)

      const pageNumber = options.pageNumber ?? 1
      const page = await pdfDocument.getPage(pageNumber)

      // Render page to image
      const dataUrl = await renderPageToImage(page)

      // Create layer with rendered image
      const layer: DocumentLayer = {
        id: options.id,
        name: options.name,
        type: 'pdf',
        url: dataUrl, // Use rendered image URL
        visible: true,
        x: options.x ?? 100,
        y: options.y ?? 100,
        width: options.width ?? 400,
        height: options.height ?? 0, // Will be set based on rendered image aspect ratio
        pageNumber,
        pageCount: pdfDocument.numPages,
        elementId,
      }

      state.value.layers.push(layer)
      state.value.activeLayerId = layer.id

      // Cleanup PDF document
      cleanupPDFDocument(pdfDocument)

      // Return the canvas element for rendering
      return {
        id: elementId || `pdf-${layer.id}`,
        type: 'image',
        userId: 'system',
        userName: 'System',
        timestamp: Date.now(),
        data: {
          src: dataUrl,
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          fileId: options.id,
        } as ImageElement,
      }
    } catch (error) {
      console.error('Failed to add PDF layer:', error)
      return null
    }
  }

  /**
   * Update an existing layer's properties
   */
  function updateLayer(
    layerId: string,
    updates: Partial<Omit<DocumentLayer, 'id' | 'type' | 'url' | 'pageNumber' | 'pageCount'>>
  ): void {
    const layer = state.value.layers.find(l => l.id === layerId)
    if (layer) {
      Object.assign(layer, updates)
    }
  }

  /**
   * Remove a layer
   */
  function removeLayer(layerId: string): void {
    const index = state.value.layers.findIndex(l => l.id === layerId)
    if (index > -1) {
      state.value.layers.splice(index, 1)
      if (state.value.activeLayerId === layerId) {
        state.value.activeLayerId = null
      }
    }
  }

  /**
   * Set the active layer
   */
  function setActiveLayer(layerId: string | null): void {
    state.value.activeLayerId = layerId
  }

  /**
   * Get a layer by ID
   */
  function getLayer(layerId: string): DocumentLayer | undefined {
    return state.value.layers.find(l => l.id === layerId)
  }

  return {
    // State
    state,
    visibleLayers,

    // Layer operations
    addImageLayer,
    addPDFLayer,
    updateLayer,
    removeLayer,
    setActiveLayer,
    getLayer,
  }
}
