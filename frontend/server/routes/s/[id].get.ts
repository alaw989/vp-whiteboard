import { isValidSessionId } from '~/server/utils/session-id'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const laravelUrl = (config.laravelUrl as string) || 'http://localhost:8000'
  const shortId = getRouterParam(event, 'id')

  if (!shortId || !isValidSessionId(shortId)) {
    return sendRedirect(event, '/', 302)
  }

  try {
    // Look up whiteboard by share_token via Laravel API
    const res = await $fetch<{ success: boolean; data?: { id: string } }>(
      `${laravelUrl}/api/sessions/${shortId}`
    )

    if (!res.success || !res.data?.id) {
      return sendRedirect(event, '/', 302)
    }

    // Set a simple share cookie for WS relay auth bypass
    setCookie(event, 'vp_share_token', shortId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    })

    return sendRedirect(event, `/whiteboard/${res.data.id}`, 302)
  } catch {
    return sendRedirect(event, '/', 302)
  }
})
