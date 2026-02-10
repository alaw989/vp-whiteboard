# Feature Research: Collaborative Markup Tools for Engineering Drawings

**Domain:** File-based markup/collaboration tools for structural engineering
**Researched:** 2026-02-10
**Confidence:** MEDIUM (WebSearch verified against multiple sources)

---

## Executive Summary

Based on research of Bluebeam Revu, Autodesk Docs/BIM 360, Drawboard Projects, Fieldwire, PlanGrid, and general PDF markup tools, the collaborative markup landscape for engineering drawings has clear table stakes and emerging differentiators.

**Key Finding:** The market divides between general PDF markup tools (Adobe, Foxit) and industry-specific AEC tools (Bluebeam, Autodesk). VP Whiteboard's niche is simplicity for engineer-client workflows, not enterprise construction management.

**Critical Insight:** File-based markup workflows differ fundamentally from whiteboard tools. Users expect markups to persist relative to the drawing, support measurements/scales, and export to standard formats (PDF with annotations).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Pen/Highlighter/Eraser** | Basic markup capability | LOW | Already implemented with perfect-freehand |
| **Text Annotations** | Callouts, labels, notes | LOW | Text input with leader lines to specific points |
| **Shapes (Rect, Circle, Line, Arrow)** | Standard drawing tools | LOW | Rectangles, circles, lines with arrows already supported |
| **Color + Thickness Control** | Expressive markup needed | LOW | Color picker and size controls already exist |
| **Undo/Redo** | Expected in any creative tool | LOW | Already implemented via Yjs UndoManager |
| **Zoom/Pan** | Essential for detailed drawings | LOW | Already implemented with wheel zoom |
| **File Upload (Images, PDF)** | Core workflow requirement | MEDIUM | Already supports images; PDF needs page handling |
| **Export as PNG/PDF** | Deliverable to client | LOW | PNG export exists; PDF export needed |
| **User Presence/Cursors** | Collaboration awareness | LOW | Already implemented via Yjs |
| **Real-time Sync** | Expected for "collaborative" | MEDIUM | Already implemented via Yjs + WebSocket |
| **Save/Auto-save** | Prevent data loss | LOW | Already implemented via Supabase |
| **Shareable Links** | Client access without auth | LOW | Already implemented (no auth workflow) |

### Emerging Table Stakes (Becoming Expected in 2026)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Measurement Tools** | Engineers measure on drawings | MEDIUM | Distance, area measurements with scale |
| **Stamps/Status Markers** | Review workflow (Approved, RFIs) | LOW | Pre-defined stamps (APPROVED, REVISED, etc.) |
| **Comment/Threaded Replies** | Discussion around markups | MEDIUM | Comments attached to elements with replies |
| **Version Comparison** | Show what changed between revisions | HIGH | Overlay/compare functionality |
| **Mobile/Tablet Support** | Field reviews on iPad | MEDIUM | Touch support partially exists |
| **PDF Multi-page** | Real drawings have multiple sheets | MEDIUM | PDF page navigation, thumbnails |

### Differentiators (Competitive Advantage)

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Phone-Native Workflow** | No app download, share link and go | LOW | Already have link-based sharing, emphasize this |
| **Structural Engineering Symbols** | Pre-built beams, loads, dimensions library | MEDIUM | Industry-specific stamps (rebar, loads, notes) |
| **Scale-Aware Markups** | Markups stay positioned when zooming | MEDIUM | Markups anchor to drawing coordinates |
| **Client-Focused Simplicity** | No account creation, minimal UI | LOW | Competitors require login/accounts |
| **Integrated Measurement** | Click-to-measure with set scale | MEDIUM | Set scale once, measure accurately |
| **Markup Status Tracking** | Markups as tasks (open/resolved) | MEDIUM | Simple checkbox status on annotations |
| **Export Flat PDF** | Client gets clean PDF with markups burned in | MEDIUM | Flattens annotations for distribution |
| **Quick Color Themes** | Engineer=red, Client=blue, visual clarity | LOW | Pre-configured role-based palettes |
| **Session Recording** | Playback drawing session for reference | HIGH | Record and replay markup session |
| **Voice-to-Text Notes** | Dictate notes while marking up | MEDIUM | Web Speech API integration |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for this specific use case.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| **Authentication/Accounts** | "Better security" | Client friction; they talk on phone anyway | Link-based sharing with optional simple PIN |
| **Video/Audio Chat** | "Integrated communication" | They already talk on phone; adds complexity | None - use existing phone |
| **CAD File Support** | "Native format editing" | Massive complexity; CAD viewers are heavy | Export to PDF, markup PDF |
| **Version History Timeline** | "See all changes" | UI complexity; overkill for 2-person use | Simple undo/redo + auto-save |
| **Complex Permissions** | "Role-based access" | Overkill for engineer+1-2 clients | Single room, anyone can draw |
| **Offline Mode** | "Work without internet" | Sync complexity; conflicts in real-time | Assume connectivity; show warning if offline |
| **AI-Assisted Markups** | "Smart suggestions" | Wrong suggestions = worse than none | Symbol library for common items |
| **3D Model Markups** | "Modern BIM workflow" | Massive complexity; target is 2D drawings | Focus on 2D PDFs/Images |
| **Enterprise Integrations** | "Connect to Procore, etc." | Not target user; small firms | Simple file upload/download |
| **Advanced Annotation Layers** | "Organize markups" | Confusing for casual clients | Single layer, visual grouping by color |

---

## Feature Dependencies

```
[File Upload - PDF]
    └──requires──> [PDF Page Rendering]
                   └──requires──> [Page Navigation/Thumbnails]

[Measurement Tools]
    └──requires──> [Scale Setting]
                   └──enhances──> [Export with Measurements]

[Comment/Threaded Replies]
    └──requires──> [Element Selection]
    └──enhances──> [Markup Status Tracking]

[Structural Engineering Symbols]
    └──enhances──> [Drawing Tools]
    └──enhances──> [Quick Markup Workflows]

[Version Comparison]
    └──requires──> [Multi-version Storage]
    └──requires──> [PDF Diff Algorithm]

[Export Flat PDF]
    └──requires──> [Canvas to PDF Rendering]
    └──requires──> [Markup Layer Compositing]

[Mobile/Tablet Support]
    └──requires──> [Touch Event Handling]
    └──requires──> [Responsive UI]

[Scale-Aware Markups]
    └──requires──> [Drawing Coordinate System]
    └──requires──> [File Reference Anchoring]
```

### Dependency Notes

- **PDF Upload** requires PDF.js or similar for rendering; currently only image upload exists
- **Measurements** require scale input (e.g., "this line is 10ft") then scale-aware calculations
- **Comments** build on element selection; selection tool exists but needs click-to-select logic
- **Version Comparison** is high complexity and should be deferred
- **Export Flat PDF** requires server-side or client-side PDF generation with annotation flattening

---

## Competitor Feature Analysis

| Feature | Bluebeam Revu | Autodesk Docs | Drawboard | Fieldwire | VP Whiteboard (Current) |
|---------|--------------|---------------|-----------|-----------|------------------------|
| Pen/Highlighter | YES | YES | YES | YES | YES |
| Shapes/Arrows | YES | YES | YES | YES | YES (no arrows) |
| Text/Callouts | YES | YES | YES | YES | YES (text only) |
| Measurements | YES (advanced) | YES | YES | Partial | NO |
| Stamps | YES (custom) | YES | YES | YES | NO |
| Real-time Sync | YES (Studio) | YES | YES | YES | YES (Yjs) |
| Version History | YES | YES | YES | YES | NO |
| Comment Threads | YES | YES | YES | YES | NO |
| No Auth Required | NO | NO | NO | NO | YES |
| Link Sharing | NO | NO | Limited | NO | YES |
| PDF Export | YES | YES | YES | YES | PNG only |
| Multi-page PDF | YES | YES | YES | YES | Basic support |
| Mobile | YES | YES | YES | YES | Partial |
| Scale Set | YES | YES | YES | NO | NO |
| Symbol Library | YES (extensive) | Limited | YES | Limited | NO |

**Competitive Position:** VP Whiteboard differentiates on simplicity and no-auth sharing. Gap is in measurement tools, stamps, and export.

---

## MVP Definition

### Launch With (v1 - File-Centric Features)

Minimum features to validate file-based markup workflow for engineer-client use.

- [x] **Real-time Drawing** - Pen, highlighter, shapes
- [x] **File Upload** - Images as background
- [ ] **Arrow Tool** - Essential for pointing at things
- [x] **Zoom/Pan** - Navigate large drawings
- [x] **Color + Size** - Expressive markups
- [x] **Real-time Collaboration** - Yjs sync
- [x] **Shareable Links** - No auth friction
- [ ] **Text with Leader Lines** - Callouts to specific points
- [ ] **Simple Stamps** - APPROVED, REVISED, NOTE
- [ ] **Export as PDF** - Client deliverable

### Add After Validation (v1.x)

Features to add once core file-based workflow is validated.

- [ ] **Measurement Tools** - Set scale, measure distance/area
- [ ] **Comment/Replies** - Threaded discussions on markups
- [ ] **Markup Status** - Open/Resolved checkboxes
- [ ] **Structural Symbols** - Beams, loads, dimension styles
- [ ] **Multi-page PDF** - Page navigation, thumbnails
- [ ] **PDF Export with Annotations** - Flattened output
- [ ] **Role Color Themes** - Engineer vs client visual distinction

### Future Consideration (v2+)

Defer until product-market fit established.

- [ ] **Version Comparison** - Overlay revisions
- [ ] **Session Recording** - Playback markup session
- [ ] **Voice Notes** - Dictate while drawing
- [ ] **Advanced Measurements** - Area, count, calibration
- [ ] **CAD File Support** - DXF/DWG viewing
- [ ] **Advanced Stamps** - Custom stamp libraries

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Rationale |
|---------|------------|---------------------|----------|-----------|
| Arrow Tool | HIGH | LOW | P1 | Essential for pointing, missing from current |
| Export as PDF | HIGH | MEDIUM | P1 | Client deliverable, currently PNG only |
| Simple Stamps | HIGH | LOW | P1 | Review workflow (APPROVED, etc.) |
| Text + Leaders | HIGH | LOW | P1 | Callouts to specific drawing elements |
| Measurements | HIGH | MEDIUM | P2 | Engineers need to measure on drawings |
| Comment Threads | MEDIUM | MEDIUM | P2 | Async discussion, but they talk on phone |
| Markup Status | MEDIUM | LOW | P2 | Simple task tracking on annotations |
| Structural Symbols | MEDIUM | MEDIUM | P2 | Domain-specific differentiator |
| Multi-page PDF | MEDIUM | MEDIUM | P2 | Real drawings have sheets |
| Role Color Themes | LOW | LOW | P3 | Nice visual clarity, not essential |
| Session Recording | LOW | HIGH | P3 | Cool feature, low demand |
| Voice Notes | LOW | MEDIUM | P3 | Niche use case |
| Version Comparison | MEDIUM | HIGH | P3 | High complexity, uncertain value |
| CAD Support | MEDIUM | HIGH | P3 | Different product category |

**Priority key:**
- P1: Must have for file-based markup launch
- P2: Should have, adds significant value
- P3: Nice to have, future consideration

---

## Existing vs. Needed Features

Based on current codebase analysis:

### Already Implemented
- Real-time sync (Yjs + WebSocket)
- Drawing tools: pen, highlighter, line, rectangle, circle, eraser
- Color picker with preset palette
- Size/stroke width control
- Undo/Redo (Yjs UndoManager)
- Zoom/Pan (mouse wheel)
- Cursor presence (other users' cursors)
- User list with colors
- File upload (images only)
- Export as PNG
- Shareable links (no auth)
- Auto-save to localStorage

### Gaps to Address
- **Arrow tool** - Line with arrowhead for pointing
- **Text with leader lines** - Callout text with pointing line
- **Stamps** - Pre-defined text/markup stamps
- **PDF rendering** - PDF.js for PDF page display
- **Multi-page PDF** - Page navigation, thumbnails
- **Measurements** - Distance, area with scale input
- **Element selection** - Click to select existing markups
- **Element editing** - Move, resize existing markups
- **Comments** - Threaded replies on elements
- **Export as PDF** - Flatten annotations to PDF
- **Markup status** - Resolved checkboxes
- **Symbol library** - Structural engineering stamps

---

## Implementation Notes

### Arrow Tool
- Add arrow element type to `types/index.ts`
- Render arrowhead at line end
- Low complexity, high utility

### Text with Leader Lines
- Extend text element with optional leader
- Click to place text, drag leader endpoint
- Medium complexity

### Simple Stamps
- Pre-defined stamp library (APPROVED, REVISED, NOTE, FOR REVIEW)
- Click to place stamp at cursor
- Could be text elements with pre-set styling

### PDF Rendering
- Integrate PDF.js for client-side rendering
- Each page as separate layer/image
- Page navigation UI
- Medium complexity

### Measurement Tools
- Need scale setting (e.g., "this line = X units")
- Distance = pixel distance * scale factor
- Display measurement next to line
- Medium complexity, high value

### Export as PDF
- Option 1: Client-side with jsPDF
- Option 2: Server-side with Puppeteer
- Must include original file + markups
- Medium complexity

### Comment Threads
- Add comments array to CanvasElement
- UI for viewing/replying to comments
- Yjs sync for comment updates
- Medium complexity

---

## Sources

- **Bluebeam Revu Features**: Industry-standard PDF markup with Studio collaboration, measurement tools, custom stamps [WebSearch 2026]
- **Autodesk Docs/BIM 360**: Cloud-based markup with issue tracking, comparison tools, mobile support [WebSearch 2026]
- **Drawboard Projects**: Real-time collaboration, issue tracking, instant sync across revisions [WebSearch 2026]
- **Fieldwire vs PlanGrid**: Usability vs feature depth comparison; both support drawing markups [WebSearch 2026]
- **PDF Markup Table Stakes**: Core features expected in annotation tools (highlighting, comments, shapes, measurements) [WebSearch 2026]
- **File-Based vs Whiteboard Tools**: Key differences in workflow (review vs create) [WebSearch 2026]
- **Construction Document Features**: Industry-specific requirements (RFI management, punch lists, compliance) [WebSearch 2026]
- **Anti-Features Research**: Common pitfalls in document tools (steep learning curve, feature bloat, poor integration) [WebSearch 2026]

---

*Feature research for: VP Whiteboard collaborative markup tools*
*Researched: 2026-02-10*
*Target: Structural engineer + client workflows, file-based markup*
