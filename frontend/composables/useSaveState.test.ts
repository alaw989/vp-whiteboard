import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useSaveState } from './useSaveState'

describe('useSaveState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts clean in the saved state', () => {
    const s = useSaveState()
    expect(s.state.value).toBe('saved')
    expect(s.dirty.value).toBe(false)
    expect(s.retryCount.value).toBe(0)
    expect(s.lastFailedAt.value).toBeNull()
  })

  it('markDirty transitions to saving and records dirty', () => {
    const s = useSaveState()
    s.markDirty()
    expect(s.state.value).toBe('saving')
    expect(s.dirty.value).toBe(true)
  })

  it('markDirty while already saving is a no-op state-wise (in-flight guard)', () => {
    const s = useSaveState()
    s.markDirty()
    s.onSaveStart()
    s.markDirty()
    s.markDirty()
    expect(s.state.value).toBe('saving')
    expect(s.retryCount.value).toBe(0)
  })

  it('onSaveStart keeps saving and clears the pending idle fallback', () => {
    const s = useSaveState()
    s.markDirty()
    s.onSaveStart()
    expect(s.state.value).toBe('saving')
    vi.advanceTimersByTime(60000)
    expect(s.state.value).toBe('saving')
  })

  it('success transitions to saved and resets retry count and failure timestamp', () => {
    const s = useSaveState()
    s.markDirty()
    s.onSaveFailure(111)
    expect(s.retryCount.value).toBe(1)
    s.onSaveStart()
    s.onSaveSuccess()
    expect(s.state.value).toBe('saved')
    expect(s.dirty.value).toBe(false)
    expect(s.retryCount.value).toBe(0)
    expect(s.lastFailedAt.value).toBeNull()
  })

  it('failure transitions to offline and increments retry count with timestamp', () => {
    const s = useSaveState()
    s.markDirty()
    s.onSaveFailure(12345)
    expect(s.state.value).toBe('offline')
    expect(s.dirty.value).toBe(true)
    expect(s.retryCount.value).toBe(1)
    expect(s.lastFailedAt.value).toBe(12345)
  })

  it('subsequent failures keep incrementing the retry count', () => {
    const s = useSaveState()
    s.markDirty()
    s.onSaveFailure(1)
    s.onSaveStart()
    s.onSaveFailure(2)
    expect(s.state.value).toBe('offline')
    expect(s.retryCount.value).toBe(2)
  })

  it('recovers from offline to saved on the next successful save', () => {
    const s = useSaveState()
    s.markDirty()
    s.onSaveFailure(1)
    s.onSaveStart()
    s.onSaveSuccess()
    expect(s.state.value).toBe('saved')
    expect(s.retryCount.value).toBe(0)
  })

  it('idle timeout rescues a stuck saving state back to saved', () => {
    const s = useSaveState({ idleTimeoutMs: 5000 })
    s.markDirty()
    expect(s.state.value).toBe('saving')
    vi.advanceTimersByTime(4999)
    expect(s.state.value).toBe('saving')
    vi.advanceTimersByTime(1)
    expect(s.state.value).toBe('saved')
    expect(s.dirty.value).toBe(false)
  })

  it('a successful save before the idle timeout cancels the fallback', () => {
    const s = useSaveState({ idleTimeoutMs: 5000 })
    s.markDirty()
    s.onSaveStart()
    s.onSaveSuccess()
    vi.advanceTimersByTime(6000)
    expect(s.state.value).toBe('saved')
  })

  it('reset returns to a clean saved state', () => {
    const s = useSaveState()
    s.markDirty()
    s.onSaveFailure(1)
    s.reset()
    expect(s.state.value).toBe('saved')
    expect(s.dirty.value).toBe(false)
    expect(s.retryCount.value).toBe(0)
    expect(s.lastFailedAt.value).toBeNull()
  })
})
