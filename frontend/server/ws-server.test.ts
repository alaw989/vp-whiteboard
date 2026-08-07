import { describe, expect, it } from 'vitest'
import { resolveStatefulOrigin, relayClientMessage, runHeartbeat, HEARTBEAT_TIMEOUT_MS } from './ws-server'

const API_URL = 'http://localhost:8002'

describe('ws-server — resolveStatefulOrigin (Sanctum session auth)', () => {
  it('forwards the browser Origin and does NOT synthesize a Referer when only Origin is present', () => {
    // A WS handshake carries `Origin` but never `Referer`. Sanctum's
    // EnsureFrontendRequestsAreStateful reads referer FIRST, so fabricating one
    // (e.g. the API origin) would win over the browser origin and skip session
    // auth, 401ing even a validly-logged-in owner.
    const { origin, referer } = resolveStatefulOrigin('http://localhost:3000', undefined, API_URL)
    expect(origin).toBe('http://localhost:3000')
    expect(referer).toBeUndefined()
  })

  it('normalizes a handshake Origin to its bare origin', () => {
    const { origin, referer } = resolveStatefulOrigin('http://localhost:3000/board/abc', undefined, API_URL)
    expect(origin).toBe('http://localhost:3000')
    expect(referer).toBeUndefined()
  })

  it('forwards a client Referer when present', () => {
    const { origin, referer } = resolveStatefulOrigin(
      'http://localhost:3000',
      'http://localhost:3000/whiteboard/x',
      API_URL,
    )
    expect(origin).toBe('http://localhost:3000')
    expect(referer).toBe('http://localhost:3000/whiteboard/x')
  })

  it('falls back to LARAVEL_URL-derived headers only when the handshake carried neither', () => {
    const { origin, referer } = resolveStatefulOrigin(undefined, undefined, API_URL)
    expect(origin).toBe('http://localhost:8002')
    expect(referer).toBe('http://localhost:8002/')
  })

  it('strips a path from the fallback LARAVEL_URL origin', () => {
    const { origin } = resolveStatefulOrigin(undefined, undefined, 'http://localhost:8002/api')
    expect(origin).toBe('http://localhost:8002')
  })
})

describe('ws-server — relayClientMessage (frame routing = live-edit propagation)', () => {
  function fakeWs(id: string, open = true) {
    const sent: ({ json: Record<string, unknown> } | { binary: Buffer })[] = []
    return {
      id,
      readyState: open ? 1 : 3,
      lastPong: 0,
      sent,
      send(d: string | Buffer) {
        if (typeof d === 'string') sent.push({ json: JSON.parse(d) })
        else sent.push({ binary: d })
      },
    }
  }

  it('forwards sync-request JSON to all other OPEN peers, never back to the sender', () => {
    const a = fakeWs('a')
    const b = fakeWs('b')
    const c = fakeWs('c')
    const room = new Set([a, b, c])

    const result = relayClientMessage(a, Buffer.from(JSON.stringify({ type: 'sync-request' })), room)

    if (result.kind !== 'json') throw new Error('expected json frame')
    expect(result.type).toBe('sync-request')
    expect(result.forwarded).toBe(2)
    expect(b.sent).toEqual([{ json: { type: 'sync-request' } }])
    expect(c.sent).toEqual([{ json: { type: 'sync-request' } }])
    expect(a.sent).toEqual([])
  })

  it('answers ping in-place with a pong to the sender only (not broadcast)', () => {
    const a = fakeWs('a')
    const b = fakeWs('b')
    const room = new Set([a, b])

    const result = relayClientMessage(a, Buffer.from(JSON.stringify({ type: 'ping' })), room)

    if (result.kind !== 'json') throw new Error('expected json frame')
    expect(result.type).toBe('ping')
    expect(a.sent).toEqual([{ json: { type: 'pong' } }])
    expect(b.sent).toEqual([])
  })

  it('relays a binary Yjs frame verbatim to all other OPEN peers — regression for dropped deltas', () => {
    // A SYNC_DELTA frame (0x02 type byte + Yjs update payload). Its bytes are
    // not valid UTF-8 JSON, so it MUST be treated as binary and relayed, never
    // misclassified as a JSON control message and dropped (root-cause candidate
    // #2) — this is exactly how a live draw reaches the other collaborator.
    const a = fakeWs('a')
    const b = fakeWs('b')
    const c = fakeWs('c')
    const room = new Set([a, b, c])
    const frame = Buffer.from([0x02, 1, 2, 3, 4])

    const result = relayClientMessage(a, frame, room)

    if (result.kind !== 'binary') throw new Error('expected binary frame')
    expect(result.relayed).toBe(2)
    expect(result.bytes).toBe(5)
    expect(b.sent).toEqual([{ binary: frame }])
    expect(c.sent).toEqual([{ binary: frame }])
    expect(a.sent).toEqual([])
  })

  it('skips closed peers and never sends back to the sender', () => {
    const a = fakeWs('a')
    const b = fakeWs('b', false)
    const c = fakeWs('c')
    const room = new Set([a, b, c])

    const result = relayClientMessage(a, Buffer.from([0x01, 9]), room)

    if (result.kind !== 'binary') throw new Error('expected binary frame')
    expect(result.relayed).toBe(1)
    expect(c.sent).toHaveLength(1)
    expect(b.sent).toEqual([])
    expect(a.sent).toEqual([])
  })
})

describe('ws-server — runHeartbeat (server-side stale-connection pruning)', () => {
  function fakeWs(id: string, opts: { open?: boolean; lastPong?: number } = {}) {
    const { open = true, lastPong } = opts
    const sent: ({ json: Record<string, unknown> } | { binary: Buffer })[] = []
    return {
      id,
      readyState: open ? 1 : 3,
      lastPong: lastPong ?? Date.now(),
      roomId: `room-${id}`,
      userName: id,
      sent,
      terminated: false,
      terminate() {
        this.terminated = true
        this.readyState = 3
      },
      send(d: string | Buffer) {
        if (typeof d === 'string') sent.push({ json: JSON.parse(d) })
        else sent.push({ binary: d })
      },
    }
  }

  it('pings a healthy client (recent lastPong) and does NOT terminate it', () => {
    const a = fakeWs('a')
    const result = runHeartbeat([a], a.lastPong + 1000)

    expect(result).toEqual({ pinged: 1, terminated: 0 })
    expect(a.sent).toEqual([{ json: { type: 'ping' } }])
    expect(a.terminated).toBe(false)
  })

  it('terminates a client whose lastPong is older than HEARTBEAT_TIMEOUT_MS — regression for candidate #5', () => {
    // A live tab answers the client-side keepalive every 25s (< 60s), so lastPong
    // stays fresh; only a genuinely-dead connection (no pong in >60s) is pruned.
    // The heartbeat must never kill idle-but-alive collaborators.
    const a = fakeWs('a', { lastPong: Date.now() - HEARTBEAT_TIMEOUT_MS - 1 })
    const result = runHeartbeat([a], Date.now())

    expect(result).toEqual({ pinged: 0, terminated: 1 })
    expect(a.terminated).toBe(true)
    expect(a.sent).toEqual([])
  })

  it('skips non-OPEN clients entirely (no ping, no terminate)', () => {
    const closed = fakeWs('c', { open: false, lastPong: 0 })
    const result = runHeartbeat([closed], Date.now())

    expect(result).toEqual({ pinged: 0, terminated: 0 })
    expect(closed.terminated).toBe(false)
    expect(closed.sent).toEqual([])
  })

  it('mixes healthy and stale clients in one pass with correct counts', () => {
    const now = Date.now()
    const healthy = fakeWs('h')
    const stale = fakeWs('s', { lastPong: now - HEARTBEAT_TIMEOUT_MS - 1000 })
    const closed = fakeWs('c', { open: false, lastPong: 0 })

    const result = runHeartbeat([healthy, stale, closed], now)

    expect(result).toEqual({ pinged: 1, terminated: 1 })
    expect(healthy.sent).toEqual([{ json: { type: 'ping' } }])
    expect(healthy.terminated).toBe(false)
    expect(stale.terminated).toBe(true)
    expect(closed.terminated).toBe(false)
  })
})
