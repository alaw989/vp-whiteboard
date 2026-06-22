import { describe, expect, it, beforeEach, vi } from 'vitest'
import { ref, type Ref } from 'vue'
import { useAutosave, type AutosaveStatus, type SaveFunction } from '~/composables/useAutosave'

// Test harness: a fake save function that we can control to resolve or reject
type FakeSaveState = 'pending' | 'resolved' | 'rejected'

function createFakeSaveFunction(): {
  saveFn: SaveFunction
  state: Ref<FakeSaveState>
  resolvePending: () => void
  rejectPending: () => void
} {
  const state = ref<FakeSaveState>('pending')
  let resolvePending: (() => void) | null = null
  let rejectPending: (() => void) | null = null

  const saveFn: SaveFunction = (_whiteboardId: string, _canvasState: string) => {
    return new Promise<void>((resolve, reject) => {
      resolvePending = resolve
      rejectPending = reject
    })
  }

  const _resolvePending = () => {
    state.value = 'resolved'
    resolvePending?.()
  }

  const _rejectPending = () => {
    state.value = 'rejected'
    rejectPending?.()
  }

  return { saveFn, state, resolvePending: _resolvePending, rejectPending: _rejectPending }
}

describe('useAutosave state machine', () => {
  it('initializes in idle state', () => {
    const { status } = useAutosave(
      () => 'wb-123',
      () => '{}',
      () => true,
      vi.fn()
    )

    expect(status.value).toBe('idle')
  })

  it('transitions idle → saving on interval tick', async () => {
    const { saveFn, resolvePending } = createFakeSaveFunction()

    const { status, stop, start } = useAutosave(
      () => 'wb-123',
      () => '{"test": true}',
      () => true,
      saveFn,
      { intervalMs: 10 }
    )

    start()

    // Wait for first interval tick (status becomes saving)
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (status.value === 'saving') {
          clearInterval(check)
          resolve()
        }
      }, 2)
    })

    expect(status.value).toBe('saving')

    resolvePending()
    stop()
  })

  it('transitions saving → saved on resolve', async () => {
    const { saveFn, resolvePending } = createFakeSaveFunction()

    const { status, lastSavedAt, stop, start } = useAutosave(
      () => 'wb-123',
      () => '{"test": true}',
      () => true,
      saveFn,
      { intervalMs: 10 }
    )

    start()

    // Wait for saving state
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (status.value === 'saving') {
          clearInterval(check)
          resolve()
        }
      }, 2)
    })

    // Resolve the pending save
    resolvePending()

    // Wait for saved state
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (status.value === 'saved') {
          clearInterval(check)
          resolve()
        }
      }, 2)
    })

    expect(status.value).toBe('saved')
    expect(lastSavedAt.value).toBeInstanceOf(Date)

    stop()
  })

  it('transitions saving → error on reject', async () => {
    const { saveFn, rejectPending } = createFakeSaveFunction()

    const { status, stop, start } = useAutosave(
      () => 'wb-123',
      () => '{"test": true}',
      () => true,
      saveFn,
      { intervalMs: 10 }
    )

    start()

    // Wait for saving state
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (status.value === 'saving') {
          clearInterval(check)
          resolve()
        }
      }, 2)
    })

    // Reject the pending save
    rejectPending()

    // Wait for error state
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (status.value === 'error') {
          clearInterval(check)
          resolve()
        }
      }, 2)
    })

    expect(status.value).toBe('error')

    stop()
  })

  it('retry() transitions error → saving → saved on success', async () => {
    const firstSave = createFakeSaveFunction()
    const retrySave = createFakeSaveFunction()
    let useFirstSave = true

    const saveFn: SaveFunction = (id, state) => {
      return useFirstSave ? firstSave.saveFn(id, state) : retrySave.saveFn(id, state)
    }

    const { status, retry, stop, start } = useAutosave(
      () => 'wb-123',
      () => '{"test": true}',
      () => true,
      saveFn,
      { intervalMs: 10 }
    )

    start()

    // Wait for first save attempt and reject it
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (status.value === 'saving') {
          clearInterval(check)
          resolve()
        }
      }, 2)
    })

    firstSave.rejectPending()

    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (status.value === 'error') {
          clearInterval(check)
          resolve()
        }
      }, 2)
    })

    expect(status.value).toBe('error')

    // Now retry with a different (successful) save
    useFirstSave = false
    retry()

    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (status.value === 'saving') {
          clearInterval(check)
          resolve()
        }
      }, 2)
    })

    retrySave.resolvePending()

    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (status.value === 'saved') {
          clearInterval(check)
          resolve()
        }
      }, 2)
    })

    expect(status.value).toBe('saved')

    stop()
  })

  it('only saves when isConnected returns true', async () => {
    let saveCallCount = 0
    const saveFn: SaveFunction = vi.fn(() => {
      saveCallCount++
      return Promise.resolve()
    })

    const isConnected = ref(false)

    const { stop, start } = useAutosave(
      () => 'wb-123',
      () => '{}',
      () => isConnected.value,
      saveFn,
      { intervalMs: 10 }
    )

    start()

    // Wait a bit — no saves should happen while disconnected
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(saveCallCount).toBe(0)

    stop()
  })

  it('saves when isConnected returns true', async () => {
    let saveCallCount = 0
    const saveFn: SaveFunction = vi.fn(() => {
      saveCallCount++
      return Promise.resolve()
    })

    const isConnected = ref(true)

    const { status, stop, start } = useAutosave(
      () => 'wb-123',
      () => '{}',
      () => isConnected.value,
      saveFn,
      { intervalMs: 10 }
    )

    start()

    // Wait for first save
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (status.value === 'saved') {
          clearInterval(check)
          resolve()
        }
      }, 2)
    })

    expect(saveCallCount).toBeGreaterThan(0)

    stop()
  })

  it('does not start a new save while one is pending', async () => {
    const { saveFn, resolvePending } = createFakeSaveFunction()
    let saveCallCount = 0

    const countedSaveFn: SaveFunction = (id, state) => {
      saveCallCount++
      return saveFn(id, state)
    }

    const { status, stop, start } = useAutosave(
      () => 'wb-123',
      () => '{}',
      () => true,
      countedSaveFn,
      { intervalMs: 10 }
    )

    start()

    // Wait for first save to start
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (status.value === 'saving') {
          clearInterval(check)
          resolve()
        }
      }, 2)
    })

    const firstSaveCount = saveCallCount

    // Wait through multiple interval ticks while still saving
    await new Promise(resolve => setTimeout(resolve, 50))

    // Should not have called save again
    expect(saveCallCount).toBe(firstSaveCount)

    resolvePending()
    stop()
  })

  it('computes isSaving correctly', async () => {
    const { saveFn, resolvePending } = createFakeSaveFunction()

    const { status, isSaving, stop, start } = useAutosave(
      () => 'wb-123',
      () => '{}',
      () => true,
      saveFn,
      { intervalMs: 10 }
    )

    start()

    // Initial idle state
    expect(isSaving.value).toBe(false)

    // Wait for saving state
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (status.value === 'saving') {
          clearInterval(check)
          resolve()
        }
      }, 2)
    })

    expect(isSaving.value).toBe(true)

    resolvePending()
    stop()
  })

  it('computes hasError correctly', async () => {
    const { saveFn, rejectPending } = createFakeSaveFunction()

    const { status, hasError, stop, start } = useAutosave(
      () => 'wb-123',
      () => '{}',
      () => true,
      saveFn,
      { intervalMs: 10 }
    )

    start()

    // Initial idle state
    expect(hasError.value).toBe(false)

    // Wait for saving state
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (status.value === 'saving') {
          clearInterval(check)
          resolve()
        }
      }, 2)
    })

    expect(hasError.value).toBe(false)

    // Reject to trigger error
    rejectPending()

    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (status.value === 'error') {
          clearInterval(check)
          resolve()
        }
      }, 2)
    })

    expect(hasError.value).toBe(true)

    stop()
  })

  it('stops interval when stop() is called', async () => {
    let saveCallCount = 0
    const saveFn: SaveFunction = vi.fn(() => {
      saveCallCount++
      return Promise.resolve()
    })

    const { stop, start } = useAutosave(
      () => 'wb-123',
      () => '{}',
      () => true,
      saveFn,
      { intervalMs: 10 }
    )

    start()

    // Wait a bit for some saves to happen
    await new Promise(resolve => setTimeout(resolve, 50))

    const countAfterRunning = saveCallCount

    stop()

    // Wait the same duration — no new saves should happen
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(saveCallCount).toBe(countAfterRunning)
  })
})
