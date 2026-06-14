import { createHmac, timingSafeEqual } from 'crypto'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  const password = config.authPassword as string
  const secret = config.authSecret as string

  if (!password || !secret) {
    return { authenticated: false }
  }

  const cookieHeader = getHeader(event, 'cookie') || ''
  const cookies = parseCookies(cookieHeader)

  // Check auth token
  const token = cookies['vp-auth-token']
  if (token) {
    const expected = createHmac('sha256', secret).update(password).digest('hex')
    if (token.length === expected.length) {
      try {
        if (timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
          return { authenticated: true }
        }
      } catch {}
    }
  }

  // Check share token if whiteboardId is provided
  const query = getQuery(event)
  const whiteboardId = query.whiteboardId as string | undefined
  const shareToken = cookies['vp-share-access']
  if (whiteboardId && shareToken) {
    const expected = createHmac('sha256', secret).update(`share:${whiteboardId}`).digest('hex')
    if (shareToken.length === expected.length) {
      try {
        if (timingSafeEqual(Buffer.from(shareToken), Buffer.from(expected))) {
          return { authenticated: true, shareAccess: true }
        }
      } catch {}
    }
  }

  return { authenticated: false }
})

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.split('=')
    if (key) cookies[key.trim()] = rest.join('=').trim()
  }
  return cookies
}
