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

const PORT = process.env.WS_PORT || 3001
const HOST = process.env.WS_HOST || '0.0.0.0'
const LARAVEL_URL = process.env.LARAVEL_URL || 'http://localhost:8000'
const AUTH_TIMEOUT_MS = parseInt(process.env.WS_AUTH_TIMEOUT_MS || '3000', 10)
// Laravel's session cookie name = Str::slug(APP_NAME).'-session', so it varies
// (e.g. APP_NAME=Laravel → "laravel-session", not the default "laravel_session").
// Accept the configured name plus the common variants.
const SESSION_COOKIE = process.env.SESSION_COOKIE || 'laravel_session'

// Cache session→verdict briefly so repeat connections don't hit Laravel each time.
const authCache = new Map() // laravel_session value -> { ok, exp }
const AUTH_CACHE_TTL_MS = 60_000

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
async function isAuthed(cookieHeader, roomId, queryShareToken, req) {
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
    const { status } = await fetchJson(`${LARAVEL_URL}/api/user`, cookieHeader, AUTH_TIMEOUT_MS, clientOrigin, clientReferer)
    const ok = status === 200
    authCache.set('sess:' + session, { ok, exp: now + AUTH_CACHE_TTL_MS })
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
    const url = `${LARAVEL_URL}/api/shares/${encodeURIComponent(shareToken)}`
    const { status, data } = await fetchJson(url, cookieHeader, AUTH_TIMEOUT_MS, clientOrigin, clientReferer)
    const ok = status === 200 && data && data.success && data.data && data.data.whiteboard_id === roomId
    authCache.set(key, { ok, exp: now + AUTH_CACHE_TTL_MS })
    if (ok) return true
  }

  return false
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

// Create HTTP server for WebSocket upgrade
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('VP Whiteboard Yjs WebSocket Server')
})

// Create WebSocket server (allow large Yjs sync payloads for big canvases)
const wss = new WebSocketServer({ server, noServer: false, maxPayload: 256 * 1024 * 1024 })

// Store connections per room
const rooms = new Map()

// Track total connections
let totalConnections = 0

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
  totalConnections++

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
      ws.close(4001, 'Authentication required')
      return
    }
  }

  // Extract user info from query params
  const userId = url.searchParams.get('userId') || 'anonymous'
  const userName = url.searchParams.get('userName') || 'Anonymous'

  console.log(`[Yjs WS] ✅ Connection: room=${roomId}, user=${userName} (${userId})`)
  console.log(`[Yjs WS] Total connections: ${totalConnections}`)

  // Add to room
  const room = getRoom(roomId)
  room.add(ws)

  console.log(`[Yjs WS] Room ${roomId} now has ${room.size} clients`)

  // Track room ID on websocket for cleanup and message routing
  ws.roomId = roomId
  ws.userId = userId
  ws.userName = userName
  ws.lastPong = Date.now()

  // Notify the new user about their connection
  sendJson(ws, {
    type: 'connected',
    roomId,
    userId,
    userCount: room.size,
    instantRetry: true,
  })

  // Notify others in the room that someone joined
  broadcastToRoom(roomId, {
    type: 'user-joined',
    userId,
    userName,
    timestamp: Date.now(),
  }, ws)

  // Handle incoming messages
  ws.on('message', (data) => {
    const result = relayClientMessage(ws, data, getRoom(ws.roomId || roomId))
    if (result.kind === 'binary' && result.bytes > 0) {
      console.log(`[Yjs WS] 📨 Binary: room=${ws.roomId || roomId}, size=${result.bytes}B, relayed to ${result.relayed}`)
    }
  })

  // Handle disconnect
  ws.on('close', () => {
    totalConnections--
    const currentRoom = getRoom(ws.roomId || roomId)
    currentRoom.delete(ws)
    console.log(`[Yjs WS] ❌ Disconnection: room=${ws.roomId || roomId}, user=${userName} (${userId}), room now has ${currentRoom.size} clients`)

    // Notify others that user left
    broadcastToRoom(ws.roomId || roomId, {
      type: 'user-left',
      userId,
      timestamp: Date.now(),
    })

    // Clean up empty rooms after delay
    if (currentRoom.size === 0) {
      setTimeout(() => {
        const checkRoom = getRoom(ws.roomId || roomId)
        if (checkRoom.size === 0) {
          rooms.delete(ws.roomId || roomId)
          console.log(`[Yjs WS] 🧹 Cleaning up empty room: ${ws.roomId || roomId}`)
        }
      }, 60000)
    }
  })

  ws.on('error', (error) => {
    console.error(`[Yjs WS] ⚠️ Error: room=${ws.roomId || roomId}, user=${userName}:`, error.message)
    const currentRoom = getRoom(ws.roomId || roomId)
    currentRoom.delete(ws)
  })
})

// Helper: send JSON to a single client
function sendJson(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg))
}

// Helper: broadcast JSON to all peers in a room
function broadcastToRoom(roomId, msg, exclude) {
  const room = getRoom(roomId)
  const payload = JSON.stringify(msg)
  room.forEach((client) => {
    if (client !== exclude && client.readyState === 1) client.send(payload)
  })
}

// Start the server + heartbeat only when run directly (skip when imported for
// tests, e.g. to unit-test helpers — the module-scope heartbeat interval would
// otherwise keep the vitest/node process alive).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  // Server-side heartbeat — ping every 30s, disconnect clients unresponsive for 60s
  const HEARTBEAT_INTERVAL = 30000
  const HEARTBEAT_TIMEOUT = 60000
  setInterval(() => {
    const now = Date.now()
    wss.clients.forEach((ws) => {
      if (ws.readyState !== 1) return
      if (now - ws.lastPong > HEARTBEAT_TIMEOUT) {
        console.log(`[Yjs WS] 💔 Heartbeat timeout: room=${ws.roomId || '?'}, user=${ws.userName || '?'}`)
        ws.terminate()
        return
      }
      sendJson(ws, { type: 'ping' })
    })
  }, HEARTBEAT_INTERVAL)

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
