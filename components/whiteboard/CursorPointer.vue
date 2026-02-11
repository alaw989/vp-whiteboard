<template>
  <div
    v-if="presence && presence.cursor"
    class="pointer-events-none fixed z-50 transition-all duration-75 ease-out"
    :style="{
      left: `${presence.cursor.x}px`,
      top: `${presence.cursor.y}px`,
    }"
  >
    <!-- Cursor icon -->
    <svg
      :style="{ color: presence.color }"
      class="absolute -top-4 -left-2 w-5 h-5 drop-shadow-md"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M5.5 3.21l13.76 9.9L13 14.2l-3.5 6.6-1-1 3-6.3L5.5 3.21z" />
    </svg>

    <!-- User name tag -->
    <div
      class="absolute left-3 top-1 px-2 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap"
      :style="{ backgroundColor: presence.color }"
    >
      {{ presence.name }}
      <span v-if="presence.tool && presence.tool !== 'select'" class="ml-1 opacity-75">
        • {{ toolName(presence.tool) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserPresence } from '~/types'

const props = defineProps<{
  presence: UserPresence | null
}>()

function toolName(tool: string): string {
  const names: Record<string, string> = {
    pen: '✏️',
    highlighter: '🖍️',
    line: '📏',
    rectangle: '⬜',
    circle: '⭕',
    text: '📝',
    eraser: '🧹',
  }
  return names[tool] || tool
}
</script>
