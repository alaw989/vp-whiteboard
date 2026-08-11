import { describe, expect, it, vi } from 'vitest'
import { useCursors } from './useCursors'
import type { DrawingTool } from '~/types'

interface MockAwareness {
  clientId: number
  localState: unknown
  getStates: () => Map<number, unknown>
  setLocalState: (state: unknown) => void
  on: (event: string, handler: (event: string) => void) => void
  off: (event: string, handler: (event: string) => void) => void
  emit: (event: string) => void
}

function createAwareness(initialStates: Record<number, unknown> = {}): MockAwareness {
  const listeners = new Set<(event: string) => void>()
  const states = new Map<number, unknown>(
    Object.entries(initialStates).map(([k, v]) => [Number(k), v])
  )
  const awareness: MockAwareness = {
    clientId: 1,
    localState: undefined,
    getStates: () => states,
    setLocalState: (state: unknown) => {
      awareness.localState = state
    },
    on: (event, handler) => {
      listeners.add(handler)
    },
    off: (event, handler) => {
      listeners.delete(handler)
    },
    emit: (event) => {
      listeners.forEach((h) => h(event))
    },
  }
  return awareness
}

const PALETTE = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899']

describe('useCursors', () => {
  it('exposes the current user with a deterministic palette color', () => {
    const awareness = createAwareness()
    const cursors = useCursors({ awareness }, 'u-1', 'Alice')
    expect(cursors.currentUser.value.id).toBe('u-1')
    expect(cursors.currentUser.value.name).toBe('Alice')
    expect(PALETTE).toContain(cursors.currentUser.value.color)
    expect(cursors.awareness).toBe(awareness)
  })

  it('maps the same user id to the same color deterministically', () => {
    const a = useCursors({ awareness: createAwareness() }, 'u-fixed', 'A').currentUser.value.color
    const b = useCursors({ awareness: createAwareness() }, 'u-fixed', 'B').currentUser.value.color
    expect(a).toBe(b)
    expect(PALETTE).toContain(a)
  })

  it('works with no awareness (no wsProvider) without throwing', () => {
    const cursors = useCursors(undefined, 'u-1', 'Alice')
    expect(cursors.currentUser.value.id).toBe('u-1')
    expect(cursors.remoteCursors.value.size).toBe(0)
    expect(() => cursors.cleanup()).not.toThrow()
    expect(() => cursors.updateLocalCursor(10, 20)).not.toThrow()
    expect(cursors.awareness).toBeUndefined()
  })

  it('loads remote cursors from existing awareness states on init', () => {
    const awareness = createAwareness({
      2: { user: { id: 'u-2', name: 'Bob', color: '#000' }, cursor: { x: 5, y: 6 } },
      3: { user: { id: 'u-3', name: 'Carol', color: '#111' }, cursor: { x: 7, y: 8 }, tool: 'pen' },
    })
    const cursors = useCursors({ awareness }, 'u-1', 'Alice')
    const remote = cursors.remoteCursors.value
    expect(remote.size).toBe(2)
    expect(remote.get(2)!.user.name).toBe('Bob')
    expect(remote.get(2)!.cursor).toEqual({ x: 5, y: 6 })
    expect(remote.get(2)!.lastSeen).toEqual(expect.any(Number))
    expect(remote.get(3)!.tool).toBe('pen')
  })

  it('filters out the local client id and states without cursor data', () => {
    const awareness = createAwareness({
      1: { user: { id: 'u-1', name: 'Alice', color: '#000' }, cursor: { x: 1, y: 1 } },
      2: { user: { id: 'u-2', name: 'Bob', color: '#000' }, cursor: { x: 2, y: 2 } },
      3: { user: { id: 'u-3', name: 'Carol', color: '#111' } },
      4: { cursor: { x: 3, y: 3 } },
    })
    const cursors = useCursors({ awareness }, 'u-1', 'Alice')
    const remote = cursors.remoteCursors.value
    expect(remote.size).toBe(1)
    expect(remote.has(2)).toBe(true)
    expect(remote.has(1)).toBe(false)
    expect(remote.has(3)).toBe(false)
    expect(remote.has(4)).toBe(false)
  })

  it('recomputes remoteCursors when awareness emits a change event', () => {
    const awareness = createAwareness({})
    const cursors = useCursors({ awareness }, 'u-1', 'Alice')
    expect(cursors.remoteCursors.value.size).toBe(0)

    awareness.getStates().set(2, {
      user: { id: 'u-2', name: 'Bob', color: '#000' },
      cursor: { x: 9, y: 9 },
    })
    awareness.emit('change')
    expect(cursors.remoteCursors.value.size).toBe(1)
    expect(cursors.remoteCursors.value.get(2)!.cursor).toEqual({ x: 9, y: 9 })

    awareness.getStates().set(2, {
      user: { id: 'u-2', name: 'Bob', color: '#000' },
      cursor: { x: 99, y: 99 },
    })
    awareness.emit('change')
    expect(cursors.remoteCursors.value.get(2)!.cursor).toEqual({ x: 99, y: 99 })
  })

  it('updateLocalCursor publishes the local state with user, cursor and tool', async () => {
    vi.useFakeTimers()
    try {
      const awareness = createAwareness()
      const cursors = useCursors({ awareness }, 'u-1', 'Alice')
      cursors.updateLocalCursor(12, 34, 'line' as DrawingTool)
      vi.advanceTimersByTime(20)
      expect(awareness.localState).toEqual({
        user: {
          id: 'u-1',
          name: 'Alice',
          color: cursors.currentUser.value.color,
        },
        cursor: { x: 12, y: 34 },
        tool: 'line',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('updateLocalCursor is a no-op when setLocalState is unavailable', async () => {
    vi.useFakeTimers()
    try {
      const awareness = createAwareness()
      awareness.setLocalState = undefined as unknown as (state: unknown) => void
      const cursors = useCursors({ awareness }, 'u-1', 'Alice')
      expect(() => cursors.updateLocalCursor(1, 2)).not.toThrow()
      vi.advanceTimersByTime(20)
    } finally {
      vi.useRealTimers()
    }
  })

  it('updateLocalCursor without a tool leaves the tool field undefined', async () => {
    vi.useFakeTimers()
    try {
      const awareness = createAwareness()
      const cursors = useCursors({ awareness }, 'u-1', 'Alice')
      cursors.updateLocalCursor(5, 6)
      vi.advanceTimersByTime(20)
      expect((awareness.localState as { cursor: { x: number; y: number } }).cursor).toEqual({
        x: 5,
        y: 6,
      })
      expect(awareness.localState).toHaveProperty('tool', undefined)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cleanup unsubscribes the change listener and clears local state', () => {
    const awareness = createAwareness({
      2: { user: { id: 'u-2', name: 'Bob', color: '#000' }, cursor: { x: 1, y: 1 } },
    })
    const cursors = useCursors({ awareness }, 'u-1', 'Alice')
    expect(cursors.remoteCursors.value.size).toBe(1)

    cursors.cleanup()
    expect(awareness.localState).toBeNull()

    awareness.getStates().set(3, {
      user: { id: 'u-3', name: 'Carol', color: '#111' },
      cursor: { x: 7, y: 8 },
    })
    awareness.emit('change')
    expect(cursors.remoteCursors.value.size).toBe(1)
  })

  it('cleanup is a no-op when awareness is missing', () => {
    const cursors = useCursors(undefined, 'u-1', 'Alice')
    expect(() => cursors.cleanup()).not.toThrow()
  })
})
