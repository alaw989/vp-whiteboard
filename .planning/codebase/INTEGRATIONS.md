# External Integrations

**Analysis Date:** 2026-02-09

## APIs & External Services

**Database:**
- Supabase - PostgreSQL database with real-time capabilities
  - SDK/Client: @supabase/supabase-js 2.39.0
  - Auth: Row Level Security (RLS) policies
  - Storage: File upload capabilities for whiteboard attachments

## Data Storage

**Databases:**
- PostgreSQL (via Supabase)
  - Connection: Environment variables (SUPABASE_URL, SUPABASE_ANON_KEY)
  - Client: Direct PostgreSQL client with TypeScript types
  - Schema: Custom schema with whiteboards and whiteboard_files tables

**File Storage:**
- Supabase Storage
  - Bucket: whiteboard-files
  - Public access enabled
  - Used for uploaded images and attachments

**Caching:**
- Not detected - No caching layer configured

## Authentication & Identity

**Auth Provider:**
- Supabase Auth
  - Implementation: Row Level Security (RLS) policies
  - No explicit user authentication - using public access policies
  - Anonymous access allowed for collaboration

## Monitoring & Observability

**Error Tracking:**
- Console logging only - No error tracking service detected

**Logs:**
- Console.error() for WebSocket errors
- Standard console logging in development

## CI/CD & Deployment

**Hosting:**
- Not detected - No deployment configuration found
- Presumed: Vercel, Netlify, or self-hosted via Node.js

**CI Pipeline:**
- Not detected - No GitHub Actions or other CI configuration

## Environment Configuration

**Required env vars:**
- SUPABASE_URL - Supabase project URL
- SUPABASE_ANON_KEY - Supabase anonymous API key
- WS_PORT - WebSocket server port (default: 3001)
- NUXT_PUBLIC_SITE_URL - Frontend site URL
- NUXT_PUBLIC_WS_URL - WebSocket URL for client connection
- NUXT_PUBLIC_SUPABASE_URL - Public Supabase URL
- NUXT_PUBLIC_SUPABASE_ANON_KEY - Public Supabase key

**Secrets location:**
- .env file (not committed)
- .env.example template provided

## Webhooks & Callbacks

**Incoming:**
- WebSocket connections on /ws/whiteboard:{id} route
- Real-time updates via Supabase subscriptions (not implemented yet)

**Outgoing:**
- Not detected - No outgoing webhook configuration

## WebSocket Implementation

**Real-time Collaboration:**
- Custom WebSocket handler at /server/websocket/[...].ts
- Uses y-websocket for Y.js integration
- Room-based messaging per whiteboard
- User presence tracking
- Connection management with cleanup

**WebSocket Features:**
- User join/leave notifications
- Room-based broadcasting
- Error handling and cleanup
- Support for query parameters (userId, userName)

---

*Integration audit: 2026-02-09*
```