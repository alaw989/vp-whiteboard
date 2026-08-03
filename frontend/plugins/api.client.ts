/**
 * API plugin: provides $api helper that routes to Laravel with credentials.
 *
 * Usage in components:
 *   const { $api } = useNuxtApp()
 *   const data = await $api('/api/whiteboards')
 */

interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export default defineNuxtPlugin<{
  api: <T = unknown>(url: string, options?: Record<string, unknown>) => Promise<T>
  ensureCsrf: () => Promise<void>
}>(() => {
  const config = useRuntimeConfig()
  const laravelUrl = (config.public.laravelUrl as string) || 'http://localhost:8000'

  let csrfInitialized = false

  async function ensureCsrf(): Promise<void> {
    if (csrfInitialized) return
    try {
      await $fetch.raw(`${laravelUrl}/sanctum/csrf-cookie`, {
        credentials: 'include',
      })
      csrfInitialized = true
    } catch {
      // Laravel might not be running
    }
  }

  /**
   * API fetch wrapper.
   * Rewrites relative /api/ URLs to ${laravelUrl}/api/...
   * Auto-includes credentials and XSRF header for mutations.
   */
  async function api<T = unknown>(
    url: string,
    options: Record<string, unknown> = {},
  ): Promise<T> {
    const fullUrl = url.startsWith('http') ? url : `${laravelUrl}${url}`

    const method = ((options.method as string) || 'GET').toUpperCase()
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)

    if (isMutation) {
      await ensureCsrf()
      if (import.meta.client) {
        const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/)
        if (match && match[1]) {
          options.headers = options.headers || {}
          ;(options.headers as Record<string, string>)['X-XSRF-TOKEN'] =
            decodeURIComponent(match[1])
        }
      }
    }

    try {
      // Use raw $fetch to avoid type constraints on generic
      return await $fetch.raw<T>(fullUrl as never, {
        ...options,
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'x-requested-with': 'XMLHttpRequest',
          ...((options.headers || {}) as Record<string, string>),
        },
      } as never).then(r => r._data as T)
    } catch (e: any) {
      // If the request was a mutation and got a 419 (CSRF token mismatch),
      // reset the CSRF flag so the NEXT mutation fetches a fresh token.
      if (isMutation && e?.response?.status === 419) {
        csrfInitialized = false
      }
      throw e
    }
  }

  return {
    provide: {
      api,
      ensureCsrf,
    },
  }
})
