<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="$emit('close')"
      >
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-neutral-200">
            <h2 class="text-lg font-semibold text-neutral-900">Export Canvas</h2>
            <p class="text-sm text-neutral-500 mt-1">Choose format and preview before exporting</p>
          </div>

          <!-- Preview -->
          <div class="px-6 py-4 bg-neutral-50 border-b border-neutral-200">
            <div class="flex items-center gap-4">
              <div class="w-32 h-24 bg-white rounded-lg border border-neutral-200 flex items-center justify-center overflow-hidden">
                <img
                  v-if="previewUrl"
                  :src="previewUrl"
                  alt="Export preview"
                  class="max-w-full max-h-full object-contain"
                />
                <div v-else class="text-neutral-400 text-sm">Loading preview...</div>
              </div>
              <div class="flex-1">
                <p class="text-sm text-neutral-600">{{ filename || 'whiteboard' }}</p>
                <p class="text-xs text-neutral-400 mt-1">{{ canvasSize }}</p>
              </div>
            </div>
          </div>

          <!-- Format Selection -->
          <div class="px-6 py-4">
            <label class="block text-sm font-medium text-neutral-700 mb-2">Export Format</label>
            <div class="grid grid-cols-2 gap-3">
              <button
                :class="[
                  'p-3 rounded-lg border-2 text-left transition-colors',
                  format === 'png'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-neutral-200 hover:border-neutral-300 text-neutral-600'
                ]"
                @click="format = 'png'"
              >
                <div class="flex items-center gap-2">
                  <Icon name="mdi:image" class="w-5 h-5" />
                  <span class="font-medium">PNG</span>
                </div>
                <p class="text-xs mt-1 opacity-75">Screen quality image</p>
              </button>

              <button
                :class="[
                  'p-3 rounded-lg border-2 text-left transition-colors',
                  format === 'pdf'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-neutral-200 hover:border-neutral-300 text-neutral-600'
                ]"
                @click="format = 'pdf'"
              >
                <div class="flex items-center gap-2">
                  <Icon name="mdi:file-pdf-box" class="w-5 h-5" />
                  <span class="font-medium">PDF</span>
                </div>
                <p class="text-xs mt-1 opacity-75">Print quality document</p>
              </button>
            </div>
          </div>

          <!-- Progress -->
          <div v-if="isExporting" class="px-6 py-4 bg-neutral-50">
            <div class="flex items-center gap-3">
              <div class="flex-1">
                <div class="h-2 bg-neutral-200 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-blue-500 transition-all duration-300"
                    :style="{ width: `${exportProgress}%` }"
                  />
                </div>
              </div>
              <span class="text-sm font-medium text-neutral-600 min-w-[3rem]">{{ exportProgress }}%</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="px-6 py-4 bg-neutral-50 flex justify-end gap-3">
            <button
              :disabled="isExporting"
              class="px-4 py-2 text-neutral-700 hover:bg-neutral-200 rounded-lg transition-colors disabled:opacity-50"
              @click="$emit('close')"
            >
              Cancel
            </button>
            <button
              :disabled="isExporting"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              @click="handleExport"
            >
              <Icon v-if="isExporting" name="mdi:loading" class="w-4 h-4 animate-spin" />
              {{ isExporting ? 'Exporting...' : 'Export' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { ExportFormat } from '~/types'
import type { Stage } from 'konva/lib/Stage'

const props = defineProps<{
  show: boolean
  stage: Stage | null
  filename?: string
  isExporting: boolean
  exportProgress: number
}>()

const emit = defineEmits<{
  close: []
  export: [format: ExportFormat]
}>()

const format = ref<ExportFormat>('png')
const previewUrl = ref<string | null>(null)
const canvasSize = ref('')

// Generate preview thumbnail when dialog opens
watch(() => props.show, async (isOpen) => {
  if (isOpen && props.stage) {
    const width = props.stage.width()
    const height = props.stage.height()
    canvasSize.value = `${Math.round(width)} x ${Math.round(height)} px`

    // Generate thumbnail at reduced size (max 300px width)
    const thumbnailWidth = Math.min(300, width)
    const scale = thumbnailWidth / width

    previewUrl.value = props.stage.toDataURL({
      pixelRatio: 1,
      x: 0,
      y: 0,
      width,
      height,
    })
  }
})

function handleExport() {
  emit('export', format.value)
}
</script>
