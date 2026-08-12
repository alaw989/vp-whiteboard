import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type jsPDF from 'jspdf'
import type { CanvasElement } from '~/types'
import { arcToCubics, drawElementToPdf, drawElementsToPdf, ellipseToCubics } from './vectorExport'

interface MockPdf {
  moveTo: Mock<(x: number, y: number) => void>
  lineTo: Mock<(x: number, y: number) => void>
  close: Mock<() => void>
  stroke: Mock<() => void>
  fillStroke: Mock<() => void>
  curveTo: Mock<(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => void>
  line: Mock<(x1: number, y1: number, x2: number, y2: number, style?: string | null) => void>
  rect: Mock<(x: number, y: number, w: number, h: number, style?: string | null) => void>
  roundedRect: Mock<(x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string | null) => void>
  circle: Mock<(x: number, y: number, r: number, style?: string | null) => void>
  ellipse: Mock<(x: number, y: number, rx: number, ry: number, style?: string | null) => void>
  triangle: Mock<(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, style?: string | null) => void>
  setDrawColor: Mock<(c: string) => void>
  setFillColor: Mock<(c: string) => void>
  setLineWidth: Mock<(w: number) => void>
  setLineCap: Mock<(s: string | number) => void>
  setLineJoin: Mock<(s: string | number) => void>
  setFont: Mock<(n: string, s?: string, w?: string | number) => void>
  setFontSize: Mock<(s: number) => void>
  setTextColor: Mock<(c: string) => void>
  setGState: Mock<(g: unknown) => void>
  text: Mock<(t: string, x: number, y: number, o?: Record<string, unknown>) => void>
}

function makePdf(): MockPdf {
  return {
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    close: vi.fn(),
    stroke: vi.fn(),
    fillStroke: vi.fn(),
    curveTo: vi.fn(),
    line: vi.fn(),
    rect: vi.fn(),
    roundedRect: vi.fn(),
    circle: vi.fn(),
    ellipse: vi.fn(),
    triangle: vi.fn(),
    setDrawColor: vi.fn(),
    setFillColor: vi.fn(),
    setLineWidth: vi.fn(),
    setLineCap: vi.fn(),
    setLineJoin: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    setGState: vi.fn(),
    text: vi.fn(),
  }
}

function draw(pdf: MockPdf, el: CanvasElement): void {
  drawElementToPdf(pdf as unknown as jsPDF, el)
}

function drawAll(pdf: MockPdf, els: CanvasElement[]): void {
  drawElementsToPdf(pdf as unknown as jsPDF, els)
}

function element(type: CanvasElement['type'], data: Record<string, unknown>): CanvasElement {
  return {
    id: 'el-1',
    type,
    userId: 'u1',
    userName: 'tester',
    timestamp: 1,
    data: data as unknown as CanvasElement['data'],
  }
}

describe('line', () => {
  it('draws a single stroke segment with the element color and width', () => {
    const pdf = makePdf()
    draw(pdf, element('line', { start: [0, 0], end: [100, 50], color: '#ff0000', size: 4 }))
    expect(pdf.setDrawColor).toHaveBeenCalledWith('#ff0000')
    expect(pdf.setLineWidth).toHaveBeenCalledWith(4)
    expect(pdf.line).toHaveBeenCalledWith(0, 0, 100, 50)
    expect(pdf.stroke).not.toHaveBeenCalled()
  })
})

describe('rectangle', () => {
  it('draws a hollow rectangle with style S when no fill is set', () => {
    const pdf = makePdf()
    draw(pdf, element('rectangle', { x: 10, y: 20, width: 50, height: 30, stroke: '#000', strokeWidth: 2 }))
    expect(pdf.rect).toHaveBeenCalledWith(10, 20, 50, 30, 'S')
    expect(pdf.setFillColor).not.toHaveBeenCalled()
  })

  it('draws a filled rectangle with style FD when a fill is set', () => {
    const pdf = makePdf()
    draw(pdf, element('rectangle', { x: 10, y: 20, width: 50, height: 30, stroke: '#000', strokeWidth: 2, fill: '#aaa' }))
    expect(pdf.setFillColor).toHaveBeenCalledWith('#aaa')
    expect(pdf.rect).toHaveBeenCalledWith(10, 20, 50, 30, 'FD')
  })

  it('normalizes negative width/height so the rect is still visible', () => {
    const pdf = makePdf()
    draw(pdf, element('rectangle', { x: 100, y: 100, width: -50, height: -30, stroke: '#000', strokeWidth: 2 }))
    expect(pdf.rect).toHaveBeenCalledWith(50, 70, 50, 30, 'S')
  })
})

describe('circle', () => {
  it('draws a hollow circle (S) or filled circle (FD)', () => {
    const pdf = makePdf()
    draw(pdf, element('circle', { cx: 100, cy: 100, radius: 20, stroke: '#000', strokeWidth: 2 }))
    expect(pdf.circle).toHaveBeenCalledWith(100, 100, 20, 'S')
    const pdf2 = makePdf()
    draw(pdf2, element('circle', { cx: 100, cy: 100, radius: 20, stroke: '#000', strokeWidth: 2, fill: '#fff' }))
    expect(pdf2.circle).toHaveBeenCalledWith(100, 100, 20, 'FD')
  })
})

describe('ellipse', () => {
  it('uses the native ellipse primitive when unrotated', () => {
    const pdf = makePdf()
    draw(pdf, element('ellipse', { x: 10, y: 20, radiusX: 30, radiusY: 15, rotation: 0, stroke: '#000', strokeWidth: 2 }))
    expect(pdf.ellipse).toHaveBeenCalledWith(10, 20, 30, 15, 'S')
    expect(pdf.moveTo).not.toHaveBeenCalled()
  })

  it('draws a rotated ellipse as a bezier path (no native ellipse)', () => {
    const pdf = makePdf()
    draw(pdf, element('ellipse', { x: 0, y: 0, radiusX: 30, radiusY: 15, rotation: 0.5, stroke: '#000', strokeWidth: 2 }))
    expect(pdf.ellipse).not.toHaveBeenCalled()
    expect(pdf.moveTo).toHaveBeenCalledTimes(1)
    expect(pdf.curveTo).toHaveBeenCalledTimes(4)
    expect(pdf.close).toHaveBeenCalledTimes(1)
    expect(pdf.stroke).toHaveBeenCalledTimes(1)
  })
})

describe('polyline', () => {
  it('strokes the points and closes when closed', () => {
    const pdf = makePdf()
    draw(pdf, element('polyline', { points: [[0, 0], [10, 10], [20, 0]], color: '#00f', size: 3, closed: true }))
    expect(pdf.moveTo).toHaveBeenCalledWith(0, 0)
    expect(pdf.lineTo).toHaveBeenCalledWith(10, 10)
    expect(pdf.lineTo).toHaveBeenCalledWith(20, 0)
    expect(pdf.close).toHaveBeenCalledTimes(1)
    expect(pdf.stroke).toHaveBeenCalledTimes(1)
  })
})

describe('arc', () => {
  it('converts a three-point arc to a polyline path', () => {
    const pdf = makePdf()
    draw(pdf, element('arc', { start: [0, 0], through: [50, 50], end: [100, 0], color: '#000', size: 3 }))
    expect(pdf.moveTo).toHaveBeenCalledTimes(1)
    expect(pdf.lineTo.mock.calls.length).toBeGreaterThan(2)
    expect(pdf.stroke).toHaveBeenCalledTimes(1)
  })
})

describe('fillet-arc', () => {
  it('draws the shortest sweep as a bezier arc', () => {
    const pdf = makePdf()
    draw(pdf, element('fillet-arc', { center: [0, 0], radius: 50, startAngle: 0, endAngle: Math.PI / 2, color: '#000', size: 3 }))
    expect(pdf.moveTo).toHaveBeenCalledTimes(1)
    expect(pdf.curveTo.mock.calls.length).toBeGreaterThan(0)
    expect(pdf.stroke).toHaveBeenCalledTimes(1)
  })
})

describe('stroke (pen/highlighter)', () => {
  const points: [number, number, number][] = [[0, 0, 0.5], [10, 0, 0.5], [20, 5, 0.5]]

  it('fills a perfect-freehand outline polygon for a pen stroke', () => {
    const pdf = makePdf()
    draw(pdf, element('stroke', { points, color: '#000', size: 8, tool: 'pen', smooth: true }))
    expect(pdf.fillStroke).toHaveBeenCalledTimes(1)
    expect(pdf.setGState).toHaveBeenCalledWith({ opacity: 1 })
    expect(pdf.moveTo.mock.calls.length).toBeGreaterThan(0)
  })

  it('renders highlighters at 50% opacity', () => {
    const pdf = makePdf()
    draw(pdf, element('stroke', { points, color: '#ff0', size: 12, tool: 'highlighter', smooth: true }))
    expect(pdf.setGState).toHaveBeenCalledWith({ opacity: 0.5 })
  })

  it('skips degenerate strokes with fewer than 2 points', () => {
    const pdf = makePdf()
    draw(pdf, element('stroke', { points: [[0, 0, 0.5]], color: '#000', size: 8, tool: 'pen', smooth: true }))
    expect(pdf.fillStroke).not.toHaveBeenCalled()
  })
})

describe('arrow', () => {
  it('draws the shaft and a filled triangular head at the tip', () => {
    const pdf = makePdf()
    draw(pdf, element('arrow', { points: [[0, 0], [100, 0]], pointerLength: 10, pointerWidth: 10, stroke: '#000', strokeWidth: 2, fill: '#000' }))
    expect(pdf.line).toHaveBeenCalledWith(0, 0, 100, 0)
    expect(pdf.triangle).toHaveBeenCalledTimes(1)
    expect(pdf.setFillColor).toHaveBeenCalledWith('#000')
  })
})

describe('dimension', () => {
  it('draws dimension + extension lines, ticks, and rotated text', () => {
    const pdf = makePdf()
    draw(pdf, element('dimension', {
      start: [0, 0], end: [100, 0], offset: 30, pixelsPerInch: 96, unit: 'inches', precision: 2, style: 'linear', color: '#000', size: 2,
    }))
    expect(pdf.line.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(pdf.setFont).toHaveBeenCalledWith('courier')
    expect(pdf.text).toHaveBeenCalledWith('1.04 in', expect.any(Number), expect.any(Number), expect.objectContaining({ align: 'center' }))
  })
})

describe('stamp', () => {
  it('draws a rounded rect with centered bold text', () => {
    const pdf = makePdf()
    draw(pdf, element('stamp', {
      stampType: 'APPROVED', text: 'APPROVED', x: 10, y: 10, width: 120, height: 50,
      backgroundColor: '#0a0', textColor: '#fff', borderColor: '#0a0', fontSize: 18, padding: 4, borderRadius: 4,
    }))
    expect(pdf.roundedRect).toHaveBeenCalledWith(10, 10, 120, 50, 4, 4, 'FD')
    expect(pdf.setFont).toHaveBeenCalledWith('helvetica', 'bold')
    expect(pdf.text).toHaveBeenCalledWith('APPROVED', 70, 35, expect.objectContaining({ align: 'center', baseline: 'middle' }))
  })
})

describe('text', () => {
  it('emits the text at its position with the element color', () => {
    const pdf = makePdf()
    draw(pdf, element('text', { text: 'hi', x: 5, y: 9, fontSize: 24, color: '#123456', fontFamily: 'Arial' }))
    expect(pdf.setTextColor).toHaveBeenCalledWith('#123456')
    expect(pdf.text).toHaveBeenCalledWith('hi', 5, 9)
  })
})

describe('text-annotation', () => {
  it('draws the leader line and the text offset below its end', () => {
    const pdf = makePdf()
    draw(pdf, element('text-annotation', {
      text: 'note', x: 50, y: 60, fontSize: 14, color: '#000', fontFamily: 'Arial',
      leaderLine: { start: [50, 60], end: [120, 100] },
    }))
    expect(pdf.line).toHaveBeenCalledWith(50, 60, 120, 100)
    expect(pdf.text).toHaveBeenCalledWith('note', 120, 120)
  })
})

describe('measurement-distance', () => {
  it('draws the line, end anchors, and a formatted label', () => {
    const pdf = makePdf()
    draw(pdf, element('measurement-distance', {
      start: [0, 0], end: [96, 0], pixelsPerInch: 96, unit: 'inches', precision: 2,
    }))
    expect(pdf.line).toHaveBeenCalledWith(0, 0, 96, 0)
    expect(pdf.circle.mock.calls.length).toBe(2)
    expect(pdf.text).toHaveBeenCalledWith('1.00"', 48, -15, expect.objectContaining({ align: 'center' }))
  })
})

describe('unknown / non-vectorizable types', () => {
  it('does nothing for image elements (already in the raster background)', () => {
    const pdf = makePdf()
    draw(pdf, element('image', { src: 'data:image/png;base64,AAAA', x: 0, y: 0, width: 10, height: 10 }))
    for (const [name, fn] of Object.entries(pdf)) {
      expect(fn, name).not.toHaveBeenCalled()
    }
  })

  it('does nothing for measurement-area (targets another element)', () => {
    const pdf = makePdf()
    draw(pdf, element('measurement-area', { targetElementId: 'x', pixelsPerInch: 96, unit: 'sq-inches', precision: 2 }))
    for (const fn of Object.values(pdf)) expect(fn).not.toHaveBeenCalled()
  })
})

describe('drawElementsToPdf', () => {
  it('draws each vectorizable element and skips malformed ones without aborting', () => {
    const pdf = makePdf()
    const good = element('line', { start: [0, 0], end: [10, 10], color: '#000', size: 2 })
    // Malformed: missing required data → the draw throws internally and is skipped.
    const bad = element('line', { start: [0, 0] })
    const img = element('image', { src: 'x', x: 0, y: 0, width: 1, height: 1 })
    expect(() => drawAll(pdf, [good, bad, img])).not.toThrow()
    expect(pdf.line).toHaveBeenCalledTimes(1)
    expect(pdf.line).toHaveBeenCalledWith(0, 0, 10, 10)
  })

  it('is a no-op for an empty element list', () => {
    const pdf = makePdf()
    drawAll(pdf, [])
    for (const fn of Object.values(pdf)) expect(fn).not.toHaveBeenCalled()
  })
})

describe('arcToCubics', () => {
  it('returns a single segment for a quarter turn whose endpoints lie on the circle', () => {
    const cubics = arcToCubics(0, 0, 10, 0, Math.PI / 2)
    expect(cubics).toHaveLength(1)
    const c = cubics[0]!
    expect(c.start.x).toBeCloseTo(10)
    expect(c.start.y).toBeCloseTo(0)
    expect(c.end.x).toBeCloseTo(0)
    expect(c.end.y).toBeCloseTo(10)
  })

  it('splits a full turn into 4 segments', () => {
    expect(arcToCubics(0, 0, 10, 0, Math.PI * 2)).toHaveLength(4)
  })

  it('returns an empty array for a zero radius or zero sweep', () => {
    expect(arcToCubics(0, 0, 0, 0, Math.PI)).toEqual([])
    expect(arcToCubics(0, 0, 10, 0, 0)).toEqual([])
  })
})

describe('ellipseToCubics', () => {
  it('produces 4 connected quadrants on the ellipse', () => {
    const cubics = ellipseToCubics(0, 0, 20, 10, 0)
    expect(cubics).toHaveLength(4)
    expect(cubics[0]!.start.x).toBeCloseTo(20)
    expect(cubics[0]!.start.y).toBeCloseTo(0)
    expect(cubics[0]!.end.x).toBeCloseTo(0)
    expect(cubics[0]!.end.y).toBeCloseTo(-10)
    expect(cubics[1]!.start.x).toBeCloseTo(0)
    expect(cubics[1]!.end.x).toBeCloseTo(-20)
  })

  it('rotates the anchor points around the center', () => {
    const cubics = ellipseToCubics(0, 0, 20, 10, Math.PI / 2)
    // The anchor that was at (+rx, 0) rotates to (0, +rx) after +90°.
    expect(cubics[0]!.start.x).toBeCloseTo(0)
    expect(cubics[0]!.start.y).toBeCloseTo(20)
  })

  it('returns an empty array for a degenerate ellipse', () => {
    expect(ellipseToCubics(0, 0, 0, 10)).toEqual([])
  })
})
