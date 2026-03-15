# VP Associates Collaborative Whiteboard

A real-time collaborative whiteboard application for structural engineering project drawings and annotations.

## Features

### Core Drawing
- **Drawing Tools**: Pen, highlighter, line, arrow, rectangle, circle, ellipse, text
- **Engineering Stamps**: Approved, Revised, Note, For Review stamps
- **Text Annotations**: Add callout notes with leader lines
- **Eraser Tool**: Remove any element from canvas
- **Undo/Redo**: Full history support with keyboard shortcuts (Ctrl+Z, Ctrl+Y)

### Real-time Collaboration
- **Multi-user Drawing**: Multiple users can draw and annotate simultaneously
- **Live Cursors**: See other users' cursors and names in real-time
- **User Presence**: See who's currently online
- **Instant Sync**: CRDT-based synchronization ensures consistency

### Document Management
- **File Upload**: Upload images (JPEG, PNG, WebP) and PDFs as canvas background
- **PDF Support**: Multi-page PDFs with page navigation
- **Document Layers**: Layer management for complex drawings

### Canvas Navigation
- **Pan & Zoom**: Mouse wheel to zoom, click+drag or spacebar+drag to pan
- **Synced View**: All users see the same viewport (optional)
- **Performance**: Viewport culling for smooth performance with 500+ elements

### Measurement Tools
- **Scale Setting**: Define drawing-to-real-world ratios (e.g., 1" = 10')
- **Distance Measurement**: Measure lines with real-world units
- **Area Measurement**: Calculate area of rectangles, circles, ellipses
- **Stale Detection**: Measurements flagged when scale changes

### Export & Sharing
- **PNG Export**: High-quality image export
- **PDF Export**: Print-ready documents with annotations
- **Share Links**: Generate shareable URLs for collaboration
- **Persistent Storage**: Canvas state auto-saves every 30 seconds

### Mobile Support
- **Touch Drawing**: Stylus and finger drawing with pressure sensitivity
- **Two-Finger Pan**: Pan canvas without drawing
- **Responsive Toolbar**: Bottom sheet on mobile, sidebar on desktop

### Accessibility
- **Full Keyboard Navigation**: All tools accessible via keyboard shortcuts
- **Screen Reader Support**: ARIA labels on all interactive elements
- **Focus Indicators**: Clear visual feedback for keyboard navigation
- **Semantic Markup**: Proper roles and labels for assistive technology

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

### Tools
| Shortcut | Action |
|----------|--------|
| V | Select tool |
| H | Pan tool |
| P | Pen tool |
| B | Highlighter tool |
| L | Line tool |
| A | Arrow tool |
| R | Rectangle tool |
| C | Circle tool |
| E | Ellipse tool |
| T | Text annotation |
| M | Measurement distance tool |
| Shift+M | Measurement area tool |
| S | Stamp tool |
| X | Eraser tool |

### Actions
| Shortcut | Action |
|----------|--------|
| Ctrl+Z / ⌘+Z | Undo |
| Ctrl+Y / ⌘+Shift+Z | Redo |
| Delete / Backspace | Delete selected |
| Escape | Deselect / Cancel |
| ? | Show keyboard shortcuts |

### Navigation
| Shortcut | Action |
|----------|--------|
| Space + Drag | Pan canvas |
| Mouse Wheel | Zoom in/out |
| Shift + Wheel | Horizontal pan |
| Ctrl + Wheel / ⌘ + Wheel | Zoom faster |

### While Drawing
| Shortcut | Action |
|----------|--------|
| Shift | Constrain angle (15°) |
| Alt / Option | Draw from center |
| Esc | Cancel drawing |
| Double-click | Finish shape |

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

## Performance & Limitations

### File Limits
- Max file upload: 10MB per file
- Supported image types: JPEG, PNG, WebP
- Supported document types: PDF

### Canvas Performance
- Viewport culling activates at 500+ elements for smooth performance
- CRDT garbage collection runs every 10 minutes to manage memory
- Recommended: <1000 elements for best performance

### Browser Support
- Modern browsers with WebSocket support
- Touch devices: iOS Safari 14+, Chrome 90+
- Pointer Events API required for pressure-sensitive drawing

### Networking
- WebSocket reconnection uses exponential backoff (1s → 30s max)
- Max concurrent users limited by server capacity

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
# Trigger deployment
# Deploy test
