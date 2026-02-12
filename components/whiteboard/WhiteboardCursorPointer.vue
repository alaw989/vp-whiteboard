<template>
  <ClientOnly>
    <div
      v-if="presence?.cursor"
      class="cursor-pointer-container"
      :style="cursorStyle"
    >
      <!-- Triangle pointer -->
      <div class="cursor-pointer" :style="pointerStyle" />

      <!-- Name label -->
      <div class="cursor-label" :style="labelStyle">
        {{ presence.name || 'Guest' }}
      </div>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import type { UserPresence } from '~/types'

const props = defineProps<{
  presence: UserPresence
}>()

// Position style - using raw canvas coordinates
const cursorStyle = computed(() => ({
  position: 'absolute' as const,
  left: `${props.presence.cursor?.x || 0}px`,
  top: `${props.presence.cursor?.y || 0}px`,
  zIndex: 1000,
  pointerEvents: 'none' as const, // Don't interfere with canvas clicks
  transition: 'left 0.1s ease-out, top 0.1s ease-out',
}))

// Pointer triangle style
const pointerStyle = computed(() => ({
  width: '0',
  height: '0',
  borderLeft: '6px solid transparent',
  borderRight: '6px solid transparent',
  borderTop: `12px solid ${props.presence.color || '#3B82F6'}`,
  transform: 'rotate(-45deg)',
}))

// Label style with user color background
const labelStyle = computed(() => ({
  backgroundColor: props.presence.color || '#3B82F6',
  color: '#FFFFFF',
  padding: '2px 6px',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: '500',
  whiteSpace: 'nowrap' as const,
  marginLeft: '8px',
  marginTop: '-4px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
}))
</script>

<style scoped>
.cursor-pointer-container {
  position: absolute;
  pointer-events: none;
}

.cursor-pointer {
  position: absolute;
  top: 0;
  left: 0;
}

.cursor-label {
  position: absolute;
  top: 0;
  left: 0;
}
</style>
