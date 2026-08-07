export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login' || to.path === '/register') return

  // Individual whiteboard pages are public (Google Docs-style)
  if (to.path.match(/^\/whiteboard\/[^/]+$/) && !to.path.endsWith('/new')) return

  const config = useRuntimeConfig()
  const laravelUrl = (config.public.laravelUrl as string) || 'http://localhost:8000'
  const siteUrl = (config.public.siteUrl as string) || 'http://localhost:3000'

  // During SSR, forward the incoming request's cookie to Laravel so the
  // session cookie (laravel_session) reaches the /api/user endpoint.
  // On the client, credentials: 'include' sends the cookie automatically.
  //
  // Also send Origin/Referer: Sanctum's EnsureFrontendRequestsAreStateful only
  // runs session auth on requests whose Origin/Referer matches
  // SANCTUM_STATEFUL_DOMAINS. Browsers send these automatically, but the
  // server-side fetch does not — and the browser's headers don't reliably
  // survive the nginx→Nuxt proxy chain. Synthesize them from the FRONTEND URL
  // (siteUrl): Sanctum's stateful domain is the frontend origin (e.g.
  // localhost:3000 in dev, the site host in prod), so claiming the API origin
  // (laravelUrl, localhost:8002 locally) makes the stateful guard skip session
  // auth and /api/user returns 401 — logging the user out on every hard refresh
  // (the same failure the WS relay's resolveStatefulOrigin fixes for handshakes).
  let cookie: string | undefined
  let origin: string | undefined
  let referer: string | undefined
  if (import.meta.server) {
    const headers = useRequestHeaders(['cookie'])
    cookie = headers.cookie
    try {
      origin = new URL(siteUrl).origin
    } catch {
      origin = siteUrl
    }
    referer = `${siteUrl}/`
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
