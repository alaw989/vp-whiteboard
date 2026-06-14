<template>
  <div class="relative" ref="containerEl">
    <button
      class="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium hover:bg-neutral-100 transition-colors w-full"
      :title="`Active layer: ${activeLayer?.name || 'Layer 0'}`"
      @click="open = !open"
    >
      <span
        class="w-3 h-3 rounded-sm flex-shrink-0 border border-neutral-300"
        :style="{ backgroundColor: activeLayer?.color || '#3B82F6' }"
      />
      <span class="truncate text-neutral-700">{{ activeLayer?.name || 'Layer 0' }}</span>
      <Icon name="mdi:chevron-down" class="w-3.5 h-3.5 text-neutral-400 ml-auto flex-shrink-0" />
    </button>

    <div
      v-if="open"
      class="absolute left-0 bottom-full mb-1 bg-white rounded-lg shadow-lg border border-neutral-200 z-50 min-w-[160px] max-h-48 overflow-y-auto"
    >
      <div class="px-2 py-1.5 text-[10px] font-semibold text-neutral-400 uppercase tracking-wide border-b border-neutral-100">
        Layers
      </div>
      <button
        v-for="layer in sortedLayers"
        :key="layer.id"
        class="w-full px-2 py-1.5 text-left hover:bg-neutral-50 flex items-center gap-2 text-xs"
        :class="{ 'bg-blue-50 text-blue-700': layer.id === modelValue }"
        @click="selectLayer(layer.id)"
      >
        <span
          class="w-2.5 h-2.5 rounded-sm flex-shrink-0"
          :style="{ backgroundColor: layer.color }"
        />
        <span class="truncate">{{ layer.name }}</span>
        <Icon v-if="!layer.visible" name="mdi:eye-off" class="w-3 h-3 text-neutral-400 ml-auto flex-shrink-0" />
        <Icon v-if="layer.locked" name="mdi:lock" class="w-3 h-3 text-neutral-400 flex-shrink-0" />
      </button>
      <div class="border-t border-neutral-100">
        <button
          class="w-full px-2 py-1.5 text-left text-xs text-blue-600 hover:bg-blue-50 flex items-center gap-1.5"
          @click="$emit('add-layer')"
        >
          <Icon name="mdi:plus" class="w-3 h-3" />
          Add Layer
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LayerDefinition } from '~/types'

const props = defineProps<{
  modelValue: string
  layers: LayerDefinition[]
}>()

const emit = defineEmits<{
  'update:modelValue': [layerId: string]
  'add-layer': []
}>()

const open = ref(false)
const containerEl = ref<HTMLElement | null>(null)

const sortedLayers = computed(() =>
  [...props.layers].sort((a, b) => a.order - b.order)
)

const activeLayer = computed(() =>
  props.layers.find(l => l.id === props.modelValue)
)

function selectLayer(id: string) {
  emit('update:modelValue', id)
  open.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (containerEl.value && !containerEl.value.contains(e.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>
