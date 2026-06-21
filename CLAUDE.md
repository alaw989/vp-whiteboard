# VP Associates Collaborative Whiteboard

> **Ralph Wiggum (spec-driven autonomous coding loop) is set up here.** The single
> source of truth for loop-mode behavior, branch safety, and spec conventions is
> `.specify/memory/constitution.md` — read it before running the loop or touching
> `specs/`. Start with `./scripts/ralph-loop.sh`; **never run the loop on
> `master`/`develop`/`main`** (they auto-deploy) — use a `feat/*` branch only.

## Operations & current state
- **Staging** (`staging-whiteboard.vp-associates.com`) runs the migrated **Laravel** backend on branch `develop`. **Production** (`whiteboard.vp-associates.com`) is still the old Nuxt+Supabase app on `master` (not yet migrated).
- **Deploy staging by pushing to `develop`** — `.github/workflows/deploy-staging.yml` builds + deploys over SSH (composer → migrate → storage:link → frontend build → PM2). **Do not hand-deploy over SSH**; SSH is read-only for diagnosis. Watch a run: `gh run watch <id> --exit-status`.
- **Full detail:** `STAGING-LARAVEL-MIGRATION.md` (state, architecture, 12-item gotcha catalog, open items), `PRODUCTION-DEPLOY.md` (prod runbook), `DEVELOPMENT.md` (fresh-machine setup).
- **Top gotchas** (full list in the migration doc): the WS relay must send `Origin`/`Referer` + use the real session-cookie name (`laravel-session`, = `Str::slug(APP_NAME).'-session'`); the `public/storage` symlink is gitignored (recreated by `artisan storage:link`); nginx routes `/api/*`→Laravel but `/api/_nuxt_icon/*`→Nuxt; every mutation must go through the `$api` helper (CSRF) or it 419s; `.env` must be readable by `www-data`.

## Tech Stack
- **Frontend**: Nuxt 3, Vue 3 (Composition API), TypeScript, Tailwind CSS — lives in `frontend/`
- **Canvas**: Konva.js + vue-konva
- **Drawing**: perfect-freehand for smooth strokes
- **Real-time**: Yjs CRDT + standalone WebSocket relay (`frontend/server/ws-server.js`)
- **Backend**: Laravel 12 (PHP 8.2+) + MySQL + Laravel Breeze (Sanctum SPA-cookie auth)
- **PDF**: jspdf (export), pdfjs-dist (rendering)
- **Testing**: Vitest (unit), Playwright (E2E)
- **Deploy**: DigitalOcean droplet, nginx + PHP-FPM + PM2, GitHub Actions CI

## Commands
Laravel commands run from the **repo root**; Nuxt/WS commands from **`frontend/`**.
```bash
# --- Laravel (repo root) ---
composer install              # install PHP dependencies
php artisan key:generate      # generate APP_KEY
php artisan migrate           # run DB migrations
php artisan storage:link      # create the public/storage symlink (uploads)
php artisan serve             # Laravel dev server on :8000

# --- Nuxt + WS (frontend/) ---
cd frontend
npm install
npm run dev                   # Nuxt dev server (:3000)
npm run dev:ws                # Yjs WS relay (:3001)
npm run dev:all               # both concurrently
npm run build                 # production build
npm run typecheck             # vue-tsc type check
```

## Architecture
- **Dual app**: Laravel API (repo root, `:8000` dev / PHP-FPM prod) + Nuxt SPA (`frontend/`, `:3000`). Nuxt calls Laravel via the `$api` helper (`frontend/plugins/api.client.ts`), which rewrites `/api/*` → `${laravelUrl}/api/*` with `credentials: 'include'` + CSRF.
- **Real-time**: Yjs CRDT over a standalone WebSocket relay — conflict-free collaboration. Drawing elements, layers, and scale live in the Yjs doc.
- **Persistence**: canvas state stored as JSON in MySQL (`whiteboards.canvas_state`), auto-saved every 30s via PATCH `/api/whiteboards/:id`.
- **Auth**: Laravel Breeze (email+password accounts) + Sanctum SPA-cookie auth — replaces the old shared `AUTH_PASSWORD`.
- Viewport culling for performance with 500+ elements.
- Tool system: each tool is a composable in `frontend/composables/tools/` implementing a `ToolHandler` interface.
- Tool dispatch: `frontend/composables/useToolHandlers.ts` routes mouse/keyboard events to the active tool.
- Core composables: `useCollaborativeCanvas` (Yjs), `useDocumentLayer` (PDF/image layers). CAD: `useOrthoMode`, `usePolarTracking`, `useSnapping`, `useGrid`, `useLayers`, `useCommandEngine`, `useCommandRegistry`.

## Pages
- `/` — Whiteboard list
- `/whiteboard/new` — Create new whiteboard
- `/whiteboard/[id]` — Main whiteboard editor
- `/s/[id]` — Shared short link

## Environment
Two `.env` files (both gitignored — copy from the matching `.env.example`):
- **Root `.env`** (Laravel): `APP_URL`, `DB_CONNECTION`/`DB_HOST`/`DB_PORT`/`DB_DATABASE`/`DB_USERNAME`/`DB_PASSWORD` (sqlite works for local dev; mysql for staging/prod), `SESSION_DOMAIN`, `SANCTUM_STATEFUL_DOMAINS`, `FRONTEND_URL`. Run `php artisan key:generate`.
- **`frontend/.env`** (Nuxt): `NUXT_PUBLIC_LARAVEL_URL` (e.g. `http://localhost:8000`), `NUXT_PUBLIC_SITE_URL` (`http://localhost:3000`), `NUXT_PUBLIC_WS_URL` (`ws://localhost:3001`).
Credentials never go in the repo. Staging/prod `.env` lives on the droplet; CI uses GitHub secrets.

## Conventions
- Vue 3 Composition API (`<script setup>`) — no Options API
- The Nuxt app lives under `frontend/`: components in `frontend/components/whiteboard/`, composables in `frontend/composables/`
- Each drawing tool is a composable in `frontend/composables/tools/` — not a Vue component
- Tailwind for UI styling, Konva for canvas rendering
- Touch support: pointer events with pressure sensitivity, two-finger pan
- Accessibility: full keyboard shortcuts, screen reader support, ARIA labels

## Drawing Tools

### Core Tools (pre-existing)
| Tool | Shortcut | File | Description |
|------|----------|------|-------------|
| Select | V | `useSelectTool.ts` | Click to select elements |
| Pan | H | `usePanTool.ts` | Click and drag to move the viewport |
| Pen | P | `usePenTool.ts` | Pressure-sensitive freehand drawing via `perfect-freehand`. Broadcasts stroke points in real-time for collaboration |
| Highlighter | B | `useHighlighterTool.ts` | Semi-transparent freehand drawing. Same real-time collaboration as pen |
| Line | L | `useLineTool.ts` | Click and drag to draw a straight line between two points. Respects ortho/polar constraints |
| Arrow | A | `useArrowTool.ts` | Line with an arrowhead at the end. Respects ortho/polar constraints |
| Rectangle | R | `useRectangleTool.ts` | Click and drag to define opposite corners. Minimum 5px threshold |
| Circle | C | `useCircleTool.ts` | Click to set center, drag to set radius. Minimum 5px radius threshold |
| Ellipse | E | `useEllipseTool.ts` | Click and drag to define bounding box. Calculates radiusX/radiusY from box dimensions |
| Eraser | X | `useEraserTool.ts` | Click or drag over elements to delete. Uses Konva hit detection |

### AutoCAD Tools (new)
| Tool | Shortcut | File | Description |
|------|----------|------|-------------|
| Polyline | PL | `usePolylineTool.ts` | Multi-segment connected lines. Click to place vertices, Enter to finish, Backspace to undo last vertex, 'c' to close back to start, double-click to finish. Creates a `PolylineElement` with `closed` property |
| Arc | ARC | `useArcTool.ts` | Three-point arc definition (AutoCAD-style). Click start point, click through-point (defines curve bulge), click end point. Escape to cancel |
| Revision Cloud | RC | `useRevisionCloudTool.ts` | Puffy cloud outline for circling revisions (AutoCAD `REVCLOUD`). Click to place vertices, Enter/double-click to close the loop (≥2 vertices), `c` to close, Backspace to undo a vertex, Escape to cancel. Creates a `RevisionCloudElement` rendered as connected outward-bulging arc lobes via `revisionCloudPath` geometry util |
| Offset | O | `useOffsetTool.ts` | Creates parallel copy at a specified distance. Click near element to set distance, click again to confirm offset side. Supports line, polyline, rectangle. Uses `parallelSegment` and `offsetPolyline` geometry utils |
| Mirror | MI | `useMirrorTool.ts` | Creates reflected copy across a user-defined axis. Click elements to select (toggle), Enter to confirm, then click two points to define mirror axis. Supports line, polyline, arrow, rectangle, circle, ellipse, arc. Preserves originals |
| Rotate | RO | `useRotateTool.ts` | Rotates copies around a base point. Click elements to select (toggle), Enter to confirm, click base point (pivot), move and click to set the rotation angle (the selection swings to follow the cursor). Uses `rotatePointAroundOrigin` + `transformElement`. A non-90° rotation of a rectangle becomes a closed polyline so geometry is preserved |
| Scale | SC | `useScaleTool.ts` | Scales copies from a base point. Click elements to select (toggle), Enter to confirm, click base point, move and click to set the factor. Factor = distance(base, cursor) / distance(base, centroid) — the centroid radius is the 1× reference. Uniform scale keeps rectangles/circles as their own type. Uses `scalePointFromOrigin` + `transformElement` |
| Trim | TR | `useTrimTool.ts` | Cuts element at intersection with a cutting edge. Click to select cutting edge, then click portion of another element to remove. Keeps side opposite to click. Uses `segmentSegmentIntersection` geometry. Works with line and polyline |
| Extend | EX | `useExtendTool.ts` | Lengthens element to meet a boundary. Click to select boundary, then click element to extend. Extends the end closer to click point. Uses `lineSegmentIntersection` geometry |
| Fillet | F | `useFilletTool.ts` | Rounds corner between two lines. Select two lines — calculates intersection, shortens both to tangent points, inserts fillet arc. Configurable radius via `calculateFillet` geometry util |
| Dimension | DIM | `useDimensionTool.ts` | Creates annotated measurement lines. Three clicks: start point, end point, offset position. Draws extension lines, dimension line with arrows, and measured distance text. Snaps to element points when OSNAP is on |
| Text Annotation | T | `useTextAnnotationTool.ts` | Places text with a leader line. Click to set leader endpoint, type text in dialog, confirm. Creates `TextAnnotationElement` with leader line geometry |
| Stamp | S | `useStampTool.ts` | Places pre-built annotation stamps. Click to drop. Four types: APPROVED (green), REVISED (amber), NOTE (blue), FOR REVIEW (red). Uses canvas text measurement for badge sizing |
| Measure Distance | M | `useMeasureDistanceTool.ts` | Click two points to measure distance. Shows dashed measurement line with value. Non-destructive — does not create a permanent element. Uses `ctx.findSnapPoint` for point snapping |
| Measure Area | Shift+M | `useMeasureAreaTool.ts` | Click on an existing shape to measure area. Supports rectangle, circle, ellipse. Changes cursor to pointer when hovering measurable shapes. Shows area value as overlay |

### Tool Context Interface
All tools receive a shared `ToolContext` object from `WhiteboardCanvas.vue`:
- `constrainPoint(origin, cursor)` — applies ortho → polar → grid-snap priority chain
- `findSnapPoint(pos, elements)` — returns nearest snap point when OSNAP is enabled
- `emitElementAdd(el)`, `emitElementUpdate(id, updates)`, `emitElementDelete(id)` — element lifecycle
- `startActiveStroke()`, `broadcastStrokePoint()`, `endActiveStroke()` — real-time collaboration for pen/highlighter
- `isDrawing`, `viewport`, `stageRef`, `currentPressure`, `currentPointerType` — canvas state
- `selectElementAtPosition()`, `setCursor()`, `clearCursor()` — interaction helpers

## CAD Mode Systems

### Ortho Mode (`useOrthoMode.ts`)
- Constrains drawing to horizontal or vertical only
- Snaps to whichever axis has the larger delta from origin to cursor
- Priority: ortho overrides polar tracking
- Toggle: toolbar button, F8 key, or `ORTHO` command
- Exposed from canvas: `orthoEnabled`, `toggleOrtho()`

### Polar Tracking (`usePolarTracking.ts`)
- Snaps to predefined angles: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
- 5° snap threshold — if cursor is within 5° of a tracked angle, snaps to it
- Shows guide line when snapped to indicate locked angle
- Preserves distance from origin along the snapped angle
- Toggle: toolbar button, F10 key, or `POLAR` command
- Exposed from canvas: `polarTracking.isPolarEnabled`, `polarTracking.toggle()`

### Object Snap / OSNAP (`useSnapping.ts`)
- Snaps cursor to geometric points on existing elements
- Snap types (priority order): endpoint > midpoint > center > corner > intersection > perpendicular > tangent > nearest
- Supported element types: line, rectangle, circle, ellipse, stroke, polyline, arc, fillet-arc, dimension
- 10px snap threshold, throttled at ~30fps for performance
- Toggle: toolbar button or `OSNAP` command
- Exposed from canvas: `snapEnabled`, `toggleSnap()`

### Grid (`useGrid.ts`)
- Dotted reference grid overlay on the canvas
- Spacing auto-adjusts based on zoom level to stay readable
- Optional grid-snap mode locks cursor to grid intersections
- Toggle grid: toolbar button or `GRID` command
- Toggle grid snap: `GRIDSNAP` command
- Exposed from canvas: `gridEnabled`, `gridSnapEnabled`, `toggleGrid()`, `toggleGridSnap()`

### Command Line (`useCommandEngine.ts`, `useCommandRegistry.ts`, `CommandLine.vue`)
- AutoCAD-style text command input at the bottom of the screen
- Registered commands: LINE, CIRCLE, RECTANGLE, ELLIPSE, ARROW, TEXT, PEN, POLYLINE, ARC, REVCLOUD, OFFSET, TRIM, EXTEND, FILLET, MIRROR, DIMENSION, SELECT, PAN, GRID, ORTHO, OSNAP, POLAR, UNDO, REDO, LAYER
- Supports aliases (e.g., `L` → LINE, `C` → CIRCLE, `OS` → OSNAP)
- Autocomplete suggestions as you type
- Command history navigation with up/down arrow keys
- Output area shows command responses and status messages

### Coordinate Display (`CoordinateDisplay.vue`)
- Bottom-left overlay showing real-time cursor coordinates
- Displays distance and angle while actively drawing
- Shows active mode indicators: ORTHO, POLAR
- Coordinates convert to real-world units when a scale is set (e.g., inches, feet)

### Layers (`useLayers.ts`, `LayerPanel.vue`, `LayerSelector.vue`)
- Full layer management with Yjs sync for real-time collaboration
- Default "Layer 0" created automatically
- Per-layer controls: visibility toggle, lock toggle, rename, reorder, color indicator
- 10-color palette for layer identification
- Active layer tracking — new elements placed on active layer
- Layer selector dropdown in toolbar + expandable layer panel
- Toggle via `LAYER` command (points to UI panel)

### Constraint Pipeline
Applied in priority order by `constrainPoint()` in `WhiteboardCanvas.vue`:
1. **Ortho** — locks to H/V if enabled (highest priority)
2. **Polar tracking** — snaps to nearest tracked angle if enabled
3. **Grid snap** — snaps to nearest grid intersection if enabled
4. **Free movement** — no constraint (default)

## Key Constraints
- Max file upload: 10MB
- Supported uploads: JPEG, PNG, WebP, PDF
- Recommended: <1000 canvas elements for best performance
- Requires WebSocket support in hosting environment
