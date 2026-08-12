interface ApiErrorShape {
  data?: { message?: string; error?: string; errors?: Record<string, string[]> }
  message?: string
  response?: { status?: number }
}

const RATE_LIMITED_MESSAGE = 'Too many attempts — please wait a minute and try again.'

/**
 * Build a user-facing message from an $api failure.
 * Laravel's `throttle` middleware returns 429 `{"message": "Too Many Attempts."}` —
 * surface a friendlier string instead of the raw Laravel copy.
 */
export function friendlyApiErrorMessage(e: unknown, fallback: string): string {
  if (!e) return fallback
  const err = e as ApiErrorShape

  if (err.response?.status === 429) {
    return RATE_LIMITED_MESSAGE
  }

  const data = err.data
  if (data?.message) return data.message
  if (data?.error) return data.error
  if (data?.errors && Object.keys(data.errors).length) {
    return Object.values(data.errors).flat().join(', ')
  }
  if (err.message) return err.message
  return fallback
}
