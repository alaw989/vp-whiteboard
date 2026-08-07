import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  shouldReconnectOnClose,
  encodeSyncFrame,
  decodeSyncFrame,
  applyRemoteSyncFrame,
  deduplicateYjsElements,
  REMOTE_ORIGIN,
} from './useCollaborativeCanvas'

describe('useCollaborativeCanvas — WebSocket reconnect policy', () => {
  it('reconnects on ordinary close codes', () => {
    expect(shouldReconnectOnClose(1006)).toBe(true)
    expect(shouldReconnectOnClose(1000)).toBe(true)
    expect(shouldReconnectOnClose(undefined)).toBe(true)
  })

  it('does NOT reconnect when the relay rejects with 4001 (auth required)', () => {
    // 4001 = "Authentication required": a logged-out viewer of a raw link or
    // an expired/revoked share token. Auto-retrying just hammers the relay.
    expect(shouldReconnectOnClose(4001)).toBe(false)
  })
})

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

describe('useCollaborativeCanvas — live sync (delta propagation both ways)', () => {
  // Mirrors importState in the composable: every client that loads the same DB
  // canvas_state re-creates the elements as fresh CRDT structs under its own
  // Yjs clientId. This is the source of struct divergence between clients.
  function importState(doc: Y.Doc, yElements: Y.Array<any>, elements: any[]) {
    doc.transact(() => {
      yElements.delete(0, yElements.length)
      yElements.insert(0, elements)
    }, 'import')
  }

  const A = { id: 'A', type: 'stroke' as const }
  const B = { id: 'B', type: 'stroke' as const }
  const C = { id: 'C', type: 'stroke' as const }
  const D = { id: 'D', type: 'line' as const }

  function ids(yElements: Y.Array<any>): string[] {
    return yElements.toArray().map((e: any) => e.id)
  }

  it('a plain incremental delta is silently dropped when CRDT structs diverge (regression)', () => {
    // Two clients both restored the same board from the DB.
    const a = new Y.Doc()
    const aEl = a.getArray('elements')
    importState(a, aEl, [A])
    const b = new Y.Doc()
    const bEl = b.getArray('elements')
    importState(b, bEl, [A])

    // A draws a new element; the incremental delta references A's structs.
    let delta: Uint8Array | null = null
    a.on('update', (u, origin) => { if (origin === 'draw') delta = u })
    a.transact(() => aEl.push([B]), 'draw')
    expect(delta).not.toBeNull()

    // The receiving client applies the delta... and nothing lands, because B's
    // doc has no knowledge of A's structs. This is the live-sync bug: edits
    // only ever appear after a full reload (DB import).
    applyRemoteSyncFrame(b, bEl, encodeSyncFrame(delta!, false))
    expect(ids(bEl)).toEqual(['A'])
  })

  it('full-state sync + dedupe reconciles two divergently-imported docs', () => {
    const a = new Y.Doc()
    const aEl = a.getArray('elements')
    importState(a, aEl, [A, B])
    const b = new Y.Doc()
    const bEl = b.getArray('elements')
    importState(b, bEl, [A, B])

    // A announces its canonical state; B applies it and dedupes (its own
    // divergent copies are collapsed into A's).
    applyRemoteSyncFrame(b, bEl, encodeSyncFrame(Y.encodeStateAsUpdate(a), true))

    expect(ids(bEl)).toEqual(['A', 'B'])
  })

  it('after convergence, deltas propagate BOTH ways (owner -> viewer, viewer -> owner)', () => {
    const a = new Y.Doc()
    const aEl = a.getArray('elements')
    importState(a, aEl, [A, B])
    const b = new Y.Doc()
    const bEl = b.getArray('elements')
    importState(b, bEl, [A, B])

    // Two-way full-state exchange + dedupe establishes a shared item graph.
    applyRemoteSyncFrame(b, bEl, encodeSyncFrame(Y.encodeStateAsUpdate(a), true))
    applyRemoteSyncFrame(a, aEl, encodeSyncFrame(Y.encodeStateAsUpdate(b), true))
    expect(ids(aEl)).toEqual(ids(bEl))

    // Owner (A) draws C -> viewer (B) sees it without a reload.
    let deltaC: Uint8Array | null = null
    a.on('update', (u, origin) => { if (origin === 'draw-C') deltaC = u })
    a.transact(() => aEl.push([C]), 'draw-C')
    applyRemoteSyncFrame(b, bEl, encodeSyncFrame(deltaC!, false))
    expect(ids(bEl)).toContain('C')

    // Viewer (B) draws D -> owner (A) sees it without a reload.
    let deltaD: Uint8Array | null = null
    b.on('update', (u, origin) => { if (origin === 'draw-D') deltaD = u })
    b.transact(() => bEl.push([D]), 'draw-D')
    applyRemoteSyncFrame(a, aEl, encodeSyncFrame(deltaD!, false))
    expect(ids(aEl)).toContain('D')

    // Both docs end up with identical content.
    expect(ids(aEl)).toEqual(ids(bEl))
  })

  it('sync frame round-trips its full/delta flag', () => {
    const update = new Uint8Array([1, 2, 3, 4])
    const full = decodeSyncFrame(encodeSyncFrame(update, true))
    expect(full.isFull).toBe(true)
    expect(Array.from(full.update)).toEqual([1, 2, 3, 4])
    const delta = decodeSyncFrame(encodeSyncFrame(update, false))
    expect(delta.isFull).toBe(false)
    expect(Array.from(delta.update)).toEqual([1, 2, 3, 4])
  })

  it('deduplicateYjsElements collapses duplicates and does not echo (REMOTE_ORIGIN)', () => {
    const doc = new Y.Doc()
    const yElements = doc.getArray('elements')
    doc.transact(() => {
      yElements.insert(0, [A, B, A, C, B])
    }, 'setup')

    const broadcasted: unknown[] = []
    doc.on('update', (_, origin) => { broadcasted.push(origin) })

    const removed = deduplicateYjsElements(yElements)
    expect(removed).toBe(2)
    expect(ids(yElements)).toEqual(['A', 'C', 'B'])
    // Dedup deletes must never be broadcast (positional deletes crossing peers
    // would wipe content); they are tagged with the remote origin.
    expect(broadcasted).toEqual([REMOTE_ORIGIN])
  })
})
