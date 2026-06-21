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
 * NOTE: anonymous share-link viewers (no session) are currently rejected.
 * If share-link real-time collaboration is needed, add a ?token= path that
 * validates via Laravel's public /api/sessions/{shareToken} route.
 */

import { WebSocketServer } from 'ws'
import { createServer } from 'http'

const PORT = process.env.WS_PORT || 3001
const HOST = process.env.WS_HOST || '0.0.0.0'
const LARAVEL_URL = process.env.LARAVEL_URL || 'http://localhost:8000'
const AUTH_TIMEOUT_MS = parseInt(process.env.WS_AUTH_TIMEOUT_MS || '3000', 10)

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

async function isAuthed(cookieHeader) {
  if (!cookieHeader) return false
  const session = parseCookies(cookieHeader)['laravel_session']
  if (!session) return false

  const now = Date.now()
  const cached = authCache.get(session)
  if (cached && cached.exp > now) return cached.ok

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)
  let ok = false
  try {
    const res = await fetch(`${LARAVEL_URL}/api/user`, {
      headers: { cookie: cookieHeader, accept: 'application/json' },
      signal: controller.signal,
    })
    ok = res.status === 200
  } catch (e) {
    // Laravel unreachable / timeout → fail closed (deny).
    console.log(`[Yjs WS] ⚠️ Auth check failed: ${e.message}`)
    ok = false
  } finally {
    clearTimeout(timer)
  }
  authCache.set(session, { ok, exp: now + AUTH_CACHE_TTL_MS })
  return ok
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

  // Validate auth against Laravel (Sanctum session cookie)
  const authed = await isAuthed(req.headers.cookie)
  if (!authed) {
    console.log(`[Yjs WS] 🚫 Rejected unauthenticated connection to room=${roomId}`)
    ws.close(4001, 'Authentication required')
    return
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

  // Log when we receive messages
  ws.on('message', (data) => {
    // Get fresh room reference to ensure we relay to ALL current clients
    const currentRoom = getRoom(ws.roomId || roomId)
    const msgSize = data.byteLength || data.length || 0
    console.log(`[Yjs WS] 📨 Message: room=${ws.roomId || roomId}, size=${msgSize} bytes, room clients=${currentRoom.size}`)

    // Relay binary message to all other clients in the room
    let relayed = 0
    currentRoom.forEach((client) => {
      if (client !== ws && client.readyState === ws.OPEN) {
        client.send(data)
        relayed++
      }
    })
    console.log(`[Yjs WS] 📤 Relayed to ${relayed} other clients`)
  })

  // Log connection state
  ws.on('close', () => {
    totalConnections--
    const currentRoom = getRoom(ws.roomId || roomId)
    currentRoom.delete(ws)
    console.log(`[Yjs WS] ❌ Disconnection: room=${ws.roomId || roomId}, user=${userName} (${userId}), room now has ${currentRoom.size} clients`)

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

// Start the server
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
