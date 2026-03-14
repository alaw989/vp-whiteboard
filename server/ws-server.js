#!/usr/bin/env node
/**
 * Yjs WebSocket Server for VP Whiteboard
 *
 * Simple WebSocket relay server for Yjs CRDT synchronization.
 * Run this alongside the Nuxt dev server for real-time collaboration.
 *
 * Usage:
 *   node server/ws-server.js
 *
 * The server:
 * - Listens on port 3001 (configurable via WS_PORT env var)
 * - Relays Yjs sync messages between clients in the same room
 * - Enables real-time collaboration across browsers
 */

import { WebSocketServer } from 'ws'
import { createServer } from 'http'

const PORT = process.env.WS_PORT || 3001
const HOST = process.env.WS_HOST || '0.0.0.0'

// Create HTTP server for WebSocket upgrade
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('VP Whiteboard Yjs WebSocket Server')
})

// Create WebSocket server
const wss = new WebSocketServer({ server, noServer: false })

// Store connections per room
const rooms = new Map()

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
wss.on('connection', (ws, req) => {
  // Extract room ID from URL path
  // Expected format: /whiteboard:{id} or /{id}
  const url = new URL(req.url || '', `http://${req.headers.host}`)
  const pathname = url.pathname

  // Match room ID from path (supports both /whiteboard:{id} and /{id} formats)
  const match = pathname.match(/(?:whiteboard:)?([^/]+)$/)
  const roomId = match && match[1] ? match[1] : 'default'

  // Extract user info from query params
  const userId = url.searchParams.get('userId') || 'anonymous'
  const userName = url.searchParams.get('userName') || 'Anonymous'

  console.log(`[Yjs WS] Connection: room=${roomId}, user=${userName} (${userId})`)

  // Add to room
  const room = getRoom(roomId)
  room.add(ws)

  // Track room ID on websocket for cleanup
  ws.roomId = roomId
  ws.userId = userId
  ws.userName = userName

  // Handle incoming messages (relay to all other clients in room)
  ws.on('message', (data) => {
    // Relay binary message to all other clients in the room
    room.forEach((client) => {
      if (client !== ws && client.readyState === ws.OPEN) {
        client.send(data)
      }
    })
  })

  // Log connection state
  ws.on('close', () => {
    console.log(`[Yjs WS] Disconnection: room=${roomId}, user=${userName} (${userId})`)
    room.delete(ws)

    // Clean up empty rooms after delay
    if (room.size === 0) {
      setTimeout(() => {
        if (rooms.has(roomId) && rooms.get(roomId).size === 0) {
          console.log(`[Yjs WS] Cleaning up empty room: ${roomId}`)
          rooms.delete(roomId)
        }
      }, 60000)
    }
  })

  ws.on('error', (error) => {
    console.error(`[Yjs WS] Error: room=${roomId}, user=${userName}:`, error.message)
    room.delete(ws)
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

Ready for Yjs connections...
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
