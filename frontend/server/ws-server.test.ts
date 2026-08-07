import { describe, expect, it } from 'vitest'
import { resolveStatefulOrigin, relayClientMessage } from './ws-server'

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
