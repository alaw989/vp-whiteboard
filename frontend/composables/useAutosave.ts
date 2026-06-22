import { ref, computed, readonly, type Ref } from 'vue'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface AutosaveState {
  status: Readonly<Ref<AutosaveStatus>>
  lastSavedAt: Readonly<Ref<Date | null>>
  isSaving: Readonly<Ref<boolean>>
  hasError: Readonly<Ref<boolean>>
  retry: () => void
  stop: () => void
  start: () => void
}

/**
 * Save function signature for dependency injection.
 * Takes a whiteboard ID and canvas state, returns a Promise that resolves on success
 * or throws on failure.
 */
export type SaveFunction = (whiteboardId: string, canvasState: string) => Promise<void>

/**
 * Options for configuring autosave behavior.
 */
export interface UseAutosaveOptions {
  /**
   * Interval in milliseconds between autosave attempts. Default: 30000 (30s).
   */
  intervalMs?: number
}

/**
 * Autosave composable with reactive status tracking and retry capability.
 *
 * State machine:
 * - `idle` → initial state, waiting for first interval tick
 * - `idle` → `saving` when interval triggers and exportState returns data
 * - `saving` → `saved` when the save promise resolves (sets lastSavedAt)
 * - `saving` → `error` when the save promise rejects
 * - `error` → `saving` when `retry()` is called
 * - `saved` → `saving` on next interval tick
 *
 * @param getWhiteboardId - Function that returns the current whiteboard ID
 * @param exportState - Function that returns the current canvas state as JSON string
 * @param isConnected - Function returning true if the canvas is connected (only save when true)
 * @param saveFn - Save function to call (injected for testability)
 * @param options - Configuration options (interval)
 *
 * @example
 * ```ts
 * const { status, lastSavedAt, hasError, retry, stop } = useAutosave(
 *   () => whiteboardId,
 *   () => canvasInstance.value?.exportState() || '',
 *   () => canvasInstance.value?.isConnected,
 *   (id, state) => $api(`/api/whiteboards/${id}`, { method: 'PATCH', body: { canvas_state: state } })
 * )
 * ```
 */
export function useAutosave(
  getWhiteboardId: () => string,
  exportState: () => string,
  isConnected: () => boolean,
  saveFn: SaveFunction,
  options: UseAutosaveOptions = {}
): AutosaveState {
  const { intervalMs = 30000 } = options

  const status = ref<AutosaveStatus>('idle')
  const lastSavedAt = ref<Date | null>(null)

  let intervalId: ReturnType<typeof setInterval> | null = null
  let pendingSave: Promise<void> | null = null

  const isSaving = computed(() => status.value === 'saving')
  const hasError = computed(() => status.value === 'error')

  /**
   * Perform a single save attempt. Transitions:
   * - → `saving` on start
   * - → `saved` on success
   * - → `error` on failure
   */
  async function performSave(): Promise<void> {
    if (status.value === 'saving') {
      return // Already saving, don't stack
    }

    const whiteboardId = getWhiteboardId()
    const state = exportState()

    if (!whiteboardId || !state) {
      return // Nothing to save
    }

    status.value = 'saving'

    try {
      pendingSave = saveFn(whiteboardId, state)
      await pendingSave
      status.value = 'saved'
      lastSavedAt.value = new Date()
    } catch {
      status.value = 'error'
    } finally {
      pendingSave = null
    }
  }

  /**
   * Retry the save immediately. Transitions `error` → `saving` → `saved`/`error`.
   */
  function retry(): void {
    if (status.value === 'error') {
      performSave()
    }
  }

  /**
   * Start the autosave interval. Only saves when `isConnected()` returns true.
   */
  function start(): void {
    if (intervalId !== null) return // Already started

    intervalId = setInterval(() => {
      if (isConnected() && status.value !== 'saving') {
        performSave()
      }
    }, intervalMs)
  }

  /**
   * Stop the autosave interval.
   */
  function stop(): void {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
    // Don't cancel pendingSave — let it complete naturally
  }

  // Start the interval on mount
  if (import.meta.client) {
    start()
  }

  return {
    status: readonly(status),
    lastSavedAt: readonly(lastSavedAt),
    isSaving: readonly(isSaving),
    hasError: readonly(hasError),
    retry,
    stop,
    start,
  }
}
