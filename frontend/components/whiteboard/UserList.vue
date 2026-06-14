<template>
  <div class="user-list bg-white rounded-lg shadow-sm border border-neutral-200 p-3">
    <h3 class="text-sm font-semibold text-neutral-700 mb-2 flex items-center gap-2">
      <Icon name="mdi:account-group" class="w-4 h-4" />
      Online ({{ users.size }})
    </h3>

    <div class="space-y-1.5">
      <div
        v-for="[id, user] in users"
        :key="id"
        class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-neutral-50"
      >
        <!-- User color indicator -->
        <div
          class="w-2.5 h-2.5 rounded-full"
          :style="{ backgroundColor: user.color }"
        />

        <!-- User name -->
        <span class="text-sm text-neutral-700 truncate">{{ user.name }}</span>

        <!-- Current tool indicator -->
        <span v-if="user.tool" class="ml-auto text-xs text-neutral-400">
          {{ getToolIcon(user.tool) }}
        </span>
      </div>

      <div v-if="users.size === 0" class="text-sm text-neutral-400 text-center py-2">
        No other users online
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserPresence } from '~/types'

const props = defineProps<{
  users: Map<string, UserPresence>
}>()

function getToolIcon(tool: string): string {
  const icons: Record<string, string> = {
    select: '👆',
    pan: '✋',
    pen: '✏️',
    highlighter: '🖍️',
    line: '📏',
    rectangle: '⬜',
    circle: '⭕',
    text: '📝',
    eraser: '🧹',
  }
  return icons[tool] || ''
}
</script>
