<template>
  <div
    :class="[
      'save-status inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all duration-200',
      statusClasses
    ]"
    :title="tooltipText"
  >
    <!-- Icon -->
    <Icon
      :name="iconName"
      :class="[
        'w-4 h-4',
        isSaving && 'animate-spin'
      ]"
    />

    <!-- Text -->
    <span class="font-medium">{{ statusText }}</span>

    <!-- Time since last save -->
    <span v-if="showTime && lastSaveTime" class="text-xs opacity-75">
      {{ timeSinceSave }}
    </span>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    isSaving?: boolean
    saveError?: string | null
    lastSaveTime?: Date | null
    pendingChanges?: boolean
    showTime?: boolean
  }>(),
  {
    isSaving: false,
    saveError: null,
    lastSaveTime: null,
    pendingChanges: false,
    showTime: false,
  }
)

const emit = defineEmits<{
  retry: []
}>()

// Computed status
const saveStatus = computed(() => {
  if (props.isSaving) return 'saving'
  if (props.pendingChanges) return 'pending'
  if (props.lastSaveTime) return 'saved'
  return 'idle'
})

// Status text to display
const statusText = computed(() => {
  switch (saveStatus.value) {
    case 'saving':
      return 'Saving...'
    case 'pending':
      return 'Unsaved changes'
    case 'saved':
      return 'Saved'
    case 'idle':
      return 'Ready'
    default:
      return ''
  }
})

// Icon name for current status
const iconName = computed(() => {
  switch (saveStatus.value) {
    case 'saving':
      return 'mdi:loading'
    case 'pending':
      return 'mdi:content-save-outline'
    case 'saved':
      return 'mdi:check-circle'
    case 'idle':
      return 'mdi:content-save'
    default:
      return 'mdi:help-circle'
  }
})

// CSS classes for current status
const statusClasses = computed(() => {
  switch (saveStatus.value) {
    case 'saving':
      return 'bg-blue-100 text-blue-700'
    case 'pending':
      return 'bg-yellow-100 text-yellow-700'
    case 'saved':
      return 'bg-green-100 text-green-700'
    case 'idle':
      return 'bg-neutral-100 text-neutral-600'
    default:
      return 'bg-neutral-100 text-neutral-600'
  }
})

// Tooltip text
const tooltipText = computed(() => {
  if (props.saveError) {
    return `Last save failed: ${props.saveError}`
  }
  if (props.isSaving) {
    return 'Saving your changes...'
  }
  if (props.pendingChanges) {
    return 'You have unsaved changes'
  }
  if (props.lastSaveTime) {
    return `Last saved at ${formatTime(props.lastSaveTime)}`
  }
  return 'Ready to save'
})

// Time since last save (human-readable)
const timeSinceSave = computed(() => {
  if (!props.lastSaveTime) return ''
  return formatRelativeTime(props.lastSaveTime)
})

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)

  if (diffSecs < 10) return 'just now'
  if (diffSecs < 60) return `${diffSecs}s ago`
  if (diffMins < 60) return `${diffMins}m ago`
  return formatTime(date)
}
</script>
