# Coding Conventions

**Analysis Date:** 2026-02-09

## Naming Patterns

**Files:**
- kebab-case for directories: `components/whiteboard/`
- PascalCase for component files: `WhiteboardCanvas.vue`
- snake_case for TypeScript files: `use_drawing_tools.ts`
- path-based routing for API files: `server/api/whiteboard/[id].get.ts`
- dot-notation for HTTP methods: `index.get.ts`, `post.ts`

**Functions:**
- camelCase for methods: `handleMouseDown`, `exportAsImage`
- PascalCase for composables: `useDrawingTools`
- kebab-case for props: `whiteboard-id`, `user-name` (in template)
- camelCase for reactive variables: `isDrawing`, `currentStroke`

**Variables:**
- camelCase for local variables: `stageConfig`, `viewport`
- const/let based on mutability
- ref() for reactive state
- computed() for derived state

**Types:**
- PascalCase for interfaces: `Whiteboard`, `CanvasElement`
- kebab-case for unions: `DrawingTool`
- camelCase for method parameters: `x`, `y`, `color`
- snake_case for constants: `COLORS`, `TOOL_SIZES`

## Code Style

**Formatting:**
- Uses Nuxt's default formatting
- 2-space indentation
- Semicolons at the end of statements
- Single quotes for strings
- Trailing commas in multi-line objects/arrays

**TypeScript:**
- Strict mode enabled
- Explicit typing for props and emits
- Interface types for complex objects
- Generic types for API responses (`ApiResponse<T>`)

**Vue Component Structure:**
```vue
<template>
  <!-- Template with proper spacing -->
</template>

<script setup lang="ts">
import type { InterfaceName } from '~/types'

// Props and emits with TypeScript
const props = defineProps<{
  whiteboardId: string
  userId: string
}>()

const emit = defineEmits<{
  'element-add': [element: CanvasElement]
}>()

// Reactive state
const state = ref({ ... })

// Methods
function handleEvent() { ... }

// Computed properties
const computedValue = computed(() => { ... })
</script>

<style scoped>
/* Component-specific styles */
</style>
```

## Import Organization

**Order:**
1. Built-ins: `import { ref, computed, onMounted } from 'vue'`
2. External libraries: `import type { CanvasElement } from '~/types'`
3. Local imports: `import { useDrawingTools } from '~/composables/useDrawingTools'`
4. Nuxt-specific: `export default defineEventHandler(...)`

**Path Aliases:**
- `~/` for project root: `~/types`, `~/composables`
- `@/` for components: `~/components/whiteboard/WhiteboardCanvas.vue`
- `#imports` for Nuxt auto-imports

## Error Handling

**API Responses:**
```typescript
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// Usage
try {
  const { data, error } = await supabase.from('whiteboards').select('*')
  if (error) throw error
  return { success: true, data }
} catch (error) {
  return { success: false, error: error.message }
}
```

**Nuxt Error Handling:**
```typescript
// API routes
throw createError({
  statusCode: 400,
  message: 'Validation failed'
})

// Components
if (!stageRef.value) {
  console.error('Stage reference not found')
  return null
}
```

**Network Errors:**
- Graceful fallback for missing Supabase config
- Mock data for development when services unavailable

## Logging

**Framework:** Console logging

**Patterns:**
```typescript
// Debug information
console.log('Initializing stage with config:', stageConfig.value)

// Error logging with context
console.error('Failed to export canvas:', error)

// User action logging
console.log(`User changed tool to: ${props.currentTool}`)
```

## Comments

**When to Comment:**
- Complex algorithm explanations (e.g., `strokeToSvgPath`)
- Business logic decisions
- TODO items for future improvements
- API integration points

**Code Comments:**
```typescript
// Get stage position from mouse/touch event
function getPointerPos(event: any) {
  // Transform coordinates based on viewport
  const transform = stage.getAbsoluteTransform().copy()
  transform.invert()
  // ...
}

// Render stroke to SVG path using perfect-freehand
// Converts stroke points to smooth SVG path
function strokeToSvgPath(stroke: StrokeElement): string {
  // ...
}
```

## Function Design

**Size:**
- Small, focused functions (typically < 50 lines)
- Single responsibility principle
- Extracted logic into composables when reusable

**Parameters:**
- Prefer objects for multiple parameters
- Optional parameters with defaults
- Type-safe with TypeScript

**Return Values:**
- Explicit return types
- null for error cases where appropriate
- Objects for multiple return values

## Module Design

**Exports:**
- Composables return objects with named exports
- Default exports for components
- Named exports for utilities

**Barrel Files:**
- No barrel files detected
- Direct imports used

**Type Exports:**
- Centralized in `~/types/index.ts`
- Organized by feature area

## Vue Specific Patterns

**Composition API:**
- `<script setup>` syntax exclusively
- `defineProps` and `defineEmits` with TypeScript
- Composables for shared logic

**Reactivity:**
- `ref()` for primitive reactive values
- `computed()` for derived state
- `watch()` for side effects

**Template Best Practices:**
- Semantic HTML5 elements
- Key directives for list rendering
- Proper event handling with modifiers

---

*Convention analysis: 2026-02-09*