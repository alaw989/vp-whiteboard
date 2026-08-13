import { describe, expect, it } from 'vitest'
import { inflateSync } from 'node:zlib'
import jsPDF from 'jspdf'
import { drawElementsToPdf } from './vectorExport'
import type { CanvasElement, LineElement, RectangleElement, StrokeElement } from '~/types'

function pdfRawText(pdf: jsPDF): string {
  const out = pdf.output('arraybuffer')
  let s = ''
  for (const b of new Uint8Array(out)) s += String.fromCharCode(b)
  return s
}

/** Decompressed PDF content streams (FlateDecode) joined into one string. */
function pdfStreamText(pdf: jsPDF): string {
  return [...pdfRawText(pdf).matchAll(/stream\r?\n(.*?)endstream/gs)]
    .map(m => m[1])
    .filter((s): s is string => s !== undefined)
    .map((s: string) => {
      try {
        return inflateSync(Buffer.from(s, 'binary')).toString('binary')
      } catch {
        return s
      }
    })
    .join('\n')
}

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

  it('actually renders a pen and highlighter stroke into the PDF content stream', () => {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [800, 600], compress: true })
    const pen: StrokeElement = { points: [[0, 0, 0.5], [100, 20, 0.5], [200, 80, 0.5]], color: '#000000', size: 8, tool: 'pen', smooth: true }
    const highlighter: StrokeElement = { points: [[0, 50, 0.5], [100, 70, 0.5], [200, 130, 0.5]], color: '#ffff00', size: 12, tool: 'highlighter', smooth: true }
    const elements: CanvasElement[] = [
      { id: 'p', type: 'stroke', userId: 'u', userName: 't', timestamp: 1, data: pen },
      { id: 'h', type: 'stroke', userId: 'u', userName: 't', timestamp: 1, data: highlighter },
    ]
    drawElementsToPdf(pdf, elements)
    const raw = pdfRawText(pdf)
    const stream = pdfStreamText(pdf)
    // A filled polygon path (stroke outline) must be emitted — the pre-fix
    // `setGState({ opacity })` threw and silently skipped both strokes.
    // jsPDF emits `B` for fill+stroke (fillStroke), which is what strokes use.
    expect(stream).toMatch(/\bB\b/)
    // Highlighter opacity 0.5 must reach the ExtGState dictionary (jsPDF maps
    // `opacity` → /ca, the fill+stroke alpha) and be referenced via a `gs`
    // operator in the content stream.
    expect(raw).toMatch(/\/ca 0.5/)
    expect(stream).toMatch(/\bgs\b/)
  })
})
