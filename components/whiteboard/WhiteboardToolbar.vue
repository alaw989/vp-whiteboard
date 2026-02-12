<template>
  <div class="toolbar flex flex-col gap-2 p-2 bg-white rounded-lg shadow-sm border border-neutral-200 overflow-y-auto">
    <!-- Drawing Tools -->
    <div class="flex flex-col gap-1">
      <h4 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide px-1">Tools</h4>

      <!-- Stamp tool with dropdown -->
      <div class="relative">
        <button
          :class="[
            'tool-btn w-full p-2 rounded-lg transition-colors flex items-center justify-center',
            currentTool === 'stamp'
              ? 'bg-blue-100 text-blue-600'
              : 'hover:bg-neutral-100 text-neutral-600'
          ]"
          @click="handleStampClick"
          title="Stamp (S)"
        >
          <Icon name="mdi:stamp" class="w-5 h-5" />
        </button>

        <!-- Stamp type dropdown menu -->
        <div
          v-if="showStampMenu"
          class="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50 min-w-[140px]"
        >
          <button
            v-for="stampType in stampTypes"
            :key="stampType"
            class="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
            :class="{ 'bg-blue-50': currentStampType === stampType }"
            @click="selectStampType(stampType)"
          >
            <span
              class="w-3 h-3 rounded-full flex-shrink-0"
              :style="{ backgroundColor: getStampColor(stampType) }"
            />
            <span class="text-sm font-medium">{{ stampType }}</span>
          </button>
        </div>
      </div>

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
        :disabled="isExporting"
        :class="[
          'p-2 rounded-lg transition-colors',
          isExporting ? 'animate-pulse bg-blue-100 text-blue-600' : 'hover:bg-neutral-100 text-neutral-600'
        ]"
        :title="isExporting ? `Exporting ${exportProgress}%` : 'Export canvas'"
        @click="$emit('open-export')"
      >
        <Icon :name="isExporting ? 'mdi:loading' : 'mdi:download'" class="w-5 h-5" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DrawingTool } from '~/types'
import type { StampType } from '~/components/whiteboard/WhiteboardCanvas.vue'
import { COLORS, TOOL_SIZES } from '~/types'

const props = defineProps<{
  currentTool: DrawingTool
  currentColor: string
  currentSize: number
  canUndo: boolean
  canRedo: boolean
  isExporting?: boolean
  exportProgress?: number
}>()

const emit = defineEmits<{
  'select-tool': [tool: DrawingTool]
  'select-color': [color: string]
  'select-size': [size: number]
  'undo': []
  'redo': []
  'clear': []
  'open-export': []
  'stamp-type-change': [stampType: StampType]
}>()

// Stamp tool state
const stampTypes = ['APPROVED', 'REVISED', 'NOTE', 'FOR REVIEW'] as const
const currentStampType = ref<StampType>('APPROVED')
const showStampMenu = ref(false)

// Handle stamp button click - toggle menu or switch to stamp tool
function handleStampClick() {
  if (currentTool.value === 'stamp') {
    showStampMenu.value = !showStampMenu.value
  } else {
    emit('select-tool', 'stamp')
    showStampMenu.value = true
  }
}

// Get current tool as ref
const currentTool = computed(() => props.currentTool)

// Select stamp type and emit change
function selectStampType(stampType: StampType) {
  currentStampType.value = stampType
  showStampMenu.value = false
  emit('stamp-type-change', stampType)
  // Automatically switch to stamp tool
  emit('select-tool', 'stamp')
}

// Get stamp color for display
function getStampColor(stampType: string): string {
  const colors = {
    'APPROVED': '#10B981',
    'REVISED': '#F59E0B',
    'NOTE': '#3B82F6',
    'FOR REVIEW': '#EF4444',
  }
  return colors[stampType as keyof typeof colors] || '#000000'
}

// Close dropdown when clicking outside
onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
})

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.relative')) {
    showStampMenu.value = false
  }
}

const tools = [
  { id: 'select' as DrawingTool, name: 'Select (V)', icon: 'mdi:cursor-default' },
  { id: 'pan' as DrawingTool, name: 'Pan (H)', icon: 'mdi:pan' },
  { id: 'pen' as DrawingTool, name: 'Pen', icon: 'mdi:pencil' },
  { id: 'highlighter' as DrawingTool, name: 'Highlighter', icon: 'mdi:marker' },
  { id: 'line' as DrawingTool, name: 'Line (L)', icon: 'mdi:vector-line' },
  { id: 'arrow' as DrawingTool, name: 'Arrow (A)', icon: 'mdi:arrow-top-right' },
  { id: 'text-annotation' as DrawingTool, name: 'Text Annotation (T)', icon: 'mdi:comment-text-outline' },
  { id: 'rectangle' as DrawingTool, name: 'Rectangle (R)', icon: 'mdi:rectangle-outline' },
  { id: 'circle' as DrawingTool, name: 'Circle (C)', icon: 'mdi:circle-outline' },
  { id: 'ellipse' as DrawingTool, name: 'Ellipse (E)', icon: 'mdi:ellipse-outline' },
  { id: 'eraser' as DrawingTool, name: 'Eraser', icon: 'mdi:eraser' },
  { id: 'measure-distance' as DrawingTool, name: 'Measure Distance (M)', icon: 'mdi:ruler' },
  { id: 'measure-area' as DrawingTool, name: 'Measure Area', icon: 'mdi:chart-box-outline' },
] as const

// Use centralized color and size constants from types
const colors = COLORS
const sizes = TOOL_SIZES
</script>
