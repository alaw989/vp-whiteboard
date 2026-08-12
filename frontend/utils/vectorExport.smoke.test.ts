import { describe, expect, it } from 'vitest'
import jsPDF from 'jspdf'
import { drawElementsToPdf } from './vectorExport'
import type { CanvasElement, LineElement, RectangleElement, StrokeElement } from '~/types'

describe('smoke: real jsPDF + vector layer', () => {
  it('produces a valid PDF with %PDF magic and non-trivial size', () => {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [800, 600], compress: true })
    const line: LineElement = { start: [10, 10], end: [700, 500], color: '#ff0000', size: 6 }
    const rect: RectangleElement = { x: 100, y: 100, width: 200, height: 100, stroke: '#0000ff', strokeWidth: 4, fill: '#ffff00' }
    const stroke: StrokeElement = { points: [[0, 0, 0.5], [100, 20, 0.5], [200, 80, 0.5], [300, 120, 0.6]], color: '#000000', size: 8, tool: 'pen', smooth: true }
    const elements: CanvasElement[] = [
      { id: '1', type: 'line', userId: 'u', userName: 't', timestamp: 1, data: line },
      { id: '2', type: 'rectangle', userId: 'u', userName: 't', timestamp: 1, data: rect },
      { id: '3', type: 'stroke', userId: 'u', userName: 't', timestamp: 1, data: stroke },
    ]
    drawElementsToPdf(pdf, elements)
    const blob = pdf.output('blob')
    expect(blob.size).toBeGreaterThan(100)
    const reader = new FileReader()
    return new Promise<void>((resolve, reject) => {
      reader.onload = () => {
        const firstBytes = String(reader.result).slice(0, 10)
        expect(firstBytes).toContain('%PDF')
        resolve()
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })
  })
})
