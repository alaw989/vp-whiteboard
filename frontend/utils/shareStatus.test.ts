import { describe, expect, it } from 'vitest'
import { shareResolverReason } from '~/utils/shareStatus'

describe('shareResolverReason', () => {
  it('maps a 410 to expired', () => {
    expect(shareResolverReason({ response: { status: 410 } })).toBe('expired')
  })

  it('maps a 429 to rate_limited', () => {
    expect(shareResolverReason({ response: { status: 429 } })).toBe('rate_limited')
  })

  it('maps a 404 to not_found', () => {
    expect(shareResolverReason({ response: { status: 404 } })).toBe('not_found')
  })

  it('reads status from the top-level error object', () => {
    expect(shareResolverReason({ status: 410 })).toBe('expired')
    expect(shareResolverReason({ statusCode: 429 })).toBe('rate_limited')
  })

  it('defaults unknown failures to not_found', () => {
    expect(shareResolverReason(undefined)).toBe('not_found')
    expect(shareResolverReason({})).toBe('not_found')
    expect(shareResolverReason({ message: 'boom' })).toBe('not_found')
  })
})
