# VP Associates Collaborative Whiteboard

A real-time collaborative whiteboard application for structural engineering project drawings and annotations.

## Features

### Core Drawing
- **Drawing Tools**: Pen, highlighter, line, arrow, rectangle, circle, ellipse, text
- **Engineering Stamps**: Approved, Revised, Note, For Review stamps
- **Text Annotations**: Add callout notes with leader lines
- **Eraser Tool**: Remove any element from canvas
- **Undo/Redo**: Full history support with keyboard shortcuts (Ctrl+Z, Ctrl+Y)
- **Select & Transform**: Move, resize, and rotate elements

### Real-time Collaboration
- **Multi-user Drawing**: Multiple users can draw and annotate simultaneously
- **Live Cursors**: See other users' cursors and names in real-time
- **User Presence**: See who's currently online
- **Instant Sync**: CRDT-based synchronization ensures consistency
- **Active Stroke Broadcasting**: See other users' strokes as they draw

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
- **Snap Detection**: Geometric snapping for precise measurements

### Export & Sharing
- **PNG Export**: High-quality image export with preview
- **PDF Export**: Print-ready documents with annotations
- **Share Links**: Generate shareable URLs for collaboration (Google Docs-style access)
- **Persistent Storage**: Canvas state auto-saves every 30 seconds to Supabase

### Dashboard
- **Whiteboard Management**: Create, rename, and delete whiteboards
- **Shared Password Auth**: Dashboard protected by shared password
- **Client Access**: Share links bypass auth for client review

### Mobile Support
- **Touch Drawing**: Stylus and finger drawing with pressure sensitivity
- **Two-Finger Pan**: Pan canvas without drawing
- **Responsive Toolbar**: Bottom sheet on mobile, sidebar on desktop

### Accessibility
- **Full Keyboard Navigation**: All tools accessible via keyboard shortcuts
- **Screen Reader Support**: ARIA labels on all interactive elements
- **Focus Indicators**: Clear visual feedback for keyboard navigation
- **Keyboard Shortcuts Modal**: Press `?` to see all shortcuts

## Tech Stack

- **Frontend**: Nuxt 3, Vue 3 (Composition API), TypeScript, Tailwind CSS
- **Canvas**: Konva.js + vue-konva
- **Drawing**: perfect-freehand for smooth strokes
- **Real-time Sync**: Yjs CRDT + y-websocket + Nitro WebSocket server
- **Backend**: Supabase (PostgreSQL + Storage, Row Level Security)
- **PDF**: jspdf (export), pdfjs-dist (rendering)
- **Deployment**: DigitalOcean droplet + Nginx + PM2; push-to-deploy via GitHub Actions (`master`→production, `develop`→staging). See [DEPLOYMENT.md](DEPLOYMENT.md)

## Prerequisites

- Node.js 18+
- npm
- Supabase account (free tier works)

## Quick Start

### 1. Clone and Install

```bash
git clone git@github.com:alaw989/vp-whiteboard.git
cd vp-whiteboard
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
AUTH_PASSWORD=your-shared-password
AUTH_SECRET=your-random-secret-key
```

### 4. Run Development Server

```bash
npm run dev:all
```

Visit `http://localhost:3000` — you'll be prompted to enter the password.

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

## Authentication

The dashboard is protected by a shared password. All pages, API routes, and WebSocket connections require authentication.

- **Login**: Visit any protected page and enter the shared password
- **Logout**: Click "Sign Out" in the dashboard header
- **Share links**: `/s/[id]` share links bypass authentication for client access to individual whiteboards

The password is stored in `AUTH_PASSWORD` and cookies are signed with `AUTH_SECRET` (generate with `openssl rand -hex 32`).

## Deployment

The live app runs on a DigitalOcean droplet (Nginx reverse proxy + PM2) and deploys automatically via GitHub Actions — there is no manual build step in normal operation.

| Environment | URL | Branch | Workflow |
|---|---|---|---|
| Production | `whiteboard.vp-associates.com` | `master` | `.github/workflows/deploy.yml` |
| Staging | `staging-whiteboard.vp-associates.com` | `develop` | `.github/workflows/deploy-staging.yml` |

**Branch model:** feature branch → `develop` (staging) → `master` (production).

```bash
git push origin develop    # deploy to staging
git push origin master     # deploy to production (after verifying staging)
```

Each push SSHes into the droplet, rebuilds the app, and restarts the PM2 processes. Production and staging builds share a concurrency group (`droplet-build`) so they never run at the same time — the droplet can't fit two builds at once. Full details (topology, secrets, first-run bootstrap, from-scratch VPS steps) are in [DEPLOYMENT.md](DEPLOYMENT.md).

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
│       ├── WhiteboardCanvas.vue       # Main canvas component
│       ├── WhiteboardToolbar.vue      # Drawing tools
│       ├── WhiteboardUpload.vue       # File upload
│       ├── ExportDialog.vue           # PNG/PDF export with preview
│       ├── ConfirmDialog.vue          # Reusable confirmation dialog
│       ├── CursorPointer.vue          # Collaborative cursors
│       ├── UserPresenceList.vue       # Online users
│       ├── ScaleBadge.vue             # Scale indicator
│       ├── ScaleToolPalette.vue       # Scale and measurement controls
│       └── KeyboardShortcutsModal.vue # Shortcuts reference
├── composables/
│   ├── useAuth.ts                     # Authentication state
│   ├── useCollaborativeCanvas.ts      # Yjs CRDT integration
│   ├── useWhiteboardStorage.ts        # Supabase integration
│   ├── useDrawingTools.ts             # Drawing helpers
│   ├── useExport.ts                   # PNG/PDF export logic
│   ├── useViewport.ts                # Zoom/pan state management
│   ├── useCursors.ts                 # Live cursor tracking
│   ├── useMeasurements.ts            # Distance/area measurements
│   ├── useSnapping.ts                # Geometric snap detection
│   ├── useScale.ts                   # Scale state management
│   ├── useAutoSave.ts                # Debounced auto-save
│   ├── useFileUpload.ts              # Upload with progress
│   └── useOffline.ts                 # Network status detection
├── middleware/
│   └── auth.global.ts                # Client-side auth guard
├── pages/
│   ├── index.vue                     # Whiteboard list (dashboard)
│   ├── login.vue                     # Login page
│   ├── s/[id].vue                    # Share link access
│   └── whiteboard/
│       ├── new.vue                   # Create whiteboard
│       └── [id].vue                  # Whiteboard editor
├── server/
│   ├── api/auth/                     # Auth endpoints
│   ├── api/whiteboard/               # REST API routes
│   ├── middleware/auth.ts            # Server-side auth middleware
│   └── websocket/[...].ts           # WebSocket handler
├── types/
│   └── index.ts                     # TypeScript definitions
└── supabase/
    └── schema.sql                   # Database schema
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
# Run both dev servers
npm run dev:all

# Type check
npm run typecheck

# Build for production
npm run build

# Preview production build
npm run preview
```

## License

Copyright © 2025 VP Associates
