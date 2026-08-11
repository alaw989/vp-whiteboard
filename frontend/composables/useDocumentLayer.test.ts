import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { useDocumentLayer } from './useDocumentLayer'
import type { DocumentLayer } from '~/types'

const {
  loadPDFDocumentMock,
  renderPageToImageMock,
  cleanupPDFDocumentMock,
  onUnmountedMock,
} = vi.hoisted(() => ({
  loadPDFDocumentMock: vi.fn(),
  renderPageToImageMock: vi.fn(),
  cleanupPDFDocumentMock: vi.fn(),
  onUnmountedMock: vi.fn(),
}))

vi.mock('vue', async (importOriginal) => {
  const mod = await importOriginal<typeof import('vue')>()
  return {
    ...mod,
    onUnmounted: (cb: () => void) => onUnmountedMock(cb),
  }
})

vi.mock('./usePDFRendering', () => ({
  usePDFRendering: () => ({
    loadPDFDocument: loadPDFDocumentMock,
    renderPageToImage: renderPageToImageMock,
    cleanupPDFDocument: cleanupPDFDocumentMock,
  }),
}))

interface FakeImageInstance {
  src: string
  width: number
  height: number
  crossOrigin: string
  onload: (() => void) | null
  onerror: (() => void) | null
}

const imageInstances: FakeImageInstance[] = []

class FakeImage {
  src = ''
  width = 0
  height = 0
  crossOrigin = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor() {
    imageInstances.push(this)
  }
}

const file = { id: 'f1', url: 'https://example.com/img.png', name: 'img.png' }

const layer = (overrides: Partial<DocumentLayer>): DocumentLayer => ({
  id: 'l1',
  type: 'image',
  fileId: 'f1',
  src: 'https://example.com/img.png',
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  scale: 1,
  opacity: 1,
  visible: true,
  ...overrides,
})

describe('useDocumentLayer', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', FakeImage)
    loadPDFDocumentMock.mockReset()
    renderPageToImageMock.mockReset()
    cleanupPDFDocumentMock.mockReset()
    onUnmountedMock.mockReset()
    imageInstances.length = 0
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts with empty local state when no Yjs map is provided', () => {
    const dl = useDocumentLayer()
    expect(dl.state.value).toEqual({
      layers: [],
      activeLayerId: null,
      loading: false,
      error: null,
    })
  })

  it('activeLayer returns undefined when nothing is active', () => {
    const dl = useDocumentLayer()
    expect(dl.activeLayer.value).toBeUndefined()
  })

  it('visibleLayers filters out hidden layers', () => {
    const dl = useDocumentLayer()
    dl.updateLayer('missing', { opacity: 0.5 })
    dl.state.value.layers = [layer({ id: 'a', visible: true }), layer({ id: 'b', visible: false })]
    expect(dl.visibleLayers.value.map(l => l.id)).toEqual(['a'])
  })

  it('addImageLayer resolves with image dimensions once the image loads', async () => {
    const onAddLayer = vi.fn()
    const dl = useDocumentLayer({ onAddLayer })

    const promise = dl.addImageLayer(file)
    const img = imageInstances[0]!
    img.width = 800
    img.height = 600
    img.onload!()

    const added = await promise
    expect(added.id).toMatch(/^layer-f1-\d+$/)
    expect(added.type).toBe('image')
    expect(added.width).toBe(800)
    expect(added.height).toBe(600)
    expect(added.x).toBe(0)
    expect(added.y).toBe(0)
    expect(dl.state.value.layers).toEqual([added])
    expect(dl.state.value.activeLayerId).toBe(added.id)
    expect(dl.state.value.error).toBeNull()
    expect(onAddLayer).toHaveBeenCalledWith(added)
    expect(dl.activeLayer.value).toEqual(added)
  })

  it('addImageLayer rejects and records the error when the image fails to load', async () => {
    const onAddLayer = vi.fn()
    const dl = useDocumentLayer({ onAddLayer })

    const promise = dl.addImageLayer(file)
    imageInstances[0]!.onerror!()

    await expect(promise).rejects.toThrow('Failed to load image: img.png')
    expect(dl.state.value.error).toBe('Failed to load image: img.png')
    expect(dl.state.value.layers).toHaveLength(0)
    expect(onAddLayer).not.toHaveBeenCalled()
  })

  it('addPDFLayer renders the first page and builds a pdf layer', async () => {
    const pdfDocument = {
      numPages: 5,
      getPage: vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ width: 600, height: 800 }),
      }),
    }
    loadPDFDocumentMock.mockResolvedValue(pdfDocument)
    renderPageToImageMock.mockResolvedValue('data:image/png;base64,AAAA')

    const onAddLayer = vi.fn()
    const dl = useDocumentLayer({ onAddLayer })

    const promise = dl.addPDFLayer(file, new ArrayBuffer(8))
    expect(dl.state.value.loading).toBe(true)

    const added = await promise
    expect(loadPDFDocumentMock).toHaveBeenCalledWith(new ArrayBuffer(8))
    expect(pdfDocument.getPage).toHaveBeenCalledWith(1)
    expect(renderPageToImageMock).toHaveBeenCalled()
    expect(added.id).toMatch(/^layer-f1-\d+$/)
    expect(added.type).toBe('pdf')
    expect(added.width).toBe(600)
    expect(added.height).toBe(800)
    expect(added.pageNumber).toBe(1)
    expect(added.totalPages).toBe(5)
    expect(dl.state.value.activeLayerId).toBe(added.id)
    expect(cleanupPDFDocumentMock).toHaveBeenCalledWith(pdfDocument)
    expect(onAddLayer).toHaveBeenCalledWith(added)
    expect(dl.state.value.loading).toBe(false)
    expect(dl.state.value.error).toBeNull()
  })

  it('addPDFLayer rejects with the error message and clears loading on failure', async () => {
    loadPDFDocumentMock.mockRejectedValue(new Error('bad pdf'))
    const dl = useDocumentLayer()

    await expect(dl.addPDFLayer(file, new ArrayBuffer(8))).rejects.toThrow('bad pdf')
    expect(dl.state.value.error).toBe('bad pdf')
    expect(dl.state.value.loading).toBe(false)
  })

  it('addPDFLayer falls back to a generic message for non-Error failures', async () => {
    loadPDFDocumentMock.mockRejectedValue('boom')
    const dl = useDocumentLayer()

    await expect(dl.addPDFLayer(file, new ArrayBuffer(8))).rejects.toBe('boom')
    expect(dl.state.value.error).toBe('Failed to load PDF')
    expect(dl.state.value.loading).toBe(false)
  })

  it('updateLayer updates the layer and syncs via the callback', () => {
    const onUpdateLayer = vi.fn()
    const dl = useDocumentLayer({ onUpdateLayer })
    dl.state.value.layers = [layer({ id: 'a' }), layer({ id: 'b', opacity: 1 })]
    dl.state.value.activeLayerId = 'a'

    dl.updateLayer('b', { opacity: 0.5 })
    expect(dl.state.value.layers.find(l => l.id === 'b')?.opacity).toBe(0.5)
    expect(dl.state.value.layers.find(l => l.id === 'a')?.opacity).toBe(1)
    expect(onUpdateLayer).toHaveBeenCalledWith('b', { opacity: 0.5 })
  })

  it('updateLayer is a no-op for a missing id', () => {
    const onUpdateLayer = vi.fn()
    const dl = useDocumentLayer({ onUpdateLayer })
    dl.state.value.layers = [layer({ id: 'a' })]

    dl.updateLayer('ghost', { opacity: 0 })
    expect(dl.state.value.layers[0]!.opacity).toBe(1)
    expect(onUpdateLayer).not.toHaveBeenCalled()
  })

  it('removeLayer removes the layer and reassigns the active layer to the first remaining', () => {
    const onRemoveLayer = vi.fn()
    const dl = useDocumentLayer({ onRemoveLayer })
    dl.state.value.layers = [layer({ id: 'a' }), layer({ id: 'b' })]
    dl.state.value.activeLayerId = 'b'

    dl.removeLayer('b')
    expect(dl.state.value.layers.map(l => l.id)).toEqual(['a'])
    expect(dl.state.value.activeLayerId).toBe('a')
    expect(onRemoveLayer).toHaveBeenCalledWith('b')
  })

  it('removeLayer keeps active null when no layers remain', () => {
    const onRemoveLayer = vi.fn()
    const dl = useDocumentLayer({ onRemoveLayer })
    dl.state.value.layers = [layer({ id: 'a' })]
    dl.state.value.activeLayerId = 'a'

    dl.removeLayer('a')
    expect(dl.state.value.layers).toHaveLength(0)
    expect(dl.state.value.activeLayerId).toBeNull()
    expect(onRemoveLayer).toHaveBeenCalledWith('a')
  })

  it('setActiveLayer sets the active layer id', () => {
    const dl = useDocumentLayer()
    dl.state.value.layers = [layer({ id: 'a' }), layer({ id: 'b' })]

    dl.setActiveLayer('b')
    expect(dl.state.value.activeLayerId).toBe('b')
    expect(dl.activeLayer.value?.id).toBe('b')

    dl.setActiveLayer(null)
    expect(dl.state.value.activeLayerId).toBeNull()
  })

  it('clearLayers resets layers, active layer and error', () => {
    const dl = useDocumentLayer()
    dl.state.value.layers = [layer({ id: 'a' })]
    dl.state.value.activeLayerId = 'a'
    dl.state.value.error = 'something'

    dl.clearLayers()
    expect(dl.state.value).toEqual({
      layers: [],
      activeLayerId: null,
      loading: false,
      error: null,
    })
  })

  it('seeds local layers from the Yjs map on construction', () => {
    const yDocumentLayers = new Y.Doc().getMap('documentLayers')
    yDocumentLayers.set('a', layer({ id: 'a' }))
    yDocumentLayers.set('b', layer({ id: 'b' }))

    const dl = useDocumentLayer({ yDocumentLayers })
    expect(dl.state.value.layers.map(l => l.id)).toEqual(['a', 'b'])
  })

  it('observes remote changes to the Yjs map', () => {
    const yDocumentLayers = new Y.Doc().getMap('documentLayers')
    yDocumentLayers.set('a', layer({ id: 'a' }))
    const dl = useDocumentLayer({ yDocumentLayers })
    expect(dl.state.value.layers).toHaveLength(1)

    yDocumentLayers.set('b', layer({ id: 'b' }))
    expect(dl.state.value.layers.map(l => l.id)).toEqual(['a', 'b'])
  })

  it('falls back to the first remaining layer when a remote change drops the active one', () => {
    const yDocumentLayers = new Y.Doc().getMap('documentLayers')
    const dl = useDocumentLayer({ yDocumentLayers })
    yDocumentLayers.set('a', layer({ id: 'a' }))
    yDocumentLayers.set('b', layer({ id: 'b' }))
    dl.setActiveLayer('a')

    yDocumentLayers.delete('a')
    expect(dl.state.value.layers.map(l => l.id)).toEqual(['b'])
    expect(dl.state.value.activeLayerId).toBe('b')
  })

  it('keeps the active layer when a remote change leaves it in place', () => {
    const yDocumentLayers = new Y.Doc().getMap('documentLayers')
    const dl = useDocumentLayer({ yDocumentLayers })
    yDocumentLayers.set('a', layer({ id: 'a' }))
    dl.setActiveLayer('a')

    yDocumentLayers.set('b', layer({ id: 'b' }))
    expect(dl.state.value.activeLayerId).toBe('a')
  })

  it('cleans up the observer on unmount', () => {
    const yDocumentLayers = new Y.Doc().getMap('documentLayers')
    yDocumentLayers.set('a', layer({ id: 'a' }))
    const dl = useDocumentLayer({ yDocumentLayers })
    expect(dl.state.value.layers).toHaveLength(1)

    const cleanup = onUnmountedMock.mock.calls[0]![0]
    cleanup()
    yDocumentLayers.set('b', layer({ id: 'b' }))
    expect(dl.state.value.layers).toHaveLength(1)
  })

  it('onUnmounted does nothing when no observer was started', () => {
    useDocumentLayer()
    const cleanup = onUnmountedMock.mock.calls[0]![0]
    expect(() => cleanup()).not.toThrow()
  })
})
