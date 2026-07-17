import { customAlphabet } from 'nanoid'

// URL-safe alphabet without ambiguous characters (0OIl)
// Provides ~64 trillion combinations with 8 characters
const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
const nanoid = customAlphabet(alphabet, 8)

export function generateSessionId(): string {
  return nanoid()
}

// Generate with prefix for potential future use
export function generateSessionIdWithPrefix(prefix: string): string {
  return `${prefix}${nanoid()}`
}

// Validate that a string looks like a session ID
// Must match the PHP SessionController regex (full alphanumeric)
export function isValidSessionId(id: string): boolean {
  return /^[A-Za-z0-9]{8}$/.test(id)
}
