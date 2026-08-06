import { describe, expect, it } from 'vitest'
import { shareCopyUrl } from './useShareLink'

describe('shareCopyUrl — copyable URL resolution', () => {
  it('returns the url when the share has one (freshly created)', () => {
    expect(shareCopyUrl({ url: 'https://whiteboard.vp-associates.com/s/abc123' }))
      .toBe('https://whiteboard.vp-associates.com/s/abc123')
  })

  it('returns null when the share has no url (loaded from the list)', () => {
    expect(shareCopyUrl({ id: '1', role: 'edit' })).toBeNull()
    expect(shareCopyUrl({})).toBeNull()
  })

  it('returns null for a missing share', () => {
    expect(shareCopyUrl(undefined)).toBeNull()
    expect(shareCopyUrl(null)).toBeNull()
  })

  it('never returns the literal string "undefined"', () => {
    expect(shareCopyUrl({ id: '1' })).not.toBe('undefined')
    expect(shareCopyUrl(undefined)).not.toBe('undefined')
  })
})
