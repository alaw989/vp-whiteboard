# Architecture Research: File-Based Collaborative Markup Tools

**Domain:** File-based collaborative markup tools
**Researched:** 2026-02-10
**Confidence:** HIGH

## Executive Summary

File-based collaborative markup tools extend standard collaborative whiteboards by adding document-centric workflows: uploading files (PDFs, images), rendering them as canvas backgrounds, capturing annotations as markup layers, and exporting marked-up documents. The architecture follows a layered approach where documents become background layers on an infinite canvas, with annotations stored separately as CRDT-based vector elements.

Existing VP Whiteboard architecture (Yjs + Konva + Supabase) already handles the collaborative canvas layer. Adding file-based markup requires extending this with: file upload/presigned URL handling, document rendering (PDF.js for PDFs, native Image for images), background layer management in Konva, and export workflows (canvas + document composite). Session management uses unique board identifiers in shareable URLs with no authentication barrier for guest access.

## Standard Architecture

### System Overview

```
+-----------------------------------------------------------------------+
|                           Client Layer                                |
+-----------------------------------------------------------------------+
|  +---------------------+  +---------------------+  +-----------------+
|  |   Upload Component  |  |   Document Viewer   |  |  Markup Canvas  |
|  |   (drag-drop UI)    |  |   (PDF.js + Image)  |  |   (Konva + Yjs) |
|  +----------+----------+  +----------+----------+  +--------+--------+
|             |                        |                     |
|             v                        v                     v |
+-----------------------------------------------------------------------+
|  +---------------------+  +---------------------+  +-----------------+
|  |   File Manager      |  |   Layer Manager     |  |  Export Service |
|  | (CRUD operations)    |  | (z-order, lock)     |  | (PNG, PDF merge)|
|  +----------+----------+  +----------+----------+  +--------+--------+
+-----------------------------------------------------------------------+
|                                |                                       |
|                                | HTTP/WebSocket                        |
|                                v                                       |
+-----------------------------------------------------------------------+
|                           Server Layer                                |
+-----------------------------------------------------------------------+
|  +---------------------+  +---------------------+  +-----------------+
|  |   Upload Handler    |  |   Session Manager   |  |  WebSocket Relay |
|  | (validation, store)  |  | (URL routing)       |  |   (Yjs sync)     |
|  +----------+----------+  +----------+----------+  +--------+--------+
|             |                        |                     |
|             v                        v                     v |
+-----------------------------------------------------------------------+
|  +---------------------+  +---------------------+  +-----------------+
|  |  Object Storage     |  |   Metadata Store    |  |   Presence DB   |
|  | (Supabase Storage)  |  |   (PostgreSQL)      |  |   (Redis/Supa)  |
|  +---------------------+  +---------------------+  +-----------------+
+-----------------------------------------------------------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| **Upload Component** | File selection, drag-drop UI, validation preview, progress tracking | File Manager (API), Object Storage (direct) |
| **Document Viewer** | Renders PDF pages as canvas backgrounds using PDF.js, image rendering | Layer Manager (background registration) |
| **Markup Canvas** | Konva stage for annotations, Yjs CRDT sync for collaboration | Layer Manager, WebSocket Relay |
| **Layer Manager** | Z-order management, document locking, background layer lifecycle | Document Viewer, Markup Canvas |
| **File Manager** | File CRUD operations, metadata persistence, file list | Server API, Object Storage |
| **Export Service** | Merges document + annotations, generates output files | Document Viewer, Markup Canvas |
| **Session Manager** | Generates shareable URLs, session routing, guest access | Server API, client routing |
| **Upload Handler** | Server-side validation, presigned URL generation, metadata storage | Object Storage, Metadata Store |
| **WebSocket Relay** | Yjs document sync, cursor broadcasting, presence awareness | Yjs clients, Presence DB |
| **Object Storage** | File blob storage, CDN delivery, public URLs | Upload Handler (server), clients (direct) |
| **Metadata Store** | File metadata, canvas state, user permissions, version history | All server components |

## Recommended Project Structure

```
vp-whiteboard/
├── components/
│   ├── markup/
│   │   ├── FileUpload.vue           # Drag-drop upload zone
│   │   ├── FileList.vue             # Uploaded files sidebar
│   │   ├── DocumentViewer.vue       # PDF.js renderer wrapper
│   │   ├── LayerPanel.vue           # Layer management UI
│   │   └── ExportDialog.vue         # Export options dialog
│   └── whiteboard/
│       ├── WhiteboardCanvas.vue     # Existing Konva canvas
│       └── WhiteboardToolbar.vue    # Existing drawing tools
├── composables/
│   ├── useFileUpload.ts             # File upload logic
│   ├── useDocumentViewer.ts         # PDF.js integration
│   ├── useLayerManager.ts           # Layer/z-order management
│   ├── useExport.ts                 # Export workflow
│   ├── useCollaborativeCanvas.ts    # Existing Yjs integration
│   └── useWhiteboardStorage.ts      # Existing Supabase integration
├── server/
│   └── api/
│       └── files/
│           ├── upload.post.ts       # File upload handler
│           ├── index.get.ts         # List files for whiteboard
│           └── [id].delete.ts       # Delete file
├── types/
│   └── index.ts                     # TypeScript interfaces
└── utils/
    ├── pdf-renderer.ts              # PDF.js utilities
    ├── export-processor.ts          # Export compositing
    └── layer-utils.ts               # Layer management helpers
```

### Structure Rationale

- **components/markup/**: File-specific UI components separate from general whiteboard components
- **composables/useFileUpload.ts**: Encapsulates file selection, validation, upload progress, retry logic
- **composables/useDocumentViewer.ts**: PDF.js lifecycle management (loading, rendering, page navigation)
- **composables/useLayerManager.ts**: Manages relationship between document backgrounds and annotation layers
- **composables/useExport.ts**: Handles canvas+document composite export for PNG/PDF
- **server/api/files/**: REST endpoints for file operations separate from whiteboard CRUD

## Architectural Patterns

### Pattern 1: Three-Layer Document Rendering

**What:** PDF.js architecture using Canvas Layer (rendered content), Annotation Layer (interactive HTML overlay), and Text Layer (selectable text).

**When to use:** For PDF markup workflows where text selection and form interactions are needed alongside drawing annotations.

**Trade-offs:**
- Pro: Native PDF interactions (links, forms, text selection)
- Pro: Accessibility (screen readers can read text layer)
- Con: Complex coordination between Konva canvas and PDF.js layers
- Con: Performance overhead with large multi-page PDFs

**Example:**

```typescript
// composables/useDocumentViewer.ts
import * as pdfjsLib from 'pdfjs-dist'

interface DocumentLayer {
  type: 'pdf' | 'image'
  src: string
  pageNumber?: number
  width: number
  height: number
  x: number
  y: number
  scale: number
  locked: boolean
}

export function useDocumentViewer() {
  const pdfDoc = ref<pdfjsLib.PDFDocumentProxy | null>(null)
  const renderTask = ref<pdfjsLib.RenderTask | null>(null)

  async function loadPDF(url: string) {
    const loadingTask = pdfjsLib.getDocument(url)
    pdfDoc.value = await loadingTask.promise
    return pdfDoc.value.numPages
  }

  async function renderPage(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    scale = 1.0
  ): Promise<{ width: number; height: number }> {
    if (!pdfDoc.value) throw new Error('PDF not loaded')

    const page = await pdfDoc.value.getPage(pageNumber)
    const viewport = page.getViewport({ scale })

    const context = canvas.getContext('2d')!
    canvas.width = viewport.width
    canvas.height = viewport.height

    // Cancel any existing render task
    if (renderTask.value) {
      renderTask.value.cancel()
    }

    renderTask.value = page.render({
      canvasContext: context,
      viewport: viewport
    })

    await renderTask.value.promise

    return { width: viewport.width, height: viewport.height }
  }

  function cleanup() {
    if (renderTask.value) {
      renderTask.value.cancel()
    }
    pdfDoc.value?.destroy()
  }

  return {
    pdfDoc,
    loadPDF,
    renderPage,
    cleanup
  }
}
```

### Pattern 2: Document-as-Background-Layer

**What:** Treat uploaded documents as locked background layers in the Konva stage, with annotations as editable foreground layers.

**When to use:** For all file-based markup workflows. Provides separation between document content and user markup.

**Trade-offs:**
- Pro: Clear separation of concerns (document vs markup)
- Pro: Can toggle document visibility to view annotations alone
- Pro: Supports multi-document canvases
- Con: Requires layer management UI complexity
- Con: Coordinate translation between document and canvas space

**Example:**

```typescript
// composables/useLayerManager.ts
import type { CanvasElement, DocumentLayer } from '~/types'

export function useLayerManager(yjsElements: Y.Array<CanvasElement>) {
  const documentLayers = ref<DocumentLayer[]>([])
  const activeLayerId = ref<string | null>(null)

  function addDocumentLayer(layer: DocumentLayer) {
    const id = `doc-${Date.now()}`
    documentLayers.value.push({
      ...layer,
      id,
      locked: true,
      zOrder: documentLayers.value.length
    })

    // Add to Yjs as special element type
    yjsElements.push([{
      id,
      type: 'document',
      userId: 'system',
      userName: 'System',
      timestamp: Date.now(),
      data: layer
    }])

    return id
  }

  function removeDocumentLayer(layerId: string) {
    const index = documentLayers.value.findIndex(l => l.id === layerId)
    if (index !== -1) {
      documentLayers.value.splice(index, 1)
      // Remove from Yjs
      const elementIndex = yjsElements.toArray().findIndex(e => e.id === layerId)
      if (elementIndex !== -1) {
        yjsElements.delete([elementIndex, 1])
      }
    }
  }

  function setLayerOrder(layerId: string, newZOrder: number) {
    const layer = documentLayers.value.find(l => l.id === layerId)
    if (layer) {
      layer.zOrder = newZOrder
      // Update Yjs element
      updateElement(layerId, { zOrder: newZOrder })
    }
  }

  function getAnnotationsForLayer(layerId: string): CanvasElement[] {
    // Filter annotations that are positioned over this document
    return yjsElements.toArray().filter(el =>
      el.type !== 'document' &&
      // Check spatial overlap with document layer
      isOverlappingDocument(el, layerId)
    )
  }

  return {
    documentLayers,
    activeLayerId,
    addDocumentLayer,
    removeDocumentLayer,
    setLayerOrder,
    getAnnotationsForLayer
  }
}
```

### Pattern 3: Shareable URL Session Management

**What:** Each whiteboard/session has a unique identifier in the URL path. No authentication required for guest access—anyone with the URL can view and edit.

**When to use:** For guest collaboration workflows where ease of sharing is prioritized over access control.

**Trade-offs:**
- Pro: Zero-friction sharing (copy link, send to anyone)
- Pro: No authentication overhead
- Con: Anyone with URL can access (security consideration)
- Con: No user attribution without auth

**Example:**

```typescript
// Session routing via Nuxt pages
// pages/whiteboard/[id].vue

const route = useRoute()
const whiteboardId = route.params.id as string

// Optional: Generate short URL for sharing
function generateShareUrl(): string {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl as string
  return `${baseUrl}/whiteboard/${whiteboardId}`
}

// Optional: Create whiteboard with random ID if none exists
// pages/new.vue -> redirect to /whiteboard/[random-id]
function createWhiteboard(): string {
  const id = crypto.randomUUID()
  navigateTo(`/whiteboard/${id}`)
  return id
}
```

### Pattern 4: Composite Export (Document + Annotations)

**What:** Export workflow that composites the original document with annotations into a single output file (PNG or PDF).

**When to use:** For generating marked-up deliverables that include both the original document and user annotations.

**Trade-offs:**
- Pro: Single file contains all markup
- Pro: Works with standard viewers (no special software needed)
- Con: For PDF: requires re-rendering PDF pages with annotations
- Con: For PNG: limited to single page or viewport

**Example:**

```typescript
// composables/useExport.ts
import * as pdfjsLib from 'pdfjs-dist'
import { jsPDF } from 'jspdf'

export function useExport() {
  async function exportAsPNG(
    konvaStage: any,
    documentLayer?: DocumentLayer
  ): Promise<string> {
    // Create a temporary canvas for composition
    const tempCanvas = document.createElement('canvas')
    const ctx = tempCanvas.getContext('2d')!

    // Set dimensions to match stage
    tempCanvas.width = konvaStage.width()
    tempCanvas.height = konvaStage.height()

    // Draw document background if present
    if (documentLayer) {
      const docCanvas = await getDocumentCanvas(documentLayer)
      ctx.drawImage(docCanvas, documentLayer.x, documentLayer.y)
    }

    // Draw Konva stage annotations
    const annotationData = konvaStage.toDataURL()
    const annotationImage = await loadImage(annotationData)
    ctx.drawImage(annotationImage, 0, 0)

    return tempCanvas.toDataURL('image/png')
  }

  async function exportAsPDF(
    konvaStage: any,
    documentLayers: DocumentLayer[]
  ): Promise<Blob> {
    const pdf = new jsPDF()

    for (let i = 0; i < documentLayers.length; i++) {
      const layer = documentLayers[i]

      if (i > 0) pdf.addPage()

      // Render original PDF page
      await renderPDFPageToPdf(pdf, layer, i)

      // Overlay annotations
      const annotationData = await getAnnotationsForLayer(
        konvaStage,
        layer.id
      )
      pdf.addImage(annotationData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight())
    }

    return pdf.output('blob')
  }

  return {
    exportAsPNG,
    exportAsPDF
  }
}
```

## Data Flow

### Upload to Render Flow

```
1. User selects file (drag-drop or click)
   Client: FileUpload.vue handles file selection

2. Client validates file (type, size)
   Client: useFileUpload.validateFile(file)

3. Request presigned upload URL
   Client: POST /api/files/upload-request {filename, contentType, whiteboardId}
   Server: Generates Supabase Storage presigned URL
   Server: Returns { uploadUrl, fileId, storagePath }

4. Direct upload to Supabase Storage
   Client: PUT <presigned-url> (direct to storage, bypassing server)

5. Confirm upload, save metadata
   Client: POST /api/files/confirm-upload {fileId, storagePath, metadata}
   Server: INSERT INTO whiteboard_files (...)
   Server: Returns file record

6. Add document as background layer
   Client: useLayerManager.addDocumentLayer({
     src: file.publicUrl,
     type: file.type,
     width, height,
     x, y, scale
   })

7. Render document on canvas
   Client: DocumentViewer.vue renders PDF/image
   Client: Konva layer positioned and locked
```

### Annotation Sync Flow

```
1. User draws on document
   Client: WhiteboardCanvas.vue captures pointer events

2. Create annotation element
   Client: useCollaborativeCanvas.addElement({
     type: 'stroke',
     data: { points, color, size },
     layerId: currentDocumentLayer.id  // Associate with document
   })

3. Yjs syncs to all clients
   Client: y-websocket provider broadcasts update

4. Other clients render annotation
   Client: observe yElements array, render new element at correct z-order
```

### Export Flow

```
1. User clicks export button
   Client: ExportDialog.vue shows format options (PNG/PDF)

2. Composite document + annotations
   Client: useExport.exportAsPDF(documents, annotations)

3. For PDF output:
   a. Create new PDF document
   b. For each page:
      - Render original PDF page
      - Overlay annotation layer (clipped to page bounds)
   c. Generate Blob

4. Download file
   Client: Trigger browser download with generated Blob
```

### Session Flow

```
1. User navigates to /whiteboard/[id]
   Client: Route handler extracts whiteboardId

2. Load whiteboard metadata
   Client: GET /api/whiteboard/[id]
   Server: Returns { name, created_at, canvas_state }

3. Load associated files
   Client: GET /api/files?whiteboardId=[id]
   Server: Returns [{ id, storage_path, file_name, ... }]

4. Initialize Yjs document
   Client: useCollaborativeCanvas(whiteboardId, userId, userName)

5. Connect to WebSocket
   Client: wsProvider.connect()
   Server: Joins room "whiteboard:[id]"

6. Load canvas state
   Client: canvas.importState(canvas_state)

7. Render document layers
   Client: DocumentViewer renders each file as background layer
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Single server instance, Supabase for all storage, in-memory document rendering |
| 1k-100k users | Multiple server instances, Redis for presence/pub/sub, CDN for file delivery |
| 100k+ users | Separate document rendering service, sharded storage, regional CDN |

### Scaling Priorities

1. **First bottleneck: Document rendering CPU**
   - PDF rendering is CPU-intensive
   - Cache rendered pages as images
   - Consider server-side pre-rendering for large PDFs
   - WebAssembly PDF.js for better performance

2. **Second bottleneck: Storage bandwidth**
   - Large PDFs (10MB+) downloaded frequently
   - Implement CDN caching (Supabase Storage supports CDN)
   - Use aggressive cache headers for static documents

3. **Third bottleneck: Yjs document size**
   - Many annotations on large documents create large CRDT documents
   - Implement per-document annotation sets (separate Yjs docs per document layer)
   - Periodic snapshot and compaction

## Anti-Patterns

### Anti-Pattern 1: Storing File Blobs in Database

**What people do:** Store uploaded files as BLOB/bytea columns in PostgreSQL.

**Why it's wrong:**
- Database bloat, poor query performance
- Backup/restore becomes extremely slow
- No CDN capability
- Expensive storage costs

**Do this instead:** Use Supabase Storage (S3-compatible) with presigned URLs. Store only metadata in database.

### Anti-Pattern 2: Rendering Entire Multi-Page PDF at Once

**What people do:** Load all pages of a 100-page PDF into canvas elements simultaneously.

**Why it's wrong:**
- Massive memory consumption (each page is a full canvas)
- Browser tab crashes with large documents
- Slow initial load time

**Do this instead:** Implement lazy page loading. Render only visible pages plus buffer (current +/- 1). Unload off-screen pages.

### Anti-Pattern 3: Blocking UI During File Upload

**What people do:** Synchronously upload files and block user interaction.

**Why it's wrong:**
- Poor UX for large files (10MB+ can take seconds)
- No progress feedback
- User can't cancel upload

**Do this instead:** Asynchronous upload with progress callback. Show progress bar, allow cancel. Use presigned URLs for direct-to-storage upload.

### Anti-Pattern 4: Exporting Canvas Only (Without Document)

**What people do:** Export only the Konva canvas annotations, excluding the underlying document.

**Why it's wrong:**
- Exported file missing context (shows marks without original content)
- Users need both document and annotations
- Incomplete deliverable for review workflows

**Do this instead:** Composite document and annotations. For PDF: create new PDF with original pages plus annotation overlays. For PNG: render document then overlay canvas.

### Anti-Pattern 5: Single File for Multi-Page PDF Markup

**What people do:** Try to render all PDF pages as a single tall canvas image.

**Why it's wrong:**
- Images don't maintain text selectability
- Can't export back to PDF format properly
- Massive single image is hard to navigate

**Do this instead:** Keep PDF as native format. Render pages as separate canvas elements. Export as new PDF with annotation layers.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Supabase Storage** | Presigned URLs for direct upload | Avoids server as bottleneck, supports CDN |
| **PDF.js** | Worker-based rendering | Use Web Worker to avoid blocking UI thread |
| **Yjs** | Per-whiteboard document | One Y.Doc per whiteboard, not per document layer |
| **Supabase PostgreSQL** | Metadata store only | File metadata, canvas state, permissions |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **FileUpload -> File Manager** | API calls (POST /api/files/...) | Upload component orchestrates upload flow |
| **DocumentViewer -> LayerManager** | Direct method calls | Same component context, synchronous communication |
| **LayerManager -> CollaborativeCanvas** | Yjs array manipulation | Both work with same yjsElements array |
| **Export -> DocumentViewer** | Async method calls | Export needs rendered document canvases |
| **Export -> CollaborativeCanvas** | Direct access to Konva stage | Export reads stage.toDataURL() |

## Build Order (Dependencies)

```
Phase 1: File Upload Infrastructure
  |
  +-- Supabase Storage bucket setup
  +-- Upload API endpoint (presigned URL)
  +-- FileUpload component (drag-drop UI)
  +-- File metadata table and queries
  |
  Dependencies: None (can be done in parallel with existing canvas)

Phase 2: Document Rendering
  |
  +-- PDF.js integration and worker setup
  +-- DocumentViewer component (PDF + images)
  +-- Layer manager basic functionality
  +-- Document-as-background-layer in Konva
  |
  Dependencies: Phase 1 (need uploaded files to render)

Phase 3: Export Functionality
  |
  +-- Export service (canvas + document composite)
  +-- PNG export (single viewport)
  +-- PDF export (multi-page with annotations)
  +-- Export dialog UI
  |
  Dependencies: Phase 2 (need document rendering to export)

Phase 4: Advanced Features
  |
  +-- Layer management UI (reorder, toggle visibility)
  +-- Multi-document support (multiple PDFs on same canvas)
  +-- Page navigation for PDFs
  +-- Annotation-per-document filtering
  |
  Dependencies: Phase 3 (core features first)

Phase 5: Optimization
  |
  +-- Lazy page loading for PDFs
  +-- Cached page rendering
  +-- WebAssembly PDF.js
  +-- Progressive image loading
  |
  Dependencies: Phase 4 (optimize after functionality complete)
```

### Build Order Rationale

1. **File Upload First**: Cannot render or markup documents without uploading them. This phase has no dependencies on existing canvas code.

2. **Document Rendering Second**: Once files are uploaded, need to render them on canvas. PDF.js integration is foundational.

3. **Export Third**: Export requires both documents (Phase 2) and annotations (existing canvas). Building export after rendering ensures all components are available.

4. **Advanced Features Fourth**: Layer management and multi-document support build on basic rendering. Not critical for MVP.

5. **Optimization Fifth**: Performance optimizations come after functionality is working. Premature optimization risks complexity.

## Migration from Existing Architecture

The existing VP Whiteboard already has:
- Yjs collaborative canvas
- Konva rendering
- Supabase integration
- File upload (basic)

To extend to full file-based markup:

1. **Extend file upload**: Add PDF type support, increase file size limits
2. **Add PDF.js**: Integrate PDF.js worker for rendering
3. **Create layer system**: Extend existing CanvasElement type to include document layers
4. **Implement export**: Add PDF export using jsPDF or similar
5. **UI additions**: File list sidebar, layer panel, export dialog

## Sources

### HIGH Confidence (Official Documentation)
- [PDF.js Official Documentation](https://mozilla.github.io/pdf.js/) - Mozilla's official PDF rendering library docs
- [Konva.js Documentation](https://konvajs.org/docs/) - Canvas framework official docs with export guides
- [Yjs Documentation](https://docs.yjs.dev/) - CRDT sync library official docs
- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage) - Official Supabase Storage guides

### MEDIUM Confidence (Recent Articles & Tutorials)
- [Complete Guide to PDF.js - Nutrient (Dec 2025)](https://www.nutrient.io/blog/complete-guide-to-pdfjs/) - Comprehensive PDF.js architecture guide
- [Understanding PDF.js Layers in React.js (July 2025)](https://blog.react-pdf.dev/understanding-pdfjs-layers-and-how-to-use-them-in-reactjs) - Layer architecture details
- [PDF.js Advanced Features: Annotations (CSDN, Aug 2025)](https://blog.csdn.net/gitblog_00982/article/details/150619351) - Annotation system architecture
- [Canvas to PDF Conversion - Konva Official](https://konvajs.org/docs/sandbox/Canvas_to_PDF.html) - Official export methodology
- [High-Quality Export Tutorial - Konva Official](https://konvajs.org/docs/data_and_serialization/High-Quality-Export.html) - Best practices for canvas export
- [Collaborative Document Editing Architecture (MDPI, 2024)](https://www.mdpi.com/2076-3417/14/18/8356) - Real-time collaboration research paper
- [Session Management for Collaborative Applications (Georgia Tech)](https://faculty.cc.gatech.edu/~keith/pubs/session-mgmt.pdf) - Academic session management patterns

### LOW Confidence (General References)
- [Best Whiteboarding Tools 2025](https://mockflow.com/blog/best-whiteboarding-tools) - Market overview for feature comparison
- Various community forum discussions on PDF.js integration patterns

---
*Architecture research for: File-based collaborative markup tools*
*Researched: 2026-02-10*
*Confidence: HIGH*
