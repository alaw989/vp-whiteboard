import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePDFRendering } from './usePDFRendering'
import type { PDFLoadingState } from '~/types'

const { getDocumentMock } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
}))

vi.mock('pdfjs-dist', () => ({
  getDocument: getDocumentMock,
}))

interface FakeRenderTask {
  promise: Promise<unknown>
  cancel: ReturnType<typeof vi.fn>
}

interface FakePage {
  getViewport: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
}

interface FakePDFDocument {
  numPages: number
  getPage: ReturnType<typeof vi.fn>
  cleanup: ReturnType<typeof vi.fn>
}

interface FakeLoadingTask {
  onProgress: null | ((progress: { loaded: number; total: number }) => void)
  destroy: ReturnType<typeof vi.fn>
  promise: Promise<unknown>
}

interface FakeCanvas {
  width: number
  height: number
  getContext: ReturnType<typeof vi.fn>
  toDataURL: ReturnType<typeof vi.fn>
}

const { loadPDFDocument, renderPageToImage, loadAndRenderPage, cleanupPDFDocument, DEFAULT_SCALE } =
  usePDFRendering()

const makeLoadingTask = (promise: Promise<unknown>): FakeLoadingTask => ({
  onProgress: null,
  destroy: vi.fn(),
  promise,
})

const makePage = (viewport = { width: 100, height: 200 }): FakePage => ({
  getViewport: vi.fn().mockReturnValue(viewport),
  render: vi.fn().mockReturnValue({
    promise: Promise.resolve(),
    cancel: vi.fn(),
  } as FakeRenderTask),
})

const makePDFDocument = (numPages = 3, page?: FakePage): FakePDFDocument => ({
  numPages,
  getPage: vi.fn().mockResolvedValue(page ?? makePage()),
  cleanup: vi.fn(),
})

let fakeCanvas: FakeCanvas
let fakeContext: object

const originalCreateElement = document.createElement.bind(document)

describe('usePDFRendering', () => {
  beforeEach(() => {
    fakeContext = { canvas: true }
    fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(fakeContext),
      toDataURL: vi.fn().mockReturnValue('data:image/png;base64,AAAA'),
    }
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return fakeCanvas as unknown as HTMLElement
      }
      return originalCreateElement(tag)
    })
    getDocumentMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes a default render scale of 1.5', () => {
    expect(DEFAULT_SCALE).toBe(1.5)
  })

  describe('cleanupPDFDocument', () => {
    it('calls cleanup() on the PDF document', () => {
      const doc = { cleanup: vi.fn() }
      cleanupPDFDocument(doc as never)
      expect(doc.cleanup).toHaveBeenCalled()
    })

    it('tolerates a null document', () => {
      expect(() => cleanupPDFDocument(null)).not.toThrow()
    })
  })

  describe('loadPDFDocument', () => {
    it('loads a PDF from an ArrayBuffer and reports loading progress', async () => {
      const buffer = new ArrayBuffer(4)
      const pdfDocument = { numPages: 3 }
      const task = makeLoadingTask(Promise.resolve(pdfDocument))
      getDocumentMock.mockReturnValue(task)
      const onProgress = vi.fn()

      const result = await loadPDFDocument(buffer, { onProgress })

      expect(result).toBe(pdfDocument)
      expect(getDocumentMock).toHaveBeenCalledWith({
        data: buffer,
        useWorkerFetch: true,
        isEvalSupported: false,
      })
      expect(onProgress).toHaveBeenNthCalledWith(1, {
        loading: true,
        loaded: 0,
        total: 100,
        percent: 0,
      })
      expect(onProgress).toHaveBeenLastCalledWith({
        loading: false,
        loaded: 1,
        total: 1,
        percent: 100,
      })
    })

    it('forwards loading progress through the task onProgress callback', async () => {
      const task = makeLoadingTask(Promise.resolve({ numPages: 1 }))
      getDocumentMock.mockReturnValue(task)
      const onProgress = vi.fn()

      const promise = loadPDFDocument(new ArrayBuffer(4), { onProgress })
      await vi.waitFor(() => expect(task.onProgress).toBeTypeOf('function'))
      task.onProgress!({ loaded: 300, total: 600 })
      expect(onProgress).toHaveBeenLastCalledWith({
        loading: true,
        loaded: 300,
        total: 600,
        percent: 50,
      })
      await promise
    })

    it('reports 0 percent when the total is unknown', async () => {
      const task = makeLoadingTask(Promise.resolve({ numPages: 1 }))
      getDocumentMock.mockReturnValue(task)
      const onProgress = vi.fn()

      const promise = loadPDFDocument(new ArrayBuffer(4), { onProgress })
      await vi.waitFor(() => expect(task.onProgress).toBeTypeOf('function'))
      task.onProgress!({ loaded: 12, total: 0 })
      expect(onProgress).toHaveBeenLastCalledWith({
        loading: true,
        loaded: 12,
        total: 0,
        percent: 0,
      })
      await promise
    })

    it('throws AbortError when the signal is already aborted', async () => {
      const ac = new AbortController()
      ac.abort()
      const onProgress = vi.fn()

      await expect(
        loadPDFDocument(new ArrayBuffer(4), { signal: ac.signal, onProgress })
      ).rejects.toMatchObject({ name: 'AbortError', message: 'Loading was aborted' })
      expect(getDocumentMock).not.toHaveBeenCalled()
      expect(onProgress).toHaveBeenCalledTimes(1)
      expect(onProgress).toHaveBeenCalledWith({
        loading: true,
        loaded: 0,
        total: 100,
        percent: 0,
      })
    })

    it('aborts the load when a progress event arrives after abort', async () => {
      let aborted = false
      const signal = {
        get aborted() {
          return aborted
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }
      const task = makeLoadingTask(Promise.resolve({ numPages: 1 }))
      getDocumentMock.mockReturnValue(task)
      const onProgress = vi.fn()

      const promise = loadPDFDocument(new ArrayBuffer(4), {
        onProgress,
        signal: signal as unknown as AbortSignal,
      })
      await vi.waitFor(() => expect(task.onProgress).toBeTypeOf('function'))
      aborted = true
      let thrown: unknown
      try {
        task.onProgress!({ loaded: 10, total: 100 })
      } catch (error) {
        thrown = error
      }
      expect(thrown).toMatchObject({ name: 'AbortError' })
      expect(task.destroy).toHaveBeenCalled()
      expect(onProgress).not.toHaveBeenCalledWith({
        loading: true,
        loaded: 10,
        total: 100,
        percent: 10,
      })
      await promise
    })

    it('destroys the loading task when the signal aborts mid-load', async () => {
      let resolveLoad!: (value: unknown) => void
      const task = makeLoadingTask(new Promise(resolve => {
        resolveLoad = resolve
      }))
      getDocumentMock.mockReturnValue(task)
      const ac = new AbortController()
      const addSpy = vi.spyOn(ac.signal, 'addEventListener')
      const removeSpy = vi.spyOn(ac.signal, 'removeEventListener')

      const promise = loadPDFDocument(new ArrayBuffer(4), { signal: ac.signal })
      await vi.waitFor(() => expect(addSpy).toHaveBeenCalledWith('abort', expect.any(Function)))
      const abortHandler = addSpy.mock.calls.find(call => call[0] === 'abort')![1]

      ac.abort()
      expect(task.destroy).toHaveBeenCalled()

      resolveLoad({ numPages: 1 })
      await promise
      expect(removeSpy).toHaveBeenCalledWith('abort', abortHandler)
    })

    it('reports the error message when the load fails', async () => {
      const task = makeLoadingTask(Promise.reject(new Error('bad pdf')))
      getDocumentMock.mockReturnValue(task)
      const onProgress = vi.fn()

      await expect(loadPDFDocument(new ArrayBuffer(4), { onProgress })).rejects.toThrow('bad pdf')
      expect(onProgress).toHaveBeenLastCalledWith({
        loading: false,
        loaded: 0,
        total: 0,
        percent: 0,
        error: 'bad pdf',
      })
    })

    it('distinguishes abort errors during load', async () => {
      const abortError = new DOMException('Loading was aborted', 'AbortError')
      const task = makeLoadingTask(Promise.reject(abortError))
      getDocumentMock.mockReturnValue(task)
      const onProgress = vi.fn()

      await expect(
        loadPDFDocument(new ArrayBuffer(4), { onProgress })
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(onProgress).toHaveBeenLastCalledWith({
        loading: false,
        loaded: 0,
        total: 0,
        percent: 0,
        error: 'Loading cancelled',
      })
    })

    it('falls back to a generic message for non-Error load failures', async () => {
      const task = makeLoadingTask(Promise.reject('boom'))
      getDocumentMock.mockReturnValue(task)
      const onProgress = vi.fn()

      await expect(loadPDFDocument(new ArrayBuffer(4), { onProgress })).rejects.toBe('boom')
      expect(onProgress).toHaveBeenLastCalledWith({
        loading: false,
        loaded: 0,
        total: 0,
        percent: 0,
        error: 'Failed to load PDF',
      })
    })

    it('works without an onProgress callback', async () => {
      const pdfDocument = { numPages: 1 }
      const task = makeLoadingTask(Promise.resolve(pdfDocument))
      getDocumentMock.mockReturnValue(task)

      await expect(loadPDFDocument(new ArrayBuffer(4))).resolves.toBe(pdfDocument)
      expect(task.onProgress).toBeNull()
    })
  })

  describe('renderPageToImage', () => {
    it('renders a page to a PNG data URL using the default scale', async () => {
      const page = makePage()
      const onProgress = vi.fn()

      const dataUrl = await renderPageToImage(page as never, { onProgress })

      expect(dataUrl).toBe('data:image/png;base64,AAAA')
      expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.5 })
      expect(fakeCanvas.width).toBe(100)
      expect(fakeCanvas.height).toBe(200)
      expect(page.render).toHaveBeenCalledWith({
        canvasContext: fakeContext,
        viewport: { width: 100, height: 200 },
      })
      expect(fakeCanvas.toDataURL).toHaveBeenCalledWith('image/png')
      expect(onProgress).toHaveBeenNthCalledWith(1, 50)
      expect(onProgress).toHaveBeenLastCalledWith(100)
    })

    it('uses a custom scale when provided', async () => {
      const page = makePage()
      await renderPageToImage(page as never, { scale: 2 })
      expect(page.getViewport).toHaveBeenCalledWith({ scale: 2 })
    })

    it('throws AbortError when the signal is already aborted', async () => {
      const page = makePage()
      const ac = new AbortController()
      ac.abort()

      await expect(
        renderPageToImage(page as never, { signal: ac.signal })
      ).rejects.toMatchObject({ name: 'AbortError', message: 'Rendering was aborted' })
      expect(page.render).not.toHaveBeenCalled()
    })

    it('throws when no 2d canvas context is available', async () => {
      const page = makePage()
      fakeCanvas.getContext.mockReturnValue(null)

      await expect(renderPageToImage(page as never)).rejects.toThrow(
        'Could not get canvas context for PDF rendering'
      )
      expect(page.render).not.toHaveBeenCalled()
    })

    it('cancels an in-flight render when the signal aborts', async () => {
      const renderTask: FakeRenderTask = {
        promise: new Promise(() => {}),
        cancel: vi.fn(),
      }
      const page = makePage()
      page.render.mockReturnValue(renderTask)
      const ac = new AbortController()
      const addSpy = vi.spyOn(ac.signal, 'addEventListener')

      void renderPageToImage(page as never, { signal: ac.signal })
      const abortHandler = addSpy.mock.calls.find(call => call[0] === 'abort')![1]

      ac.abort()
      expect(renderTask.cancel).toHaveBeenCalled()
      expect(abortHandler).toBeTypeOf('function')
    })

    it('removes the abort handler after the render completes', async () => {
      const renderTask: FakeRenderTask = { promise: Promise.resolve(), cancel: vi.fn() }
      const page = makePage()
      page.render.mockReturnValue(renderTask)
      const ac = new AbortController()
      const addSpy = vi.spyOn(ac.signal, 'addEventListener')
      const removeSpy = vi.spyOn(ac.signal, 'removeEventListener')

      await renderPageToImage(page as never, { signal: ac.signal })
      const abortHandler = addSpy.mock.calls.find(call => call[0] === 'abort')![1]
      expect(removeSpy).toHaveBeenCalledWith('abort', abortHandler)
    })

    it('converts a cancelled render into an AbortError', async () => {
      const renderTask: FakeRenderTask = {
        promise: Promise.reject(new Error('render cancelled')),
        cancel: vi.fn(),
      }
      const page = makePage()
      page.render.mockReturnValue(renderTask)

      await expect(renderPageToImage(page as never)).rejects.toMatchObject({
        name: 'AbortError',
        message: 'Rendering was aborted',
      })
    })

    it('rethrows non-cancel render errors', async () => {
      const renderTask: FakeRenderTask = {
        promise: Promise.reject(new Error('boom')),
        cancel: vi.fn(),
      }
      const page = makePage()
      page.render.mockReturnValue(renderTask)

      await expect(renderPageToImage(page as never)).rejects.toThrow('boom')
    })
  })

  describe('loadAndRenderPage', () => {
    it('loads and renders a page with combined 0-100 progress', async () => {
      const page = makePage()
      const pdfDocument = makePDFDocument(7, page)
      const task = makeLoadingTask(Promise.resolve(pdfDocument))
      getDocumentMock.mockReturnValue(task)
      const onProgress = vi.fn()

      const result = await loadAndRenderPage(new ArrayBuffer(4), 2, { onProgress })

      expect(result).toEqual({ dataUrl: 'data:image/png;base64,AAAA', totalPages: 7 })
      expect(getDocumentMock).toHaveBeenCalledTimes(1)
      expect(pdfDocument.getPage).toHaveBeenCalledWith(2)
      expect(pdfDocument.cleanup).toHaveBeenCalled()
      expect(onProgress).toHaveBeenCalledWith({
        loading: true,
        loaded: 0,
        total: 100,
        percent: 0,
      })
      expect(onProgress).toHaveBeenCalledWith({
        loading: false,
        loaded: 1,
        total: 1,
        percent: 50,
      })
      expect(onProgress).toHaveBeenCalledWith({
        loading: true,
        loaded: 75,
        total: 100,
        percent: 75,
      })
      expect(onProgress).toHaveBeenCalledWith({
        loading: true,
        loaded: 100,
        total: 100,
        percent: 100,
      })
    })

    it('defaults to the first page', async () => {
      const page = makePage()
      const pdfDocument = makePDFDocument(4, page)
      const task = makeLoadingTask(Promise.resolve(pdfDocument))
      getDocumentMock.mockReturnValue(task)

      await loadAndRenderPage(new ArrayBuffer(4))

      expect(pdfDocument.getPage).toHaveBeenCalledWith(1)
    })

    it('rejects when loading the document fails', async () => {
      const task = makeLoadingTask(Promise.reject(new Error('corrupt')))
      getDocumentMock.mockReturnValue(task)

      await expect(loadAndRenderPage(new ArrayBuffer(4))).rejects.toThrow('corrupt')
    })
  })
})
