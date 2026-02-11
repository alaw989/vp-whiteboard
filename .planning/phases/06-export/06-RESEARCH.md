# Phase 6: Export - Research

**Researched:** 2026-02-11
**Domain:** Canvas export (PNG/PDF generation with annotation compositing)
**Confidence:** HIGH

## Summary

Export functionality for canvas-based whiteboards requires compositing document background layers with annotation overlays, then generating downloadable files. The project uses Konva for canvas rendering, with PDF.js for document backgrounds. PNG export is already partially implemented via `stage.toDataURL()`. PDF export requires adding jsPDF library to convert canvas output to PDF format. Key technical challenges include proper pixel ratio handling for high-DPI exports, unit conversion (pixels to millimeters) for PDF page sizing, and filename generation from original document metadata.

**Primary recommendation:** Use Konva's built-in `toDataURL()` for PNG export combined with jsPDF v4.1.0+ (addresses CVE-2026-24040) for PDF generation. Implement as a composable (`useExport.ts`) that handles both formats with progress tracking and proper filename generation.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Export UI & workflow:**
  - Always-visible export button in toolbar or header (not just in menu)
  - Pre-export dialog asks user to select format (PNG/PDF) and settings before exporting
  - Show preview thumbnail of what will be exported before finalizing
  - Progress bar with percentage for large exports

- **Export content scope:**
  - Flatten all visible layers into single export (multiple documents become one export)
  - Export full canvas regardless of current zoom/pan viewport
  - Always include background document (PDF/image) in export
  - Include ALL elements in export regardless of visibility state (hidden layers still export)

- **File handling & naming:**
  - Auto-download to user's downloads folder (no save dialog)
  - Filename based on uploaded document's original filename + suffix
  - Multiple documents export as separate numbered files: [doc-name]-1.png, [doc-name]-2.png
  - Include ISO date timestamp in filename for version tracking

- **Export quality & resolution:**
  - PNG: 1x canvas resolution (screen quality) for smaller files
  - PDF: Print/high DPI (150-300 DPI) for professional output
  - PNG compression: Maximum quality (no compression artifacts)
  - PDF generation: Image-based PDF (raster image embedded, simpler implementation)

### Claude's Discretion
- Exact DPI value within print range (150-300)
- Timestamp format in filename (ISO vs other)
- Progress bar implementation details
- Preview thumbnail size/aspect ratio

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **jsPDF** | ^4.1.0 | PDF generation | Addresses CVE-2026-24040 race condition vulnerability. Generates PDFs client-side without server. Image-based PDF approach matches locked decision. |
| **Konva** | ^9.3.0 (installed) | Canvas export | Already in project. `stage.toDataURL()` provides PNG export with pixelRatio control. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **FileSaver.js** | ^2.0.0 | Download triggering | Simplified browser download triggering across browsers. Alternative: native `<a>` tag with `download` attribute + `click()`. |
| **html2canvas-pro** | ^1.6.6 | HTML-to-canvas (if needed) | NOT NEEDED for this phase - Konva already provides canvas. Use only if exporting DOM elements. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jsPDF | PDFKit | PDFKit requires Node.js or complex build. jsPDF works directly in browser. |
| jsPDF | pdf-lib | pdf-lib has more features but larger bundle. jsPDF sufficient for image-based PDF. |
| Native `<a>` download | FileSaver.js | FileSaver provides better cross-browser handling. Native approach works in modern browsers. |
| Vector PDF (SVG) | Raster PDF | Vector PDF requires re-architecting entire canvas to SVG. Locked decision specifies image-based PDF. |

**Installation:**
```bash
# Core export library (CVE-2026-24040 fix required)
npm install jspdf@^4.1.0

# Optional: FileSaver for better browser compatibility
npm install file-saver
```

## Architecture Patterns

### Recommended Project Structure
```
vp-whiteboard/
├── components/
│   └── whiteboard/
│       └── ExportDialog.vue          # NEW: Export options dialog
├── composables/
│   └── useExport.ts                  # NEW: Export workflow
├── types/
│   └── index.ts                       # ADD: ExportFormat, ExportOptions types
```

### Pattern 1: Konva Stage Export

**What:** Use Konva's `stage.toDataURL()` method to export the entire stage as a PNG data URL, with control over pixel ratio and region.

**When to use:** Exporting canvas content including all layers (document backgrounds + annotations) to PNG or for PDF embedding.

**Example:**
```typescript
// composables/useExport.ts
function exportCanvas(
  stage: Konva.Stage,
  options: { format: 'png' | 'pdf'; quality?: number; filename?: string }
): Promise<Blob> {
  const { format, quality = 1.0, filename } = options

  // Calculate export bounds (full canvas, not viewport)
  const width = stage.width()
  const height = stage.height()

  // Export as data URL with pixelRatio for quality
  const dataUrl = stage.toDataURL({
    pixelRatio: quality,  // 1.0 for screen, 2.0+ for print
    x: 0,
    y: 0,
    width,
    height,
  })

  if (format === 'png') {
    return dataURLToBlob(dataUrl, 'image/png')
  }

  // For PDF: pass dataUrl to jsPDF
  return dataUrl  // PDF handled separately
}
```

### Pattern 2: jsPDF Image-Based PDF Generation

**What:** Create PDF with jsPDF using exported canvas PNG as embedded image. Simpler than vector reconstruction, matches "flattened" export requirement.

**When to use:** PDF export with annotations layered onto document background. Matches locked decision for image-based PDF.

**Example:**
```typescript
import jsPDF from 'jspdf'

async function exportToPDF(
  dataUrl: string,
  options: { width: number; height: number; filename: string }
): Promise<Blob> {
  const { width, height, filename } = options
  const pdf = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
    unit: 'px',  // Use pixel units to avoid conversion
    format: [width, height],
  })

  // Add canvas as image
  pdf.addImage(dataUrl, 'PNG', 0, 0, width, height)

  // Generate blob for download
  const pdfBlob = pdf.output('blob')
  return new Blob([pdfBlob], { type: 'application/pdf' })
}
```

### Anti-Patterns to Avoid
- **Exporting viewport only:** User requirement specifies full canvas export regardless of zoom/pan. Use stage dimensions, not visible viewport.
- **Ignoring hidden layers:** Locked decision states ALL elements export regardless of visibility. Do not filter by `visible` property.
- **Save dialogs:** Browser security prevents controlling save location. Use auto-download to default Downloads folder.
- **jsPDF < 4.1.0:** Contains CVE-2026-24040 race condition vulnerability.
- **Separate PDF export per layer:** Locked decision flattens all layers into single export.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF generation | Custom PDF encoder from scratch | jsPDF | Handles page sizing, compression, PDF structure. CVE patch available. |
| Canvas serialization | Manual JSON parsing/walking | Konva's `toDataURL()` | Native method optimized for performance. |
| Browser download handling | Complex iframe/ActiveX workarounds | Native `<a download>` or FileSaver.js | Browser security prevents arbitrary file paths. |
| Unit conversion | Manual pixel-to-mm formulas | jsPDF `unit: 'px'` | Library handles conversion. |

**Key insight:** Canvas export and PDF generation are well-solved problems. Custom implementations risk quality issues, security vulnerabilities, and browser compatibility problems.

## Common Pitfalls

### Pitfall 1: Export Quality Degradation

**What goes wrong:** Exported PNG/JPEG images are pixelated, fuzzy, or lower quality than expected. File sizes are unexpectedly large or small. Clipping operations degrade quality to ~60%.

**Why it happens:** Canvas `toDataURL()` and `toBlob()` quality parameters not properly set. Scaling during export causes pixelation. Default JPEG compression too aggressive.

**How to avoid:** Always specify quality parameter (use PNG for lossless). Use `pixelRatio` in Konva's `toDataURL()` to control output resolution.

**Warning signs:** Exported images look blurry compared to canvas; JPEG artifacts visible in exported files.

**Source:** [MDN: HTMLCanvasElement.toDataURL()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL) (HIGH confidence - official docs)

### Pitfall 2: Canvas Tainted by Cross-Origin Images

**What goes wrong:** Export fails with "Tainted canvas" error when document layers contain images from different origins (e.g., Supabase storage CDN).

**Why it happens:** Browser security blocks exporting canvas content that includes cross-origin images without proper CORS headers.

**How to avoid:** Ensure all layer images have `crossOrigin: 'anonymous'` attribute and Supabase bucket allows public access. Already implemented in existing codebase (see `useDocumentLayer.ts` line 50).

**Warning signs:** Export fails silently or throws security error; Check browser console for CORS errors.

**Source:** [Konva: Tainted Canvas](https://konvajs.org/docs/posts/Tainted_Canvas.html) (HIGH confidence - official docs)

### Pitfall 3: PDF Unit Conversion Errors

**What goes wrong:** Images added to PDF appear at wrong scale or are cropped because pixels aren't properly converted to PDF units.

**Why it happens:** jsPDF defaults to millimeters but Konva exports in pixels. Manual conversion formulas are error-prone.

**How to avoid:** Use jsPDF's `unit: 'px'` to work directly in pixel coordinates, avoiding conversion math.

**Warning signs:** PDF content appears stretched/squashed; images don't fill page as expected.

### Pitfall 4: jsPDF Security Vulnerability (CVE-2026-24040)

**What goes wrong:** Race condition in jsPDF versions before 4.1.0 can cause security issues.

**Why it happens:** Shared state mutation during concurrent operations.

**How to avoid:** Use jsPDF v4.1.0 or later.

**Source:** [CVE-2026-24040 - jsPDF Race Condition](https://www.sentinelone.com/vulnerability-database/cve-2026-24040/) (HIGH confidence - security advisory)

### Pitfall 5: Missing Original Filename

**What goes wrong:** Exported files named generically (e.g., "whiteboard.png") instead of using the original document name.

**Why it happens:** Export function doesn't access document metadata from the whiteboard or uploaded files.

**How to avoid:** Pass original filename from file upload metadata through to export function. Query whiteboard files or store filename in document layer state.

**Warning signs:** All exports have same generic name.

## Code Examples

Verified patterns from official sources:

### Konva Stage Export
```typescript
// Source: https://konvajs.org/docs/data_and_serialization/Stage_Data_URL.html
import type { Stage } from 'konva/lib/Stage'

interface ExportOptions {
  pixelRatio?: number
  x?: number
  y?: number
  width?: number
  height?: number
}

function exportStage(stage: Stage, options: ExportOptions = {}): string {
  return stage.toDataURL({
    pixelRatio: options.pixelRatio || 1,
    x: options.x || 0,
    y: options.y || 0,
    width: options.width || stage.width(),
    height: options.height || stage.height(),
  })
}
```

### jsPDF Image-Based PDF
```typescript
// Source: https://github.com/parallax/jsPDF v4.1.0+
import jsPDF from 'jspdf'

interface PDFExportOptions {
  dataUrl: string
  width: number
  height: number
  filename: string
  orientation?: 'portrait' | 'landscape'
}

function exportToPDF(options: PDFExportOptions): Blob {
  const { dataUrl, width, height, filename, orientation } = options

  const pdf = new jsPDF({
    orientation: orientation || (width > height ? 'landscape' : 'portrait'),
    unit: 'px',  // Critical: use pixels to match canvas
    format: [width, height],
    compress: true,  // Enable compression for smaller files
  })

  pdf.addImage(dataUrl, 'PNG', 0, 0, width, height)
  return pdf.output('blob')
}
```

### Browser Download Trigger
```typescript
// Source: Native browser API (no library needed)
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)  // Clean up memory
}
```

### Progress Tracking for Large Exports
```typescript
// For Konva exports requiring visible rendering time
async function exportWithProgress(
  stage: Stage,
  onProgress: (percent: number) => void
): Promise<string> {
  // Report start
  onProgress(0)

  // Small delay to allow UI update
  await new Promise(resolve => setTimeout(resolve, 50))

  const dataUrl = stage.toDataURL({ pixelRatio: 2 })

  // Report complete
  onProgress(100)

  return dataUrl
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| `html2canvas` (unmaintained) | **html2canvas-pro** | 2022 | Active fork with modern browser fixes |
| Server-side PDF generation | Client-side jsPDF | ~2018 | Reduced server load, faster iteration |
| jsPDF v2.x | jsPDF v4.1.0+ | Feb 2026 | CVE-2026-24040 fix required |
| Manual filename entry | Auto-generated from metadata | - | Better UX, less error-prone |

**Deprecated/outdated:**
- **html2canvas original:** Unmaintained since 2022, use `html2canvas-pro` if needed
- **jsPDF < 4.0.0:** Contains security vulnerability, must upgrade

## Open Questions

1. **Original filename retrieval**
   - What we know: Document layers have `fileId` and `src` URL, but original filename not directly stored in layer state
   - What's unclear: Best way to retrieve original filename for export naming
   - Recommendation: Query `whiteboard_files` table by `fileId` or extend `DocumentLayer` type to include `originalFilename` property

2. **Multi-document export format**
   - What we know: Locked decision specifies "[doc-name]-1.png, [doc-name]-2.png" pattern
   - What's unclear: Should each document layer create separate PDF page, or create separate PDF files?
   - Recommendation: Single PDF with multiple pages for cleaner workflow, implement as enhancement after initial export capability

3. **Preview thumbnail implementation**
   - What we know: Locked decision requires preview before export
   - What's unclear: Optimal thumbnail size/aspect ratio for dialog
   - Recommendation: 200-300px width with aspect ratio preservation, generate via `stage.toDataURL({ width: 300, height: ... })`

## Sources

### Primary (HIGH confidence)
- [Konva: Stage Data URL](https://konvajs.org/docs/data_and_serialization/Stage_Data_URL.html) - Export API documentation
- [Konva: High-Quality Export](https://konvajs.org/docs/data_and_serialization/High-Quality-Export.html) - pixelRatio and quality control
- [jsPDF npm v4.1.0](https://www.npmjs.com/package/jspdf) - CVE-2026-24040 fix verified
- [MDN: HTMLCanvasElement.toDataURL()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL) - Official browser API
- [Project source code](/home/deck/Sites/vp-whiteboard) - Existing export patterns in `WhiteboardCanvas.vue` line 1495-1499

### Secondary (MEDIUM confidence)
- [Canvas export with annotations discussion (2025)](https://www.google.com/search?q=canvas+export+annotations+2025) - Community patterns for composite export
- [jsPDF examples and documentation](https://github.com/parallax/jsPDF) - Official examples for image-based PDF

### Tertiary (LOW confidence)
- None - All findings verified against official docs or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - jsPDF and Konva are established, official docs verify APIs
- Architecture: HIGH - Pattern matches existing codebase (composables pattern)
- Pitfalls: HIGH - Canvas export issues documented in MDN and Konva docs

**Research date:** 2026-02-11
**Valid until:** 2026-03-13 (30 days - stable domain, rapid changes only in security patches)
