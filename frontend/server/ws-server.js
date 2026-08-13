#!/usr/bin/env node
/**
 * Yjs WebSocket Server for VP Whiteboard
 *
 * Simple WebSocket relay server for Yjs CRDT synchronization.
 * Run this alongside the Nuxt/Laravel stack for real-time collaboration.
 *
 * Usage:
 *   WS_PORT=3003 LARAVEL_URL=https://staging-whiteboard.vp-associates.com node server/ws-server.js
 *
 * The server:
 * - Listens on port 3003 (configurable via WS_PORT env var)
 * - Authenticates each connection by forwarding the browser's laravel_session
 *   cookie to Laravel's auth:sanctum /api/user endpoint (cached briefly).
 * - Relays Yjs sync messages between clients in the same room.
 *
 * NOTE: anonymous share-link viewers are accepted when they carry a valid
 * vp_share_token cookie (set by the /s/:token route) that resolves — via
 * Laravel's public /api/sessions/{token} — to the whiteboard being opened.
 * The token is scoped to that room, so a share viewer for board A cannot
 * reach board B.
 */

import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { realpathSync } from 'fs'
import { fileURLToPath } from 'url'

const PORT = process.env.WS_PORT || 3001
const HOST = process.env.WS_HOST || '0.0.0.0'
const LARAVEL_URL = process.env.LARAVEL_URL || 'http://localhost:8000'
const AUTH_TIMEOUT_MS = parseInt(process.env.WS_AUTH_TIMEOUT_MS || '3000', 10)
// Laravel's session cookie name = Str::slug(APP_NAME).'-session', so it varies
// (e.g. APP_NAME=Laravel → "laravel-session", not the default "laravel_session").
// Accept the configured name plus the common variants.
const SESSION_COOKIE = process.env.SESSION_COOKIE || 'laravel_session'

// Cache session→verdict briefly so repeat connections don't hit Laravel each time.
const authCache = new Map() // credential -> { ok, exp }
const AUTH_CACHE_TTL_MS = 60_000
// NEGATIVE verdicts (Laravel answered, but said no) are cached much shorter
// than positives. A single transient 401/500 from Laravel — e.g. during a
// deploy that restarts it mid-flight — must not lock every viewer of that
// credential out for the full minute: after this short window the credential
// is re-checked and a recovered Laravel is seen immediately. Fetches that
// FAIL (status 0, Laravel unreachable) are NOT cached at all — they fail
// closed for that one connection only (see isAuthed).
const NEGATIVE_AUTH_CACHE_TTL_MS = 5_000

function parseCookies(cookieHeader) {
  const cookies = {}
  if (!cookieHeader) return cookies
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.split('=')
    if (key) cookies[key.trim()] = rest.join('=').trim()
  }
  return cookies
}

/**
 * Resolve the Origin/Referer values the relay should present to Laravel when
 * checking a session. Prefer the browser's real handshake headers (matching
 * SANCTUM_STATEFUL_DOMAINS for the frontend). A WS handshake carries only
 * `Origin` (never `Referer`), and Sanctum's stateful check reads `referer`
 * before `origin` — so we must NOT synthesize a referer when only the client
 * origin is available, or a fabricated one (e.g. the API origin) would win and
 * skip session auth. Fall back to LARAVEL_URL-derived values only when the
 * handshake carried neither header.
 */
export function resolveStatefulOrigin(clientOrigin, clientReferer, laravelUrl = LARAVEL_URL) {
  let fallbackOrigin = laravelUrl
  try { fallbackOrigin = new URL(laravelUrl).origin } catch {}
  if (!clientOrigin && !clientReferer) {
    return { origin: fallbackOrigin, referer: `${laravelUrl}/` }
  }
  let origin = clientOrigin || undefined
  if (origin) { try { origin = new URL(origin).origin } catch {} }
  return { origin, referer: clientReferer || undefined }
}

async function fetchJson(url, cookieHeader, timeoutMs, clientOrigin, clientReferer) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  // Sanctum's stateful guard only authenticates the session cookie on requests
  // whose Origin/Referer matches SANCTUM_STATEFUL_DOMAINS. Browsers send these
  // automatically on the WS handshake; the relay must forward them, or
  // /api/user returns 401 and every connection is rejected (causing an infinite
  // reconnect loop that resets the Yjs doc and wipes just-added layers).
  //
  // Do NOT synthesize them from LARAVEL_URL when the real handshake headers are
  // present: the frontend origin often differs from the API origin (local dev:
  // :3000 vs :8002), and Sanctum's stateful check only matches the frontend
  // domain — so a fabricated referer 401s even a validly-logged-in owner.
  const { origin, referer } = resolveStatefulOrigin(clientOrigin, clientReferer)
  const headers = {
    cookie: cookieHeader || '',
    accept: 'application/json',
  }
  if (origin) headers.origin = origin
  if (referer) headers.referer = referer
  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    })
    return {
      status: res.status,
      data: res.status === 200 ? await res.json().catch(() => null) : null,
    }
  } catch (e) {
    // Laravel unreachable / timeout → fail closed (deny).
    console.log(`[Yjs WS] ⚠️ Auth check failed: ${e.message}`)
    return { status: 0, data: null }
  } finally {
    clearTimeout(timer)
  }
}

// Accept a connection if the caller is EITHER a logged-in user (valid Sanctum
// session) OR a share-link viewer whose vp_share_token resolves (via Laravel) to
// THIS room's whiteboard. The share token can arrive as the httpOnly cookie
// (carried by nginx on the handshake) OR, when nginx does not forward the Cookie
// header to this relay, as the ?share= query param appended by the client.
// Verdicts are cached briefly per credential.
export async function isAuthed(cookieHeader, roomId, queryShareToken, req, laravelUrl = LARAVEL_URL) {
  if (!cookieHeader && !queryShareToken) return false
  const cookies = parseCookies(cookieHeader || '')
  const now = Date.now()

  // The browser sends Origin/Referer on the WS handshake; pass them through so
  // Laravel's stateful guard runs session auth (see fetchJson).
  const clientOrigin = req?.headers?.origin
  const clientReferer = req?.headers?.referer

  // 1. Logged-in user (Sanctum session cookie)
  const session = cookies[SESSION_COOKIE] || cookies['laravel-session'] || cookies['laravel_session']
  if (session) {
    const cached = authCache.get('sess:' + session)
    if (cached && cached.exp > now) return cached.ok
    const { status } = await fetchJson(`${laravelUrl}/api/user`, cookieHeader, AUTH_TIMEOUT_MS, clientOrigin, clientReferer)
    const ok = status === 200
    if (status > 0) {
      // Cache positives for the full TTL, negatives only briefly so a transient
      // Laravel failure self-heals instead of locking the credential out.
      authCache.set('sess:' + session, { ok, exp: now + (ok ? AUTH_CACHE_TTL_MS : NEGATIVE_AUTH_CACHE_TTL_MS) })
    }
    if (ok) return true
  }

  // 2. Share-link viewer (token must resolve to this room's whiteboard id).
  // Prefer the query param (present for anonymous share viewers regardless of
  // nginx cookie forwarding); fall back to the httpOnly cookie.
  const shareToken = queryShareToken || cookies['vp_share_token']
  if (shareToken) {
    const key = 'share:' + shareToken + ':' + roomId
    const cached = authCache.get(key)
    if (cached && cached.exp > now) return cached.ok
    const url = `${laravelUrl}/api/shares/${encodeURIComponent(shareToken)}`
    const { status, data } = await fetchJson(url, cookieHeader, AUTH_TIMEOUT_MS, clientOrigin, clientReferer)
    const ok = status === 200 && data && data.success && data.data && data.data.whiteboard_id === roomId
    if (status > 0) {
      authCache.set(key, { ok, exp: now + (ok ? AUTH_CACHE_TTL_MS : NEGATIVE_AUTH_CACHE_TTL_MS) })
    }
    if (ok) return true
  }

  return false
}

// Test helper: drop cached auth verdicts so a fresh run observes real fetches.
export function clearAuthCache() {
  authCache.clear()
}

/**
 * Route one client frame to the rest of its room.
 *
 * Extracted from the connection handler so the relay's core routing behavior
 * can be unit-tested (regression-locks candidate root cause #2: a Yjs binary
 * update must be relayed as binary, never misclassified as a JSON control
 * message and dropped).
 *
 * - JSON frames with a `type`: `ping` is answered in-place with a `pong` to the
 *   sender; every other type (sync-request, presence, cursor, …) is forwarded
 *   to all OTHER open peers, never echoed back to the sender.
 * - Anything that isn't JSON is a Yjs binary frame and is relayed verbatim to
 *   all OTHER open peers (this is the live-edit path: incremental deltas and
 *   full-state snapshots).
 *
 * @returns {{kind:'json', type?:string, forwarded:number}|
 *           {kind:'binary', relayed:number, bytes:number}}
 */
export function relayClientMessage(ws, data, room) {
  let text
  if (typeof data === 'string' || data instanceof Buffer) {
    text = typeof data === 'string' ? data : data.toString('utf8')
  } else {
    text = Buffer.from(data).toString('utf8')
  }

  let json
  try { json = JSON.parse(text) } catch { /* not JSON — binary Yjs message */ }
  if (json && json.type) {
    if (json.type === 'ping') {
      ws.lastPong = Date.now()
      sendJson(ws, { type: 'pong' })
      return { kind: 'json', type: 'ping', forwarded: 0 }
    }

    if (json.type === 'pong') {
      // A client's reply to the server-side heartbeat. This is NOT a message
      // for the room — refreshing lastPong is what keeps the connection alive,
      // so answer in-place and never relay it to peers.
      ws.lastPong = Date.now()
      return { kind: 'json', type: 'pong', forwarded: 0 }
    }

    // Forward other JSON messages (presence, cursor, etc.) to the room
    const payload = JSON.stringify(json)
    let forwarded = 0
    room.forEach((client) => {
      if (client !== ws && client.readyState === 1) {
        client.send(payload)
        forwarded++
      }
    })
    return { kind: 'json', type: json.type, forwarded }
  }

  // Binary message — relay to all other clients in the room (Yjs sync)
  const rawBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
  const bytes = rawBuffer.byteLength || rawBuffer.length || 0

  let relayed = 0
  room.forEach((client) => {
    if (client !== ws && client.readyState === 1) {
      client.send(rawBuffer)
      relayed++
    }
  })
  return { kind: 'binary', relayed, bytes }
}

export const HEARTBEAT_INTERVAL_MS = 30_000
export const HEARTBEAT_TIMEOUT_MS = 60_000

// Binary-frame logging is rate-limited per connection. Under active
// collaboration (cursor/active-stroke deltas every frame), logging EVERY
// binary frame grew the pm2 out log to 4.9GB / 72M lines in prod. We still log
// large frames (full-state syncs — the diagnostic signal) and at most one
// "small frames flowing" summary per connection per window.
const BINARY_LOG_MIN_BYTES = 1024
const BINARY_LOG_INTERVAL_MS = 2000
const binaryLogLastLogged = new Map() // ws -> timestamp of last summary line

/**
 * Rate-limited logger for relayed binary (Yjs) frames.
 *
 * - Frames >= BINARY_LOG_MIN_BYTES (full-state syncs, big deltas) are logged
 *   immediately — that's the signal worth seeing.
 * - Smaller frames (cursor deltas, active-stroke points) are summarized at most
 *   once per BINARY_LOG_INTERVAL_MS per connection.
 *
 * Exported so the throttling contract is unit-testable.
 *
 * @param {object} ws the sending socket (carries roomId)
 * @param {number} bytes the relayed frame size
 * @param {number} relayed how many peers received it
 * @param {number} [now] injectable clock (tests)
 * @returns {boolean} whether a log line was emitted
 */
export function logBinaryRelay(ws, bytes, relayed, now = Date.now()) {
  if (bytes >= BINARY_LOG_MIN_BYTES) {
    console.log(`[Yjs WS] 📨 Binary: room=${ws.roomId || '?'}, size=${bytes}B, relayed to ${relayed}`)
    binaryLogLastLogged.set(ws, now)
    return true
  }
  const last = binaryLogLastLogged.get(ws) || 0
  if (now - last >= BINARY_LOG_INTERVAL_MS) {
    console.log(`[Yjs WS] 📨 Binary: room=${ws.roomId || '?'}, small frames flowing, relayed to ${relayed}`)
    binaryLogLastLogged.set(ws, now)
    return true
  }
  return false
}

/**
 * Run one server-side heartbeat pass: ping every live client and terminate any
 * that haven't been heard from within HEARTBEAT_TIMEOUT_MS.
 *
 * `ws.lastPong` is refreshed whenever the client sends its own keepalive
 * `{type:'ping'}` (relayClientMessage sets lastPong and answers `pong`). The
 * client sends that every 25s (< 60s), so a healthy client is never pruned;
 * only connections whose browser tab is gone (no pong in 60s) get terminated.
 * This is root-cause candidate #5 — a heartbeat must NOT kill idle-but-alive
 * clients (extracted from the `isMain` block so it can be regression-tested).
 *
 * @param {Iterable<{readyState:number,lastPong:number,roomId?:string,userName?:string,terminate:()=>void,send:(d:string|Buffer)=>void}>} clients
 * @param {number} [now]
 * @returns {{pinged:number, terminated:number}}
 */
export function runHeartbeat(clients, now = Date.now()) {
  let pinged = 0
  let terminated = 0
  for (const ws of clients) {
    if (ws.readyState !== 1) continue
    if (now - ws.lastPong > HEARTBEAT_TIMEOUT_MS) {
      console.log(`[Yjs WS] 💔 Heartbeat timeout: room=${ws.roomId || '?'}, user=${ws.userName || '?'}`)
      ws.terminate()
      terminated++
      continue
    }
    sendJson(ws, { type: 'ping' })
    pinged++
  }
  return { pinged, terminated }
}

// Create HTTP server for WebSocket upgrade
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('VP Whiteboard Yjs WebSocket Server')
})

// Create WebSocket server (allow large Yjs sync payloads for big canvases)
const wss = new WebSocketServer({ server, noServer: false, maxPayload: 256 * 1024 * 1024 })

// Store connections per room
const rooms = new Map()

// Track total connections. Held in an object so the lifecycle helpers (which
// take explicit deps for testability) can mutate the same module-level counter.
const totalConnectionsRef = { value: 0 }

/**
 * Get or create room connections
 */
function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set())
  }
  return rooms.get(roomId)
}

/**
 * Handle WebSocket connection
 */
wss.on('connection', async (ws, req) => {
  totalConnectionsRef.value++

  // Extract room ID from URL path
  // Expected format: /whiteboard:{id} or /{id}
  const url = new URL(req.url || '', `http://${req.headers.host}`)
  const pathname = url.pathname

  // Match room ID from path (supports both /whiteboard:{id} and /{id} formats)
  const match = pathname.match(/(?:whiteboard:)?([^/]+)$/)
  const roomId = match && match[1] ? match[1] : 'default'

  // Validate auth against Laravel (Sanctum session OR scoped share token).
  // Auth is ON by default and only bypassed when explicitly allowed with
  // WS_ALLOW_ANON=1. The previous `HOST === '0.0.0.0'` default effectively
  // disabled auth in production (the relay bound to 0.0.0.0 behind nginx),
  // letting anyone who knows a room UUID join. nginx forwards the Cookie
  // header on WebSocket upgrades, so session/share cookies do reach us.
  const skipAuth = process.env.WS_ALLOW_ANON === '1'
  if (!skipAuth) {
    const authed = await isAuthed(req.headers.cookie, roomId, url.searchParams.get('share'), req)
    if (!authed) {
      console.log(`[Yjs WS] 🚫 Rejected unauthenticated connection to room=${roomId}`)
      rejectConnection(ws, totalConnectionsRef)
      return
    }
  }

  // Extract user info from query params
  const userId = url.searchParams.get('userId') || 'anonymous'
  const userName = url.searchParams.get('userName') || 'Anonymous'

  console.log(`[Yjs WS] ✅ Connection: room=${roomId}, user=${userName} (${userId})`)
  console.log(`[Yjs WS] Total connections: ${totalConnectionsRef.value}`)

  // Add to room
  const room = getRoom(roomId)
  room.add(ws)

  console.log(`[Yjs WS] Room ${roomId} now has ${room.size} clients`)

  // Track room ID on websocket for cleanup and message routing
  ws.roomId = roomId
  ws.userId = userId
  ws.userName = userName
  ws.lastPong = Date.now()

  // Notify the new user about their connection + announce their join to peers.
  // Extracted so the join-presence contract (connected to self, user-joined to
  // others) is unit-testable.
  announceJoin(ws, rooms)

  // Handle incoming messages
  ws.on('message', (data) => {
    const result = relayClientMessage(ws, data, getRoom(ws.roomId || roomId))
    if (result.kind === 'binary' && result.bytes > 0) {
      logBinaryRelay(ws, result.bytes, result.relayed)
    }
  })

  // Handle disconnect (and error). Both events converge on the SAME teardown
  // (removal from room, connection-count decrement, user-left broadcast to the
  // remaining peers, delayed empty-room cleanup) so an error can never leak a
  // connection count, a user-left notification, or a room entry.
  registerLifecycleHandlers(ws, rooms, totalConnectionsRef, broadcastToRoom)
})

// Helper: send JSON to a single client (exported for tests)
export function sendJson(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg))
}

/**
 * Broadcast JSON to all OPEN peers in a room, excluding the sender.
 *
 * Exported (with an injectable `roomsArg`) so the presence broadcasts are
 * unit-testable. Uses a NON-creating lookup (unlike getRoom) — broadcasting to
 * a stale/absent room id must not resurrect a phantom empty-room entry.
 */
export function broadcastToRoom(roomId, msg, exclude, roomsArg = rooms) {
  const room = roomsArg.get(roomId)
  if (!room) return
  const payload = JSON.stringify(msg)
  room.forEach((client) => {
    if (client !== exclude && client.readyState === 1) client.send(payload)
  })
}

/**
 * Announce a freshly-connected socket to its room: a `connected` frame to the
 * joiner itself (echoing roomId/userId/userCount) and a `user-joined` frame to
 * every OTHER peer. Extracted from the connection handler so the join-presence
 * contract (and the sent-to-self message) is unit-testable.
 */
export function announceJoin(ws, roomsArg = rooms, now = Date.now()) {
  const roomId = ws.roomId
  const room = roomsArg.get(roomId)
  sendJson(ws, {
    type: 'connected',
    roomId,
    userId: ws.userId,
    userCount: room ? room.size : 0,
    instantRetry: true,
  })
  broadcastToRoom(roomId, {
    type: 'user-joined',
    userId: ws.userId,
    userName: ws.userName,
    timestamp: now,
  }, ws, roomsArg)
}

// Delay before an empty room entry is deleted from the `rooms` map.
export const EMPTY_ROOM_CLEANUP_DELAY_MS = 60_000

/**
 * Reject a connection that failed auth. The connection handler increments
 * `totalConnections` BEFORE the auth check runs, so a rejected socket must be
 * un-accounted here — the original inline `ws.close(4001); return` leaked the
 * count (the socket was never added to a room, never got lifecycle handlers,
 * and its eventual close decremented nothing). Extracted so the accounting is
 * unit-testable and converges with `removeClientFromRoom`'s guard.
 *
 * @param {object} ws the socket to reject (never joined a room)
 * @param {{value:number}} totalConnectionsRef shared connection counter holder
 * @param {number} [code] close code (default 4001)
 * @param {string} [reason] close reason (default 'Authentication required')
 */
export function rejectConnection(ws, totalConnectionsRef, code = 4001, reason = 'Authentication required') {
  if (totalConnectionsRef.value > 0) totalConnectionsRef.value--
  ws.close(code, reason)
}

/**
 * Shared teardown for a departing socket (close OR error). Removes it from its
 * room, un-accounts it from `totalConnections`, and announces `user-left` to
 * the REMAINING peers ONLY — never broadcast when the room just became empty,
 * since there is nobody left to receive it.
 *
 * Pure-ish: takes explicit deps (`rooms`, a `{value}` counter holder, and the
 * broadcast fn) so it is unit-testable without a real WebSocketServer.
 *
 * @param {object} ws the socket (carries roomId/userId/userName)
 * @param {Map<string, Set<object>>} rooms roomId -> client set
 * @param {{value:number}} totalConnectionsRef shared connection counter holder
 * @param {(roomId:string, msg:object, exclude?:object)=>void} broadcastToRoomFn
 * @param {number} [now] injectable clock (tests)
 * @returns {{roomId:string, roomSize:number, broadcastUserLeft:boolean, alreadyHandled:boolean}}
 */
export function removeClientFromRoom(ws, rooms, totalConnectionsRef, broadcastToRoomFn, now = Date.now()) {
  const roomId = ws.roomId

  // Idempotency guard: a real socket that errors ALSO emits 'close' afterwards
  // (ws fires error then close), so both lifecycle handlers run this teardown.
  // The first pass un-accounts + broadcasts; subsequent passes must NOT
  // re-decrement the counter or re-broadcast user-left — but they must still
  // report the REAL room size, or handleClientClose would schedule an empty-room
  // cleanup for a room that still has live peers (deleting a live room).
  if (ws.lifecycleHandled) {
    const room = rooms.get(roomId)
    return { roomId, roomSize: room ? room.size : 0, broadcastUserLeft: false, alreadyHandled: true }
  }
  ws.lifecycleHandled = true

  if (totalConnectionsRef.value > 0) totalConnectionsRef.value--
  const room = rooms.get(roomId)
  if (room) room.delete(ws)
  const roomSize = room ? room.size : 0
  binaryLogLastLogged.delete(ws)

  let broadcastUserLeft = false
  if (roomSize > 0 && ws.userId) {
    broadcastToRoomFn(roomId, {
      type: 'user-left',
      userId: ws.userId,
      timestamp: now,
    })
    broadcastUserLeft = true
  }
  return { roomId, roomSize, broadcastUserLeft, alreadyHandled: false }
}

/**
 * Schedule deletion of an empty room entry. The room is only deleted if it is
 * STILL empty when the timer fires — a client may have rejoined within the
 * window, in which case the entry must survive.
 *
 * @returns {NodeJS.Timeout} the timer (tests may await/advance it)
 */
export function scheduleEmptyRoomCleanup(roomId, rooms, delayMs = EMPTY_ROOM_CLEANUP_DELAY_MS) {
  return setTimeout(() => {
    const room = rooms.get(roomId)
    if (room && room.size === 0) {
      rooms.delete(roomId)
      console.log(`[Yjs WS] 🧹 Cleaning up empty room: ${roomId}`)
    }
  }, delayMs)
}

/**
 * Handle a socket close: teardown, log, and schedule empty-room cleanup when
 * the room just emptied.
 */
export function handleClientClose(ws, rooms, totalConnectionsRef, broadcastToRoomFn, now = Date.now(), cleanupDelayMs = EMPTY_ROOM_CLEANUP_DELAY_MS) {
  const result = removeClientFromRoom(ws, rooms, totalConnectionsRef, broadcastToRoomFn, now)
  const { roomId, roomSize, alreadyHandled } = result
  console.log(`[Yjs WS] ❌ Disconnection: room=${roomId}, user=${ws.userName} (${ws.userId}), room now has ${roomSize} clients`)
  // Only the FIRST teardown pass schedules the empty-room cleanup. A repeat pass
  // (error already fired close, or close fired twice) must not schedule a second
  // timer — the room's fate was decided by the first pass.
  if (roomSize === 0 && !alreadyHandled) {
    scheduleEmptyRoomCleanup(roomId, rooms, cleanupDelayMs)
  }
}

/**
 * Handle a socket error. Deliberately converges with the close path — a socket
 * that errors without a following `close` must still be un-accounted, announced
 * as `user-left`, and (if the room emptied) scheduled for cleanup. The previous
 * error handler leaked all three.
 */
export function handleClientError(error, ws, rooms, totalConnectionsRef, broadcastToRoomFn, now = Date.now(), cleanupDelayMs = EMPTY_ROOM_CLEANUP_DELAY_MS) {
  console.error(`[Yjs WS] ⚠️ Error: room=${ws.roomId}, user=${ws.userName}:`, error?.message)
  handleClientClose(ws, rooms, totalConnectionsRef, broadcastToRoomFn, now, cleanupDelayMs)
}

/**
 * Register a socket's connection-lifetime handlers. Both `close` and `error`
 * drive the same cleanup, and a heartbeat termination — `ws.terminate()` fires
 * the `close` event — ends up in the close path too, so a pruned stale client
 * never leaks either. Because a real socket that errors ALSO emits `close`
 * afterwards, both handlers may run for the same departure; `removeClientFromRoom`
 * guards teardown so the second pass is a no-op (no double-decrement, no
 * duplicate user-left, no duplicate empty-room cleanup).
 */
export function registerLifecycleHandlers(ws, rooms, totalConnectionsRef, broadcastToRoomFn) {
  ws.on('close', () => {
    handleClientClose(ws, rooms, totalConnectionsRef, broadcastToRoomFn)
  })
  ws.on('error', (error) => {
    handleClientError(error, ws, rooms, totalConnectionsRef, broadcastToRoomFn)
  })
}

/**
 * Decide whether this process was launched as the entry-point script (so it
 * must bind the port and start the heartbeat) rather than merely imported as a
 * module (e.g. by vitest, which unit-tests the exported helpers below).
 *
 * Two launch modes are treated as "entry point":
 * 1. Direct `node server/ws-server.js` — process.argv[1] is our own file. The
 *    paths are compared via realpath (not the raw string) so relative
 *    invocations, symlinked entry points, and redundant `..` segments all still
 *    resolve to this file. `pathToFileURL(argv[1]).href === import.meta.url` is
 *    NOT enough: it resolves relative paths against cwd but does not follow
 *    symlinks, so `node /usr/local/bin/ws-relay` (a symlink to this script)
 *    would report false and leave the relay unbound.
 * 2. pm2 fork mode — pm2 executes our script via its ProcessContainerFork.js
 *    loader, so process.argv[1] is THAT container's path
 *    (/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js), never ours. The
 *    naive `import.meta.url === file://${process.argv[1]}` comparison then
 *    returns false and the relay never binds — nginx 502s every WS upgrade and
 *    live sharing breaks until a refresh. Detect the fork loader directly from
 *    argv[1] as the primary pm2 signal (works even if pm2 doesn't set pm_id,
 *    e.g. older majors); pm_id covers any other pm2 loader path as a
 *    belt-and-suspenders fallback.
 *
 * @param {string|undefined} [argv1] override process.argv[1] (tests)
 * @param {string|undefined} [pmId]  override process.env.pm_id (tests)
 * @returns {boolean}
 */
export function isEntryPoint(argv1 = process.argv[1], pmId = process.env.pm_id) {
  if (argv1) {
    // 1. Direct node run — argv[1] resolves to our own file. realpathSync
    //    normalizes relative paths AND follows symlinks; it throws when the
    //    path isn't a real file (e.g. a bare pm2 loader path on a dev machine
    //    without pm2 installed), which falls through to the pm2 checks below.
    try {
      if (realpathSync(argv1) === realpathSync(fileURLToPath(import.meta.url))) return true
    } catch {
      // unparsable/nonexistent argv[1] — fall through to the pm2 checks
    }
    // 2. pm2 fork mode — argv[1] is pm2's ProcessContainerFork.js loader.
    if (argv1.includes('ProcessContainerFork')) return true
  }
  // pm2 fallback signal: pm2 always sets pm_id on managed children, so this
  // also catches loader paths we don't explicitly recognize above.
  return typeof pmId !== 'undefined' && pmId !== ''
}

// Start the server + heartbeat only when run directly (skip when imported for
// tests, e.g. to unit-test helpers — the module-scope heartbeat interval would
// otherwise keep the vitest/node process alive).
const isMain = isEntryPoint()
if (isMain) {
  // Server-side heartbeat — ping every 30s, disconnect clients unresponsive for 60s
  setInterval(() => {
    runHeartbeat(wss.clients)
  }, HEARTBEAT_INTERVAL_MS)

  server.listen(PORT, HOST, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║           VP Whiteboard Yjs WebSocket Server              ║
╠══════════════════════════════════════════════════════════╣
║  Status: Running                                          ║
║  URL: ws://${HOST}:${PORT}                                ║
║  Rooms: ${rooms.size}                                            ║
╚══════════════════════════════════════════════════════════╝

Waiting for Yjs connections...
  `)
  })
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Yjs WS] Shutting down gracefully...')
  wss.close(() => {
    server.close(() => {
      console.log('[Yjs WS] Server closed')
      process.exit(0)
    })
  })
})

process.on('SIGTERM', () => {
  console.log('\n[Yjs WS] Received SIGTERM, shutting down...')
  wss.close(() => {
    server.close(() => {
      console.log('[Yjs WS] Server closed')
      process.exit(0)
    })
  })
})
