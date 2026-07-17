import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

describe('useCollaborativeCanvas — persistence helpers', () => {
  function createTestDoc() {
    const ydoc = new Y.Doc()
    const yElements = ydoc.getArray('elements')
    const yMeta = ydoc.getMap('meta')
    const yDocumentLayers = ydoc.getMap('documentLayers')
    return { ydoc, yElements, yMeta, yDocumentLayers }
  }

  it('import dedup removes duplicate element ids keeping first occurrence', () => {
    const state = {
      version: 1,
      elements: [
        { id: 'a', type: 'rectangle' as const },
        { id: 'b', type: 'circle' as const },
        { id: 'a', type: 'rectangle' as const },
      ],
    }

    const seen = new Set<string>()
    const unique = state.elements.filter(el => {
      if (seen.has(el.id)) return false
      seen.add(el.id)
      return true
    })

    expect(unique).toHaveLength(2)
    expect(unique.map(e => e.id)).toEqual(['a', 'b'])
  })

  it('export dedup removes duplicate element ids keeping last occurrence (reverse)', () => {
    const { yElements } = createTestDoc()
    yElements.push([
      { id: 'a', type: 'rectangle' },
      { id: 'b', type: 'circle' },
      { id: 'a', type: 'rectangle' },
      { id: 'c', type: 'line' },
      { id: 'b', type: 'circle' },
    ] as any)

    const seen = new Set<string>()
    let removed = 0
    for (let i = yElements.length - 1; i >= 0; i--) {
      const el = yElements.get(i) as any
      if (el && seen.has(el.id)) {
        yElements.delete(i, 1)
        removed++
      } else if (el) {
        seen.add(el.id)
      }
    }

    expect(removed).toBe(2)
    expect(yElements.toArray().map((e: any) => e.id)).toEqual(['a', 'c', 'b'])
  })

  it('roundElementCoords truncates points to 2 decimal places', () => {
    const points = [
      [1.23456, 2.78901, 0],
      [3.14159, 4.99999, 0],
    ] as [number, number, number][]

    const rounded = points.map(p => p.map(v => Math.round(v * 100) / 100))

    expect(rounded).toEqual([
      [1.23, 2.79, 0],
      [3.14, 5, 0],
    ])
  })

  it('export strips src from PDF layers and sets needsRender', () => {
    const { yDocumentLayers } = createTestDoc()
    yDocumentLayers.set('pdf1', {
      id: 'pdf1',
      type: 'pdf',
      src: 'data:application/pdf;base64,AAAA',
      fileId: 'file-123',
      needsRender: false,
    })
    yDocumentLayers.set('img1', {
      id: 'img1',
      type: 'image',
      src: 'data:image/png;base64,BBBB',
      fileId: 'file-456',
      needsRender: false,
    })

    const rawLayers = Array.from(yDocumentLayers.values())
    const exported = rawLayers.map((l: any) => {
      if (l.type === 'pdf') {
        const { src, ...rest } = l
        return { ...rest, needsRender: true }
      }
      return l
    })

    const pdfLayer = exported.find((l: any) => l.id === 'pdf1')
    expect(pdfLayer.src).toBeUndefined()
    expect(pdfLayer.needsRender).toBe(true)
    expect(pdfLayer.fileId).toBe('file-123')

    const imgLayer = exported.find((l: any) => l.id === 'img1')
    expect(imgLayer.src).toBe('data:image/png;base64,BBBB')
    expect(imgLayer.needsRender).toBe(false)
  })

  it('import restores document layers into yDocumentLayers', () => {
    const { yDocumentLayers } = createTestDoc()

    const documentLayers = [
      { id: 'pdf1', type: 'pdf', fileId: 'f1', needsRender: true },
      { id: 'img1', type: 'image', fileId: 'f2', src: 'data:...' },
    ]

    yDocumentLayers.clear()
    for (const layer of documentLayers) {
      yDocumentLayers.set(layer.id, layer)
    }

    expect((yDocumentLayers.get('pdf1') as any)?.fileId).toBe('f1')
    expect((yDocumentLayers.get('img1') as any)?.src).toBe('data:...')
    expect(Array.from(yDocumentLayers.values())).toHaveLength(2)
  })
})
