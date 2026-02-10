# Technology Stack

**Analysis Date:** 2026-02-09

## Languages

**Primary:**
- TypeScript 5.9.3 - Client-side and server-side code
- Vue 3.5.0 - Frontend framework

**Secondary:**
- JavaScript - Build output and runtime
- CSS - Styling with Tailwind CSS

## Runtime

**Environment:**
- Node.js 18+ (assumed from package.json)
- Nuxt 3.15.0 - Full-stack Vue framework

**Package Manager:**
- npm 9+ (using package-lock.json)
- Lockfile: present (package-lock.json)

## Frameworks

**Core:**
- Nuxt 3.15.0 - Full-stack Vue framework with server-side rendering
- Vue 3.5.0 - Progressive JavaScript framework

**UI/UX:**
- Tailwind CSS 6.12.1 - Utility-first CSS framework
- @nuxt/icon 1.0.0 - Icon management

**State Management:**
- Pinia - Client-side state management (@pinia/nuxt 0.5.5)

**Real-time:**
- Y.js 13.6.29 - CRDT for collaborative editing
- y-websocket 3.0.0 - WebSocket server for Y.js

**Canvas/Drawing:**
- Konva 9.3.15 - Canvas library for 2D shapes
- vue-konva 3.3.0 - Vue bindings for Konva
- perfect-freehand 1.2.3 - Handwriting recognition

## Key Dependencies

**Critical:**
- @supabase/supabase-js 2.39.0 - Database client
- yjs 13.6.29 - Collaborative editing core
- konva 9.3.15 - Canvas rendering engine

**Infrastructure:**
- @nuxtjs/tailwindcss 6.12.1 - CSS framework
- @vueuse/nuxt 12.0.1 - Composition API utilities

## Configuration

**Environment:**
- Environment variables via .env file
- Runtime config in nuxt.config.ts
- Supabase configuration required

**Build:**
- Vite bundler (built into Nuxt)
- TypeScript strict mode enabled
- Path aliases configured (~/*, @/*, #imports)

**Development:**
- Hot module replacement
- DevTools enabled
- WebSocket support enabled

## Platform Requirements

**Development:**
- Node.js 18+
- npm 9+
- TypeScript 5.9.3

**Production:**
- Node.js runtime (Nitro server)
- WebSocket server (y-websocket)
- Supabase database instance

---

*Stack analysis: 2026-02-09*
```