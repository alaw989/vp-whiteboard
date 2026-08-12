import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type jsPDF from 'jspdf'
import type { CanvasElement } from '~/types'

vi.mock('perfect-freehand', () => ({
  getStroke: (): number[][] => [],
}))

import { drawElementToPdf } from './vectorExport'

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

describe('stroke degenerate outline guard', () => {
  it('skips a stroke when perfect-freehand returns fewer than 2 outline points', () => {
    const pdf = makePdf()
    const stroke: CanvasElement = element('stroke', {
      points: [[0, 0, 0.5], [10, 10, 0.5]],
      color: '#000',
      size: 8,
      tool: 'pen',
      smooth: true,
    })
    drawElementToPdf(pdf as unknown as jsPDF, stroke)
    expect(pdf.moveTo).not.toHaveBeenCalled()
    expect(pdf.lineTo).not.toHaveBeenCalled()
    expect(pdf.fillStroke).not.toHaveBeenCalled()
  })
})
