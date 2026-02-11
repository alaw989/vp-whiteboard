<template>
  <Transition
    enter-active-class="transition ease-out duration-200"
    enter-from-class="transform -translate-y-full"
    enter-to-class="transform translate-y-0"
    leave-active-class="transition ease-in duration-150"
    leave-from-class="transform translate-y-0"
    leave-to-class="transform -translate-y-full"
  >
    <div
      v-if="showBanner"
      :class="[
        'offline-banner fixed top-0 left-0 right-0 z-50 px-4 py-3 shadow-lg',
        bannerClasses
      ]"
    >
      <div class="container mx-auto flex items-center justify-between gap-4">
        <!-- Icon and Message -->
        <div class="flex items-center gap-3">
          <Icon
            :name="iconName"
            :class="[
              'w-5 h-5 flex-shrink-0',
              isReconnecting && 'animate-spin'
            ]"
          />
          <div>
            <p class="font-medium">{{ message }}</p>
            <p v-if="detailMessage" class="text-sm opacity-90">
              {{ detailMessage }}
            </p>
          </div>
        </div>

        <!-- Action Button (if provided) -->
        <button
          v-if="actionLabel && onAction"
          @click="onAction"
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-white/20 hover:bg-white/30"
        >
          {{ actionLabel }}
        </button>

        <!-- Close Button (optional) -->
        <button
          v-if="dismissible && !isOffline"
          @click="dismiss"
          class="p-1 rounded hover:bg-white/10 transition-colors"
        >
          <Icon name="mdi:close" class="w-5 h-5" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    isOnline: boolean
    isReconnecting?: boolean
    connectionStatus?: 'online' | 'offline' | 'reconnecting'
    dismissible?: boolean
  }>(),
  {
    isReconnecting: false,
    connectionStatus: 'online',
    dismissible: false,
  }
)

const emit = defineEmits<{
  dismiss: []
  retry: []
}>()

// Local state for dismissal
const dismissed = ref(false)

// Whether to show the banner
const showBanner = computed(() => {
  if (dismissed.value) return false
  return !props.isOnline || props.isReconnecting
})

// Banner CSS classes based on status
const bannerClasses = computed(() => {
  if (!props.isOnline) {
    // Offline - red/orange warning
    return 'bg-orange-500 text-white'
  }
  if (props.isReconnecting) {
    // Reconnecting - yellow/amber
    return 'bg-amber-500 text-white'
  }
  return 'bg-green-500 text-white'
})

// Icon name based on status
const iconName = computed(() => {
  if (!props.isOnline) return 'mdi:wifi-off'
  if (props.isReconnecting) return 'mdi:loading'
  return 'mdi:wifi'
})

// Main message
const message = computed(() => {
  if (!props.isOnline) return "You're Offline"
  if (props.isReconnecting) return 'Reconnecting...'
  return 'Connected'
})

// Detail message
const detailMessage = computed(() => {
  if (!props.isOnline) {
    return 'Check your internet connection. Drawing is disabled while offline.'
  }
  if (props.isReconnecting) {
    return 'Attempting to reconnect...'
  }
  return ''
})

// Action button label
const actionLabel = computed(() => {
  if (!props.isOnline) return 'Retry'
  return ''
})

const onAction = computed(() => {
  if (!props.isOnline) return () => emit('retry')
  return null
})

const isOffline = computed(() => !props.isOnline)

function dismiss() {
  dismissed.value = true
  emit('dismiss')
}

// Reset dismissal when status changes
watch(() => [props.isOnline, props.isReconnecting], () => {
  dismissed.value = false
})
</script>
