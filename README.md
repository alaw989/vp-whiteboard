# VP Associates Collaborative Whiteboard

A real-time collaborative whiteboard application for structural engineering project drawings and annotations.

## Features

- **Real-time Collaboration**: Multiple users can draw and annotate simultaneously
- **Drawing Tools**: Pen, highlighter, line, rectangle, circle, and eraser
- **File Upload**: Upload images (JPEG, PNG, WebP) and PDFs as canvas background
- **Live Cursors**: See other users' cursors and names in real-time
- **Undo/Redo**: Full history support with keyboard shortcuts (Ctrl+Z, Ctrl+Y)
- **Export**: Download whiteboard as PNG image
- **Share**: Generate shareable links for collaboration
- **Persistent Storage**: Canvas state auto-saves every 30 seconds

## Tech Stack

- **Frontend**: Nuxt 3, Vue 3, Tailwind CSS
- **Canvas**: Konva.js + vue-konva
- **Drawing**: perfect-freehand for smooth strokes
- **Real-time Sync**: Yjs CRDT + y-websocket + Nitro WebSocket
- **Storage**: Supabase (PostgreSQL + Storage)
- **Deployment**: Node.js server (Digital Ocean, Railway, etc.)

## Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (free tier works)

## Quick Start

### 1. Clone and Install

```bash
cd /home/deck/Sites/vp-whiteboard
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the schema from `supabase/schema.sql`
3. Go to Settings > API to get your credentials:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
NUXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NUXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
WS_PORT=3001
NUXT_PUBLIC_WS_URL=ws://localhost:3001
NUXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 4. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

## Deployment

### Digital Ocean App Platform

1. Push your code to GitHub
2. Create a new App in Digital Ocean
3. Connect your GitHub repository
4. Configure build settings:
   - Build Command: `npm run build`
   - Run Command: `npm start`
5. Add environment variables from `.env`
6. Enable WebSockets in app settings
7. Deploy!

### Other Node.js Hosts

The app works on any Node.js hosting that supports WebSockets:
- Railway
- Render
- Fly.io
- AWS EC2
- VPS with Nginx reverse proxy

### Nginx Configuration (for VPS)

```nginx
server {
    listen 80;
    server_name whiteboard.vp-associates.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Usage

1. **Create a whiteboard**: Click "New Whiteboard" and enter a name
2. **Invite collaborators**: Share the URL with anyone
3. **Start drawing**: Select a tool and draw on the canvas
4. **Upload files**: Click "Upload" to add images or PDFs
5. **Export**: Download your work as PNG

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Escape | Select tool |

## Project Structure

```
vp-whiteboard/
├── components/
│   └── whiteboard/
│       ├── WhiteboardCanvas.vue    # Main canvas component
│       ├── WhiteboardToolbar.vue   # Drawing tools
│       ├── WhiteboardUpload.vue    # File upload
│       ├── CursorPointer.vue       # Collaborative cursors
│       └── UserList.vue            # Online users
├── composables/
│   ├── useCollaborativeCanvas.ts   # Yjs integration
│   ├── useWhiteboardStorage.ts     # Supabase integration
│   └── useDrawingTools.ts          # Drawing helpers
├── pages/
│   ├── index.vue                   # Whiteboard list
│   ├── new.vue                     # Create whiteboard
│   └── whiteboard/
│       └── [id].vue                # Whiteboard editor
├── server/
│   ├── api/whiteboard/             # REST API routes
│   └── websocket/[...].ts          # WebSocket handler
├── types/
│   └── index.ts                    # TypeScript definitions
└── supabase/
    └── schema.sql                  # Database schema
```

## Limitations

- Max file upload: 10MB
- Supported file types: JPEG, PNG, WebP, PDF
- CAD support: DXF only (planned feature)
- WebSocket connections: Limited by server capacity

## Development

```bash
# Run dev server
npm run dev

# Type check
npm run typecheck

# Build for production
npm run build

# Preview production build
npm run preview
```

## License

Copyright © 2025 VP Associates
