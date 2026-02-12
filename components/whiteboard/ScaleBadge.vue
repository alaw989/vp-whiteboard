<template>
  <div
    class="scale-badge fixed bottom-4 left-4 z-30 bg-slate-800/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-md shadow-lg text-xs font-mono cursor-pointer hover:bg-slate-700/90 transition-colors select-none"
    :title="currentScale ? 'Click to change scale' : 'Click to set scale'"
    @click="$emit('open-scale-dialog')"
  >
    <div class="flex items-center gap-2">
      <Icon name="mdi:ruler" class="w-4 h-4 text-slate-400" />
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
