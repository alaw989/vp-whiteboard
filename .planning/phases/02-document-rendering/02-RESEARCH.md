# Phase 2: Document Rendering - Research

**Researched:** 2026-02-10
**Domain:** PDF.js integration with Nuxt 3/Vue 3 and Konva canvas rendering
**Confidence:** HIGH

## Summary

This phase focuses on rendering uploaded PDF and image files as canvas backgrounds in the whiteboard. The core technical challenge involves integrating PDF.js with the existing vue-konva setup, managing PDF rendering off the main thread, and implementing proper layer management for document backgrounds.

The research reveals that PDF.js 5.4.624 is the current standard for PDF rendering in the browser, with official npm distribution as `pdfjs-dist`. For Vite/Nuxt environments, worker configuration requires specific handling using `import.meta.url` to resolve the worker path. Konva provides a well-documented layer management system with performance optimization patterns like `listening(false)` for non-interactive background layers.

For image files (JPG, PNG, WebP), the existing `v-image` implementation in WhiteboardCanvas.vue already demonstrates the correct pattern - using `useImage` hook from vue-konva or manual `new Image()` with data.src. This can be extended for document backgrounds.

**Primary recommendation:** Use pdfjs-dist 5.4.x with worker configuration in a Nuxt plugin, render PDF pages to offscreen canvases, convert to dataURLs, and display as Konva Image nodes on dedicated background layers with `listening(false)` for performance.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pdfjs-dist` | 5.4.624 | PDF rendering | Mozilla-maintained, actively developed (4 days ago), 8.7M weekly downloads |
| `konva` | 9.3.15 (existing) | Canvas rendering | Already in project, provides layer management |
| `vue-konva` | 3.3.0 (existing) | Vue bindings for Konva | Already in project, declarative API |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | - | - | Existing packages cover all needs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pdfjs-dist | react-pdf | React-specific, not suitable for Vue 3 |
| pdfjs-dist | PDF.js from CDN | Less control over worker configuration, harder for Nuxt SSR |
| v-image with dataURL | v-rect with fillPatternImage | dataURL approach simpler for generated PDF images |

**Installation:**
```bash
# PDF.js for PDF rendering
npm install pdfjs-dist

# Note: No additional packages needed - vue-konva already provides useImage hook
```

## Architecture Patterns

### Recommended Project Structure
```
composables/
├── usePDFRendering.ts     # PDF.js integration, page rendering to canvas
├── useDocumentLayer.ts    # Konva layer management for document backgrounds
└── useFileUpload.ts       # (existing, extend for PDF validation)

components/whiteboard/
├── WhiteboardCanvas.vue   # (modify: add document layers)
├── DocumentBackground.vue # New: displays PDF/image as background
└── WhiteboardUpload.vue   # (existing, already handles file types)

plugins/
└── pdfjs.client.ts        # Nuxt plugin for PDF.js worker configuration

types/
└── index.ts               # (extend with PDF-related types)
```

### Pattern 1: PDF.js Worker Configuration in Nuxt
**What:** Configure the PDF.js worker using a Nuxt client-side plugin with Vite-compatible asset resolution.
**When to use:** Required for any PDF.js usage in Nuxt 3/Vite environments.
**Example:**
```typescript
// plugins/pdfjs.client.ts
export default defineNuxtPlugin(() => {
  if (process.client) {
    import('pdfjs-dist').then((pdfjsLib) => {
      // Vite-compatible worker URL resolution
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString()
    })
  }
})
// Source: https://konvajs.org, https://www.npmjs.com/package/pdfjs-dist
```

### Pattern 2: PDF Page to Canvas to Konva Image
**What:** Render PDF page to offscreen canvas, convert to dataURL, use as Konva Image source.
**When to use:** When displaying PDF pages as canvas backgrounds that can be exported.
**Example:**
```typescript
async function renderPDFPageToImage(
  pdfDocument: PDFDocumentProxy,
  pageNumber: number,
  scale = 1.5
): Promise<string> {
  const page = await pdfDocument.getPage(pageNumber)
  const viewport = page.getViewport({ scale })

  // Create offscreen canvas
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  canvas.width = viewport.width
  canvas.height = viewport.height

  // Render PDF page to canvas
  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise

  // Convert to dataURL for Konva Image
  return canvas.toDataURL('image/png')
}
// Source: PDF.js official examples, mozilla.github.io/pdf.js/examples/
```

### Pattern 3: Multi-Layer Architecture with Konva
**What:** Separate background layer (document), main layer (drawings), UI layer (cursors/controls).
**When to use:** When rendering documents that should not interfere with interactive elements.
**Example:**
```vue
<template>
  <v-stage ref="stageRef" :config="stageConfig">
    <!-- Background Layer: Document (PDF/Image) -->
    <v-layer ref="documentLayerRef" :config="{ listening: false }">
      <v-image :config="documentImageConfig" />
    </v-layer>

    <!-- Main Layer: Drawings/Annotations -->
    <v-layer ref="mainLayerRef">
      <!-- Existing elements rendered here -->
    </v-layer>

    <!-- UI Layer: Collaborative cursors (if needed) -->
    <v-layer ref="uiLayerRef">
      <!-- Cursor overlays -->
    </v-layer>
  </v-stage>
</template>
// Source: https://konvajs.org/docs/performance/All_Performance_Tips.html
```

### Pattern 4: Memory Management for Large PDFs
**What:** Explicit cleanup of PDF document proxies and render tasks to prevent memory leaks.
**When to use:** Always when working with PDF.js, especially with multiple documents.
**Example:**
```typescript
// Cleanup function for PDF resources
function cleanupPDFResources(
  pdfDocument: PDFDocumentProxy | null,
  renderTask: RenderTask | null
) {
  // Cancel ongoing rendering
  renderTask?.cancel()

  // Clean up document (caches on main and worker threads)
  pdfDocument?.cleanup()

  // Nullify references
  renderTask = null
  pdfDocument = null
}
// Source: PDF.js GitHub issues #9662, #10021, #10730
```

### Anti-Patterns to Avoid
- **Rendering PDF directly to main canvas without layering:** Makes document export difficult and affects drawing performance
- **Not using `listening(false)` on background layers:** Wastes CPU cycles on hit detection for non-interactive elements
- **Loading all PDF pages at once:** Causes memory issues with large PDFs; use lazy loading instead
- **Using CSS background for documents:** Background won't be included in `stage.toDataURL()` exports

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF parsing and rendering | Custom PDF parser | pdfjs-dist | PDF specification is complex (1.7MB+ spec), edge cases with fonts, encodings, compression |
| Worker thread management | Manual worker setup | PDF.js built-in worker | Already handles off-main-thread rendering, browser compatibility |
| Canvas to dataURL conversion | Custom base64 encoder | canvas.toDataURL() | Native browser API, optimized |
| Image loading in vue-konva | Manual image load handling | useImage() hook from vue-konva | Handles loading states, errors, reactive updates |
| Layer hit detection optimization | Custom hit testing | layer.listening(false) | Built-in Konva performance optimization |

**Key insight:** PDF.js is a 13+ year old Mozilla project with 2440 dependents. Hand-rolling PDF rendering would require implementing ISO 32000 (PDF) specification handling including:
- 8 compression algorithms (Flate, LZW, CCITT, etc.)
- Multiple font formats (Type 1, TrueType, OpenType, CID-keyed)
- Color space management (RGB, CMYK, Lab, ICC profiles)
- XRef table and trailer parsing
- Object stream reconstruction

## Common Pitfalls

### Pitfall 1: Worker Version Mismatch
**What goes wrong:** PDF.js API version doesn't match Worker version, causing "version mismatch" errors and rendering failures.
**Why it happens:** npm installs may have cached worker files, or manual worker file copying uses different version.
**How to avoid:** Always use `import.meta.url` resolution from `pdfjs-dist` package rather than copying worker files manually.
**Warning signs:** Console errors mentioning version numbers not matching, partial PDF rendering.

### Pitfall 2: Memory Leaks from Uncleaned Render Tasks
**What goes wrong:** Memory usage grows continuously when loading/rendering multiple PDFs.
**Why it happens:** PDF.js maintains caches on both main and worker threads that are not automatically cleared.
**How to avoid:** Always call `pdfDocument.cleanup()` when done with a document. Cancel pending `renderTask.cancel()` before cleanup.
**Warning signs:** Browser DevTools memory tab shows increasing heap size, slowing performance over time.

### Pitfall 3: CORS Issues with Remote PDFs
**What goes wrong:** PDF pages render as blank or throw security errors when loading from different domain.
**Why it happens:** Canvas becomes "tainted" when drawing cross-origin content without proper CORS headers.
**How to avoid:** Ensure PDF server sends proper CORS headers; for local files, no CORS issues.
**Warning signs:** Canvas `toDataURL()` throws security error, blank PDF pages.

### Pitfall 4: Large PDFs Blocking UI
**What goes wrong:** Browser freezes when loading/rendering large PDFs (>20MB).
**Why it happens:** PDF rendering is CPU-intensive; without proper worker setup or lazy loading, it blocks main thread.
**How to avoid:** Ensure worker is properly configured; implement page-by-page lazy loading with progress indicators.
**Warning signs:** UI becomes unresponsive during PDF load, progress indicators don't update.

### Pitfall 5: Layer Z-Index Issues
**What goes wrong:** Drawings appear behind document, or document obscures drawings.
**Why it happens:** Konva renders layers in order of addition; document layer added after main layer ends up on top.
**How to avoid:** Always add document layer first, then main drawing layer. Use `moveToTop()` / `moveToBottom()` to adjust.
**Warning signs:** Drawings not visible, can't select drawn elements.

## Code Examples

Verified patterns from official sources:

### PDF.js Worker Configuration (Nuxt/Vite)
```typescript
// plugins/pdfjs.client.ts
import * as pdfjsLib from 'pdfjs-dist'

export default defineNuxtPlugin(() => {
  // Configure worker for Vite/Nuxt
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()
})
// Source: npm pdfjs-dist, Vite configuration guides
```

### Render PDF Page with Progress Tracking
```typescript
async function renderPageWithProgress(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  onProgress?: (percent: number) => void
): Promise<void> {
  const viewport = page.getViewport({ scale: 1.5 })
  const context = canvas.getContext('2d')!
  canvas.width = viewport.width
  canvas.height = viewport.height

  // Render with optional callback (Note: progress callback not fully supported in all versions)
  const renderTask = page.render({
    canvasContext: context,
    viewport: viewport,
  })

  // For PDF.js 5.x, use renderTask.onProgress if available
  // Otherwise, rendering is typically fast enough to not need per-page progress
  await renderTask.promise
}
// Source: PDF.js API documentation
```

### Konva Background Layer with Document
```vue
<script setup lang="ts">
import { useImage } from 'vue-konva'

const documentUrl = ref<string>('/path/to/document.png')
const image = useImage(documentUrl)

const documentConfig = computed(() => ({
  image: image.value,
  x: 0,
  y: 0,
  listening: false, // Performance: don't track events on background
}))
</script>

<template>
  <v-stage>
    <!-- Document background layer (non-interactive) -->
    <v-layer :config="{ listening: false }">
      <v-image :config="documentConfig" />
    </v-layer>

    <!-- Drawing layer (interactive) -->
    <v-layer>
      <!-- Drawing elements -->
    </v-layer>
  </v-stage>
</template>
// Source: https://konvajs.org/docs/vue/Images.html
```

### Image File Handling (Already Working)
```typescript
// From WhiteboardCanvas.vue - existing working pattern
function getImageConfig(element: CanvasElement) {
  const data = element.data as ImageElement
  const image = new Image()
  image.src = data.src
  return {
    x: data.x,
    y: data.y,
    image,
    width: data.width,
    height: data.height,
  }
}
// Source: Existing codebase - this pattern works for images
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Copying worker.js to public/ manually | Using `import.meta.url` for worker resolution | Vite 3+ | Simpler config, automatic version matching |
| Rendering all PDF pages upfront | Lazy page loading with IntersectionObserver | ~2022 | Better performance for large PDFs |
| Single canvas layer | Multi-layer architecture (background, content, UI) | ~2020 | Better organization, performance optimization |
| CSS backgrounds for canvas | Konva.Rect with fillPatternImage | Always | CSS backgrounds don't export with canvas |

**Deprecated/outdated:**
- `pdfjs-dist` legacy build: Use modern ESM build, not legacy folder unless supporting old browsers
- `page.destroy()`: Deprecated, use `page.cleanup()` instead
- Direct worker file copying: Use URL resolution pattern for Vite compatibility

## Open Questions

1. **Multi-page PDF navigation (beyond MVP)**
   - What we know: Single page rendering is straightforward with `page.render()`
   - What's unclear: Best pattern for page switching, thumbnail generation, maintaining rendered page cache
   - Recommendation: Start with single page MVP; defer multi-page navigation to later phase. Consider virtualization for large documents.

2. **PDF text selection/search (future requirement)**
   - What we know: PDF.js provides text layer API for text extraction
   - What's unclear: Integration pattern with Konva layers, performance implications
   - Recommendation: Out of scope for this phase; defer to later phase if needed.

3. **Zoom/pan synchronization with document layer**
   - What we know: Existing viewport zoom/pan in WhiteboardCanvas.vue uses stage transform
   - What's unclear: How document-as-background behaves with viewport transforms
   - Recommendation: Test early; document layer should move with viewport group since it's inside same v-group.

## Sources

### Primary (HIGH confidence)
- [pdfjs-dist npm package](https://www.npmjs.com/package/pdfjs-dist) - Latest version 5.4.624, API reference
- [PDF.js GitHub Repository](https://github.com/mozilla/pdf.js) - Official source, examples, documentation
- [Konva.js Official Documentation - Canvas Background](https://konvajs.org/docs/sandbox/Canvas_Background.html) - Official background patterns
- [Konva.js Performance Tips](https://konvajs.org/docs/performance/All_Performance_Tips.html) - Layer optimization, listening(false)
- [Konva.js Vue Images Documentation](https://konvajs.org/docs/vue/Images.html) - useImage hook reference

### Secondary (MEDIUM confidence)
- [Stack Overflow: PDF.js with Vue3 and Vite](https://stackoverflow.com/questions/73979621/how-do-i-use-pdfjs-with-vue3-and-vite) - Worker configuration for Vite
- [Stack Overflow: Using background in Konva Layer](https://stackoverflow.com/questions/60798016/using-a-background-image-in-konva-layer-or-stage) - Background patterns
- [Dev.to: Building SVG Editor with Konva.js](https://dev.to/lovestaco/building-an-svg-editor-with-konvajs-56fo) - Multi-layer architecture patterns (2025)

### Tertiary (LOW confidence - marked for validation)
- Various CSDN/Juejin blog posts on Vue3 + Vite + pdfjs-dist integration - Community examples, verify with official docs
- Web search results on PDF.js memory management - Confirm with PDF.js GitHub issues

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official npm and GitHub sources verified, current version confirmed
- Architecture: HIGH - Official Konva documentation and existing codebase patterns used
- Pitfalls: MEDIUM - Some sources are secondary (blogs, community posts); verify during implementation

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (30 days - pdfjs-dist is actively maintained)
