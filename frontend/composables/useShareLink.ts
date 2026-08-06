/**
 * Resolve the copyable share URL for a share record, or null when it is not
 * available.
 *
 * The raw share token is only ever returned at creation time (the DB stores a
 * SHA-256 hash). Share records loaded via GET /api/whiteboards/{id}/shares
 * therefore carry no `url`, so the copy action must not fall back to writing
 * the literal string "undefined".
 */
export function shareCopyUrl(share?: Record<string, unknown> | null): string | null {
  const url = share?.url
  return typeof url === 'string' && url.length > 0 ? url : null
}
