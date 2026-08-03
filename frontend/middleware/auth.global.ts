export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login' || to.path === '/register') return

  // Individual whiteboard pages are public (Google Docs-style)
  if (to.path.match(/^\/whiteboard\/[^/]+$/) && !to.path.endsWith('/new')) return

  const config = useRuntimeConfig()
  const laravelUrl = (config.public.laravelUrl as string) || 'http://localhost:8000'

  // During SSR, forward the incoming request's cookie to Laravel so the
  // session cookie (laravel_session) reaches the /api/user endpoint.
  // On the client, credentials: 'include' sends the cookie automatically.
  let cookie: string | undefined
  if (import.meta.server) {
    const headers = useRequestHeaders(['cookie'])
    cookie = headers.cookie
  }

  try {
    await $fetch(`${laravelUrl}/api/user`, {
      headers: cookie ? { cookie } : undefined,
      credentials: import.meta.client ? 'include' : undefined,
    })
  } catch {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`, { redirectCode: 302 })
  }
})
