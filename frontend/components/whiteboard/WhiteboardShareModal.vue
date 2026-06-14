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
            <h2 class="text-lg font-semibold text-neutral-900">Share Whiteboard</h2>
            <p class="text-sm text-neutral-500 mt-1">Invite others to collaborate</p>
          </div>

          <!-- Share Link Section -->
          <div class="px-6 py-4">
            <label class="block text-sm font-medium text-neutral-700 mb-2">Share Link</label>
            <div class="flex gap-2">
              <input
                ref="urlInput"
                :value="shareUrl"
                readonly
                class="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                @focus="selectUrl"
              />
              <button
                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                @click="copyToClipboard"
              >
                <Icon name="mdi:content-copy" class="w-4 h-4" />
                Copy Link
              </button>
            </div>
          </div>

          <!-- Permissions Info -->
          <div class="px-6 py-4 bg-neutral-50 border-t border-neutral-200">
            <div class="flex items-start gap-3">
              <Icon name="mdi:information-outline" class="w-5 h-5 text-neutral-500 flex-shrink-0 mt-0.5" />
              <div class="text-sm text-neutral-600">
                <p>Anyone with this link can view and edit the whiteboard in real-time.</p>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="px-6 py-4 bg-neutral-50 flex justify-end">
            <button
              class="px-4 py-2 bg-neutral-200 text-neutral-700 hover:bg-neutral-300 rounded-lg transition-colors"
              @click="$emit('close')"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
const props = defineProps<{
  show: boolean
  shareUrl: string
}>()

const emit = defineEmits<{
  close: []
}>()

import { toastSuccess } from '~/composables/useToast'

const urlInput = ref<HTMLInputElement | null>(null)

// Auto-select URL when input is focused
function selectUrl() {
  urlInput.value?.select()
}

// Copy URL to clipboard
async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(props.shareUrl)
    toastSuccess('Link copied to clipboard')
  } catch (err) {
    // Fallback for older browsers
    if (urlInput.value) {
      urlInput.value.select()
      document.execCommand('copy')
      toastSuccess('Link copied to clipboard')
    }
  }
}
</script>
