import { describe, expect, it } from 'vitest'
import { generateSessionId, generateSessionIdWithPrefix, isValidSessionId } from './session-id'

describe('session-id utils', () => {
  it('generateSessionId returns an 8-char alphanumeric id', () => {
    const id = generateSessionId()
    expect(id).toMatch(/^[A-Za-z0-9]{8}$/)
  })

  it('generateSessionId produces distinct values across many calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSessionId()))
    expect(ids.size).toBe(100)
  })

  it('generateSessionIdWithPrefix prepends the prefix and keeps the 8-char core', () => {
    const id = generateSessionIdWithPrefix('sess_')
    expect(id.startsWith('sess_')).toBe(true)
    expect(isValidSessionId(id.slice('sess_'.length))).toBe(true)
  })

  it('isValidSessionId accepts exactly 8 alphanumeric chars', () => {
    expect(isValidSessionId('a1B2c3D4')).toBe(true)
    expect(isValidSessionId('abc')).toBe(false)
    expect(isValidSessionId('abcdefghij')).toBe(false)
    expect(isValidSessionId('ab_cdefg')).toBe(false)
  })
})
