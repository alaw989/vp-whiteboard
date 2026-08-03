<template>
  <div
    class="scale-badge fixed bottom-4 left-4 md:bottom-[88px] z-30 bg-chrome/90 backdrop-blur-sm text-chrome-fg px-3 py-1.5 rounded-md shadow-lg text-xs font-mono cursor-pointer hover:bg-neutral-800/90 transition-colors select-none"
    :title="currentScale ? 'Click to change scale' : 'Click to set scale'"
    @click="$emit('open-scale-dialog')"
  >
    <div class="flex items-center gap-2">
      <Icon name="mdi:ruler" class="w-4 h-4 text-chrome-fg-muted" />
      <span>{{ displayFormat }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  displayFormat: string
  currentScale: { label: string } | null
}>()

defineEmits<{
  'open-scale-dialog': []
}>()
</script>

<style scoped>
.scale-badge {
  font-family: 'Courier New', monospace;
}
</style>
