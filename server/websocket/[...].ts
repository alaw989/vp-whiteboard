// WebSocket handler for Yjs real-time collaboration
// This route enables Yjs y-websocket to work with Nitro
// Configured for instant retry reconnection (no exponential backoff)

import { WebSocketServer, WebSocket } from 'ws'
import { parse } from 'querystring'

// Store active connections
const connections = new Map<string, Set<any>>()

// Store user info per connection
const connectionUsers = new Map<any, { userId: string; userName: string; lastHeartbeat: number }>()

export default defineWebSocketHandler({
  // Configure heartbeat for connection health monitoring
  heartbeat: {
    interval: 30000, // 30 seconds
    message: JSON.stringify({ type: 'ping' }),
  },

  async open(peer) {
    const url = new URL(peer.url || '', `ws://${peer.headers?.host || 'localhost'}`)
    const pathname = url.pathname

    // Extract room/whiteboard ID from pathname
    // Expected format: /ws/whiteboard:{id} or /ws/{id}
    const match = pathname.match(/(?:whiteboard:)?([^/]+)$/)
    const roomId = match ? match[1] : 'default'

    // Get user info from query params
    const userId = url.searchParams.get('userId') || 'anonymous'
    const userName = url.searchParams.get('userName') || 'Anonymous'

    // Store user info with heartbeat timestamp
    connectionUsers.set(peer, { userId, userName, lastHeartbeat: Date.now() })

    // Add to room
    if (!connections.has(roomId)) {
      connections.set(roomId, new Set())
    }
    connections.get(roomId)!.add(peer)

    // Subscribe to room
    peer.subscribe(roomId)

    // Notify others in room
    peer.publish(roomId, {
      type: 'user-joined',
      userId,
      userName,
      timestamp: Date.now(),
    })

    // Send current room info to new user
    peer.send(JSON.stringify({
      type: 'connected',
      roomId,
      userId,
      userCount: connections.get(roomId)?.size || 0,
      // Indicate instant retry is supported
      instantRetry: true,
    }))
  },

  message(peer, message) {
    try {
      // Update heartbeat timestamp
      const userInfo = connectionUsers.get(peer)
      if (userInfo) {
        userInfo.lastHeartbeat = Date.now()
      }

      const data = typeof message === 'string' ? JSON.parse(message) : message

      // Handle ping/pong for heartbeat
      if (data.type === 'ping') {
        peer.send(JSON.stringify({ type: 'pong' }))
        return
      }

      // Get room from subscriptions
      const url = new URL(peer.url || '', `ws://${peer.headers?.host || 'localhost'}`)
      const pathname = url.pathname
      const match = pathname.match(/(?:whiteboard:)?([^/]+)$/)
      const roomId = match ? match[1] : 'default'

      // Forward message to room (Yjs handles the actual CRDT logic)
      peer.publish(roomId, data)
    } catch (error) {
      console.error('WebSocket message error:', error)
    }
  },

  close(peer, event) {
    const userInfo = connectionUsers.get(peer)
    if (userInfo) {
      // Notify others that user left
      for (const [roomId, peers] of connections.entries()) {
        if (peers.has(peer)) {
          peer.publish(roomId, {
            type: 'user-left',
            userId: userInfo.userId,
            timestamp: Date.now(),
          })
          peers.delete(peer)

          // Clean up empty rooms
          if (peers.size === 0) {
            connections.delete(roomId)
          }
        }
      }
      connectionUsers.delete(peer)
    }
  },

  error(peer, error) {
    console.error('[WebSocket] Error:', error)
    const userInfo = connectionUsers.get(peer)
    if (userInfo) {
      // Clean up user info on error
      for (const [roomId, peers] of connections.entries()) {
        if (peers.has(peer)) {
          peers.delete(peer)
          // Clean up empty rooms
          if (peers.size === 0) {
            connections.delete(roomId)
          }
        }
      }
      connectionUsers.delete(peer)
    }
  },
})
