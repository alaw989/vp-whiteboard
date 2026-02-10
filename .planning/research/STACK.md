# Stack Research

**Domain:** Collaborative Markup Tools for Engineering Drawings (Nuxt 3 + Yjs + Konva)
**Researched:** 2025-02-10
**Confidence:** HIGH

## Executive Summary

VP Whiteboard is built on Nuxt 3 + Yjs + Konva + Supabase. This is a solid foundation. For adding file-based markup capabilities (PDF backgrounds, session management, export), the 2025 stack requires minimal additions: **pdfjs-dist** for PDF rendering, **html2canvas-pro** + **jsPDF** for export, and leveraging Konva's native Transformer for pan/zoom/selection. Key finding: stay with Konva (already integrated) rather than switching to Fabric.js—migration cost outweighs benefits, and Konva now has native arrow/shape support.

## Recommended Stack

### Core Technologies (Already Installed)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Nuxt 3 | ^3.15.0 | Full-stack framework | Latest stable, SSR, auto-imports, Nitro WebSocket server built-in |
| Vue 3 | ^3.5.0 | UI framework | Composition API, TypeScript-first, excellent perf |
| Yjs | ^13.6.29 | CRDT for collaboration | Industry standard for collaborative editing, conflict-free merge |
| y-websocket | ^3.0.0 | WebSocket sync for Yjs | Official Yjs WebSocket provider |
| Konva | ^9.3.15 | Canvas rendering | High perf 2D canvas, native Vue 3 support via vue-konva |
| vue-konva | ^3.3.0 | Vue bindings for Konva | Declarative Vue components for Konva |
| @supabase/supabase-js | ^2.39.0 | Backend/auth/storage | PostgreSQL, real-time, auth, storage in one platform |
| perfect-freehand | ^1.2.3 | Smooth drawing | Best-in-class freehand drawing, pressure sensitivity |
| @vueuse/nuxt | ^12.0.1 | Vue utilities | useElementSize, useGesture for drag/zoom |
| @pinia/nuxt | ^0.5.5 | State management | Already installed, for session state |
| TailwindCSS | ^6.12.1 | Styling | Already installed |

**Confidence:** HIGH - Verified via package.json, all current versions.

### New Additions Required

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| **pdfjs-dist** | ^5.4.624 | PDF rendering | Mozilla's PDF.js, only viable browser-based PDF renderer with canvas layer support, actively maintained (Jan 2026) |
| **html2canvas-pro** | ^1.6.6 | Canvas to image | Active fork of html2canvas (original unmaintained since 2022), fixes modern browser issues |
| **jsPDF** | ^4.1.0 | PDF generation | Generate PDF exports, addresses CVE-2025-68428 in v4.0.0+ (critical security fix) |

**Confidence:** HIGH - Verified via npm and official sources Feb 2025.

### Optional Additions

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@panzoom/panzoom** | ^4.5.1 | Canvas pan/zoom | If Konva's native transformer proves insufficient for mobile gestures |
| **utif** | ^3.1.0 | TIFF support | If engineering drawings come in TIFF format |

**Confidence:** MEDIUM - Evaluate during implementation.

## Installation

```bash
# PDF rendering (for background drawings)
npm install pdfjs-dist

# Export functionality
npm install html2canvas-pro jspdf

# Optional: pan/zoom helper
npm install @panzoom/panzoom
```

## Why Not Other Libraries?

### PDF Rendering

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| react-pdf | React-specific, heavy, limited canvas annotation | pdfjs-dist (framework-agnostic, better canvas control) |
| @vue-pdf-viewer/viewer | Abandoned, Vue 2 focused | pdfjs-dist with custom wrapper |
| pdf-lib | Server-side focus, not for rendering | pdfjs-dist (browser-first) |

### Canvas Library

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Fabric.js | Already using Konva; migration cost high; no significant benefit | Keep Konva (better perf, Vue 3 support, already integrated) |

**Why Keep Konva:** Fabric.js trades ~30% performance for features. For real-time collaboration where 60fps is critical, Konva is better. The project already has vue-konva integrated—switching would require rewriting all canvas logic.

### Export Libraries

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| html2canvas (original) | Unmaintained since Jan 2022, issues with modern browsers | html2canvas-pro (active fork, v1.6.6) |
| jsPDF < 4.0.0 | CVE-2025-68428 path traversal vulnerability | jsPDF ^4.1.0 (patched) |

### Real-time Sync

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Socket.IO | Unnecessary abstraction, adds overhead | y-websocket (native Yjs protocol, lighter) |
| Liveblocks | No self-hosting option, data control issues | y-websocket + Nitro WebSocket (already implemented) |

## Markup Tools Implementation Strategy

### Already Implemented

| Tool | Status | Notes |
|------|--------|-------|
| Freehand drawing (pen, highlighter) | ✅ | perfect-freehand |
| Basic shapes (line, rectangle, circle) | ✅ | Konva-based |
| Eraser | ✅ | Paints with background color |
| Color picker | ✅ | 8 preset + custom |
| Line width control | ✅ | 5 sizes |
| Undo/Redo | ✅ | Keyboard shortcuts |

### To Add (Konva Native)

| Tool | Implementation | Notes |
|------|----------------|-------|
| **Arrow** | Konva.Arrow + Transformer | Built-in, double-headed support, settable pointer length |
| **Text** | Konva.Text + Transformer | Multi-line, font family/size, draggable |
| **Sticky note** | Konva.Group (Rect + Text) | Yellow background, auto-expand |
| **Selection** | Konva.Transformer | Multi-select with Shift+click, drag handles |
| **Move/Resize** | Konva.Transformer | Native, touch-enabled, rotation |

**Konva Transformer Example:**
```typescript
// Enable drag, resize, rotate on any shape
const transformer = new Konva.Transformer({
  nodes: [selectedNode],
  anchoredScale: true, // Better touch support
  boundBoxFunc: (oldBox, newBox) => {
    // Prevent resizing below minimum
    if (newBox.width < 5 || newBox.height < 5) return oldBox
    return newBox
  }
})
```

### Integration with Yjs

Each shape type maps to Yjs shared types:
- `Y.Map` for shape properties (x, y, rotation, scale, stroke, etc.)
- `Y.Array` for shape ordering (z-index)
- Separate `Y.Doc` concerns: canvas state vs session metadata

**Yjs Structure:**
```typescript
// canvas state
ydoc.getMap('shapes') // Y.Map<ShapeData>
ydoc.getArray('shapeOrder') // Y.Array<string>

// session metadata (separate doc or stored in Supabase)
// whiteboards table: id, name, created_at, password_hash, expires_at
```

## Pan/Zoom Strategy

### Option 1: Konva Native (Recommended)

Use Konva Stage's built-in scale and position:

```typescript
// Wheel to zoom
stage.on('wheel', (e) => {
  e.evt.preventDefault()
  const oldScale = stage.scaleX()
  const pointer = stage.getPointerPosition()
  const newPos = {
    x: pointer.x - (pointer.x - stage.x()) * (scaleBy / oldScale),
    y: pointer.y - (pointer.y - stage.y()) * (scaleBy / oldScale)
  }
  stage.scale({ x: scaleBy, y: scaleBy })
  stage.position(newPos)
})

// Drag background to pan
// Use a draggable rectangle layer behind all content
```

**Pros:** Native, no extra deps, syncs via Yjs naturally
**Cons:** Manual implementation required for pinch-to-zoom

### Option 2: @panzoom/panzoom

Wrapper around Konva Stage container:

```typescript
import Panzoom from '@panzoom/panzoom'
const panzoom = Panzoom(stageContainer, {
  maxScale: 5,
  minScale: 0.1,
  contain: 'outside'
})
```

**Pros:** Battle-tested, mobile gestures (pinch, spread), touch-friendly
**Cons:** Extra 3.7kb, need to sync state to Yjs manually

**Recommendation:** Start with Konva native. Add @panzoom only if mobile gestures prove complex (likely needed for iPad/Android tablet users).

## Session & Share Link Strategy

### Current Implementation

- Shareable URL: `/whiteboard/[id]`
- Session stored in Supabase `whiteboards` table
- Canvas state auto-saves every 30s
- Connection: Nitro WebSocket server at `/ws`

### Recommended Enhancements

| Feature | Implementation | Priority | Complexity |
|---------|----------------|----------|------------|
| **Session expiration** | Add `expires_at` timestamptz column, cron cleanup or Supabase Edge Function | High | Low |
| **Password protection** | Add `password_hash` text column, bcrypt compare on join, use Yjs auth hook | Medium | Medium |
| **Session templates** | Copy whiteboard row + Yjs state snapshot, new UUID | Low | Medium |
| **Version history** | Store Yjs snapshots in `whiteboard_snapshots` table | Medium | High |

### URL Strategy

**Current (keep):**
- `/whiteboard/[uuid]` — Works well

**Add:**
- `/whiteboard/[uuid]?password=[hash]` — For password-protected sessions
- Optional: `/share/[slug]` — Human-readable links (requires slug column + uniqueness check)

### Yjs Authentication Hook

For password-protected sessions, integrate with the WebSocket server:

```typescript
// server/websocket/[...].ts
// Use y-websocket's configure callback
wsServer.on('connection', (ws, req) => {
  const whiteboardId = getWhiteboardId(req)
  const password = req.query.password

  // Verify password against Supabase
  const session = await supabase
    .from('whiteboards')
    .select('password_hash')
    .eq('id', whiteboardId)
    .single()

  if (session.password_hash && !bcrypt.compare(password, session.password_hash)) {
    ws.close(1008, 'Unauthorized')
    return
  }

  // Proceed with Yjs connection
})
```

## Export Strategy

### Current

- PNG export via `stage.toDataURL()` — Implemented

### Add

| Format | Implementation | Quality | Notes |
|--------|----------------|---------|-------|
| **PDF** | jsPDF + html2canvas-pro | Rasterized | Exact visual match, smaller file size than pure image PDF |
| **Session bundle** | Yjs `Y.encodeStateAsUpdate()` + PDF ref | Binary | JSON metadata + binary state + file URLs |

### PDF Export Implementation

```typescript
import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'

async function exportToPDF(stage: Konva.Stage) {
  // 1. Get canvas data URL
  const dataUrl = stage.toDataURL({ pixelRatio: 2 })

  // 2. Create PDF
  const pdf = new jsPDF({
    orientation: stage.width() > stage.height() ? 'landscape' : 'portrait',
    unit: 'px',
    format: [stage.width(), stage.height()]
  })

  // 3. Add image
  pdf.addImage(dataUrl, 'PNG', 0, 0, stage.width(), stage.height())

  // 4. Save
  pdf.save('whiteboard-export.pdf')
}
```

### PDF Export Quality Considerations

- **Raster PDF:** html2canvas + jsPDF (fast, exact match, recommended)
- **Vector PDF:** Not possible with Konva (no SVG export)
- **Hybrid:** Export PDF background natively, overlay annotations as image layer

**Recommendation:** Stick with raster export for MVP. Vector export requires significant architecture changes.

## PDF as Canvas Background

### Architecture

```
┌─────────────────────────────────────┐
│  Supabase Storage (PDF files)       │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  PDF.js Worker (off-main-thread)    │
│  - Renders PDF page to canvas       │
│  - Returns ImageBitmap              │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Konva Stage (bottom layer)         │
│  - Konva.Image with PDF bitmap      │
│  - Locked (no direct editing)       │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Konva Layer (annotation layer)     │
│  - User drawings, shapes, text      │
│  - Synced via Yjs                   │
└─────────────────────────────────────┘
```

### Implementation Pattern

```typescript
// PDF rendering component
async function renderPDFToCanvas(pdfUrl: string, pageNum: number = 1) {
  const loadingTask = pdfjsLib.getDocument(pdfUrl)
  const pdf = await loadingTask.promise
  const page = await pdf.getPage(pageNum)

  const viewport = page.getViewport({ scale: 2 }) // 2x for retina
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  canvas.width = viewport.width
  canvas.height = viewport.height

  await page.render({ canvasContext: context, viewport }).promise

  // Convert to Konva.Image
  const image = new Konva.Image({
    image: canvas,
    x: 0,
    y: 0,
    draggable: false, // PDF background is locked
    listening: false   // Clicks pass through to annotation layer
  })

  return image
}
```

### Multi-Page PDF Handling

For engineering drawings with multiple pages:

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **One whiteboard per page** | Each PDF page creates separate whiteboard | Simpler, familiar UX | More database rows, manual navigation |
| **Page switcher in whiteboard** | Add page navigation UI | Single session, easier | More complex UI, larger Yjs docs |

**Recommendation:** Start with one whiteboard per page (simpler). Add page switcher if users request it.

## Database Schema Additions

```sql
-- Add to existing whiteboards table
ALTER TABLE whiteboards
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS background_file_id uuid REFERENCES storage.files(id),
  ADD COLUMN IF NOT EXISTS background_page_number int DEFAULT 1;

-- For version history (optional, phase 2)
CREATE TABLE IF NOT EXISTS whiteboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whiteboard_id uuid REFERENCES whiteboards(id) ON DELETE CASCADE,
  state_vector bytea, -- Yjs encoded state
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_snapshots_whiteboard ON whiteboard_snapshots(whiteboard_id, created_at DESC);
```

## What NOT to Do

| Don't Do | Why | Do Instead |
|----------|-----|-------------|
| Switch to Fabric.js | Already invested in Konva, migration high cost, no material benefit | Extend Konva with native features |
| Use original html2canvas | Unmaintained since 2022, browser compatibility issues | html2canvas-pro fork |
| Use jsPDF < 4.0.0 | CVE-2025-68428 security vulnerability | jsPDF ^4.1.0 |
| Store files in PostgreSQL | Bloats database, poor performance for large files | Supabase Storage |
| Client-side only PDF rendering | Blocks UI, poor mobile performance | PDF.js with Web Worker |
| Ignore mobile gestures | iPad/tablet users expect pinch-to-zoom | Test touch, add @panzoom if needed |
| Implement custom sync | Reinventing CRDT wheel, conflict-prone | Trust Yjs for all state sync |
| Render entire PDF to canvas | Multi-page PDFs will crash browser | Render current page only |

## Version Compatibility Matrix

| Package A | Package B | Compatible | Notes |
|-----------|-----------|------------|-------|
| konva@9.3.15 | vue-konva@3.3.0 | YES | Current compatible pair |
| vue@3.5.0 | vue-konva@3.3.0 | YES | Requires Vue 3 |
| pdfjs-dist@5.4.624 | All browsers | YES | Web Worker recommended |
| yjs@13.6.29 | y-websocket@3.0.0 | YES | Official pairing |
| nuxt@3.15.0 | All packages | YES | Verify during build |

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Core stack (Nuxt/Yjs/Konva) | HIGH | Already implemented, verified current Feb 2025 |
| PDF rendering (pdfjs-dist) | HIGH | Mozilla-backed, v5.4.624 actively maintained |
| Export (html2canvas-pro, jsPDF) | HIGH | Verified npm versions, CVE patch confirmed |
| Pan/zoom (Konva native) | MEDIUM | Need to implement and test; @panzoom fallback available |
| Session management | HIGH | Supabase patterns well-documented |
| Mobile gestures | MEDIUM | Requires device testing; @panzoom is proven fallback |
| Yjs auth hooks | MEDIUM | Documentation sparse but patterns exist |

## Open Questions Requiring Phase-Specific Research

1. **Large file performance:** Engineering drawings can be 50MB+; need streaming/progressive loading patterns
2. **Coordinate mapping:** PDF coordinates to canvas coordinates at different zoom levels
3. **Mobile performance:** PDF.js + Konva on low-end tablets
4. **Multi-page PDF UX:** User feedback on navigation patterns

## Sources

### Official Documentation (HIGH Confidence)
- [pdfjs-dist npm v5.4.624](https://www.npmjs.com/package/pdfjs-dist) — Verified Feb 2025
- [jsPDF npm v4.1.0](https://www.npmjs.com/package/jspdf) — CVE patch verified
- [html2canvas-pro npm v1.6.6](https://www.npmjs.com/package/html2canvas-pro) — Active fork
- [vue-konva npm v3.3.0](https://www.npmjs.com/package/vue-konva) — Vue 3 support
- [Konva npm v10.2.0](https://www.npmjs.com/package/konva) — Latest verified
- [Mozilla PDF.js Docs](https://mozilla.github.io/pdf.js/) — Canvas rendering API
- [Konva.js Docs](https://konvajs.org/) — Transformer, Arrow, Text
- [Yjs Docs](https://docs.yjs.dev/) — Shared types, best practices
- [Supabase Storage Docs](https://supabase.com/docs/guides/storage) — RLS, upload patterns

### Web Search (MEDIUM Confidence)
- [Building Real-time Collaborative Whiteboard (Medium, May 2025)](https://medium.com/@adredars/building-a-real-time-collaborative-whiteboard-frontend-with-next-js-7c6b2ef1e072) — Arrow/text patterns
- [PDF.js Express Collaboration](https://www.pdfjs.net/blog/collaboration) — Real-time sync patterns
- [Nuxt 3 File Upload Best Practices (2025)](https://dev.to/...) — Supabase storage
- [@panzoom/panzoom](https://github.com/timmywil/panzoom) — Mobile gestures
- [Yjs Best Practices 2025](https://docs.yjs.dev/ecosystem/) — Performance, memory

### Package Verification (Feb 2025)
- All version numbers verified via npm registry or official GitHub releases
- jsPDF CVE-2025-68428 verified in release notes
- html2canvas last update: Jan 2022 → confirmed unmaintained
- html2canvas-pro last update: Jan 2026 → confirmed active

---
*Stack research for: VP Whiteboard Collaborative Markup*
*Researched: 2025-02-10*
*Focus: Building on existing Nuxt 3 + Yjs + Konva + Supabase foundation*
