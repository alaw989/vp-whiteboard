import { shareResolverReason, type ShareInvalidReason } from '~/utils/shareStatus'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const laravelUrl = (config.public.laravelUrl as string) || 'http://localhost:8000'
  const token = getRouterParam(event, 'id')

  if (!token) {
    return sendRedirect(event, '/share-invalid?reason=not_found', 302)
  }

  // The resolver distinguishes expired (410) from unknown/revoked (404), and a
  // 429 means the `throttle:shares` limiter tripped — the link is fine, the
  // viewer should retry, NOT be told it was revoked. Send the viewer to a
  // friendly page that can say the right thing — NOT a silent redirect home.
  // No token/secret ever appears in the error URL.
  const redirectInvalid = (reason: ShareInvalidReason) =>
    sendRedirect(event, `/share-invalid?reason=${reason}`, 302)

  try {
    // Resolve the share token via Laravel's public resolver.
    const res = await $fetch<{ success: boolean; data?: { whiteboard_id: string } }>(
      `${laravelUrl}/api/shares/${encodeURIComponent(token)}`
    )

    if (!res.success || !res.data?.whiteboard_id) {
      return redirectInvalid('not_found')
    }

    // Set a share cookie so the WS relay and autosave authorize this client.
    setCookie(event, 'vp_share_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })

    // Carry the raw token to the whiteboard page via a one-time query param.
    // The page stashes it (sessionStorage) for the WS handshake and scrubs the
    // URL, so anonymous share collaboration works even if nginx does not forward
    // the httpOnly vp_share_token cookie to the WS relay. The cookie itself is
    // kept for API/autosave auth.
    return sendRedirect(event, `/whiteboard/${res.data.whiteboard_id}?share=${encodeURIComponent(token)}`, 302)
  } catch (e) {
    return redirectInvalid(shareResolverReason(e))
  }
})
