# Phase 6: Export - Context

**Gathered:** 2026-02-11
**Status:** Ready for planning

## Phase Boundary

Users can export marked-up documents as PNG or PDF with annotations. Export includes original file background plus all markups.

## Implementation Decisions

### Export UI & workflow
- Always-visible export button in toolbar or header (not just in menu)
- Pre-export dialog asks user to select format (PNG/PDF) and settings before exporting
- Show preview thumbnail of what will be exported before finalizing
- Progress bar with percentage for large exports

### Export content scope
- Flatten all visible layers into single export (multiple documents become one export)
- Export full canvas regardless of current zoom/pan viewport
- Always include background document (PDF/image) in export
- Include ALL elements in export regardless of visibility state (hidden layers still export)

### File handling & naming
- Auto-download to user's downloads folder (no save dialog)
- Filename based on uploaded document's original filename + suffix
- Multiple documents export as separate numbered files: [doc-name]-1.png, [doc-name]-2.png
- Include ISO date timestamp in filename for version tracking

### Export quality & resolution
- PNG: 1x canvas resolution (screen quality) for smaller files
- PDF: Print/high DPI (150-300 DPI) for professional output
- PNG compression: Maximum quality (no compression artifacts)
- PDF generation: Image-based PDF (raster image embedded, simpler implementation)

### Claude's Discretion
- Exact DPI value within print range (150-300)
- Timestamp format in filename (ISO vs other)
- Progress bar implementation details
- Preview thumbnail size/aspect ratio

## Specific Ideas

No specific requirements — standard export approaches acceptable.

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 06-export*
*Context gathered: 2026-02-11*
