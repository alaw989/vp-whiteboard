import type { PDFDocumentProxy, PDFPageProxy, PDFRenderOptions, PDFLoadingState } from '~/types'

// Default scale for PDF rendering (higher = better quality, larger images)
const DEFAULT_SCALE = 1.5

/**
 * Load a PDF document from an ArrayBuffer
 * Returns PDFDocumentProxy for page access
 * Supports cancellation via AbortSignal
 */
async function loadPDFDocument(
  arrayBuffer: ArrayBuffer,
  options: {
    onProgress?: (state: PDFLoadingState) => void
    signal?: AbortSignal
  } = {}
): Promise<PDFDocumentProxy> {
  const { onProgress, signal } = options
  const pdfjsLib = await import('pdfjs-dist')

  // Emit initial loading state
  onProgress?.({ loading: true, loaded: 0, total: 100, percent: 0 })

  // Check for abort at start
  if (signal?.aborted) {
    throw new DOMException('Loading was aborted', 'AbortError')
  }

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      useWorkerFetch: true,
      isEvalSupported: false,
    })

    // Attach progress listener if callback provided
    if (onProgress) {
      loadingTask.onProgress = (progress: { loaded: number; total: number }) => {
        // Check for abort during progress
        if (signal?.aborted) {
          loadingTask.destroy()
          throw new DOMException('Loading was aborted', 'AbortError')
        }

        const percent = progress.total > 0
          ? Math.round((progress.loaded / progress.total) * 100)
          : 0
        onProgress({ loading: true, loaded: progress.loaded, total: progress.total, percent })
      }
    }

    // Set up abort handler
    const abortHandler = () => {
      loadingTask.destroy()
    }
    signal?.addEventListener('abort', abortHandler)

    const pdfDocument = await loadingTask.promise

    // Clean up abort handler
    signal?.removeEventListener('abort', abortHandler)

    onProgress?.({ loading: false, loaded: 1, total: 1, percent: 100 })

    return pdfDocument
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load PDF'

    // Distinguish between abort and other errors
    if (error instanceof DOMException && error.name === 'AbortError') {
      onProgress?.({ loading: false, loaded: 0, total: 0, percent: 0, error: 'Loading cancelled' })
      throw error
    }

    onProgress?.({ loading: false, loaded: 0, total: 0, percent: 0, error: message })
    throw error
  }
}

/**
 * Render a single PDF page to a data URL for use in Konva Image
 * Supports cancellation via AbortSignal
 */
async function renderPageToImage(
  page: PDFPageProxy,
  options: {
    scale?: number
    onProgress?: (percent: number) => void
    signal?: AbortSignal
  } = {}
): Promise<string> {
  const { scale = DEFAULT_SCALE, onProgress, signal } = options

  // Check for abort at start
  if (signal?.aborted) {
    throw new DOMException('Rendering was aborted', 'AbortError')
  }

  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Could not get canvas context for PDF rendering')
  }

  canvas.width = viewport.width
  canvas.height = viewport.height

  // Report 50% progress before rendering
  onProgress?.(50)

  const renderTask = page.render({
    canvasContext: context,
    viewport: viewport,
  })

  // Set up abort handler for render task
  const abortHandler = () => {
    renderTask.cancel()
  }
  signal?.addEventListener('abort', abortHandler)

  try {
    await renderTask.promise

    // Clean up abort handler
    signal?.removeEventListener('abort', abortHandler)

    // Report 100% progress after rendering
    onProgress?.(100)

    return canvas.toDataURL('image/png')
  } catch (error) {
    signal?.removeEventListener('abort', abortHandler)

    if (error instanceof Error && error.message.includes('cancelled')) {
      throw new DOMException('Rendering was aborted', 'AbortError')
    }
    throw error
  }
}

/**
 * Load PDF and render a specific page with progress tracking
 * Combines loadPDFDocument and renderPageToImage for common use case
 */
async function loadAndRenderPage(
  arrayBuffer: ArrayBuffer,
  pageNumber: number = 1,
  options: {
    scale?: number
    onProgress?: (state: PDFLoadingState) => void
    signal?: AbortSignal
  } = {}
): Promise<{ dataUrl: string; totalPages: number }> {
  const { onProgress, signal, scale } = options

  // Load document (0-50% of total progress)
  const pdfDocument = await loadPDFDocument(arrayBuffer, {
    onProgress: (state) => {
      // Map 0-100 to 0-50 range
      onProgress?.({
        ...state,
        percent: Math.floor(state.percent / 2),
      })
    },
    signal,
  })

  // Get page
  const page = await pdfDocument.getPage(pageNumber)

  // Render page (50-100% of total progress)
  const dataUrl = await renderPageToImage(page, {
    scale,
    onProgress: (percent) => {
      // Map 0-100 to 50-100 range
      onProgress?.({
        loading: true,
        loaded: 50 + Math.floor(percent / 2),
        total: 100,
        percent: 50 + Math.floor(percent / 2),
      })
    },
    signal,
  })

  // Cleanup document resources
  cleanupPDFDocument(pdfDocument)

  return { dataUrl, totalPages: pdfDocument.numPages }
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
    loadAndRenderPage,
    cleanupPDFDocument,
    DEFAULT_SCALE,
  }
}
