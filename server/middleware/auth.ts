import { createHmac, timingSafeEqual } from 'crypto'

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/verify',
]

const PUBLIC_PREFIXES = [
  '/_nuxt/',
  '/api/session/',
  '/s/',
]

function isStaticAsset(path: string): boolean {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json|map|webp)$/i.test(path)
}

function hashToken(password: string, secret: string): string {
  return createHmac('sha256', secret).update(password).digest('hex')
}

function isValidAuthToken(cookie: string, password: string, secret: string): boolean {
  const expected = hashToken(password, secret)
  if (cookie.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(cookie), Buffer.from(expected))
  } catch {
    return false
  }
}

function isValidShareToken(cookie: string, whiteboardId: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(`share:${whiteboardId}`).digest('hex')
  if (cookie.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(cookie), Buffer.from(expected))
  } catch {
    return false
  }
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.split('=')
    if (key) cookies[key.trim()] = rest.join('=').trim()
  }
  return cookies
}

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const path = url.pathname

  // Allow public paths
  if (PUBLIC_PATHS.includes(path)) return
  if (PUBLIC_PREFIXES.some(prefix => path.startsWith(prefix))) return
  if (isStaticAsset(path)) return

  const config = useRuntimeConfig()
  const password = config.authPassword as string
  const secret = config.authSecret as string

  if (!password || !secret) return

  const cookieHeader = getHeader(event, 'cookie') || ''
  const cookies = parseCookies(cookieHeader)

  // Check auth token
  if (cookies['vp-auth-token'] && isValidAuthToken(cookies['vp-auth-token'], password, secret)) {
    return
  }

  // Individual whiteboard pages are public (anyone with the link can view/edit)
  // But /whiteboard/new requires auth
  if (path.match(/^\/whiteboard\/[^/]+$/) && !path.endsWith('/new')) return

  // Whiteboard read/write API is public for collaborative editing
  if (path.match(/^\/api\/whiteboard\/[^/]+$/)) return

  // File uploads for whiteboards are public (images, PDFs added to canvas)
  if (path.match(/^\/api\/whiteboard\/[^/]+\/.+/)) return

  // Unauthorized
  if (path.startsWith('/api/')) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  // Redirect page requests to login
  const redirect = encodeURIComponent(path)
  sendRedirect(event, `/login?redirect=${redirect}`, 302)
})
