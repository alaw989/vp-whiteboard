import type { CanvasState } from '~/types'

export interface AutoSaveOptions<T> {
  whiteboardId: string
  data: Ref<T>
  debounceMs?: number
  intervalMs?: number
  enabled?: ComputedRef<boolean> | Ref<boolean> | boolean
  onSave?: (data: T) => void
  onSaveError?: (error: string) => void
}

export interface QueuedSave {
  data: CanvasState
  timestamp: number
  attempt: number
}

export function useAutoSave<T extends CanvasState>(
  options: AutoSaveOptions<T>
) {
  const {
    whiteboardId,
    data,
    debounceMs = 1000,
    intervalMs = 30000,
    enabled = ref(true),
    onSave,
    onSaveError,
  } = options

  // State
  const isSaving = ref(false)
  const lastSaveTime = ref<Date | null>(null)
  const saveError = ref<string | null>(null)
  const pendingChanges = ref(false)
  const saveQueue = ref<QueuedSave[]>([])

  // Timers
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let intervalTimer: ReturnType<typeof setInterval> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Perform the actual save operation
   */
  async function performSave(saveData: T): Promise<boolean> {
    // Don't save if disabled
    if (typeof enabled === 'boolean' ? !enabled : !enabled.value) {
      return false
    }

    // Don't overlap saves
    if (isSaving.value) {
      pendingChanges.value = true
      return false
    }

    isSaving.value = true
    saveError.value = null

    try {
      await $fetch(`/api/whiteboard/${whiteboardId}`, {
        method: 'PATCH',
        body: { canvas_state: saveData as unknown as CanvasState },
      })

      lastSaveTime.value = new Date()
      pendingChanges.value = false

      if (onSave) {
        onSave(saveData)
      }

      // Clear queue on successful save
      saveQueue.value = []

      return true
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Save failed'
      saveError.value = errorMsg

      // Queue for retry if network error
      if (error instanceof TypeError || errorMsg.includes('fetch')) {
        // Network error - queue the save
        saveQueue.value.push({
          data: saveData as unknown as CanvasState,
          timestamp: Date.now(),
          attempt: 1,
        })
        pendingChanges.value = true
      }

      if (onSaveError) {
        onSaveError(errorMsg)
      }

      return false
    } finally {
      isSaving.value = false
    }
  }

  /**
   * Trigger a debounced save
   */
  function triggerSave() {
    if (typeof enabled === 'boolean' ? !enabled : !enabled.value) {
      return
    }

    pendingChanges.value = true

    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(async () => {
      await performSave(data.value)
    }, debounceMs)
  }

  /**
   * Process queued saves (for retry after connection restored)
   */
  async function processQueue() {
    if (saveQueue.value.length === 0 || isSaving.value) {
      return
    }

    // Get the most recent save from queue (last write wins per user decision)
    const latestSave = saveQueue.value[saveQueue.value.length - 1]
    if (!latestSave) {
      return
    }
    saveQueue.value = []

    await performSave(latestSave.data as T)
  }

  /**
   * Start the interval timer for periodic saves
   */
  function startInterval() {
    if (intervalTimer) {
      clearInterval(intervalTimer)
    }

    intervalTimer = setInterval(async () => {
      if (pendingChanges.value && !isSaving.value) {
        await performSave(data.value)
      }
    }, intervalMs)
  }

  /**
   * Stop all timers
   */
  function stopTimers() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (intervalTimer) {
      clearInterval(intervalTimer)
      intervalTimer = null
    }
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  /**
   * Manually trigger an immediate save
   */
  async function saveNow(): Promise<boolean> {
    stopTimers()
    const result = await performSave(data.value)
    startInterval()
    return result
  }

  // Watch for data changes
  const stopWatch = watch(
    data,
    () => {
      triggerSave()
    },
    { deep: true }
  )

  // Start interval on mount
  onMounted(() => {
    startInterval()
  })

  // Cleanup on unmount
  onUnmounted(() => {
    stopTimers()
    stopWatch()
  })

  return {
    // State
    isSaving: readonly(isSaving),
    lastSaveTime: readonly(lastSaveTime),
    saveError: readonly(saveError),
    pendingChanges: readonly(pendingChanges),
    queueSize: computed(() => saveQueue.value.length),

    // Methods
    saveNow,
    processQueue,
    startInterval,
    stopTimers,

    // Computed states for UI
    hasUnsavedChanges: computed(() => pendingChanges.value),
    isSaved: computed(() => !isSaving.value && !pendingChanges.value && lastSaveTime.value !== null),
    saveStatus: computed(() => {
      if (isSaving.value) return 'saving'
      if (pendingChanges.value) return 'pending'
      if (lastSaveTime.value) return 'saved'
      return 'idle'
    }),
  }
}
