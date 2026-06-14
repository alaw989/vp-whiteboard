import type { Session, ApiResponse } from '~/types'

export function useSession() {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl as string || ''

  // State
  const currentSession = ref<Session | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Create a new session
   */
  async function createSession(name: string): Promise<ApiResponse<Session>> {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<Session>>('/api/session', {
        method: 'POST',
        body: { name },
      })

      if (response.success && response.data) {
        currentSession.value = response.data
      }

      return response
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create session'
      error.value = errorMsg
      return { success: false, error: errorMsg }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Fetch a session by short ID
   */
  async function fetchSession(shortId: string): Promise<ApiResponse<Session>> {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<Session>>(`/api/session/${shortId}`)

      if (response.success && response.data) {
        currentSession.value = response.data
      }

      return response
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch session'
      error.value = errorMsg
      return { success: false, error: errorMsg }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get the shareable URL for the current session
   */
  function getShareUrl(): string {
    if (!currentSession.value?.short_id) return ''
    return `${baseUrl}/s/${currentSession.value.short_id}`
  }

  /**
   * Check if the session has expired
   */
  function isSessionExpired(): boolean {
    if (!currentSession.value?.expires_at) return false
    return new Date(currentSession.value.expires_at) < new Date()
  }

  /**
   * Get time remaining until expiration
   */
  function getTimeRemaining(): { days: number; hours: number; expired: boolean } {
    if (!currentSession.value?.expires_at) {
      return { days: 0, hours: 0, expired: false }
    }

    const now = new Date()
    const expiresAt = new Date(currentSession.value.expires_at)
    const diff = expiresAt.getTime() - now.getTime()

    if (diff <= 0) {
      return { days: 0, hours: 0, expired: true }
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

    return { days, hours, expired: false }
  }

  /**
   * Clear the current session
   */
  function clearSession() {
    currentSession.value = null
    error.value = null
  }

  return {
    // State
    currentSession: readonly(currentSession),
    isLoading: readonly(isLoading),
    error: readonly(error),

    // Methods
    createSession,
    fetchSession,
    getShareUrl,
    isSessionExpired,
    getTimeRemaining,
    clearSession,
  }
}
