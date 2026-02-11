import type { UserPresence, DrawingTool } from '~/types'

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

  // Update local cursor position via awareness
  function updateLocalCursor(x: number, y: number, tool?: DrawingTool) {
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
  }

  // Cleanup function
  function cleanup() {
    if (awareness) {
      awareness.off('change', handleAwarenessChange)
      // Mark user as offline by clearing local state
      awareness.setLocalState(null)
    }
  }

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
  return colors[Math.abs(hash) % colors.length]
}
