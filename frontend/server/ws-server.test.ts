import { describe, expect, it } from 'vitest'
import { resolveStatefulOrigin } from './ws-server'

const API_URL = 'http://localhost:8002'

describe('ws-server — resolveStatefulOrigin (Sanctum session auth)', () => {
  it('forwards the browser Origin and does NOT synthesize a Referer when only Origin is present', () => {
    // A WS handshake carries `Origin` but never `Referer`. Sanctum's
    // EnsureFrontendRequestsAreStateful reads referer FIRST, so fabricating one
    // (e.g. the API origin) would win over the browser origin and skip session
    // auth, 401ing even a validly-logged-in owner.
    const { origin, referer } = resolveStatefulOrigin('http://localhost:3000', undefined, API_URL)
    expect(origin).toBe('http://localhost:3000')
    expect(referer).toBeUndefined()
  })

  it('normalizes a handshake Origin to its bare origin', () => {
    const { origin, referer } = resolveStatefulOrigin('http://localhost:3000/board/abc', undefined, API_URL)
    expect(origin).toBe('http://localhost:3000')
    expect(referer).toBeUndefined()
  })

  it('forwards a client Referer when present', () => {
    const { origin, referer } = resolveStatefulOrigin(
      'http://localhost:3000',
      'http://localhost:3000/whiteboard/x',
      API_URL,
    )
    expect(origin).toBe('http://localhost:3000')
    expect(referer).toBe('http://localhost:3000/whiteboard/x')
  })

  it('falls back to LARAVEL_URL-derived headers only when the handshake carried neither', () => {
    const { origin, referer } = resolveStatefulOrigin(undefined, undefined, API_URL)
    expect(origin).toBe('http://localhost:8002')
    expect(referer).toBe('http://localhost:8002/')
  })

  it('strips a path from the fallback LARAVEL_URL origin', () => {
    const { origin } = resolveStatefulOrigin(undefined, undefined, 'http://localhost:8002/api')
    expect(origin).toBe('http://localhost:8002')
  })
})
