import { describe, expect, it } from 'vitest'
import { friendlyApiErrorMessage } from '~/utils/apiError'

describe('friendlyApiErrorMessage', () => {
  it('maps a 429 response to a friendly rate-limit message', () => {
    const e = {
      response: { status: 429 },
      data: { message: 'Too Many Attempts.' },
      message: 'Too Many Attempts.',
    }
    expect(friendlyApiErrorMessage(e, 'Invalid credentials')).toBe(
      'Too many attempts — please wait a minute and try again.',
    )
  })

  it('falls back to the server message for other statuses', () => {
    const e = { data: { message: 'The password is incorrect.' } }
    expect(friendlyApiErrorMessage(e, 'Invalid credentials')).toBe(
      'The password is incorrect.',
    )
  })

  it('joins validation errors from data.errors', () => {
    const e = { data: { errors: { email: ['required'], password: ['too short'] } } }
    expect(friendlyApiErrorMessage(e, 'Registration failed')).toBe(
      'required, too short',
    )
  })

  it('falls back to the error message then the fallback string', () => {
    expect(friendlyApiErrorMessage({ message: 'boom' }, 'Registration failed')).toBe('boom')
    expect(friendlyApiErrorMessage({}, 'Registration failed')).toBe('Registration failed')
    expect(friendlyApiErrorMessage(undefined, 'Registration failed')).toBe('Registration failed')
  })
})
