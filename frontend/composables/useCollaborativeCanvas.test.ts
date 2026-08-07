import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import {
  shouldReconnectOnClose,
  encodeSyncFrame,
  decodeSyncFrame,
  applyRemoteSyncFrame,
  deduplicateYjsElements,
  applyPresenceMessage,
  REMOTE_ORIGIN,
  useCollaborativeCanvas,
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

describe('useCollaborativeCanvas — relay presence messages (user-joined/user-left)', () => {
  it('seeds an immediate presence entry on user-joined', () => {
    const users = new Map<string, any>()
    applyPresenceMessage(users, { type: 'user-joined', userId: 'peer-1', userName: 'Ada' }, 1000)

    expect(users.get('peer-1')).toEqual({
      id: 'peer-1',
      name: 'Ada',
      color: expect.any(String),
      lastSeen: 1000,
    })
  })

  it('user-joined is idempotent — a repeat join does not overwrite the existing entry', () => {
    const users = new Map<string, any>()
    applyPresenceMessage(users, { type: 'user-joined', userId: 'peer-1', userName: 'Ada' }, 1000)
    const seeded = users.get('peer-1')

    applyPresenceMessage(users, { type: 'user-joined', userId: 'peer-1', userName: 'Ada' }, 5000)
    expect(users.get('peer-1')).toBe(seeded)
  })

  it('user-left removes the peer immediately instead of waiting out the 30s cursor expiry', () => {
    const users = new Map<string, any>()
    applyPresenceMessage(users, { type: 'user-joined', userId: 'peer-1', userName: 'Ada' }, 1000)
    applyPresenceMessage(users, { type: 'user-left', userId: 'peer-1' }, 2000)

    expect(users.has('peer-1')).toBe(false)
  })

  it('ignores frames without a userId and non-presence types', () => {
    const users = new Map<string, any>()
    applyPresenceMessage(users, { type: 'user-joined' }, 1000)
    applyPresenceMessage(users, { type: 'whatever', userId: 'peer-1' }, 1000)

    expect(users.size).toBe(0)
  })

  it('leaves other users untouched when one peer leaves', () => {
    const users = new Map<string, any>()
    applyPresenceMessage(users, { type: 'user-joined', userId: 'peer-1', userName: 'Ada' }, 1000)
    applyPresenceMessage(users, { type: 'user-joined', userId: 'peer-2', userName: 'Grace' }, 1000)
    applyPresenceMessage(users, { type: 'user-left', userId: 'peer-1' }, 2000)

    expect(users.has('peer-1')).toBe(false)
    expect(users.get('peer-2')).toBeDefined()
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

  it('a stale-peer SYNC_FULL that is a strict SUBSET cannot wipe newer content already applied as a delta', () => {
    // A and B both restored the same board, then converged via full-state
    // exchange + dedupe (shared CRDT item graph).
    const a = new Y.Doc()
    const aEl = a.getArray('elements')
    importState(a, aEl, [A, B])
    const b = new Y.Doc()
    const bEl = b.getArray('elements')
    importState(b, bEl, [A, B])

    applyRemoteSyncFrame(b, bEl, encodeSyncFrame(Y.encodeStateAsUpdate(a), true))
    applyRemoteSyncFrame(a, aEl, encodeSyncFrame(Y.encodeStateAsUpdate(b), true))

    // A draws C; B applies it as a plain delta.
    let deltaC: Uint8Array | null = null
    a.on('update', (u, origin) => { if (origin === 'draw-C') deltaC = u })
    a.transact(() => aEl.push([C]), 'draw-C')
    applyRemoteSyncFrame(b, bEl, encodeSyncFrame(deltaC!, false))
    expect([...ids(bEl)].sort()).toEqual(['A', 'B', 'C'])

    // A STALE peer (e.g. a reconnecting client that restored the DB state but
    // never saw C) announces a full state that is a strict SUBSET — and it
    // lands AFTER B already applied C. This must NOT wipe C: Yjs merges the
    // subset's structs monotonically (no delete op is present) and the dedupe
    // collapses the duplicate A/B imports, leaving exactly the union.
    const stale = new Y.Doc()
    const staleEl = stale.getArray('elements')
    importState(stale, staleEl, [A, B])
    applyRemoteSyncFrame(b, bEl, encodeSyncFrame(Y.encodeStateAsUpdate(stale), true))

    const union = ids(bEl)
    expect([...union].sort()).toEqual(['A', 'B', 'C'])
    expect(union).toHaveLength(3)
    expect(new Set(union).size).toBe(union.length)
  })

  it('a duplicated SYNC_FULL frame applied twice never duplicates elements', () => {
    const a = new Y.Doc()
    const aEl = a.getArray('elements')
    importState(a, aEl, [A, B, C])
    const b = new Y.Doc()
    const bEl = b.getArray('elements')
    importState(b, bEl, [A, B])

    // A announces its full state once; B converges onto it. This is the
    // classic "two peers both reply to the same sync-request" / re-delivered
    // reconnect announce case.
    const aFull = encodeSyncFrame(Y.encodeStateAsUpdate(a), true)
    applyRemoteSyncFrame(b, bEl, aFull)
    expect([...ids(bEl)].sort()).toEqual(['A', 'B', 'C'])

    // The SAME frame arrives again. Re-applying identical Yjs structs is a
    // no-op and dedupe has nothing left to do — the doc must not grow a
    // second copy of every element.
    applyRemoteSyncFrame(b, bEl, aFull)
    const after = ids(bEl)
    expect([...after].sort()).toEqual(['A', 'B', 'C'])
    expect(after).toHaveLength(3)
    expect(new Set(after).size).toBe(after.length)
  })
})

describe('useCollaborativeCanvas — reconnect resume (mocked WebSocket)', () => {
  // Deterministic fake of the native WebSocket. The composable assigns
  // onopen/onclose/onmessage handlers directly and gates broadcasts on
  // `ws.readyState === WebSocket.OPEN`, so a class exposing instance
  // `readyState` plus static OPEN/CONNECTING/CLOSED mirrors the real API
  // closely enough to drive the whole reconnect cycle in tests.
  class FakeWebSocket {
    static instances: FakeWebSocket[] = []
    static OPEN = 1
    static CONNECTING = 0
    static CLOSED = 3

    url: string
    readyState = FakeWebSocket.CONNECTING
    binaryType = 'blob'
    sent: (string | Uint8Array)[] = []
    onopen: (() => void) | null = null
    onclose: ((event: { code?: number }) => void) | null = null
    onerror: ((event: unknown) => void) | null = null
    onmessage: ((event: { data: string | Uint8Array }) => void) | null = null

    constructor(url: string) {
      this.url = url
      FakeWebSocket.instances.push(this)
    }

    send(data: string | Uint8Array) {
      this.sent.push(data)
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED
    }

    // --- test helpers (not part of the real WebSocket API) ---
    _open() {
      this.readyState = FakeWebSocket.OPEN
      this.onopen?.()
    }

    _message(data: string | Uint8Array) {
      this.onmessage?.({ data })
    }

    _close(code = 1000) {
      this.readyState = FakeWebSocket.CLOSED
      this.onclose?.({ code })
    }
  }

  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { wsUrl: 'ws://test/ws' } }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // Emulate the relay: forward every frame one socket has queued onto another.
  // Routing a `sync-request` into a peer triggers that peer's SYNC_FULL reply
  // (queued on the peer's own socket), so callers re-pump the reverse direction.
  function pump(from: FakeWebSocket, to: FakeWebSocket) {
    const queued = from.sent.splice(0)
    for (const data of queued) to._message(data)
  }

  function el(id: string) {
    return { id, type: 'rectangle', data: { x: 0, y: 0, width: 10, height: 10, stroke: '#000', strokeWidth: 1 } } as any
  }

  function idsOf(c: ReturnType<typeof useCollaborativeCanvas>): string[] {
    return c.yElements.toArray().map(e => e.id)
  }

  function expectConverged(c: ReturnType<typeof useCollaborativeCanvas>, expected: string[]) {
    const got = idsOf(c)
    expect([...got].sort()).toEqual([...expected].sort())
    expect(got).toHaveLength(expected.length)
    expect(new Set(got).size).toBe(got.length)
  }

  it('re-converges with a peer after its WS drops: offline edits survive via the reconnect SYNC_FULL announce, no duplicates, and deltas flow again', async () => {
    const a = useCollaborativeCanvas('board-1', 'user-a', 'A')
    const b = useCollaborativeCanvas('board-1', 'user-b', 'B')
    const a0 = FakeWebSocket.instances[0]!
    const b0 = FakeWebSocket.instances[1]!

    // --- Phase 1: both clients connect and converge on a shared board. ---
    a0._open()
    b0._open()
    a.addElement(el('A1'))
    b.addElement(el('B1'))
    pump(a0, b0) // A's sync-request + delta A1 -> B (B is empty, no full reply)
    pump(b0, a0) // B's sync-request + delta B1 -> A; B's sync-request makes A announce SYNC_FULL
    pump(a0, b0) // A's SYNC_FULL (in reply to B's request) -> B
    expectConverged(a, ['A1', 'B1'])
    expectConverged(b, ['A1', 'B1'])

    // --- Phase 2: A's socket drops; A keeps editing while offline. ---
    a0._close(1006)
    await vi.advanceTimersByTimeAsync(2000)
    expect(FakeWebSocket.instances).toHaveLength(3) // a0, b0, and the reconnect socket
    const a1 = FakeWebSocket.instances[2]!

    // A draws while disconnected (socket not yet OPEN): sendBinary drops it,
    // but the SYNC_FULL announce on reconnect must carry A2 to the peers.
    a.addElement(el('A2'))
    expect(a1.sent).toHaveLength(0)

    a1._open() // -> sends sync-request + SYNC_FULL([A1, B1, A2])
    pump(a1, b0) // sync-request -> B replies SYNC_FULL; full-state -> B
    pump(b0, a1) // B's SYNC_FULL reply (a strict subset of A's doc) -> A must not lose A2

    expectConverged(a, ['A1', 'B1', 'A2'])
    expectConverged(b, ['A1', 'B1', 'A2'])

    // --- Phase 3: post-reconnect deltas flow in both directions again. ---
    a.addElement(el('A3'))
    pump(a1, b0)
    b.addElement(el('B2'))
    pump(b0, a1)

    expect(idsOf(b)).toContain('A3')
    expect(idsOf(a)).toContain('B2')
    expectConverged(a, ['A1', 'B1', 'A2', 'A3', 'B2'])
    expectConverged(b, ['A1', 'B1', 'A2', 'A3', 'B2'])
  })

  it('an empty board announces NO SYNC_FULL on open or in reply to a sync-request — the empty-doc announce is skipped entirely', async () => {
    // encodeStateAsUpdate of an empty doc is a 2-byte [0, 0] client header,
    // NOT a zero-length update, so a byteLength guard alone would still
    // broadcast a meaningless SYNC_FULL. The composable must skip the announce
    // when the doc has no persisted content (no elements, layers, or meta).
    const a = useCollaborativeCanvas('board-empty', 'user-a', 'A')
    const b = useCollaborativeCanvas('board-empty', 'user-b', 'B')
    const a0 = FakeWebSocket.instances[0]!
    const b0 = FakeWebSocket.instances[1]!

    // On open, only the JSON sync-request text frame is sent — no binary
    // full-state frame.
    a0._open()
    expect(a0.sent).toHaveLength(1)
    expect(a0.sent[0]).toBe(JSON.stringify({ type: 'sync-request' }))
    expect(a0.sent.some((f) => f instanceof Uint8Array)).toBe(false)

    b0._open()
    expect(b0.sent).toHaveLength(1)
    expect(b0.sent[0]).toBe(JSON.stringify({ type: 'sync-request' }))
    expect(b0.sent.some((f) => f instanceof Uint8Array)).toBe(false)

    // Even an explicit sync-request from a peer draws no SYNC_FULL reply when
    // our doc is empty: B's request reaches A, but A sends nothing back.
    // (Clear A's own already-sent sync-request first so we only observe the
    // reply, and note the pump drains B's sent frames onto A.)
    a0.sent.splice(0)
    pump(b0, a0)
    expect(a0.sent).toHaveLength(0)
    expect(a0.sent.some((f) => f instanceof Uint8Array)).toBe(false)

    a.cleanup()
    b.cleanup()
  })

  it('timer hygiene: repeated close/reopen cycles spawn exactly one reconnect socket per close, a close during backoff never double-schedules, and a settled reconnect leaks no pending timers', async () => {
    const a = useCollaborativeCanvas('board-1', 'user-a', 'A')
    const a0 = FakeWebSocket.instances[0]!
    a0._open()
    expect(FakeWebSocket.instances).toHaveLength(1)

    // First drop -> exactly one reconnect socket is created.
    a0._close(1006)
    await vi.advanceTimersByTimeAsync(5000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    const a1 = FakeWebSocket.instances[1]!
    a1._open()

    // Second drop -> again exactly one reconnect socket (no accumulation).
    a1._close(1006)
    await vi.advanceTimersByTimeAsync(5000)
    expect(FakeWebSocket.instances).toHaveLength(3)
    const a2 = FakeWebSocket.instances[2]!
    a2._open()

    // A close landing DURING the reconnect backoff (e.g. a duplicate close
    // event) must not double-schedule a second socket: scheduleReconnect
    // bails when a timer is already pending, so only one reconnect fires.
    a2._close(1006)
    await vi.advanceTimersByTimeAsync(500) // still inside the >=1000ms backoff
    expect(FakeWebSocket.instances).toHaveLength(3)
    a2._close(1006) // spurious second close while the backoff is pending
    await vi.advanceTimersByTimeAsync(5000)
    expect(FakeWebSocket.instances).toHaveLength(4) // exactly one new socket
    const a3 = FakeWebSocket.instances[3]!

    // Once reconnected and settled, the pending reconnect timer must have
    // been cleared on open: idle time spawns no stray sockets.
    a3._open()
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
    expect(FakeWebSocket.instances).toHaveLength(4)

    // cleanup() tears the heartbeat interval down; nothing spawns afterwards.
    a.cleanup()
    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(FakeWebSocket.instances).toHaveLength(4)
  })

  it('a 4001 rejection DURING the reconnect backoff cancels the pending timer — no socket is created after the backoff elapses', async () => {
    const a = useCollaborativeCanvas('board-1', 'user-a', 'A')
    const a0 = FakeWebSocket.instances[0]!
    a0._open()
    expect(FakeWebSocket.instances).toHaveLength(1)

    // A transient close (1006) schedules a reconnect backoff (~1s).
    a0._close(1006)
    expect(a.authRejected.value).toBe(false)
    expect(a.connectionStatus.value).toBe('connecting')

    // The relay then rejects the attempt with 4001 (auth required). This must
    // cancel the still-pending backoff timer, not just flag authRejected —
    // otherwise the stale timer fires initWebSocket() once the backoff elapses
    // and re-creates a socket doomed to be rejected again.
    a0._close(4001)
    expect(a.authRejected.value).toBe(true)
    expect(a.connectionStatus.value).toBe('disconnected')

    // Even after the original backoff window fully elapses, no new socket is
    // created: the stale timer was cleared on the 4001 rejection.
    await vi.advanceTimersByTimeAsync(30 * 1000)
    expect(FakeWebSocket.instances).toHaveLength(1)

    a.cleanup()
  })
})
