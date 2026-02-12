<template>
  <div class="fixed top-4 right-4 z-50">
    <div class="bg-white rounded-lg shadow-lg p-3 max-w-xs">
      <!-- Header with user count -->
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-semibold text-neutral-900">In Session</h3>
        <span
          class="px-2 py-0.5 text-xs font-medium rounded-full bg-neutral-100 text-neutral-700"
        >
          {{ userCount }}
        </span>
      </div>

      <!-- User list -->
      <div class="space-y-2">
        <div
          v-for="user in allUsers"
          :key="user.id"
          class="flex items-center gap-2"
        >
          <!-- Color indicator -->
          <div
            class="w-3 h-3 rounded-full flex-shrink-0"
            :style="{ backgroundColor: user.color }"
          />

          <!-- User info -->
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-neutral-900 truncate">
              {{ user.name }}
            </p>
            <p class="text-xs text-neutral-500">
              {{ toolDisplay(user) }}
            </p>
          </div>

          <!-- Online status indicator -->
          <div
            class="w-2 h-2 rounded-full flex-shrink-0"
            :class="isActive(user) ? 'bg-green-500' : 'bg-gray-300'"
            :title="isActive(user) ? 'Active' : 'Idle'"
          />
        </div>

        <!-- Empty state -->
        <div v-if="allUsers.length === 0" class="text-xs text-neutral-400 text-center py-2">
          No users in session
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CursorState } from '~/composables/useCursors'

const props = defineProps<{
  users: Map<number, CursorState>  // remoteCursors from useCursors
  currentUser: {
    id: string
    name: string
    color: string
  }
}>()

// User list - filters users seen within 30 seconds
const userList = computed(() => {
  const now = Date.now()
  const thirtySecondsAgo = now - 30000

  return Array.from(props.users.values())
    .filter((cursorState) => {
      // Filter by lastSeen time if available
      // For Awareness API, we infer activity from cursor presence
      return cursorState.cursor !== undefined
    })
    .map((cursorState) => ({
      id: cursorState.user.id,
      name: cursorState.user.name,
      color: cursorState.user.color,
      tool: cursorState.tool,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

// Combine current user with remote users
const allUsers = computed(() => {
  return [
    {
      id: props.currentUser.id,
      name: props.currentUser.name,
      color: props.currentUser.color,
      tool: undefined, // Current user's tool tracked locally
    },
    ...userList.value.filter((u) => u.id !== props.currentUser.id),
  ]
})

// Total user count
const userCount = computed(() => allUsers.value.length)

// Active users (seen within 5 seconds)
const activeCount = computed(() => {
  // For Awareness API, consider all users with cursors as active
  return allUsers.value.filter((user) => user.tool !== undefined).length
})

// Check if user is active (has cursor/tool data)
function isActive(user: any): boolean {
  return user.tool !== undefined
}

// Display text for tool
function toolDisplay(user: any): string {
  if (!user.tool) return 'Viewing'

  const toolNames: Record<string, string> = {
    select: 'Selecting',
    pan: 'Panning',
    pen: 'Drawing',
    highlighter: 'Highlighting',
    line: 'Drawing Line',
    arrow: 'Drawing Arrow',
    rectangle: 'Drawing Rectangle',
    circle: 'Drawing Circle',
    ellipse: 'Drawing Ellipse',
    text: 'Adding Text',
    'text-annotation': 'Annotating',
    stamp: 'Stamping',
    eraser: 'Erasing',
    'measure-distance': 'Measuring Distance',
    'measure-area': 'Measuring Area',
  }

  return toolNames[user.tool] || 'Viewing'
}
</script>

<style scoped>
/* Smooth transitions for list updates */
.space-y-2 > * {
  transition: all 0.2s ease-out;
}
</style>
