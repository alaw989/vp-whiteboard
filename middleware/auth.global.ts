export default defineNuxtRouteMiddleware(async (to) => {
  // Server middleware handles auth during SSR.
  // This only needs to run for client-side navigations.
  if (import.meta.server) return
  if (to.path === '/login') return

  // Individual whiteboard pages are public (Google Docs-style)
  if (to.path.match(/^\/whiteboard\/[^/]+$/) && !to.path.endsWith('/new')) return

  try {
    const res = await $fetch<{ authenticated: boolean }>('/api/auth/verify')

    if (!res.authenticated) {
      return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`, { redirectCode: 302 })
    }
  } catch {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`, { redirectCode: 302 })
  }
})
