import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Stage } from 'konva/lib/Stage'

const { addImageMock, outputMock, instances, JsPDFMock } = vi.hoisted(() => {
  const addImageMock = vi.fn()
  const outputMock = vi.fn(() => new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
  const instances: { config: Record<string, unknown> }[] = []
  class JsPDFMock {
    config: Record<string, unknown>
    constructor(config: Record<string, unknown>) {
      this.config = config
      instances.push(this as unknown as { config: Record<string, unknown> })
    }
    addImage = addImageMock
    output = outputMock
  }
  return { addImageMock, outputMock, instances, JsPDFMock }
})

vi.mock('jspdf', () => ({ default: JsPDFMock }))
vi.mock('~/composables/useToast', () => ({ toastError: vi.fn() }))
vi.mock('~/utils/vectorExport', () => ({ drawElementsToPdf: vi.fn() }))

import { useExport, getTimestamp, generateFilename } from './useExport'
import { toastError } from '~/composables/useToast'
import { drawElementsToPdf } from '~/utils/vectorExport'
import type { CanvasElement, LineElement } from '~/types'

const toastErrorMock = vi.mocked(toastError)
const drawElementsToPdfMock = vi.mocked(drawElementsToPdf)
let lastClickTarget: HTMLAnchorElement | null = null

function makeStage(
  width = 800,
  height = 600,
  toDataURL: (config?: Record<string, unknown>) => string = () => 'data:image/png;base64,AAAA'
): Stage {
  return { width: () => width, height: () => height, toDataURL: vi.fn(toDataURL) } as unknown as Stage
}

beforeEach(() => {
  lastClickTarget = null
  toastErrorMock.mockClear()
  addImageMock.mockClear()
  outputMock.mockClear()
  drawElementsToPdfMock.mockClear()
  instances.length = 0
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-pdf')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    lastClickTarget = this
  })
})

describe('getTimestamp', () => {
  it('returns a compact ISO timestamp (YYYY-MM-DDTHH-mm-ss)', () => {
    expect(getTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/)
  })
})

describe('generateFilename', () => {
  it('produces a whiteboard-<timestamp>.png default', () => {
    expect(generateFilename('whiteboard', 'png')).toMatch(/^whiteboard-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.png$/)
  })

  it('uses the pdf extension for pdf format', () => {
    expect(generateFilename('whiteboard', 'pdf')).toMatch(/\.pdf$/)
  })

  it('sanitizes the base name: lowercases and replaces non-alphanumerics with dashes', () => {
    expect(generateFilename('My Design v2!', 'png')).toMatch(/^my-design-v2-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.png$/)
  })

  it('collapses consecutive dashes and trims leading/trailing dashes', () => {
    expect(generateFilename('foo!!bar', 'png')).toMatch(/^foo-bar-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.png$/)
    expect(generateFilename('!leading and trailing!', 'png')).toMatch(/^leading-and-trailing-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.png$/)
  })

  it('falls back to the whiteboard default when the base name is empty or all symbols', () => {
    expect(generateFilename('', 'png')).toMatch(/^whiteboard-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.png$/)
    expect(generateFilename('   ', 'pdf')).toMatch(/^whiteboard-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.pdf$/)
    expect(generateFilename('!!!', 'png')).toMatch(/^whiteboard-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.png$/)
  })
})

describe('exportAsPNG', () => {
  it('exports the stage at 1x pixel ratio and downloads a .png with an auto-generated filename', async () => {
    const stage = makeStage(800, 600)
    const { exportAsPNG, isExporting, progress } = useExport()

    await exportAsPNG(stage)

    expect(stage.toDataURL).toHaveBeenCalledWith({
      pixelRatio: 1,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    })
    expect(lastClickTarget?.download).toMatch(/\.png$/)
    expect(lastClickTarget?.href).toBe('data:image/png;base64,AAAA')
    expect(progress.value).toBe(100)
    expect(isExporting.value).toBe(false)
  })

  it('honors a custom filename and pixelRatio from options', async () => {
    const stage = makeStage(800, 600)
    const { exportAsPNG } = useExport()

    await exportAsPNG(stage, { filename: 'custom-shot.png', pixelRatio: 2 })

    expect(stage.toDataURL).toHaveBeenCalledWith(expect.objectContaining({ pixelRatio: 2 }))
    expect(lastClickTarget?.download).toBe('custom-shot.png')
  })

  it('sets a clear error and skips download when the stage is missing', async () => {
    const { exportAsPNG, error } = useExport()

    await exportAsPNG(null)

    expect(error.value).toBe('Canvas not available')
    expect(lastClickTarget).toBeNull()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('maps a tainted-canvas SecurityError to the cross-origin toast message', async () => {
    const stage = makeStage(800, 600, () => {
      throw new Error('The canvas has been tainted by cross-origin data.')
    })
    const { exportAsPNG, error, isExporting } = useExport()

    await exportAsPNG(stage)

    expect(error.value).toContain('tainted')
    expect(toastErrorMock).toHaveBeenCalledWith('Export blocked by cross-origin image. Try removing uploaded images first.')
    expect(isExporting.value).toBe(false)
  })

  it('surfaces a generic export failure toast for unrelated errors', async () => {
    const stage = makeStage(800, 600, () => {
      throw new Error('konva exploded')
    })
    const { exportAsPNG, error } = useExport()

    await exportAsPNG(stage)

    expect(error.value).toBe('konva exploded')
    expect(toastErrorMock).toHaveBeenCalledWith('Export failed')
  })

  it('exports a large canvas at its full pixel size without hanging', async () => {
    const stage = makeStage(4096, 3072)
    const { exportAsPNG, error, isExporting } = useExport()

    await exportAsPNG(stage)

    expect(stage.toDataURL).toHaveBeenCalledWith({
      pixelRatio: 1,
      x: 0,
      y: 0,
      width: 4096,
      height: 3072,
    })
    expect(lastClickTarget?.download).toMatch(/\.png$/)
    expect(error.value).toBeNull()
    expect(isExporting.value).toBe(false)
  })
})

describe('exportAsPDF', () => {
  it('renders the stage at 2x, embeds it in a page sized to the canvas, and downloads a .pdf', async () => {
    const stage = makeStage(800, 600)
    const { exportAsPDF, progress, isExporting } = useExport()

    await exportAsPDF(stage)

    expect(stage.toDataURL).toHaveBeenCalledWith({
      pixelRatio: 2,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    })
    expect(addImageMock).toHaveBeenCalledWith('data:image/png;base64,AAAA', 'PNG', 0, 0, 800, 600)
    expect(outputMock).toHaveBeenCalledWith('blob')
    expect(lastClickTarget?.download).toMatch(/\.pdf$/)
    expect(lastClickTarget?.href).toBe('blob:mock-pdf')
    expect(progress.value).toBe(100)
    expect(isExporting.value).toBe(false)
  })

  it('sizes the PDF page to the canvas and picks orientation from the aspect ratio', async () => {
    const landscape = makeStage(1200, 800)
    const { exportAsPDF } = useExport()
    await exportAsPDF(landscape)
    const landscapeConfig = instances[0]?.config
    expect(landscapeConfig).toEqual({
      orientation: 'landscape',
      unit: 'px',
      format: [1200, 800],
      compress: true,
    })

    const portrait = makeStage(600, 900)
    const { exportAsPDF: portraitExport } = useExport()
    await portraitExport(portrait)
    const portraitConfig = instances[1]?.config
    expect(portraitConfig?.orientation).toBe('portrait')
    expect(portraitConfig?.format).toEqual([600, 900])
  })

  it('sets a clear error and skips download when the stage is missing', async () => {
    const { exportAsPDF, error } = useExport()

    await exportAsPDF(null)

    expect(error.value).toBe('Canvas not available')
    expect(lastClickTarget).toBeNull()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('maps a tainted-canvas error to the cross-origin toast message', async () => {
    const stage = makeStage(800, 600, () => {
      throw new Error('The canvas has been tainted by cross-origin data.')
    })
    const { exportAsPDF, error, isExporting } = useExport()

    await exportAsPDF(stage)

    expect(error.value).toContain('tainted')
    expect(toastErrorMock).toHaveBeenCalledWith('Export blocked by cross-origin image. Try removing uploaded images first.')
    expect(isExporting.value).toBe(false)
  })

  it('surfaces a generic PDF export failure toast for unrelated errors', async () => {
    const stage = makeStage(800, 600, () => {
      throw new Error('pdf broken')
    })
    const { exportAsPDF, error } = useExport()

    await exportAsPDF(stage)

    expect(error.value).toBe('pdf broken')
    expect(toastErrorMock).toHaveBeenCalledWith('PDF export failed')
  })

  it('sizes the PDF page to a large canvas without tripping jsPDF limits', async () => {
    const stage = makeStage(4096, 3072)
    const { exportAsPDF, error, isExporting } = useExport()

    await exportAsPDF(stage)

    expect(stage.toDataURL).toHaveBeenCalledWith({
      pixelRatio: 2,
      x: 0,
      y: 0,
      width: 4096,
      height: 3072,
    })
    expect(instances[0]?.config).toEqual({
      orientation: 'landscape',
      unit: 'px',
      format: [4096, 3072],
      compress: true,
    })
    expect(addImageMock).toHaveBeenCalledWith('data:image/png;base64,AAAA', 'PNG', 0, 0, 4096, 3072)
    expect(lastClickTarget?.download).toMatch(/\.pdf$/)
    expect(error.value).toBeNull()
    expect(isExporting.value).toBe(false)
  })

  it('draws the crisp vector layer on top of the raster when elements are provided', async () => {
    const stage = makeStage(800, 600)
    const { exportAsPDF } = useExport()
    const lineData: LineElement = { start: [0, 0], end: [10, 10], color: '#000', size: 2 }
    const elements: CanvasElement[] = [
      { id: 'a', type: 'line', userId: 'u', userName: 't', timestamp: 1, data: lineData },
    ]

    await exportAsPDF(stage, { filename: 'vec.pdf' }, elements)

    expect(drawElementsToPdfMock).toHaveBeenCalledTimes(1)
    expect(drawElementsToPdfMock).toHaveBeenCalledWith(instances[0], elements)
    expect(lastClickTarget?.download).toBe('vec.pdf')
  })

  it('skips the vector layer when no elements are provided', async () => {
    const stage = makeStage(800, 600)
    const { exportAsPDF } = useExport()

    await exportAsPDF(stage)

    expect(drawElementsToPdfMock).not.toHaveBeenCalled()
  })
})
