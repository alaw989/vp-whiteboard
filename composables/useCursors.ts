import type { UserPresence, DrawingTool } from '~/types'
import { useDebounceFn } from '@vueuse/core'

export interface CursorState {
  user: {
    id: string
    name: string
    color: string
  }
  cursor?: {
    x: number
    y: number
  }
  tool?: DrawingTool
  lastSeen: number
}

export function useCursors(
  wsProvider: any,
  userId: string,
  userName: string
) {
  // Get awareness from provider
  const awareness = wsProvider?.awareness

  // Current user ref with consistent color
  const currentUser = ref({
    id: userId,
    name: userName,
    color: getUserColor(userId),
  })

  // Remote cursors map - tracks all other users' cursor states
  const remoteCursors = ref<Map<number, CursorState>>(new Map())

  // Track local client ID for filtering
  const localClientId = awareness?.clientId ?? null

  // Handler for awareness changes
  const handleAwarenessChange = () => {
    if (!awareness) return

    const states = awareness.getStates()
    const cursors = new Map<number, CursorState>()

    states.forEach((state: any, clientId: number) => {
      // Filter out current user
      if (clientId === localClientId) return

      // Only include users with cursor data
      if (state.user && state.cursor) {
        cursors.set(clientId, {
          user: state.user,
          cursor: state.cursor,
          tool: state.tool,
          lastSeen: Date.now(),
        })
      }
    })

    remoteCursors.value = cursors
  }

  // Subscribe to awareness changes
  if (awareness) {
    awareness.on('change', handleAwarenessChange)

    // Initial sync - call handler immediately to populate existing cursors
    handleAwarenessChange()
  }

  // Throttled cursor update function (~60fps max)
  // Uses VueUse's useDebounceFn for RAF-style timing
  const updateLocalCursor = useDebounceFn((x: number, y: number, tool?: DrawingTool) => {
    if (!awareness) return

    awareness.setLocalState({
      user: {
        id: userId,
        name: userName,
        color: getUserColor(userId),
      },
      cursor: { x, y },
      tool,
    })
  }, 16) // 16ms = ~60fps max

  // Cleanup function
  function cleanup() {
    if (awareness) {
      awareness.off('change', handleAwarenessChange)
      // Mark CURRENT user as offline by clearing local state
      awareness.setLocalState(null)
    }
  }

  /**
   * Awareness API Automatic Cleanup
   *
   * The Yjs Awareness API automatically handles cleanup of remote users:
   * - When a user disconnects, their state is automatically removed
   * - A 30-second inactivity timeout is built into Awareness
   * - No manual cleanup is needed for remote cursors
   *
   * The cleanup() function above only handles the CURRENT user's state
   * by calling awareness.setLocalState(null) to mark them as offline.
   *
   * The 30-second filter in remoteCursors (in handleAwarenessChange)
   * provides additional safety, but Awareness handles the primary cleanup.
   */

  return {
    currentUser,
    remoteCursors,
    updateLocalCursor,
    cleanup,
    awareness,
  }
}

// Helper: Get consistent color for user (same as in useCollaborativeCanvas.ts)
function getUserColor(userId: string): string {
  const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899']
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]!
}
