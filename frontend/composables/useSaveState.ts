import { ref } from 'vue'

export type SaveState = 'saved' | 'saving' | 'offline'

export interface UseSaveStateOptions {
  idleTimeoutMs?: number
}

export function useSaveState(options: UseSaveStateOptions = {}) {
  const { idleTimeoutMs = 30000 } = options

  const state = ref<SaveState>('saved')
  const dirty = ref(false)
  const retryCount = ref(0)
  const lastFailedAt = ref<number | null>(null)

  let idleTimer: ReturnType<typeof setTimeout> | null = null

  function clearIdleTimer() {
    if (idleTimer !== null) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  function scheduleIdleTimeout() {
    clearIdleTimer()
    idleTimer = setTimeout(() => {
      idleTimer = null
      // Safety net: a save was marked pending but never actually started
      // (e.g. the 2s debounce fired while another save held saveInProgress,
      // or the canvas wasn't ready yet). Fall back to 'saved' so the badge
      // never gets stuck in 'saving'.
      if (state.value === 'saving') {
        state.value = 'saved'
        dirty.value = false
      }
    }, idleTimeoutMs)
  }

  function markDirty() {
    dirty.value = true
    scheduleIdleTimeout()
    if (state.value !== 'saving') {
      state.value = 'saving'
    }
  }

  function onSaveStart() {
    clearIdleTimer()
    state.value = 'saving'
  }

  function onSaveSuccess() {
    clearIdleTimer()
    dirty.value = false
    retryCount.value = 0
    lastFailedAt.value = null
    state.value = 'saved'
  }

  function onSaveFailure(timestamp: number = Date.now()) {
    clearIdleTimer()
    dirty.value = true
    retryCount.value += 1
    lastFailedAt.value = timestamp
    state.value = 'offline'
  }

  function reset() {
    clearIdleTimer()
    dirty.value = false
    retryCount.value = 0
    lastFailedAt.value = null
    state.value = 'saved'
  }

  return {
    state,
    dirty,
    retryCount,
    lastFailedAt,
    idleTimeoutMs,
    markDirty,
    onSaveStart,
    onSaveSuccess,
    onSaveFailure,
    reset,
  }
}

export type UseSaveStateReturn = ReturnType<typeof useSaveState>
