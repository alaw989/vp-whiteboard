<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition ease-out duration-300"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="show"
        :class="[
          'fixed z-[100] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg max-w-sm',
          typeClass
        ]"
        :style="positionStyle"
      >
        <Icon
          :name="typeIcon"
          class="flex-shrink-0"
          :class="iconClass"
        />
        <div class="flex-1 min-w-0">
          <p v-if="title" class="text-sm font-medium" :class="titleClass">{{ title }}</p>
          <p class="text-sm break-words" :class="messageClass">{{ message }}</p>
        </div>
        <button
          v-if="dismissible"
          @click="close"
          class="flex-shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
        >
          <Icon name="mdi:close" class="w-4 h-4" :class="iconClass" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    show: boolean
    message: string
    title?: string
    type?: 'success' | 'error' | 'info' | 'warning'
    position?: 'top-right' | 'top-center' | 'bottom-right'
    duration?: number
    dismissible?: boolean
  }>(),
  {
    type: 'info',
    position: 'top-right',
    duration: 3000,
    dismissible: true,
  }
)

const emit = defineEmits<{
  close: []
}>()

// Auto-close after duration
let timeoutId: ReturnType<typeof setTimeout> | null = null

watch(() => props.show, (isOpen) => {
  if (isOpen && props.duration > 0) {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      close()
    }, props.duration)
  }
})

function close() {
  if (timeoutId) clearTimeout(timeoutId)
  emit('close')
}

// Type-specific styling
const typeClass = computed(() => {
  switch (props.type) {
    case 'success':
      return 'bg-white border-l-4 border-green-500'
    case 'error':
      return 'bg-white border-l-4 border-red-500'
    case 'warning':
      return 'bg-white border-l-4 border-amber-500'
    default:
      return 'bg-white border-l-4 border-blue-500'
  }
})

const typeIcon = computed(() => {
  switch (props.type) {
    case 'success':
      return 'mdi:check-circle'
    case 'error':
      return 'mdi:alert-circle'
    case 'warning':
      return 'mdi:alert'
    default:
      return 'mdi:information'
  }
})

const iconClass = computed(() => {
  switch (props.type) {
    case 'success':
      return 'text-green-500'
    case 'error':
      return 'text-red-500'
    case 'warning':
      return 'text-amber-500'
    default:
      return 'text-blue-500'
  }
})

const titleClass = computed(() => {
  switch (props.type) {
    case 'success':
    case 'info':
      return 'text-neutral-900'
    case 'error':
    case 'warning':
      return 'text-neutral-900'
  }
})

const messageClass = computed(() => {
  switch (props.type) {
    case 'success':
    case 'info':
      return 'text-neutral-600'
    case 'error':
    case 'warning':
      return 'text-neutral-600'
  }
})

const positionStyle = computed(() => {
  switch (props.position) {
    case 'top-center':
      return 'top-4 left-1/2 -translate-x-1/2'
    case 'bottom-right':
      return 'bottom-4 right-4'
    default:
      return 'top-4 right-4'
  }
})
</script>
