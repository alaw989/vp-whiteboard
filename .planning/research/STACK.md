# Technology Stack

**Project:** vp-whiteboard
**Researched:** 2025-02-09
**Overall Confidence:** HIGH

## Executive Summary

For a collaborative whiteboard application focused on engineering/technical drawings deployed to DigitalOcean, the recommended 2025 stack is:

**Frontend:** Next.js 15 + React 19 + tldraw SDK 4.2 + TailwindCSS
**Backend:** Bun 1.3+ or Node.js 22 + Hono (with Bun adapter) or Fastify
**Real-time:** Yjs 13.6.29 + Hocuspocus 3.4+ (self-hosted WebSocket server)
**Database:** PostgreSQL 17 + Drizzle ORM 0.34+
**Authentication:** Auth.js (NextAuth.js) v5 or Lucia 1+
**File Storage:** MinIO (self-hosted S3-compatible)
**Deployment:** DigitalOcean Droplet with Ubuntu 24.04 LTS + Nginx + PM2 or Docker

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Next.js** | 15.x | Full-stack React framework | React 19 support, Server Actions stable, Turbopack default (5-10x faster builds), excellent DX |
| **React** | 19.x | UI library | Latest version with full Next.js 15 integration, improved Server Components |
| **TypeScript** | 5.7+ | Type safety | Essential for collaborative apps with complex state management |

**Alternatives Considered:**
- **Remix 3**: Good for web standards, but Next.js 15 has better Server Actions and real-time ecosystem for this use case
- **SvelteKit**: Excellent DX, but smaller ecosystem for whiteboard-specific libraries

**Why Not Vite-only:** While Vite is faster for pure SPAs, Next.js 15's Server Actions, API routes, and App Router provide better structure for real-time collaborative apps.

### Canvas / Drawing Engine

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **tldraw SDK** | 4.2.3+ | Infinite canvas whiteboard | Purpose-built for whiteboards, production-ready multiplayer sync, excellent engineering drawing support, active development (SDK 4.2 released Nov 2025) |
| **Konva.js** | 9.3+ | Canvas rendering (if custom) | 60fps with 1000+ objects, superior performance to Fabric.js for drawing-intensive apps, better React integration via react-konva |

**Alternatives Considered:**
- **Fabric.js**: Good for complex object manipulation but ~30% slower than Konva for high-frequency drawing
- **Excalidraw**: Excellent but more opinionated for diagramming, less flexible for technical drawings
- **Pure Canvas 2D**: Too much boilerplate, reinventing the wheel

**Why Not Fabric.js:** Fabric.js trades performance for features. For a real-time collaborative whiteboard where 60fps is critical, Konva.js benchmarks show significantly better performance with high object counts.

### Real-time Collaboration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Yjs** | 13.6.29 (stable) | CRDT for conflict-free sync | Industry standard for collaborative apps, battle-tested, excellent offline support |
| **Hocuspocus** | 3.4+ | Yjs WebSocket server | Self-hosted, production-ready, actively maintained (latest release Jan 2026), excellent extensibility via hooks |
| **y-websocket** | Latest | Fallback WebSocket provider | Simpler alternative, direct Yjs integration, less feature-rich than Hocuspocus |

**Alternatives Considered:**
- **Liveblocks**: Excellent product but NO self-hosting option (major red flag for confidential engineering data), $0.15/GB beyond 8GB free tier
- **PartyKit**: Good for edge computing via Cloudflare, but more vendor lock-in than self-hosted solution
- **Automerge 2.0**: Good CRDT alternative but smaller ecosystem than Yjs

**Why Not Liveblocks:** Despite excellent Yjs integration, Liveblocks does not offer self-hosting. For engineering applications with confidential data, data residency and control are critical requirements.

**Why Hocuspocus over y-websocket:** Hocuspocus provides a production-ready, extensible server with hooks for authentication, persistence, and authorization. The development team actively maintains it (v3.4.4 released Jan 2026), and it's designed specifically for production workloads.

### Backend Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Bun** | 1.3+ | JavaScript runtime | 4x HTTP throughput vs Node.js, 7x WebSocket throughput, built-in WebSocket support, zero-config TypeScript |
| **Node.js** | 22 LTS | Alternative runtime | If Bun compatibility issues arise, Node.js LTS provides stability and ecosystem maturity |

**Alternatives Considered:**
- **Deno 2**: Excellent security and performance, but smaller ecosystem for production WebSocket servers

**Why Bun in 2025:** Bun offers significant performance advantages for WebSocket-heavy applications (7x throughput). For a collaborative whiteboard where real-time sync is critical, this is material. However, Node.js 22 LTS is a safe fallback if ecosystem compatibility becomes an issue.

### Backend Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Hono** | 4.x | Web framework | Ultra-fast, excellent Bun/edge runtime support, modern TypeScript-first API, lightweight |
| **Fastify** | 5.x | Alternative framework | If using Node.js, best-in-class performance, excellent WebSocket plugin ecosystem |

**Alternatives Considered:**
- **Express**: Mature ecosystem but significantly slower than Hono/Fastify, larger bundle size
- **NestJS**: Excellent for large teams but overkill for this use case, more boilerplate

**Why Not Express:** Express is the default choice, but Hono and Fastify offer significantly better performance with less overhead. For a WebSocket-heavy application, this matters.

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **PostgreSQL** | 17 | Primary database | Major performance improvements (94% faster queries in some cases), enhanced JSONB support, incremental VACUUM, mature ecosystem |
| **Drizzle ORM** | 0.34+ | Database access | SQL-like syntax, excellent TypeScript integration, smaller bundles than Prisma, better performance, no query engine overhead |

**Alternatives Considered:**
- **Prisma 7**: Rust-free engine is good, but Drizzle offers smaller bundles and more SQL control
- **MySQL 9**: Good but PostgreSQL 17 has better JSONB performance for document storage

**Why Drizzle over Prisma:** Drizzle generates zero-overhead SQL and offers better TypeScript integration with smaller bundle sizes. For serverless/edge deployments, this matters. Prisma's query engine adds overhead.

### Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Auth.js (NextAuth.js)** | 5.x | Authentication | Open-source, Next.js 15 App Router support, mature ecosystem, self-hosted |
| **Lucia** | 1+ | Alternative | More flexible, framework-agnostic, excellent TypeScript support |

**Alternatives Considered:**
- **Clerk**: Fast setup (~30 min), but managed service only (no self-hosting), adds dependency
- **Supabase Auth**: Good but self-hosting is complex, overkill for auth-only needs
- **PocketBase**: Excellent for simple apps, but SQLite-based (less ideal for production scale)

**Why Not Clerk:** While Clerk offers the fastest setup, it's a managed service. For self-hosted deployment on DigitalOcean with control over user data, Auth.js v5 provides better long-term independence.

**Why Auth.js v5:** Specifically built for Next.js with App Router support. Matures ecosystem, social providers built-in, and you control the user data.

### Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Valibot** | Latest | Schema validation | 2x faster than Zod v3, 17x faster than Zod v4, better tree-shaking, modular architecture |

**Alternatives Considered:**
- **Zod 4**: Industry standard but performance regression (17x slower than v3 for schema creation)

**Why Valibot over Zod:** Zod v4 introduced significant performance issues. Valibot is designed from the ground up for performance and tree-shaking, making it ideal for frontend validation.

### File Storage

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **MinIO** | Latest | S3-compatible storage | Self-hosted, S3 API compatible, excellent performance, object locking for data retention, active development |
| **Local Storage** | N/A | Development/small deployments | Simplest option for single-droplet deployments |

**Alternatives Considered:**
- **AWS S3**: Managed but adds vendor dependency and cost
- **SeaweedFS**: Good for distributed storage but more complex setup
- **Garage**: Rust-based, interesting but smaller ecosystem

**Why MinIO:** MinIO is the de facto standard for self-hosted S3-compatible storage. It offers enterprise features like object locking (WORM) important for engineering document retention policies. Active development with optimized small object storage (2024-2025 updates).

### Deployment

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Ubuntu** | 24.04 LTS | OS | Latest LTS, systemd improvements, long-term support |
| **Nginx** | Latest | Reverse proxy | Excellent WebSocket support, battle-tested, good WSS configuration |
| **PM2** | 6.x | Process manager | Zero-downtime reloads, auto-restart, monitoring, production-ready |
| **Docker** | 27.x+ | Containerization | Optional but recommended for easier deployments and isolation |
| **Certbot** | Latest | SSL certificates | Let's Encrypt with systemd auto-renewal (automatic on Ubuntu) |

**Alternatives Considered:**
- **Kubernetes**: Overkill for single droplet deployment
- **Systemd-only**: Possible but PM2 provides better Node.js process management

**Why Docker (Optional):** Docker simplifies dependency management and makes deployments reproducible. However, for a single droplet, direct deployment with PM2 is simpler and uses fewer resources.

---

## Installation

```bash
# Core dependencies
npm install next@15 react@19 react-dom@19
npm install @tldraw/sync@latest konva@9.3 react-konva@latest

# Real-time collaboration
npm install yjs@13.6.29
npm install @hocuspocus/server@latest

# Backend (if building custom backend)
npm install hono@4

# Database
npm install drizzle-orm@latest
npm install postgres@latest  # PostgreSQL driver

# Authentication
npm install next-auth@5 auth-core@latest

# Validation
npm install valibot@latest

# File upload
npm install multer@latest  # For multipart forms
npm install @aws-sdk/client-s3@latest  # For MinIO/S3

# TypeScript
npm install -D typescript@5.7 @types/react@18 @types/node@22

# Development
npm install -D tailwindcss@latest postcss@latest autoprefixer@latest
npm install -D drizzle-kit@latest
```

---

## Architecture Decisions

### Authentication Pattern: JWT + HttpOnly Cookies

**Pattern:** Server-side JWTs stored in HttpOnly cookies

**Why:**
- HttpOnly cookies prevent XSS access to tokens
- Server-side JWTs allow immediate revocation
- Works seamlessly with Next.js 15 Server Actions
- Simpler than implementing CSRF tokens for every request

**Implementation:**
```typescript
// Auth.js v5 configuration
// Uses secure, HttpOnly cookies by default
// JWT stored server-side with database-backed sessions for revocation
```

**What NOT to Do:**
- Don't store tokens in localStorage (XSS vulnerable)
- Don't use client-side JWTs without refresh token rotation
- Don't implement custom auth before evaluating Auth.js/Lucia

### Real-time Collaboration Pattern: CRDT + WebSocket

**Pattern:** Yjs CRDT for state + Hocuspocus WebSocket server

**Why:**
- CRDTs guarantee no conflicts even with offline edits
- Yjs is battle-tested with excellent TypeScript support
- Hocuspocus provides production-ready WebSocket server with auth hooks
- Self-hosted for data control

**Data Flow:**
1. Client connects to Hocuspocus server via WebSocket
2. Hocuspocus authenticates via hooks (integrates with Auth.js)
3. Yjs document state syncs via CRDT
4. Changes persist to PostgreSQL via Hocuspocus extension
5. Presence info (cursors, selections) syncs via Yjs awareness

**What NOT to Do:**
- Don't build custom sync logic (use Yjs)
- Don't use operational transformation manually (Yjs handles this)
- Don't store entire canvas in database (Yjs document + periodic snapshots)

### File Storage Strategy: MinIO + Object Metadata

**Pattern:** Files in MinIO, metadata in PostgreSQL

**Why:**
- S3-compatible API makes migration easy
- PostgreSQL stores permissions, version history, metadata
- MinIO handles large file storage efficiently
- Object locking for document retention (WORM model)

**Implementation:**
```typescript
// File upload flow
1. User uploads via multipart/form-data
2. Server validates file type, size
3. Generate unique key (UUID + original extension)
4. Stream to MinIO using presigned URL or direct upload
5. Store metadata in PostgreSQL (owner_id, key, content_type, created_at)
6. Return file URL for display
```

**Security Considerations:**
- Validate file types (magic bytes, not just extension)
- Limit file sizes (e.g., 50MB for PDFs, 10MB for images)
- Scan uploaded files for malware (ClamAV optional)
- Use presigned URLs with expiration for direct access
- Store engineering documents with encryption at rest

**What NOT to Do:**
- Don't store files in database (use object storage)
- Don't trust client-provided MIME types
- Don't serve files directly from public URLs without auth checks

### Deployment Pattern for DigitalOcean

**Option A: Simple PM2 Deployment (Recommended for Start)**

```bash
# DigitalOcean Droplet: 4GB RAM, 2 vCPU, 80GB SSD
# OS: Ubuntu 24.04 LTS

# Setup
1. Create droplet with Ubuntu 24.04
2. SSH in, update: apt update && apt upgrade -y
3. Install Node.js 22 LTS via NodeSource
4. Install PostgreSQL 17
5. Install MinIO (separate process or Docker)
6. Clone repo, npm install
7. Configure environment variables
8. Build: npm run build
9. Start with PM2: pm2 start npm --name "whiteboard" -- start
10. Configure Nginx reverse proxy with WSS support
11. Setup Let's Encrypt with certbot
```

**Option B: Docker Deployment (Recommended for Production)**

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://...
      - WS_URL=ws://localhost:3001
    depends_on:
      - postgres
      - minio

  postgres:
    image: postgres:17
    volumes:
      - pgdata:/var/lib/postgresql/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data

  hocuspocus:
    build: ./hocuspocus-server
    ports:
      - "3001:3001"
```

---

## DigitalOcean Specific Considerations

### Droplet Sizing

| Tier | Specs | Suitable For |
|------|-------|--------------|
| Basic | 2GB RAM, 1 vCPU, $6/mo | Development only |
| Basic | 4GB RAM, 2 vCPU, $24/mo | MVP, small team (up to 10 concurrent users) |
| Premium | 8GB RAM, 4 vCPU, $48/mo | Production, larger teams (10-50 concurrent) |
| Premium | 16GB RAM, 8 vCPU, $96/mo | Scaling to 100+ concurrent users |

**Recommendation:** Start with 4GB/2vCPU Basic droplet. Upgrade when average WebSocket connections exceed 50% of RAM capacity.

### Security Configuration

```nginx
# /etc/nginx/sites-available/whiteboard
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL from Let's Encrypt (auto-renews via systemd)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Next.js app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket server (Hocuspocus)
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Extended timeouts for persistent connections
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_connect_timeout 60s;
    }
}
```

**UFW Firewall Rules:**
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp   # HTTP for certbot
ufw allow 443/tcp  # HTTPS
ufw enable
```

### Monitoring

**Essential monitoring:**
1. **PM2 Plus** or **Keymetrics**: Process monitoring, restart alerts
2. **Node.js metrics:** Event loop lag, memory usage, heap size
3. **WebSocket metrics:** Concurrent connections, message throughput
4. **PostgreSQL:** Connection pool, query performance
5. **Nginx logs:** Access logs, error monitoring

**Recommended tools:**
- `pm2-logrotate`: Prevent disk space issues from logs
- `autopostgresqlbackup`: Automated backups
- DigitalOcean Uptime monitoring: Free basic monitoring

---

## What NOT to Use (Anti-Recommendations)

| Technology | Why Avoid | Alternative |
|------------|-----------|-------------|
| **Socket.IO** | Unnecessary abstraction over native WebSockets, adds overhead | Native WebSocket API or ws library |
| **MongoDB** | PostgreSQL 17 has excellent JSONB performance, better for relational data | PostgreSQL 17 |
| **Express.js** | Slower than Hono/Fastify, larger bundle | Hono (with Bun) or Fastify |
| **Redux** | Overkill for modern React, use Zustand or Jotai for local state | Zustand for client state, Yjs for shared state |
| **Webpack** | Next.js 15 uses Turbopack by default, faster builds | Turbopack (default in Next.js 15) |
| **Jest** | Slow for component testing, consider Vitest | Vitest (faster, better DX) |
| **Liveblocks** | No self-hosting option, data control issues for engineering | Hocuspocus + self-hosted Yjs |
| **Clerk** | Managed service only, adds vendor dependency | Auth.js v5 (self-hosted) |
| **Zod 4** | 17x slower than v3 for schema creation | Valibot |
| **Canvas 2D directly** | Too much boilerplate, performance concerns at scale | tldraw SDK or Konva.js |
| **AWS S3** | Adds vendor dependency and egress costs | MinIO (self-hosted) |

---

## Confidence Levels

| Area | Confidence | Reasoning |
|------|------------|-----------|
| Frontend (Next.js 15) | HIGH | Official docs confirm stable release, Turbopack default |
| Real-time (Yjs + Hocuspocus) | HIGH | Active development, latest releases Jan 2026, production-ready |
| Canvas (tldraw/Konva) | HIGH | SDK 4.2 released Nov 2025, active development |
| Database (PostgreSQL 17) | HIGH | Official release notes confirm features |
| ORM (Drizzle) | HIGH | Actively maintained, latest releases 2025 |
| Authentication (Auth.js v5) | MEDIUM | Some conflicting info on version stability, but generally positive |
| Deployment (DigitalOcean) | HIGH | Standard practices, confirmed via official DO tutorials |
| File Storage (MinIO) | HIGH | Active development, 2024-2025 releases confirm features |

---

## Sources

### Official Documentation (HIGH Confidence)
- [Next.js 15 Release Notes](https://nextjs.org/blog/next-15)
- [tldraw SDK Releases](https://github.com/tldraw/tldraw/releases)
- [tldraw SDK 4.0 Announcement](https://tldraw.dev/blog/tldraw-sdk-4-0)
- [Yjs Official Documentation](https://docs.yjs.dev/)
- [PostgreSQL 17 Release Notes](https://www.postgresql.org/docs/release/17.0/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Hocuspocus Documentation](https://tiptap.dev/docs/hocuspocus/)
- [Bun 1.3 Release](https://bun.com/blog/bun-v1.3)

### Community Resources (MEDIUM-HIGH Confidence)
- [Drizzle vs Prisma 2025 Comparison](https://www.bytebase.com/blog/drizzle-vs-prisma/)
- [Node.js ORMs 2025 Comparison](https://thedataguy.pro/blog/2025/12/nodejs-orm-comparison-2025/)
- [Best CRDT Libraries 2025](https://velt.dev/blog/best-crdt-libraries-real-time-data-sync)
- [Clerk vs Supabase Auth vs NextAuth.js Comparison](https://medium.com/better-dev-nextjs-react/clerk-vs-supabase-auth-vs-nextauth-js-the-production-reality-nobody-tells-you-a4b8f0993e1b)
- [Konva.js vs Fabric.js Comparison](https://medium.com/@www.blog4j.com/konva-js-vs-fabric-js-in-depth-technical-comparison-and-use-case-analysis-9c247968dd0f)
- [Valibot vs Zod Comparison](https://valibot.dev/guides/comparison/)
- [MinIO vs Ceph RGW vs SeaweedFS vs Garage 2025](https://onidel.com/blog/minio-ceph-seaweedfs-garage-2025)

### Deployment Resources (HIGH Confidence)
- [DigitalOcean UFW Tutorial](https://www.digitalocean.com/community/tutorials/how-to-set-up-a-firewall-with-ufw-on-ubuntu)
- [DigitalOcean Let's Encrypt with Nginx](https://www.digitalocean.com/community/tutorials/how-to-secure-nginx-with-let-s-encrypt-on-ubuntu-20-04)
- [DigitalOcean Docker Compose Tutorial](https://www.digitalocean.com/community/tutorials/how-to-install-and-use-docker-compose-on-ubuntu-22-04)

### Performance Benchmarks (MEDIUM Confidence)
- [Bun vs Node.js 2025 Performance](https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide)
- [Zod v4 Performance Issues](https://dev.to/dzakh/zod-v4-17x-slower-and-why-you-should-care-1m1)
- [Canvas Engines Comparison](https://benchmarks.slaylines.io/)

---

## Phase 1 MVP Package List

```json
{
  "dependencies": {
    "next": "15.x",
    "react": "19.x",
    "react-dom": "19.x",
    "@tldraw/sync": "latest",
    "konva": "9.3.x",
    "react-konva": "latest",
    "yjs": "13.6.29",
    "valibot": "latest",
    "drizzle-orm": "latest",
    "postgres": "latest",
    "next-auth": "5.x",
    "@hocuspocus/server": "latest",
    "@aws-sdk/client-s3": "latest",
    "tailwindcss": "latest"
  },
  "devDependencies": {
    "typescript": "5.7.x",
    "@types/react": "18.x",
    "@types/node": "22.x",
    "drizzle-kit": "latest",
    "autoprefixer": "latest",
    "postcss": "latest"
  }
}
```

---

## Open Questions for Phase-Specific Research

1. **PDF/CAD Rendering:** Specific libraries for technical drawing annotation need deeper investigation
2. **WebSocket Scaling:** Multi-droplet setup with Redis for session sharing
3. **Backup Strategy:** PostgreSQL backup automation and disaster recovery
4. **Rate Limiting:** DDoS protection for WebSocket endpoints
5. **Performance Testing:** Load testing methodology for concurrent WebSocket connections
