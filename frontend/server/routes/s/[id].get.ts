export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const laravelUrl = (config.public.laravelUrl as string) || 'http://localhost:8000'
  const token = getRouterParam(event, 'id')

  if (!token) {
    return sendRedirect(event, '/', 302)
  }

  try {
    // Resolve the share token via Laravel's public resolver.
    const res = await $fetch<{ success: boolean; data?: { whiteboard_id: string } }>(
      `${laravelUrl}/api/shares/${encodeURIComponent(token)}`
    )

    if (!res.success || !res.data?.whiteboard_id) {
      return sendRedirect(event, '/', 302)
    }

    // Set a share cookie so the WS relay and autosave authorize this client.
    setCookie(event, 'vp_share_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })

    return sendRedirect(event, `/whiteboard/${res.data.whiteboard_id}`, 302)
  } catch {
    return sendRedirect(event, '/', 302)
  }
})
