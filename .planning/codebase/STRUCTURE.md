# Codebase Structure

**Analysis Date:** 2024-02-09

## Directory Layout

```
vp-whiteboard/
├── app.vue                    # Root application component
├── components/                # Vue components
│   └── whiteboard/           # Whiteboard-specific components
├── composables/              # Reusable Vue composables
├── pages/                   # Nuxt page routes
├── server/                  # Server-side code
│   ├── api/                # API route handlers
│   └── websocket/          # WebSocket handlers
├── plugins/                # Nuxt plugins
├── types/                  # TypeScript type definitions
├── assets/                 # Static assets
│   └── css/               # Stylesheets
├── .nuxt/                  # Nuxt generated files
├── .output/               # Build output
└── .planning/codebase/    # Planning documents
```

## Directory Purposes

**`pages/`:**
- Purpose: Nuxt page routes and page components
- Contains: Home, whiteboard views, and page-specific logic
- Key files:
  - `pages/index.vue`: Main listing page for whiteboards
  - `pages/whiteboard/[id].vue`: Individual whiteboard editor
  - `pages/new.vue`: Whiteboard creation page

**`components/`:**
- Purpose: Reusable Vue components
- Contains: Canvas, toolbar, and UI components
- Key files:
  - `components/whiteboard/WhiteboardCanvas.vue`: Main canvas rendering
  - `components/whiteboard/WhiteboardToolbar.vue`: Drawing tools
  - `components/whiteboard/UserList.vue`: Connected users display

**`server/`:**
- Purpose: Backend API and WebSocket handlers
- Contains: Serverless route handlers for data operations
- Key files:
  - `server/api/whiteboard/`: CRUD operations for whiteboards
  - `server/websocket/[...].ts`: WebSocket connection handler

**`composables/`:**
- Purpose: Reusable Vue composition functions
- Contains: Core business logic and state management
- Key files:
  - `composables/useCollaborativeCanvas.ts`: Real-time collaboration logic

**`types/`:**
- Purpose: TypeScript type definitions
- Contains: Application data structures and interfaces
- Key files:
  - `types/index.ts`: Complete type definitions for the application

## Key File Locations

**Entry Points:**
- `[app.vue]`: Application root and router outlet
- `[pages/index.vue]`: Home page with whiteboard listing
- `[pages/whiteboard/[id].vue]`: Main whiteboard editor

**Configuration:**
- `[nuxt.config.ts]`: Nuxt framework configuration
- `[package.json]`: Project dependencies and scripts

**Core Logic:**
- `[composables/useCollaborativeCanvas.ts]`: Collaboration state management
- `[components/whiteboard/WhiteboardCanvas.vue]`: Canvas rendering engine
- `[types/index.ts]`: Type definitions

**API Layer:**
- `[server/api/whiteboard/index.get.ts]`: List whiteboards
- `[server/api/whiteboard/post.ts]`: Create new whiteboard
- `[server/api/whiteboard/[id].patch.ts]`: Update whiteboard state

## Naming Conventions

**Files:**
- PascalCase for components: `WhiteboardCanvas.vue`
- kebab-case for pages: `whiteboard/[id].vue`
- camelCase for composables: `useCollaborativeCanvas.ts`
- snake_case for API files: `[id].patch.ts`

**Functions:**
- camelCase for methods: `updateCursor`, `addElement`
- PascalCase for type names: `CanvasElement`, `UserPresence`

**Variables:**
- camelCase for Reactives: `currentTool`, `isConnected`
- PascalCase for computed refs: `canUndo`, `canRedo`

## Where to Add New Code

**New Drawing Tool:**
- Primary code: `components/whiteboard/WhiteboardToolbar.vue`
- Canvas logic: `components/whiteboard/WhiteboardCanvas.vue`
- Type definitions: `types/index.ts`
- Tests: Create corresponding test files

**New API Endpoint:**
- Handler: `server/api/[new-endpoint].ts`
- Types: Update `types/index.ts`
- Client usage: Add to corresponding page or composable

**New Component:**
- Implementation: `components/[category]/[ComponentName].vue`
- Registration: Auto-registered in Nuxt 3
- Types: Update `types/index.ts` if needed

**Utilities:**
- Shared helpers: Create new directory `utils/`
- Composable logic: Add to existing `composables/`

## Special Directories

**`.nuxt/`:**
- Purpose: Nuxt generated files
- Generated: Yes
- Committed: No (in .gitignore)

**`.output/`:**
- Purpose: Build output for production
- Generated: Yes
- Committed: No (in .gitignore)

**`server/websocket/`:**
- Purpose: WebSocket server implementation
- Generated: No
- Committed: Yes
- Note: Currently uses y-websocket package

---

*Structure analysis: 2024-02-09*