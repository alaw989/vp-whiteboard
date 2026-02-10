# Architecture Patterns

**Domain:** Real-time collaborative engineering whiteboard
**Researched:** 2026-02-09
**Overall confidence:** HIGH

## Recommended Architecture

### High-Level Architecture Diagram

```
+-------------------+     +-------------------+     +-------------------+
|                   |     |                   |     |                   |
|   Web Browser     |<--->|   Web Browser     |<--->|   Web Browser     |
|   (React/Vue)     |     |   (React/Vue)     |     |   (React/Vue)     |
|   + Yjs CRDT      |     |   + Yjs CRDT      |     |   + Yjs CRDT      |
+-------------------+     +-------------------+     +-------------------+
         |                        |                        |
         |                        |                        |
         +------------------------+------------------------+
                                    | WebSocket
                                    v
+---------------------------------------------------------------+
|                    Load Balancer (Nginx/Traefik)              |
+---------------------------------------------------------------+
         |                        |                        |
         v                        v                        v
+----------------+     +----------------+     +----------------+
|   Node.js      |     |   Node.js      |     |   Node.js      |
|   WebSocket    |     |   WebSocket    |     |   WebSocket    |
|   Server #1    |     |   Server #2    |     |   Server #3    |
+----------------+     +----------------+     +----------------+
         |                        |                        |
         +------------------------+------------------------+
                                    | Pub/Sub
                                    v
+---------------------------------------------------------------+
|                      Redis (Presence + Message Bus)           |
+---------------------------------------------------------------+
         |                        |                        |
         v                        v                        v
+----------------+     +----------------+     +----------------+
|   PostgreSQL   |     |  Object Store  |     |   Auth Service |
|   (Metadata)   |     |  (DO Spaces)  |     |   (JWT)        |
+----------------+     +----------------+     +----------------+
```

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Client (Yjs)** | Local CRDT state, UI rendering, offline support | WebSocket Server, Object Store (direct) |
| **WebSocket Server** | Connection management, message relay, auth validation | Client, Redis, PostgreSQL |
| **Redis Pub/Sub** | Cross-server message distribution, presence tracking | WebSocket Servers (all instances) |
| **PostgreSQL** | User auth, board metadata, permissions, version history | WebSocket Server |
| **Object Storage** | File uploads (images, blueprints, exports), CRDT snapshots | Client (signed URLs), WebSocket Server |
| **Load Balancer** | TLS termination, connection distribution, health checks | All WebSocket Servers |

### Data Flow

#### Real-Time Sync Flow (CRDT-based)

```
1. User draws on canvas
   Client: ydoc.getArray('elements').push([newElement])

2. Yjs encodes change as update (binary format)
   Client: ws.send(update)

3. WebSocket Server receives update
   Server: Validates JWT, extracts room/user info

4. Update stored in PostgreSQL (for history/recovery)
   Server: INSERT INTO board_updates (board_id, update_data, user_id, timestamp)

5. Update published to Redis channel
   Server: redis.publish('board:123', update)

6. All WebSocket instances receive update
   Server: redis.subscribe('board:123')

7. Each instance broadcasts to connected clients in that room
   Server: clients.forEach(c => c.send(update))

8. Client Yjs merges update automatically
   Client: Y.applyUpdate(update) - no conflicts, commutative merge
```

#### Presence Flow

```
1. User joins board
   Client: ws.emit('join', {boardId, userId})

2. WebSocket Server tracks connection
   Server: redis.hset('presence:board:123', userId, JSON.stringify({
     cursor: {x, y}, status: 'active', lastSeen: timestamp
   }))

3. Presence published to room
   Server: redis.publish('presence:board:123', {userId, status: 'joined'})

4. Other clients update presence indicators
   Client: Show cursor, update online count

5. User disconnects/leaves
   Server: redis.hdel('presence:board:123', userId)
   Server: redis.publish('presence:board:123', {userId, status: 'left'})
```

#### File Upload Flow

```
1. User uploads blueprint/image
   Client: POST /api/upload-request {filename, contentType, boardId}

2. Server validates auth, generates presigned URL
   Server: JWT validation
   Server: DO Spaces.generatePresignedUrl(key, expiration)

3. Client uploads directly to Object Storage
   Client: PUT https://spaces.nyc3.digitaloceanspaces.com/... (direct)

4. Client confirms upload
   Client: POST /api/upload-complete {key, boardId}

5. Server adds file reference to board
   Server: INSERT INTO board_files (board_id, storage_key, filename, uploaded_by)
   Server: ws.publish('board:123', {type: 'file-added', file})
```

## Patterns to Follow

### Pattern 1: CRDT-Based Sync with Yjs

**What:** Use Yjs as the CRDT engine for real-time collaboration. Each client maintains local state and updates are merged automatically using conflict-free replicated data types.

**When:** For any real-time collaborative features (drawing, text, shapes, cursors).

**Why:**
- Automatic conflict resolution without central coordination
- Offline-first support with automatic sync on reconnect
- Proven at scale (used by tldraw, various collaborative editors)
- Better performance for local operations compared to OT

**Example:**

```typescript
// Client-side initialization
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const ydoc = new Y.Doc()
const elements = ydoc.getArray('elements')  // Shared CRDT array
const awareness = ydoc.awareness

// WebSocket connection with auth
const wsProvider = new WebsocketProvider(
  'wss://api.example.com',
  `board-${boardId}`,
  ydoc,
  {
    connect: true,
    // JWT token sent as query param or header
    params: { token: userToken }
  }
)

// Local changes automatically sync
function addElement(element) {
  elements.push([{
    type: 'rectangle',
    x: element.x,
    y: element.y,
    id: generateId(),
    userId: currentUser.id
  }])
}

// Listen to remote changes
elements.observe((event) => {
  renderCanvas(elements.toArray())
})

// Presence awareness
awareness.setLocalStateField('cursor', { x, y })
awareness.setLocalStateField('user', { name, color })
```

### Pattern 2: Redis Pub/Sub for Multi-Instance Sync

**What:** Use Redis as a message broker to coordinate between multiple WebSocket server instances.

**When:** When you need to scale beyond a single WebSocket server instance.

**Why:**
- Enables horizontal scaling without sticky sessions
- Low-latency message distribution (in-memory)
- Automatic fanout to all subscribed instances
- Battle-tested pattern for real-time systems

**Example:**

```typescript
// Each WebSocket server instance
import Redis from 'ioredis'

const redisPublisher = new Redis(process.env.REDIS_URL)
const redisSubscriber = new Redis(process.env.REDIS_URL)

// Subscribe to board channels
const roomClients = new Map<string, Set<WebSocket>>()

async function handleConnection(ws: WebSocket, boardId: string) {
  if (!roomClients.has(boardId)) {
    roomClients.set(boardId, new Set())

    // Subscribe to Redis channel for this board
    await redisSubscriber.subscribe(`board:${boardId}`)
  }
  roomClients.get(boardId)!.add(ws)
}

// Forward client messages to Redis
ws.on('message', (data) => {
  // Broadcast to local clients
  roomClients.get(boardId)?.forEach(client => {
    if (client !== ws) client.send(data)
  })

  // Publish to other server instances
  redisPublisher.publish(`board:${boardId}`, data)
})

// Receive messages from other instances
redisSubscriber.on('message', (channel, message) => {
  const boardId = channel.split(':')[1]
  roomClients.get(boardId)?.forEach(client => {
    client.send(message)
  })
})
```

### Pattern 3: JWT-Based Authentication with Room-Level Authorization

**What:** Use stateless JWT tokens for authentication, with room-level authorization checked on connection and message processing.

**When:** For all authenticated operations and access control.

**Why:**
- Stateless auth scales horizontally
- Room-level permissions prevent unauthorized access
- Token expiration enforces session limits

**Example:**

```typescript
// WebSocket connection with JWT
async function handleWebSocketUpgrade(request: IncomingMessage) {
  // Extract JWT from query param or header
  const token = new URL(request.url, 'http://localhost').searchParams.get('token')

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload

    // Check room access permission
    const hasAccess = await checkBoardAccess(decoded.userId, boardId)
    if (!hasAccess) {
      return { error: 'Unauthorized' }
    }

    return { userId: decoded.userId, permissions: decoded.permissions }
  } catch (err) {
    return { error: 'Invalid token' }
  }
}

// Room-level permission check
async function checkBoardAccess(userId: string, boardId: string): Promise<boolean> {
  const result = await pg.query(`
    SELECT permission FROM board_permissions
    WHERE board_id = $1 AND user_id = $2
  `, [boardId, userId])

  return result.rows.length > 0
}
```

### Pattern 4: Snapshot + Incremental Updates Pattern

**What:** Store periodic full snapshots of CRDT state plus incremental updates between snapshots. Load latest snapshot and replay updates since.

**When:** For board persistence and recovery.

**Why:**
- Faster initial load (don't replay entire history)
- Efficient storage (updates compress well)
- Point-in-time recovery capability

**Example:**

```typescript
// Server-side snapshot management
const SNAPSHOT_INTERVAL = 100 // Create snapshot every 100 updates
const SNAPSHOT_TTL = 7 * 24 * 60 * 60 // Keep snapshots for 7 days

async function saveBoardUpdate(boardId: string, update: Buffer) {
  await pg.transaction(async (tx) => {
    // Save incremental update
    await tx.query(`
      INSERT INTO board_updates (board_id, update_data, timestamp)
      VALUES ($1, $2, NOW())
    `, [boardId, update])

    // Check if we need a new snapshot
    const { count } = await tx.query(`
      SELECT COUNT(*) as count
      FROM board_updates
      WHERE board_id = $1 AND snapshot_id IS NULL
    `, [boardId])

    if (count >= SNAPSHOT_INTERVAL) {
      await createSnapshot(boardId, tx)
    }
  })
}

async function createSnapshot(boardId: string, tx: any) {
  // Get current Yjs state
  const state = Y.encodeStateAsUpdate(ydoc)

  // Create snapshot
  const { rows: [snapshot] } = await tx.query(`
    INSERT INTO board_snapshots (board_id, snapshot_data, created_at)
    VALUES ($1, $2, NOW())
    RETURNING id
  `, [boardId, state])

  // Link recent updates to this snapshot
  await tx.query(`
    UPDATE board_updates
    SET snapshot_id = $1
    WHERE board_id = $2 AND snapshot_id IS NULL
  `, [snapshot.id, boardId])
}

// Client-side: load board efficiently
async function loadBoard(boardId: string) {
  const { snapshot, updates } = await api.getBoardData(boardId)

  // Apply latest snapshot
  Y.applyUpdate(ydoc, snapshot.snapshot_data)

  // Replay incremental updates since snapshot
  for (const update of updates) {
    Y.applyUpdate(ydoc, update.update_data)
  }

  return ydoc
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Centralized Operational Transformation

**What:** Using OT with a central server that transforms all operations.

**Why bad:**
- Extremely complex to implement correctly
- Server becomes bottleneck and single point of failure
- Difficult to support offline mode
- Prone to transformation bugs with concurrent edits

**Instead:** Use CRDTs (Yjs) which handle conflicts automatically without central coordination.

### Anti-Pattern 2: Sending Full State on Every Change

**What:** Broadcasting entire document state instead of incremental updates.

**Why bad:**
- Massive bandwidth usage (O(n) per change instead of O(1))
- Poor performance with large documents
- Unnecessary network traffic

**Instead:** Use Yjs which sends only incremental binary updates.

### Anti-Pattern 3: Reliance on Sticky Sessions for Scaling

**What:** Using load balancer sticky sessions to keep users on same WebSocket server.

**Why bad:**
- Creates uneven load distribution
- Session migration on server failure is complex
- Doesn't solve cross-room communication

**Instead:** Use Redis pub/sub for message distribution across all instances.

### Anti-Pattern 4: Storing Files in Database

**What:** Storing uploaded files (images, PDFs) as BLOBs in PostgreSQL.

**Why bad:**
- Database bloat, poor performance
- Backups become huge and slow
- No CDN capability
- Expensive storage costs

**Instead:** Use DigitalOcean Spaces (S3-compatible) with presigned URLs for direct uploads.

### Anti-Pattern 5: No Rate Limiting on WebSocket Messages

**What:** Accepting unlimited messages from clients without throttling.

**Why bad:**
- DoS vulnerability (malicious client can spam server)
- Database overload from excessive writes
- Can take down entire infrastructure

**Instead:** Implement per-user and per-connection rate limiting.

## Scalability Considerations

| Concern | At 100 users | At 1K users | At 10K+ users |
|---------|--------------|-------------|---------------|
| **WebSocket Connections** | Single node sufficient | 2-3 nodes with Redis pub/sub | Multiple nodes, geographic distribution |
| **Database** | Single PostgreSQL instance | Read replicas, connection pooling | Sharding by board_id, read replicas |
| **Object Storage** | Direct Spaces integration | CDN enabled, presigned URLs | Multi-region replication |
| **Memory (Yjs state)** | ~1-2 MB per active board | Monitor and evict inactive boards | Separate state servers, periodic snapshotting |
| **Presence (Redis)** | In-memory hash per board | Redis cluster for distribution | Separate presence service, sharding |

### DigitalOcean Droplet Specifics

**Connection Limits:**
- Theoretical TCP limit: ~65,535 connections per IP
- Practical tested limit on 4 CPU/8GB droplet: ~45,000 concurrent WebSockets
- Recommended per-instance limit: 5,000-10,000 connections (headroom for spikes)

**Droplet Sizing Guide:**

| Users (concurrent) | Droplet Size | Num Instances | Redis | Notes |
|-------------------|--------------|---------------|-------|-------|
| < 100 | 2 CPU, 2GB | 1 | Managed (basic) | Single instance sufficient |
| 100-500 | 2 CPU, 4GB | 2 | Managed | Add Redis for pub/sub |
| 500-2000 | 4 CPU, 8GB | 3 | Managed Cluster | Load balancer recommended |
| 2000-10000 | 8 CPU, 16GB | 5+ | Dedicated Redis | Consider database read replicas |

**Kernel Tuning for High WebSocket Counts:**

```bash
# /etc/sysctl.conf
fs.file-max=14000000
fs.nr_open=14000000
net.ipv4.tcp_mem="100000000 100000000 100000000"
net.core.somaxconn=20000
net.ipv4.tcp_max_syn_backlog=20000
net.ipv4.ip_local_port_range="1025 65535"

# Apply
sysctl -p
```

**Scaling Path:**
1. **Phase 1 (MVP):** Single droplet, integrated PostgreSQL + Redis
2. **Phase 2:** Add second WebSocket instance, managed Redis, load balancer
3. **Phase 3:** Separate database tier, read replicas, 3+ WebSocket instances
4. **Phase 4:** Geographic distribution, separate state servers

## Security Architecture

### Authentication Flow

```
1. User logs in
   POST /api/auth/login {email, password}
   -> Validates against PostgreSQL users table
   <- Returns JWT (15min access token + 7day refresh token)

2. WebSocket connection
   wss://api.example.com/ws?token=<jwt>
   -> Validates JWT on connection
   -> Extracts userId, permissions
   <- Connection accepted with assigned permissions

3. Token refresh
   POST /api/auth/refresh {refreshToken}
   <- Returns new JWT
```

### Authorization Model

```typescript
// Permission levels
enum Permission {
  VIEW = 'view',           // Can view board only
  COMMENT = 'comment',     // Can add comments, not edit
  EDIT = 'edit',           // Can edit elements
  ADMIN = 'admin'          // Full control + user management
}

// Board ownership
interface BoardAccess {
  boardId: string
  userId: string
  permission: Permission
  grantedBy: string | null  // null for owner
  grantedAt: Date
}

// Check on every sensitive operation
async function requirePermission(
  userId: string,
  boardId: string,
  required: Permission
): Promise<boolean> {
  const access = await getBoardAccess(userId, boardId)

  const hierarchy = {
    [Permission.ADMIN]: 4,
    [Permission.EDIT]: 3,
    [Permission.COMMENT]: 2,
    [Permission.VIEW]: 1
  }

  return hierarchy[access.permission] >= hierarchy[required]
}
```

### Security Checklist

- [ ] JWT with RS256 (asymmetric) for production, HS256 for MVP
- [ ] WebSocket rate limiting per user (e.g., 100 msg/sec)
- [ ] Input validation on all WebSocket messages
- [ ] File upload validation (type, size limits, virus scanning)
- [ ] HTTPS only (TLS 1.3) for WebSocket connections
- [ ] CORS restricted to known domains
- [ ] SQL injection prevention (parameterized queries)
- [ ] Regular security audits of dependencies
- [ ] Logging of all auth/permission decisions
- [ ] Room-level isolation (users can only access authorized boards)

## Build Order (Dependencies)

```
Phase 1: Foundation
  |
  +-- Authentication (JWT, user model)
  +-- Database schema (users, boards, permissions)
  +-- Basic WebSocket server (single instance)
  +-- Yjs integration (local-only first)

Phase 2: Real-Time Sync
  |
  +-- WebSocket + Yjs integration
  +-- Room-based message routing
  +-- Basic presence (online/offline)
  +-- PostgreSQL persistence (updates, snapshots)

Phase 3: Scaling
  |
  +-- Redis pub/sub integration
  +-- Multiple WebSocket instances
  +-- Load balancer configuration
  +-- Redis presence implementation

Phase 4: File Handling
  |
  +-- DigitalOcean Spaces integration
  +-- Presigned URL generation
  +-- File metadata storage
  +-- Client-side upload handling

Phase 5: Advanced Features
  |
  +-- Fine-grained permissions
  +-- Cursor tracking
  +-- Comments system
  +-- Export/import functionality
```

## Database Schema

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Boards table
CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Board permissions
CREATE TABLE board_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(50) NOT NULL, -- 'view', 'edit', 'admin'
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(board_id, user_id)
);

-- Board updates (incremental CRDT updates)
CREATE TABLE board_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  update_data BYTEA NOT NULL,
  snapshot_id UUID REFERENCES board_snapshots(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Board snapshots (full CRDT state)
CREATE TABLE board_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  snapshot_data BYTEA NOT NULL,
  update_count INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- File uploads metadata
CREATE TABLE board_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  storage_key VARCHAR(500) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(100),
  size_bytes BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_board_updates_board_id ON board_updates(board_id, created_at DESC);
CREATE INDEX idx_board_updates_snapshot_id ON board_updates(snapshot_id);
CREATE INDEX idx_board_snapshots_board_id ON board_snapshots(board_id, created_at DESC);
CREATE INDEX idx_board_permissions_board_id ON board_permissions(board_id);
CREATE INDEX idx_board_permissions_user_id ON board_permissions(user_id);
CREATE INDEX idx_board_files_board_id ON board_files(board_id);
```

## Sources

- [Velt - Best CRDT Libraries 2025](https://velt.dev/blog/best-crdt-libraries-real-time-data-sync) - HIGH confidence, comprehensive CRDT library comparison
- [Velt - Yjs WebSocket Server Guide](https://velt.dev/blog/yjs-websocket-server-real-time-collaboration) - HIGH confidence, detailed Yjs WebSocket architecture
- [Scaling WebSocket Services with Redis Pub/Sub](https://leapcell.io/blog/scaling-websocket-services-with-redis-pub-sub-in-node-js) - MEDIUM confidence, practical implementation guide
- [Real-Time Presence System Using Redis Pub/Sub + Spring WebSockets](https://blog.stackademic.com/real-time-presence-system-using-redis-pub-sub-spring-websockets-2025-architecture-guide-47e670b87af4) - HIGH confidence, 2025 architecture for presence
- [Realtime Collaborative Whiteboard using NodeJS, MongoDB, Nginx LB and Redis](https://medium.com/@rayancr/realtime-collaborative-whiteboard-using-nodejs-mongodb-nginx-lb-and-redis-a0f1d29a1462) - MEDIUM confidence, real whiteboard implementation
- [PART 1: FastAPI 45k concurrent websocket on single digitalocean droplet](https://medium.com/@ar.aldhafeeri11/part-1-fastapi-45k-concurrent-websocket-on-single-digitalocean-droplet-1e4fce4c5a64) - HIGH confidence, actual DO droplet performance data
- [Operational Transformation vs CRDTs](https://dev.to/puritanic/building-collaborative-interfaces-operational-transforms-vs-crdts-2obo) - MEDIUM confidence, comparison of sync approaches
- [Building Real-Time Applications with WebSockets](https://render.com/articles/building-real-time-applications-with-websockets) - MEDIUM confidence, WebSocket best practices
