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
        @click.self="$emit('cancel')"
      >
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
          <div class="px-6 py-5">
            <h2 class="text-lg font-semibold text-neutral-900">{{ title }}</h2>
            <p class="text-sm text-neutral-500 mt-2">{{ message }}</p>
          </div>
          <div class="px-6 py-4 bg-neutral-50 flex justify-end gap-3">
            <button
              class="px-4 py-2 text-neutral-700 hover:bg-neutral-200 rounded-lg transition-colors"
              @click="$emit('cancel')"
            >
              Cancel
            </button>
            <button
              :class="[
                'px-4 py-2 text-white rounded-lg transition-all duration-200 hover:shadow-md',
                destructive
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              ]"
              @click="$emit('confirm')"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  show: boolean
  title: string
  message: string
  confirmText?: string
  destructive?: boolean
}>()

defineEmits<{
  confirm: []
  cancel: []
}>()
</script>
