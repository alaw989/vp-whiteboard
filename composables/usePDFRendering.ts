import type { PDFDocumentProxy, PDFPageProxy, PDFRenderOptions, PDFLoadingState } from '~/types'

// Default scale for PDF rendering (higher = better quality, larger images)
const DEFAULT_SCALE = 1.5

/**
 * Load a PDF document from an ArrayBuffer
 * Returns PDFDocumentProxy for page access
 */
async function loadPDFDocument(
  arrayBuffer: ArrayBuffer,
  onProgress?: (state: PDFLoadingState) => void
): Promise<PDFDocumentProxy> {
  const pdfjsLib = await import('pdfjs-dist')

  // Emit initial loading state
  onProgress?.({ loading: true, loaded: 0, total: 100, percent: 0 })

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      // Enable worker for off-main-thread rendering
      useWorkerFetch: true,
      isEvalSupported: false,
    })

    // Attach progress listener if callback provided
    if (onProgress) {
      loadingTask.onProgress = (progress: { loaded: number; total: number }) => {
        const percent = progress.total > 0
          ? Math.round((progress.loaded / progress.total) * 100)
          : 0
        onProgress({ loading: true, loaded: progress.loaded, total: progress.total, percent })
      }
    }

    const pdfDocument = await loadingTask.promise

    onProgress?.({ loading: false, loaded: 1, total: 1, percent: 100 })

    return pdfDocument
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load PDF'
    onProgress?.({ loading: false, loaded: 0, total: 0, percent: 0, error: message })
    throw error
  }
}

/**
 * Render a single PDF page to a data URL for use in Konva Image
 * Uses offscreen canvas for rendering
 */
async function renderPageToImage(
  page: PDFPageProxy,
  options: PDFRenderOptions = {}
): Promise<string> {
  const scale = options.scale ?? DEFAULT_SCALE

  // Get viewport with desired scale
  const viewport = page.getViewport({ scale })

  // Create offscreen canvas
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Could not get canvas context for PDF rendering')
  }

  canvas.width = viewport.width
  canvas.height = viewport.height

  // Render PDF page to canvas
  const renderTask = page.render({
    canvasContext: context,
    viewport: viewport,
  })

  // Wait for rendering to complete
  await renderTask.promise

  // Convert to data URL for Konva Image consumption
  return canvas.toDataURL('image/png')
}

/**
 * Cleanup PDF resources to prevent memory leaks
 * Call this when done with a PDF document
 */
function cleanupPDFDocument(pdfDocument: PDFDocumentProxy | null) {
  pdfDocument?.cleanup()
}

export function usePDFRendering() {
  return {
    loadPDFDocument,
    renderPageToImage,
    cleanupPDFDocument,
    DEFAULT_SCALE,
  }
}
