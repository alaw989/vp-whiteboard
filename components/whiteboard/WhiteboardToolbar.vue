<template>
  <div class="toolbar flex flex-col gap-2 p-2 bg-white rounded-lg shadow-sm border border-neutral-200">
    <!-- Drawing Tools -->
    <div class="flex flex-col gap-1">
      <h4 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide px-1">Tools</h4>

      <button
        v-for="tool in tools"
        :key="tool.id"
        :title="tool.name"
        :class="[
          'p-2 rounded-lg transition-colors',
          currentTool === tool.id
            ? 'bg-blue-100 text-blue-600'
            : 'hover:bg-neutral-100 text-neutral-600'
        ]"
        @click="$emit('select-tool', tool.id)"
      >
        <Icon :name="tool.icon" class="w-5 h-5" />
      </button>
    </div>

    <!-- Divider -->
    <div class="h-px bg-neutral-200" />

    <!-- Color Picker -->
    <div class="flex flex-col gap-1">
      <h4 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide px-1">Color</h4>

      <div class="grid grid-cols-3 gap-1">
        <button
          v-for="color in colors"
          :key="color"
          :title="color"
          :class="[
            'w-7 h-7 rounded-md transition-transform hover:scale-110',
            currentColor === color ? 'ring-2 ring-offset-1 ring-neutral-400' : ''
          ]"
          :style="{ backgroundColor: color }"
          @click="$emit('select-color', color)"
        />
      </div>

      <!-- Custom color input -->
      <input
        type="color"
        :value="currentColor"
        class="w-full h-7 rounded cursor-pointer"
        @input="$emit('select-color', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- Divider -->
    <div class="h-px bg-neutral-200" />

    <!-- Size Picker -->
    <div class="flex flex-col gap-1">
      <h4 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide px-1">Size</h4>

      <div class="flex flex-col gap-1">
        <button
          v-for="size in sizes"
          :key="size"
          :class="[
            'flex items-center gap-2 px-2 py-1 rounded-md transition-colors',
            currentSize === size
              ? 'bg-blue-100 text-blue-600'
              : 'hover:bg-neutral-100 text-neutral-600'
          ]"
          @click="$emit('select-size', size)"
        >
          <div
            class="rounded-full bg-neutral-800"
            :style="{ width: `${size}px`, height: `${size}px` }"
          />
          <span class="text-xs">{{ size }}px</span>
        </button>
      </div>
    </div>

    <!-- Divider -->
    <div class="h-px bg-neutral-200" />

    <!-- Actions -->
    <div class="flex flex-col gap-1">
      <h4 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide px-1">Actions</h4>

      <button
        :disabled="!canUndo"
        :class="[
          'p-2 rounded-lg transition-colors flex items-center justify-center',
          canUndo
            ? 'hover:bg-neutral-100 text-neutral-600'
            : 'opacity-40 cursor-not-allowed text-neutral-400'
        ]"
        title="Undo (Ctrl+Z)"
        @click="$emit('undo')"
      >
        <Icon name="mdi:undo" class="w-5 h-5" />
      </button>

      <button
        :disabled="!canRedo"
        :class="[
          'p-2 rounded-lg transition-colors flex items-center justify-center',
          canRedo
            ? 'hover:bg-neutral-100 text-neutral-600'
            : 'opacity-40 cursor-not-allowed text-neutral-400'
        ]"
        title="Redo (Ctrl+Y)"
        @click="$emit('redo')"
      >
        <Icon name="mdi:redo" class="w-5 h-5" />
      </button>

      <button
        class="p-2 rounded-lg hover:bg-neutral-100 text-neutral-600 transition-colors"
        title="Clear Canvas"
        @click="$emit('clear')"
      >
        <Icon name="mdi:delete-sweep" class="w-5 h-5" />
      </button>
    </div>

    <!-- Divider -->
    <div class="h-px bg-neutral-200" />

    <!-- Export -->
    <div class="flex flex-col gap-1">
      <h4 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide px-1">Export</h4>

      <button
        class="p-2 rounded-lg hover:bg-neutral-100 text-neutral-600 transition-colors"
        title="Export as PNG"
        @click="$emit('export', 'png')"
      >
        <Icon name="mdi:download" class="w-5 h-5" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DrawingTool } from '~/types'

defineProps<{
  currentTool: DrawingTool
  currentColor: string
  currentSize: number
  canUndo: boolean
  canRedo: boolean
}>()

defineEmits<{
  'select-tool': [tool: DrawingTool]
  'select-color': [color: string]
  'select-size': [size: number]
  'undo': []
  'redo': []
  'clear': []
  'export': [format: 'png' | 'pdf']
}>()

const tools = [
  { id: 'select' as DrawingTool, name: 'Select', icon: 'mdi:cursor-default' },
  { id: 'pan' as DrawingTool, name: 'Pan', icon: 'mdi:pan' },
  { id: 'pen' as DrawingTool, name: 'Pen', icon: 'mdi:pencil' },
  { id: 'highlighter' as DrawingTool, name: 'Highlighter', icon: 'mdi:marker' },
  { id: 'line' as DrawingTool, name: 'Line', icon: 'mdi:vector-line' },
  { id: 'text-annotation' as DrawingTool, name: 'Text Annotation', icon: 'mdi:comment-text-outline' },
  { id: 'rectangle' as DrawingTool, name: 'Rectangle', icon: 'mdi:rectangle-outline' },
  { id: 'circle' as DrawingTool, name: 'Circle', icon: 'mdi:circle-outline' },
  { id: 'eraser' as DrawingTool, name: 'Eraser', icon: 'mdi:eraser' },
] as const

const colors = [
  '#000000', // Black
  '#374151', // Gray 700
  '#EF4444', // Red 500
  '#F59E0B', // Amber 500
  '#10B981', // Emerald 500
  '#3B82F6', // Blue 500
  '#8B5CF6', // Violet 500
  '#EC4899', // Pink 500
] as const

const sizes = [2, 4, 8, 16, 24] as const
</script>
