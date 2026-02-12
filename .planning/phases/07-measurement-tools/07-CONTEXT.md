# Phase 7: Measurement Tools - Context

**Gathered:** 2026-02-11
**Status:** Ready for planning

## Phase Boundary

Scale-aware measurement system for engineering drawings. Users can define a reference scale, then measure distances and areas with proper unit display. Measurements sync across collaborators and persist with the session.

## Implementation Decisions

### Scale Setting Interface
- **Scale factor input** — Users directly input scale ratio (e.g., "1 inch = 10 feet") rather than drawing a reference line
- **Floating tool palette** — Scale tool activated from toolbar shows a floating input dialog near the canvas for easy access
- **Per-document scale persistence** — Each uploaded document (PDF/image) remembers its own scale. Switching documents restores that document's scale.
- **Always-visible scale badge** — Current scale (e.g., "1" = 10'") shown in a corner or status bar at all times

### Measurement Tool Behavior
- **Distance measurement interaction** — Claude's discretion on click-click vs drag interaction pattern
- **Smart snapping** — Measurements snap to endpoints of lines, corners of rectangles, centers of circles, and other geometric features
- **Area measurement workflow** — Select existing shapes (rectangles/circles) that were already drawn, then apply 'measure' action to calculate area
- **Fully editable measurements** — Double-click or select measurement to edit measured dimensions or move endpoints after creation

### Units and Formatting
- **Imperial units only** — Support inches and feet for US engineering workflows (inches, feet, miles)
- **Decimal inches display** — Show measurements as decimal inches (e.g., 126.5") not feet-inches format
- **High precision** — 1/10000 precision (.0001) for engineering accuracy
- **Simple text labels** — Plain text with measurement value only, matching canvas font (no backgrounds, outlines, or callout arrows)

### Measurement Persistence
- **Claude's discretion** — Storage approach (as canvas elements vs separate yMeasurements map) based on what fits existing architecture
- **Claude's discretion** — Whether measurements appear in layers panel, based on UX consistency with existing layer system
- **Claude's discretion** — Measurement behavior when document/scale changes (static coordinates vs dynamic recalculation) based on technical feasibility

## Specific Ideas

No specific requirements — open to standard approaches for measurement tools in engineering applications.

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 07-measurement-tools*
*Context gathered: 2026-02-11*
