import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spawn } from 'child_process'
import http from 'http'
import { createServer as createTcpServer } from 'net'
import { mkdtemp, rm, writeFile, symlink } from 'fs/promises'
import os from 'os'
import { fileURLToPath, pathToFileURL } from 'url'
import path from 'path'
import {
  resolveStatefulOrigin,
  relayClientMessage,
  runHeartbeat,
  isAuthed,
  clearAuthCache,
  isEntryPoint,
  HEARTBEAT_TIMEOUT_MS,
  EMPTY_ROOM_CLEANUP_DELAY_MS,
  removeClientFromRoom,
  scheduleEmptyRoomCleanup,
  handleClientClose,
  handleClientError,
  registerLifecycleHandlers,
} from './ws-server'

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

describe('ws-server — isEntryPoint (bind decision: direct node run AND pm2 fork)', () => {
  // The real filesystem path of ws-server.js — argv[1] as `node server/ws-server.js`
  // would produce. pathToFileURL(serverPath).href === ws-server.js's import.meta.url.
  const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ws-server.js')
  // What pm2 fork mode actually puts in argv[1] (the relay's root cause).
  const PM2_FORK_LOADER = '/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js'

  it('returns true for a direct `node server/ws-server.js` run', () => {
    expect(isEntryPoint(serverPath, undefined)).toBe(true)
  })

  it('returns true when launched via a symlink to this script (realpath, not string/pathToFileURL compare)', async () => {
    // `node /usr/local/bin/ws-relay` where that path is a symlink to this file:
    // pathToFileURL(argv[1]).href would be the symlink's URL ≠ import.meta.url,
    // so the direct-run check must resolve realpaths, not compare URLs/strings.
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ws-symlink-'))
    const link = path.join(tmpDir, 'ws-server-link.js')
    await symlink(serverPath, link)
    try {
      expect(isEntryPoint(link, undefined)).toBe(true)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns true under pm2 fork mode — regression: argv[1] is pm2\'s loader, not ours', () => {
    // Under pm2, process.argv[1] is ProcessContainerFork.js, so the naive
    // `import.meta.url === file://${process.argv[1]}` check is false and the
    // relay never binds (nginx 502s every WS upgrade). pm2 always sets pm_id on
    // managed children — that must flip the decision to true.
    expect(isEntryPoint(PM2_FORK_LOADER, '0')).toBe(true)
    expect(isEntryPoint(PM2_FORK_LOADER, '1')).toBe(true)
  })

  it('returns true when only pm_id is present (pm2 without a parseable argv[1])', () => {
    expect(isEntryPoint(undefined, '3')).toBe(true)
    expect(isEntryPoint('not a real path/…', '3')).toBe(true)
  })

  it('returns true when argv[1] is pm2\'s fork loader even WITHOUT pm_id (older pm2 majors)', () => {
    // Belt-and-suspenders: an older pm2 major may not set pm_id on the child,
    // but it still runs our script via ProcessContainerFork.js — detecting that
    // loader in argv[1] alone must be enough to bind the relay.
    expect(isEntryPoint(PM2_FORK_LOADER, undefined)).toBe(true)
  })

  it('returns false when merely imported as a module (vitest/test process)', () => {
    // vitest's own bin is argv[1] and pm_id is unset → no bind, so unit tests
    // never leave a stray port open or a heartbeat interval alive.
    expect(isEntryPoint('/usr/lib/node_modules/vitest/vitest.mjs', undefined)).toBe(false)
    expect(isEntryPoint(undefined, undefined)).toBe(false)
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

describe('ws-server — connection lifecycle (close/error/cleanup) — regression for leaks', () => {
  // The close/error/cleanup logic used to be buried in the connection callback
  // (untested) and the error path leaked: it removed the client from its room
  // but never decremented totalConnections, never broadcast `user-left`, and
  // never scheduled the empty-room cleanup. These tests lock the extracted
  // helpers — and prove heartbeat termination lands in the close path too.
  //
  // Fake timers keep the 60s empty-room cleanup deterministic.
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function fakeSocket(id: string, opts: { roomId?: string; userId?: string; userName?: string } = {}) {
    const handlers: Record<string, (arg?: any) => void> = {}
    const ws: any = {
      id,
      roomId: opts.roomId,
      userId: opts.userId ?? `user-${id}`,
      userName: opts.userName ?? `User ${id}`,
      readyState: 1,
      lastPong: Date.now(),
      sent: [] as { json: Record<string, unknown> }[],
      send(d: string) {
        ws.sent.push({ json: JSON.parse(d) })
      },
      on(evt: string, cb: (arg?: any) => void) {
        handlers[evt] = cb
      },
      emit(evt: string, arg?: any) {
        handlers[evt]?.(arg)
      },
      terminate() {
        ws.readyState = 3
        handlers.close?.()
      },
    }
    return ws
  }

  // Mimics the real broadcastToRoom: sends the payload to every OPEN peer still
  // in the room, and records the call.
  function makeBroadcastRecorder(rooms: Map<string, Set<any>>) {
    const calls: { roomId: string; msg: Record<string, unknown> }[] = []
    const fn = (roomId: string, msg: Record<string, unknown>) => {
      calls.push({ roomId, msg })
      const room = rooms.get(roomId)
      if (room) {
        for (const client of room) {
          if (client.readyState === 1 && typeof client.send === 'function') {
            client.send(JSON.stringify(msg))
          }
        }
      }
    }
    return { calls, fn }
  }

  it('close removes the client from its room, decrements totalConnections, and broadcasts user-left to remaining peers only', () => {
    const a = fakeSocket('a', { roomId: 'r1' })
    const b = fakeSocket('b', { roomId: 'r1' })
    const c = fakeSocket('c', { roomId: 'r1' })
    const rooms = new Map<string, Set<any>>([['r1', new Set([a, b, c])]])
    const counter = { value: 3 }
    const recorder = makeBroadcastRecorder(rooms)

    registerLifecycleHandlers(a, rooms, counter, recorder.fn)
    a.emit('close')

    expect(counter.value).toBe(2)
    expect(rooms.get('r1')!.has(a)).toBe(false)
    expect(rooms.get('r1')!.size).toBe(2)

    // user-left is announced once, to the room that still has peers.
    expect(recorder.calls).toHaveLength(1)
    expect(recorder.calls[0]!.roomId).toBe('r1')
    expect(recorder.calls[0]!.msg.type).toBe('user-left')
    expect(recorder.calls[0]!.msg.userId).toBe('user-a')
    expect(recorder.calls[0]!.msg.timestamp).toEqual(expect.any(Number))

    // Both remaining OPEN peers actually received the frame; the closer (a) did not.
    expect(b.sent).toEqual([{ json: { type: 'user-left', userId: 'user-a', timestamp: expect.any(Number) } }])
    expect(c.sent).toEqual([{ json: { type: 'user-left', userId: 'user-a', timestamp: expect.any(Number) } }])
    expect(a.sent).toEqual([])

    // Room is not empty → NO cleanup timer is scheduled; it survives past the delay.
    vi.advanceTimersByTime(EMPTY_ROOM_CLEANUP_DELAY_MS)
    expect(rooms.has('r1')).toBe(true)
  })

  it('does NOT broadcast user-left when the room just became empty (nobody to receive), but schedules cleanup', () => {
    const a = fakeSocket('a', { roomId: 'r1' })
    const rooms = new Map<string, Set<any>>([['r1', new Set([a])]])
    const counter = { value: 1 }
    const recorder = makeBroadcastRecorder(rooms)

    registerLifecycleHandlers(a, rooms, counter, recorder.fn)
    a.emit('close')

    expect(counter.value).toBe(0)
    expect(recorder.calls).toHaveLength(0)
    expect(a.sent).toEqual([])

    // The empty room is deleted once the delayed cleanup fires…
    vi.advanceTimersByTime(EMPTY_ROOM_CLEANUP_DELAY_MS)
    expect(rooms.has('r1')).toBe(false)
  })

  it('delayed empty-room cleanup deletes the room only if it is STILL empty when it fires', () => {
    // Empty room → deleted after the delay.
    const roomsEmpty = new Map<string, Set<any>>([['r1', new Set()]])
    scheduleEmptyRoomCleanup('r1', roomsEmpty)
    vi.advanceTimersByTime(EMPTY_ROOM_CLEANUP_DELAY_MS)
    expect(roomsEmpty.has('r1')).toBe(false)

    // A client rejoined within the window → the room survives the timer.
    const rejoined = fakeSocket('x', { roomId: 'r2' })
    const roomsRejoined = new Map<string, Set<any>>([['r2', new Set([rejoined])]])
    scheduleEmptyRoomCleanup('r2', roomsRejoined)
    vi.advanceTimersByTime(EMPTY_ROOM_CLEANUP_DELAY_MS)
    expect(roomsRejoined.has('r2')).toBe(true)
    expect(roomsRejoined.get('r2')!.size).toBe(1)
  })

  it('error path performs the SAME cleanup as close (decrement, user-left, cleanup) — no leak', () => {
    const a = fakeSocket('a', { roomId: 'r1' })
    const b = fakeSocket('b', { roomId: 'r1' })
    const rooms = new Map<string, Set<any>>([['r1', new Set([a, b])]])
    const counter = { value: 2 }
    const recorder = makeBroadcastRecorder(rooms)

    registerLifecycleHandlers(a, rooms, counter, recorder.fn)
    a.emit('error', new Error('boom'))

    expect(counter.value).toBe(1)
    expect(rooms.get('r1')!.has(a)).toBe(false)
    expect(rooms.get('r1')!.size).toBe(1)
    expect(recorder.calls).toHaveLength(1)
    expect(recorder.calls[0]!.msg.type).toBe('user-left')
    expect(recorder.calls[0]!.msg.userId).toBe('user-a')
    expect(b.sent).toHaveLength(1)
  })

  it('error on a solo client empties the room and schedules its cleanup (no room leak)', () => {
    const a = fakeSocket('a', { roomId: 'r1' })
    const rooms = new Map<string, Set<any>>([['r1', new Set([a])]])
    const counter = { value: 1 }
    const recorder = makeBroadcastRecorder(rooms)

    registerLifecycleHandlers(a, rooms, counter, recorder.fn)
    a.emit('error', new Error('boom'))

    expect(counter.value).toBe(0)
    expect(recorder.calls).toHaveLength(0)
    expect(rooms.has('r1')).toBe(true)
    vi.advanceTimersByTime(EMPTY_ROOM_CLEANUP_DELAY_MS)
    expect(rooms.has('r1')).toBe(false)
  })

  it('heartbeat-terminated socket drives the close path (cleanup runs, no leak)', () => {
    // runHeartbeat calls ws.terminate() on a stale client; a real socket then
    // fires its 'close' event, which must run the SAME cleanup as a manual
    // close. The fake socket's terminate() emits 'close' to simulate that.
    const a = fakeSocket('a', { roomId: 'r1' })
    const b = fakeSocket('b', { roomId: 'r1' })
    const rooms = new Map<string, Set<any>>([['r1', new Set([a, b])]])
    const counter = { value: 2 }
    const recorder = makeBroadcastRecorder(rooms)

    registerLifecycleHandlers(a, rooms, counter, recorder.fn)
    a.lastPong = 0
    const now = Date.now() + HEARTBEAT_TIMEOUT_MS + 1000
    runHeartbeat([a], now)

    expect(a.readyState).toBe(3)
    expect(counter.value).toBe(1)
    expect(rooms.get('r1')!.has(a)).toBe(false)
    expect(recorder.calls).toHaveLength(1)
    expect(recorder.calls[0]!.msg.type).toBe('user-left')
    expect(b.sent).toHaveLength(1)
  })

  it('a socket that never joined a room (auth-reject path) is a no-op for room state but still un-accounted', () => {
    // The 4001-reject path increments the counter on connect but never adds the
    // socket to a room; its eventual close must decrement without crashing,
    // broadcasting, or creating a phantom room entry (getRoom used to CREATE it).
    const a = fakeSocket('a', { roomId: 'ghost' })
    const rooms = new Map<string, Set<any>>()
    const counter = { value: 1 }
    const recorder = makeBroadcastRecorder(rooms)

    registerLifecycleHandlers(a, rooms, counter, recorder.fn)
    a.emit('close')

    expect(counter.value).toBe(0)
    expect(rooms.size).toBe(0)
    expect(recorder.calls).toHaveLength(0)
  })

  it('removeClientFromRoom guards against double-decrement (idempotent teardown)', () => {
    const a = fakeSocket('a', { roomId: 'r1' })
    const rooms = new Map<string, Set<any>>([['r1', new Set([a])]])
    const counter = { value: 1 }
    const recorder = makeBroadcastRecorder(rooms)

    // The same socket closes twice (belt-and-suspenders) — the counter must
    // not go negative and the room must not be double-broadcast.
    handleClientClose(a, rooms, counter, recorder.fn, 1000, 0)
    handleClientClose(a, rooms, counter, recorder.fn, 2000, 0)

    expect(counter.value).toBe(0)
    expect(recorder.calls).toHaveLength(0)
  })

  it('handleClientClose accepts an injectable clock for deterministic timestamps', () => {
    const a = fakeSocket('a', { roomId: 'r1' })
    const b = fakeSocket('b', { roomId: 'r1' })
    const rooms = new Map<string, Set<any>>([['r1', new Set([a, b])]])
    const counter = { value: 2 }
    const recorder = makeBroadcastRecorder(rooms)

    handleClientClose(a, rooms, counter, recorder.fn, 1234567890)

    expect(recorder.calls[0]!.msg.timestamp).toBe(1234567890)
    expect(b.sent).toEqual([{ json: { type: 'user-left', userId: 'user-a', timestamp: 1234567890 } }])
  })
})

describe('ws-server — isAuthed (connection gate: owners + share viewers)', () => {
  // isAuthed performs real `fetch` calls against LARAVEL_URL, so stub the
  // global fetch with a route table and spy on the calls it makes.
  function mockFetch(routes: Record<string, { status: number; body?: unknown }>) {
    const calls: { url: string; init?: { headers?: Record<string, string> } }[] = []
    vi.stubGlobal('fetch', async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push({ url, init })
      const route = routes[url]
      return {
        status: route?.status ?? 404,
        json: async () => route?.body ?? {},
      }
    })
    return calls
  }

  function req(extra: Record<string, string | undefined> = {}) {
    return { headers: { origin: 'http://localhost:3000', ...extra } }
  }

  beforeEach(() => clearAuthCache())
  afterEach(() => vi.unstubAllGlobals())

  it('rejects when there is no cookie and no share token — no fetch made', async () => {
    const calls = mockFetch({})
    expect(await isAuthed(undefined, 'room-1', undefined, req(), API_URL)).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('accepts a logged-in user whose Sanctum session resolves at /api/user', async () => {
    const calls = mockFetch({
      [`${API_URL}/api/user`]: { status: 200, body: { id: 7 } },
    })
    const ok = await isAuthed('laravel_session=abc123; foo=bar', 'room-1', undefined, req(), API_URL)

    expect(ok).toBe(true)
    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.url).toBe(`${API_URL}/api/user`)
    expect(call.init?.headers?.cookie).toBe('laravel_session=abc123; foo=bar')
    // The browser's WS-handshake Origin is forwarded so Sanctum's stateful
    // guard runs session auth (regression for the Iteration-1 auth bug).
    expect(call.init?.headers?.origin).toBe('http://localhost:3000')
    expect(call.init?.headers?.referer).toBeUndefined()
  })

  it('accepts a share viewer whose token resolves to THIS room (cookie transport)', async () => {
    const calls = mockFetch({
      [`${API_URL}/api/shares/tok-1`]: {
        status: 200,
        body: { success: true, data: { whiteboard_id: 'room-1', role: 'edit' } },
      },
    })
    // No session cookie present → /api/user is never consulted; the share
    // lookup alone admits the viewer.
    const ok = await isAuthed('vp_share_token=tok-1', 'room-1', undefined, req(), API_URL)

    expect(ok).toBe(true)
    expect(calls.map((c) => c.url)).toEqual([`${API_URL}/api/shares/tok-1`])
  })

  it('falls through to the share token when a session cookie 401s', async () => {
    const calls = mockFetch({
      [`${API_URL}/api/user`]: { status: 401 },
      [`${API_URL}/api/shares/tok-f`]: {
        status: 200,
        body: { success: true, data: { whiteboard_id: 'room-1' } },
      },
    })
    // A stale/expired session must not block a valid share viewer — the share
    // lookup runs after the session check fails.
    const ok = await isAuthed('laravel_session=stale; vp_share_token=tok-f', 'room-1', undefined, req(), API_URL)

    expect(ok).toBe(true)
    expect(calls.map((c) => c.url)).toEqual([`${API_URL}/api/user`, `${API_URL}/api/shares/tok-f`])
  })

  it('accepts a share viewer via the ?share= query param (nginx cookie-less path)', async () => {
    const calls = mockFetch({
      [`${API_URL}/api/shares/tok-q`]: {
        status: 200,
        body: { success: true, data: { whiteboard_id: 'room-1' } },
      },
    })
    // No session cookie at all — the relay never even calls /api/user.
    const ok = await isAuthed('', 'room-1', 'tok-q', req(), API_URL)

    expect(ok).toBe(true)
    expect(calls.map((c) => c.url)).toEqual([`${API_URL}/api/shares/tok-q`])
  })

  it('prefers the query param token over the cookie token', async () => {
    const calls = mockFetch({
      [`${API_URL}/api/shares/tok-q`]: {
        status: 200,
        body: { success: true, data: { whiteboard_id: 'room-1' } },
      },
      [`${API_URL}/api/shares/tok-c`]: {
        status: 200,
        body: { success: true, data: { whiteboard_id: 'room-OTHER' } },
      },
    })
    const ok = await isAuthed('vp_share_token=tok-c', 'room-1', 'tok-q', req(), API_URL)

    expect(ok).toBe(true)
    expect(calls.map((c) => c.url)).toEqual([`${API_URL}/api/shares/tok-q`])
  })

  it('rejects a share token that resolves to a DIFFERENT whiteboard (room-scoped)', async () => {
    const calls = mockFetch({
      [`${API_URL}/api/shares/tok-x`]: {
        status: 200,
        body: { success: true, data: { whiteboard_id: 'room-OTHER' } },
      },
    })
    const ok = await isAuthed('vp_share_token=tok-x', 'room-1', undefined, req(), API_URL)

    expect(ok).toBe(false)
    expect(calls.map((c) => c.url)).toEqual([`${API_URL}/api/shares/tok-x`])
  })

  it('fails closed when Laravel is unreachable (fetch rejects)', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('connect ECONNREFUSED')
    })
    const ok = await isAuthed('laravel_session=abc123', 'room-1', undefined, req(), API_URL)
    expect(ok).toBe(false)
  })

  it('caches the session verdict so repeat connections skip the /api/user round-trip', async () => {
    const calls = mockFetch({
      [`${API_URL}/api/user`]: { status: 200, body: { id: 7 } },
    })
    const creds = 'laravel_session=cacheme'

    await expect(isAuthed(creds, 'room-1', undefined, req(), API_URL)).resolves.toBe(true)
    await expect(isAuthed(creds, 'room-1', undefined, req(), API_URL)).resolves.toBe(true)

    expect(calls).toHaveLength(1)
  })
})

describe('ws-server — actually listens when launched as the entry point (regression for pm2 never binding)', () => {
  const SERVER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ws-server.js')

  function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = createTcpServer()
      srv.unref()
      srv.on('error', reject)
      srv.listen(0, '127.0.0.1', () => {
        const port = (srv.address() as { port: number }).port
        srv.close(() => resolve(port))
      })
    })
  }

  // Poll the relay's HTTP endpoint until it answers with its banner (proves the
  // listen() actually happened), or reject after timeoutMs.
  function waitForBanner(port: number, timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs
    return new Promise((resolve, reject) => {
      const attempt = () => {
        if (Date.now() > deadline) {
          reject(new Error(`relay did not answer on :${port} within ${timeoutMs}ms`))
          return
        }
        const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 500 }, (res) => {
          let body = ''
          res.on('data', (c) => (body += c))
          res.on('end', () => {
            if (res.statusCode === 200 && body.includes('VP Whiteboard Yjs WebSocket Server')) {
              resolve(body)
            } else {
              setTimeout(attempt, 200)
            }
          })
        })
        req.on('timeout', () => {
          req.destroy()
          setTimeout(attempt, 200)
        })
        req.on('error', () => setTimeout(attempt, 200))
      }
      attempt()
    })
  }

  it('spawns `node server/ws-server.js` on a free port and serves the banner', async () => {
    const port = await freePort()
    const child = spawn(process.execPath, [SERVER_PATH], {
      env: {
        ...process.env,
        WS_PORT: String(port),
        WS_HOST: '127.0.0.1',
        // No connections in this test, so auth is never consulted; set an
        // unreachable Laravel URL so nothing hangs if a stray connection fires.
        LARAVEL_URL: 'http://127.0.0.1:9',
        WS_ALLOW_ANON: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const exited = new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', () => resolve())
    })
    try {
      const body = await waitForBanner(port, 5000)
      expect(body).toContain('VP Whiteboard Yjs WebSocket Server')
    } finally {
      child.kill('SIGTERM')
      await exited
    }
  }, 15000)

  it('spawns the relay through a simulated pm2 fork loader and serves the banner', async () => {
    // Real pm2 never runs our script directly: it spawns
    // `node /usr/lib/node_modules/pm2/lib/ProcessContainerFork.js` and THAT
    // container loads ws-server.js, so argv[1] is pm2's loader, never ours. This
    // is the exact shape that left the relay silently unbound (nginx 502 on every
    // WS upgrade). Emulate it with a temp copy named ProcessContainerFork.js that
    // dynamically imports ws-server.js, and prove the relay binds with NO pm_id —
    // locking the belt-and-suspenders argv[1] signal end-to-end, not just as a
    // pure-function unit assertion.
    const port = await freePort()
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pm2-fork-'))
    const loaderPath = path.join(tmpDir, 'ProcessContainerFork.js')
    await writeFile(loaderPath, `import(${JSON.stringify(pathToFileURL(SERVER_PATH).href)});`)

    const child = spawn(process.execPath, [loaderPath], {
      env: {
        ...process.env,
        WS_PORT: String(port),
        WS_HOST: '127.0.0.1',
        // No connections in this test, so auth is never consulted; set an
        // unreachable Laravel URL so nothing hangs if a stray connection fires.
        LARAVEL_URL: 'http://127.0.0.1:9',
        WS_ALLOW_ANON: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const exited = new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', () => resolve())
    })
    try {
      const body = await waitForBanner(port, 5000)
      expect(body).toContain('VP Whiteboard Yjs WebSocket Server')
    } finally {
      child.kill('SIGTERM')
      await exited
      await rm(tmpDir, { recursive: true, force: true })
    }
  }, 15000)
})
