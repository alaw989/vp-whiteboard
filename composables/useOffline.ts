import { useOnline } from '@vueuse/core'

type ConnectionStatus = 'online' | 'offline' | 'reconnecting'

export function useOffline() {
  // VueUse's useOnline uses the Network Information API
  const isOnline = useOnline()

  // Connection status with more states
  const connectionStatus = ref<ConnectionStatus>(
    isOnline.value ? 'online' : 'offline'
  )

  // Track if we were previously offline (for UI transitions)
  const wasOffline = ref(false)

  // Timestamp of last connection change
  const lastConnectionChange = ref<Date>(new Date())

  // Update status when online state changes
  watch(isOnline, (online, wasOnlineBefore) => {
    lastConnectionChange.value = new Date()

    if (!online && wasOnlineBefore) {
      // Just went offline
      connectionStatus.value = 'offline'
      wasOffline.value = true
    } else if (online && !wasOnlineBefore) {
      // Just came back online
      connectionStatus.value = 'online'
      // Reset wasOffline after a delay
      setTimeout(() => {
        if (isOnline.value) {
          wasOffline.value = false
        }
      }, 3000)
    }
  })

  /**
   * Set connection status to reconnecting (for manual override)
   */
  function setReconnecting() {
    connectionStatus.value = 'reconnecting'
  }

  /**
   * Get human-readable status message
   */
  const statusMessage = computed(() => {
    switch (connectionStatus.value) {
      case 'online':
        return 'Connected'
      case 'offline':
        return 'Offline - Reconnecting...'
      case 'reconnecting':
        return 'Reconnecting...'
      default:
        return 'Unknown'
    }
  })

  /**
   * Check if currently in a degraded state (offline or reconnecting)
   */
  const isDegraded = computed(() => {
    return connectionStatus.value !== 'online'
  })

  /**
   * Time since connection changed
   */
  const timeSinceChange = computed(() => {
    const diff = Date.now() - lastConnectionChange.value.getTime()
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ago`
  })

  return {
    // Reactive state
    isOnline: readonly(isOnline),
    isOffline: computed(() => !isOnline.value),
    connectionStatus: readonly(connectionStatus),
    wasOffline: readonly(wasOffline),
    isDegraded,
    lastConnectionChange: readonly(lastConnectionChange),

    // Computed values
    statusMessage,
    timeSinceChange,

    // Methods
    setReconnecting,
  }
}
