export default defineNuxtRouteMiddleware(async (to) => {
  // Server middleware handles auth during SSR.
  // This only needs to run for client-side navigations.
  if (import.meta.server) return
  if (to.path === '/login') return

  try {
    const whiteboardMatch = to.path.match(/^\/whiteboard\/([^/]+)/)
    const params = whiteboardMatch ? { whiteboardId: whiteboardMatch[1] } : {}
    const res = await $fetch<{ authenticated: boolean }>('/api/auth/verify', { params })

    if (!res.authenticated) {
      return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`, { redirectCode: 302 })
    }
  } catch {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`, { redirectCode: 302 })
  }
})
