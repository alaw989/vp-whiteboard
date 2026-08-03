<template>
  <Transition
    enter-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-200"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="loading"
      class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <!-- Header -->
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Icon
              :name="error ? 'mdi:alert-circle' : 'mdi:file-pdf-box'"
              :class="error ? 'text-red-500' : 'text-blue-600'"
              class="w-6 h-6"
            />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-neutral-900">
              {{ error ? 'Loading Failed' : 'Loading PDF...' }}
            </p>
            <p v-if="fileName" class="text-xs text-neutral-500 truncate">
              {{ fileName }}
            </p>
          </div>
        </div>

        <!-- Progress Bar -->
        <div v-if="!error" class="mb-4">
          <div class="h-2 bg-neutral-200 rounded-full overflow-hidden">
            <div
              class="h-full bg-blue-600 transition-all duration-100 ease-out"
              :style="{ width: `${percent}%` }"
            />
          </div>
          <div class="flex justify-between items-center mt-2 text-xs text-neutral-500">
            <span>{{ statusText }}</span>
            <span class="font-medium">{{ percent }}%</span>
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="error" class="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
          {{ error }}
        </div>

        <!-- Actions -->
        <div class="flex gap-2">
          <button
            v-if="!error && !cancellable"
            class="flex-1 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-medium rounded-lg transition-colors"
            disabled
          >
            Loading...
          </button>
          <button
            v-if="!error && cancellable"
            class="flex-1 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-lg transition-colors"
            @click="handleCancel"
          >
            Cancel
          </button>
          <button
            v-if="error"
            class="flex-1 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-medium rounded-lg transition-colors"
            @click="handleClose"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { PDFLoadingState } from '~/types'

const props = defineProps<{
  loading: boolean
  fileName?: string
  state: PDFLoadingState
  cancellable?: boolean
}>()

const emit = defineEmits<{
  cancel: []
  close: []
}>()

// Computed percent
const percent = computed(() => props.state.percent || 0)

// Error message
const error = computed(() => props.state.error)

// Status text based on progress
const statusText = computed(() => {
  if (!props.loading) return ''

  const p = percent.value
  if (p < 20) return 'Initializing...'
  if (p < 50) return 'Loading PDF...'
  if (p < 80) return 'Rendering page...'
  return 'Almost done...'
})

function handleCancel() {
  emit('cancel')
}

function handleClose() {
  emit('close')
}
</script>
