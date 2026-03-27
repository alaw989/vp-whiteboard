# VP Associates Collaborative Whiteboard

## Tech Stack
- **Framework**: Nuxt 3, Vue 3 (Composition API), TypeScript, Tailwind CSS
- **Canvas**: Konva.js + vue-konva
- **Drawing**: perfect-freehand for smooth strokes
- **Real-time**: Yjs CRDT + y-websocket + Nitro WebSocket server
- **Backend**: Supabase (PostgreSQL + Storage, Row Level Security)
- **PDF**: jspdf (export), pdfjs-dist (rendering)
- **Testing**: Vitest (unit), Playwright (E2E)
- **Deploy**: DigitalOcean App Platform, PM2 (separate app + WebSocket processes)

## Commands
```bash
npm run dev                # Nuxt dev server only
npm run dev:ws             # WebSocket server only
npm run dev:all            # Both servers concurrently
npm run build              # Production build
npm run start              # Start Nuxt server
npm run start:ws           # Start WebSocket server
npm run start:all          # Start both servers
npm run typecheck          # TypeScript type checking
```

## Architecture
- Dual-server: Nuxt HTTP server (port 3000) + separate WebSocket server (port 3001)
- CRDT-based real-time sync via Yjs — conflict-free collaboration
- Canvas state stored as JSONB in PostgreSQL, auto-saves every 30 seconds
- Viewport culling for performance with 500+ elements
- Composables: `useCollaborativeCanvas` (Yjs), `useWhiteboardStorage` (Supabase), `useDrawingTools`

## Pages
- `/` — Whiteboard list
- `/whiteboard/new` — Create new whiteboard
- `/whiteboard/[id]` — Main whiteboard editor
- `/s/[id]` — Shared short link

## Environment
Copy `.env.example` to `.env`. Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_ANON_KEY`. Optional: `WS_PORT` (default 3001), `NUXT_PUBLIC_WS_URL`, `NUXT_PUBLIC_SITE_URL`.

## Conventions
- Vue 3 Composition API (`<script setup>`) — no Options API
- Components in `components/whiteboard/`, composables in `composables/`
- All drawing tools are separate Vue components
- Tailwind for UI styling, Konva for canvas rendering
- Touch support: pointer events with pressure sensitivity, two-finger pan
- Accessibility: full keyboard shortcuts, screen reader support, ARIA labels

## Key Constraints
- Max file upload: 10MB
- Supported uploads: JPEG, PNG, WebP, PDF
- Recommended: <1000 canvas elements for best performance
- Requires WebSocket support in hosting environment
