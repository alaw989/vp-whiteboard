# VP Whiteboard

## What This Is

A real-time collaborative markup tool for VP Associates (structural engineering firm) to use with their clients. Engineers can upload drawings and files, invite clients via a shared link, and collaboratively mark up and discuss the drawings while on a call. Multiple participants can draw simultaneously with real-time synchronization.

## Core Value

Engineers and clients can collaboratively mark up and discuss engineering drawings in real-time, with everyone seeing each other's cursors and annotations instantly.

## Requirements

### Validated

- ✓ **Real-time collaboration foundation** — Nuxt 3 app with Yjs CRDT sync and WebSocket server
- ✓ **Canvas rendering** — Konva.js-based whiteboard canvas with drawing tools
- ✓ **Basic drawing tools** — Freehand drawing with perfect-freehand smoothing
- ✓ **User presence** — Multi-user cursor tracking and user list display
- ✓ **File upload** — WhiteboardUpload component for adding images/PDFs to canvas
- ✓ **Persistence** — Canvas state saved to Supabase every 30 seconds
- ✓ **Guest access** — Simple user ID generation, no authentication required

### Active

- [ ] **File-based drawing foundation** — Upload file → set as canvas background → draw on top
- [ ] **Link-based session sharing** — Create session → generate unique URL → share with clients
- [ ] **Multi-file support** — PDF, images (JPG, PNG, WebP), any drawable format
- [ ] **Essential markup tools** — Freehand pen, text labels, arrows/shapes for callouts
- [ ] **Session management** — Create, save, revisit sessions via link
- [ ] **Save/export** — Download marked-up file or session state
- [ ] **Responsive canvas** — Files display at correct scale, pan/zoom for navigation

### Out of Scope

- **User accounts/authentication** — Link-based guest access only, simpler for clients
- **Voice/video chat** — Clients talk over phone separately
- **Advanced CAD features** — This is markup/discussion tool, not CAD software
- **Real-time PDF rendering** — PDF converted to image on upload, not live PDF manipulation
- **Version history** — Current session state only, no undo/redo timeline

## Context

**Client:** VP Associates — structural engineering firm working with clients on building projects. Currently rebuilding their main website (vp-eng-nuxt project).

**Problem:** Engineers need to mark up drawings and plans with clients in real-time. Currently likely emailing marked-up PDFs back and forth or using generic whiteboard tools that don't fit engineering workflows.

**Use case:** Engineer creates session, uploads structural drawing, shares link with client. They discuss on phone while both drawing arrows, circling elements, adding notes directly on the plan.

**Existing codebase:** Has foundational whiteboard with Yjs collaboration, Konva canvas, and Supabase. Needs to be adapted for file-based markup workflow.

## Constraints

- **Timeline** — Client deliverable, determined by client needs
- **Session size** — Typically 2-3 users (engineer + 1-2 clients)
- **Tech stack** — Nuxt 3, Yjs, Konva, Supabase (existing)
- **Access model** — Link-based sharing, no authentication barrier for clients
- **File types** — Support all commonly drawable formats (PDF, images)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Guest access only | Clients shouldn't need accounts — frictionless join via link | — Pending |
| Yjs CRDT sync | Already implemented, proven for real-time collaboration | ✓ Good |
| Supabase backend | Already integrated, used for session persistence | ✓ Good |
| Link-based sessions | Simplest sharing model for engineer→client workflow | — Pending |

---
*Last updated: 2026-02-10 after initialization*
