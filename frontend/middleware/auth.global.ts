export default defineNuxtRouteMiddleware(async (to) => {
  // Server middleware handles auth during SSR.
  // This only needs to run for client-side navigations.
  if (import.meta.server) return
  if (to.path === '/login') return

  // Individual whiteboard pages are public (Google Docs-style)
  if (to.path.match(/^\/whiteboard\/[^/]+$/) && !to.path.endsWith('/new')) return

  // Check if user is authenticated via Laravel session
  const config = useRuntimeConfig()
  const laravelUrl = (config.public.laravelUrl as string) || 'http://localhost:8000'

  try {
    await $fetch(`${laravelUrl}/api/user`, { credentials: 'include' })
  } catch {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`, { redirectCode: 302 })
  }
})
