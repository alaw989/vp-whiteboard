<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 -translate-x-4"
    enter-to-class="opacity-100 translate-x-0"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100 translate-x-0"
    leave-to-class="opacity-0 -translate-x-4"
  >
    <div
      v-if="show"
      class="w-56 bg-white border-r border-neutral-200 flex flex-col flex-shrink-0 z-10"
    >
      <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-200">
        <h3 class="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Layers</h3>
        <button
          class="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
          title="Close layer panel"
          @click="$emit('close')"
        >
          <Icon name="mdi:close" class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <div
          v-for="layer in sortedLayers"
          :key="layer.id"
          class="flex items-center gap-2 px-2 py-1.5 border-b border-neutral-50 group cursor-pointer"
          :class="{
            'bg-blue-50': layer.id === activeLayerId,
            'opacity-50': !layer.visible,
          }"
          @click="$emit('set-active', layer.id)"
        >
          <!-- Visibility toggle -->
          <button
            class="p-0.5 rounded hover:bg-neutral-200 transition-colors flex-shrink-0"
            :title="layer.visible ? 'Hide layer' : 'Show layer'"
            @click.stop="$emit('toggle-visibility', layer.id)"
          >
            <Icon
              :name="layer.visible ? 'mdi:eye' : 'mdi:eye-off'"
              class="w-3.5 h-3.5"
              :class="layer.visible ? 'text-neutral-500' : 'text-neutral-300'"
            />
          </button>

          <!-- Color swatch -->
          <label class="relative flex-shrink-0 cursor-pointer" :title="'Layer color'">
            <span
              class="block w-4 h-4 rounded-sm border border-neutral-300"
              :style="{ backgroundColor: layer.color }"
            />
            <input
              type="color"
              :value="layer.color"
              class="absolute inset-0 opacity-0 w-0 h-0 cursor-pointer"
              @input.stop="$emit('set-color', layer.id, ($event.target as HTMLInputElement).value)"
              @click.stop
            />
          </label>

          <!-- Layer name -->
          <div v-if="editingId === layer.id" class="flex-1 min-w-0">
            <input
              ref="nameInput"
              :value="layer.name"
              class="w-full text-xs bg-white border border-blue-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              @keydown.enter="commitRename(layer.id, ($event.target as HTMLInputElement).value)"
              @keydown.escape="editingId = null"
              @blur="commitRename(layer.id, ($event.target as HTMLInputElement).value)"
              @click.stop
            />
          </div>
          <span
            v-else
            class="text-xs text-neutral-700 truncate flex-1 min-w-0"
            @dblclick.stop="startRename(layer.id, layer.name)"
          >
            {{ layer.name }}
          </span>

          <!-- Lock toggle -->
          <button
            class="p-0.5 rounded hover:bg-neutral-200 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
            :class="{ '!opacity-100': layer.locked }"
            :title="layer.locked ? 'Unlock layer' : 'Lock layer'"
            @click.stop="$emit('toggle-lock', layer.id)"
          >
            <Icon
              :name="layer.locked ? 'mdi:lock' : 'mdi:lock-open-outline'"
              class="w-3.5 h-3.5"
              :class="layer.locked ? 'text-amber-500' : 'text-neutral-400'"
            />
          </button>

          <!-- Delete (not for default layer) -->
          <button
            v-if="layer.id !== 'default'"
            class="p-0.5 rounded hover:bg-red-100 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
            title="Delete layer"
            @click.stop="$emit('remove', layer.id)"
          >
            <Icon name="mdi:close" class="w-3 h-3 text-neutral-400 hover:text-red-500" />
          </button>
        </div>
      </div>

      <!-- Add layer button -->
      <div class="border-t border-neutral-200 px-2 py-2">
        <button
          class="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
          @click="$emit('add')"
        >
          <Icon name="mdi:plus" class="w-3.5 h-3.5" />
          Add Layer
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { LayerDefinition } from '~/types'

const props = defineProps<{
  show: boolean
  layers: LayerDefinition[]
  activeLayerId: string
}>()

const emit = defineEmits<{
  close: []
  'set-active': [layerId: string]
  'toggle-visibility': [layerId: string]
  'toggle-lock': [layerId: string]
  'set-color': [layerId: string, color: string]
  remove: [layerId: string]
  add: []
  rename: [layerId: string, name: string]
}>()

const sortedLayers = computed(() =>
  [...props.layers].sort((a, b) => a.order - b.order)
)

const editingId = ref<string | null>(null)
const nameInput = ref<HTMLInputElement[] | null>(null)

function startRename(layerId: string, _currentName: string) {
  editingId.value = layerId
  nextTick(() => {
    if (nameInput.value?.[0]) {
      nameInput.value[0].focus()
      nameInput.value[0].select()
    }
  })
}

function commitRename(layerId: string, name: string) {
  if (editingId.value === layerId && name.trim()) {
    emit('rename', layerId, name.trim())
  }
  editingId.value = null
}
</script>
