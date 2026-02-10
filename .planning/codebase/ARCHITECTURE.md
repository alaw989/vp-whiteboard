# Architecture

**Analysis Date:** 2024-02-09

## Pattern Overview

**Overall:** Full-stack Nuxt 3 application with real-time collaboration capabilities

**Key Characteristics:**
- Client-server architecture with Nuxt 3 as the framework
- Real-time collaboration using Yjs and WebSocket
- Canvas-based rendering with Konva.js
- REST API with Supabase integration
- Progressive Web App with client-side fallbacks

## Layers

**Presentation Layer:**
- Purpose: User interface and interaction handling
- Location: `pages/`, `components/`
- Contains: Vue components, pages, and UI logic
- Depends on: Component composables, Konva.js for canvas rendering
- Used by: End users through browser

**Logic Layer:**
- Purpose: Business logic and state management
- Location: `composables/`
- Contains: Reusable Vue composables for canvas and collaboration
- Depends on: Yjs for real-time sync, TypeScript interfaces
- Used by: Presentation layer components

**Data Layer:**
- Purpose: Data persistence and external integrations
- Location: `server/api/`, `supabase/`
- Contains: API handlers, database operations
- Depends on: Supabase client, WebSocket server
- Used by: Logic layer

**Network Layer:**
- Purpose: Real-time communication and data synchronization
- Location: `server/websocket/`, `composables/useCollaborativeCanvas.ts`
- Contains: WebSocket handlers, Yjs synchronization
- Depends on: y-websocket, WebSocket protocol
- Used by: Logic layer for real-time updates

## Data Flow

**Whiteboard Creation Flow:**

1. User creates new whiteboard via UI
2. `/whiteboard/new` page sends POST request to `/api/whiteboard`
3. API handler creates whiteboard in Supabase
4. Redirects to `/whiteboard/[id]` with new whiteboard ID
5. Canvas initializes with empty state, saved to localStorage

**Real-time Collaboration Flow:**

1. User connects to WebSocket via `useCollaborativeCanvas` composable
2. Y.js document synchronizes canvas elements across clients
3. Drawing events update Y.js array
4. Changes broadcast to all connected clients
5. Canvas renders updates via reactive Vue components

**Persistence Flow:**

1. Canvas state exported every 30 seconds
2. PATCH request to `/api/whiteboard/[id]` with canvas state
3. Supabase updates whiteboard record
4. Fallback to localStorage if Supabase unavailable

## Key Abstractions

**CanvasElement:**
- Purpose: Represents a single element on the whiteboard
- Examples: `[types/index.ts:38-45]`
- Pattern: Type union with discriminated union for different element types

**UserPresence:**
- Purpose: Tracks connected users and their cursors
- Examples: `[types/index.ts:116-123]`
- Pattern: Reactive map with timestamp-based cleanup

**ApiResponse:**
- Purpose: Standardized API response format
- Examples: `[types/index.ts:134-138]`
- Pattern: Generic type wrapper with success/error fields

## Entry Points

**Web Application:**
- Location: `[app.vue:1-7]`
- Triggers: Direct URL access or navigation
- Responsibilities: Global app setup and routing

**Whiteboard Page:**
- Location: `[pages/whiteboard/[id].vue:1-361]`
- Triggers: User navigates to specific whiteboard
- Responsibilities: Canvas rendering, tool handling, real-time collaboration

**API Routes:**
- Location: `[server/api/whiteboard/](server/api/whiteboard/)`
- Triggers: HTTP requests from client
- Responsibilities: CRUD operations for whiteboards

**WebSocket Connection:**
- Location: `[server/websocket/[...].ts]`, `[composables/useCollaborativeCanvas.ts:17-32]`
- Triggers: Client connects to WebSocket
- Responsibilities: Real-time data synchronization

## Error Handling

**Strategy:** Graceful degradation with fallbacks

**Patterns:**
- Mock data when Supabase unavailable
- Local storage persistence when WebSocket disconnected
- User-friendly error messages for API failures
- Try-catch blocks around async operations

## Cross-Cutting Concerns

**Logging:** Console logging with context information
**Validation:** TypeScript interfaces for data shapes
**Authentication:** Guest-based with simple user ID generation
**Performance:** Debounced save operations, efficient canvas rendering

---

*Architecture analysis: 2024-02-09*