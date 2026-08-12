export type ShareInvalidReason = 'expired' | 'not_found' | 'rate_limited'

interface ShareResolverError {
  response?: { status?: number }
  status?: number
  statusCode?: number
}

/**
 * Map a share-resolver failure (Laravel `GET /api/shares/{token}`) to a
 * user-facing reason. 410 = the share expired; 429 = the `throttle:shares`
 * limiter tripped (too many resolves for this token) — the link is NOT broken,
 * so the viewer must NOT be told it was revoked. Anything else = unknown/revoked.
 */
export function shareResolverReason(e: unknown): ShareInvalidReason {
  const err = (e ?? {}) as ShareResolverError
  const status = err?.response?.status ?? err?.status ?? err?.statusCode
  if (status === 410) return 'expired'
  if (status === 429) return 'rate_limited'
  return 'not_found'
}
