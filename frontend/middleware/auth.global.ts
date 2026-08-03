export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login' || to.path === '/register') return

  // Individual whiteboard pages are public (Google Docs-style)
  if (to.path.match(/^\/whiteboard\/[^/]+$/) && !to.path.endsWith('/new')) return

  const config = useRuntimeConfig()
  const laravelUrl = (config.public.laravelUrl as string) || 'http://localhost:8000'

  // During SSR, forward the incoming request's cookie to Laravel so the
  // session cookie (laravel_session) reaches the /api/user endpoint.
  // On the client, credentials: 'include' sends the cookie automatically.
  //
  // Also send Origin/Referer: Sanctum's EnsureFrontendRequestsAreStateful only
  // runs session auth on requests whose Origin/Referer matches
  // SANCTUM_STATEFUL_DOMAINS. Browsers send these automatically, but the
  // server-side fetch does not — and the browser's headers don't reliably
  // survive the nginx→Nuxt proxy chain. Synthesize them from LARAVEL_URL so
  // /api/user doesn't return 401 for a logged-in user on hard refresh (same
  // fix applied to the WS relay in b036f3d).
  let cookie: string | undefined
  let origin: string | undefined
  let referer: string | undefined
  if (import.meta.server) {
    const headers = useRequestHeaders(['cookie'])
    cookie = headers.cookie
    try {
      origin = new URL(laravelUrl).origin
    } catch {
      origin = laravelUrl
    }
    referer = `${laravelUrl}/`
  }

  try {
    await $fetch(`${laravelUrl}/api/user`, {
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(origin ? { origin } : {}),
        ...(referer ? { referer } : {}),
      },
      credentials: import.meta.client ? 'include' : undefined,
    })
  } catch {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`, { redirectCode: 302 })
  }
})
