// Dashboard helpers for frontend/pages/index.vue — pure logic kept out of the
// page so it is unit-testable without mounting the SFC.
//
// Thumbnails are derived CLIENT-side from the already-fetched
// `whiteboard.canvas_state.elements` (the API returns the full canvas_state for
// every board). No server image storage / thumbnail column.
import type { CanvasElement } from '~/types'
import { getElementGeometry } from '~/utils/geometryUtils'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export type DashboardSort = 'recent' | 'alpha'

/**
 * Latest-wins guard for the dashboard's debounced async refresh. Each call to
 * `next()` issues a monotonically-increasing request id; when the fetch
 * resolves, call `isLatest(id)` and discard the response unless it belongs to
 * the most recent request. Without this, a slow earlier search/sort response
 * can land AFTER a newer one and clobber the grid with stale results (e.g.
 * typing "founda" then "foundation" — the "founda" response could arrive
 * last).
 */
export function createLatestWins(): { next(): number; isLatest(id: number): boolean } {
  let current = 0
  return {
    next() {
      current += 1
      return current
    },
    isLatest(id) {
      return id === current
    },
  }
}

export interface DashboardEmptyState {
  title: string
  message: string
  /** Whether the empty state offers a "Create Whiteboard" CTA. */
  showCreate: boolean
}

/**
 * Empty-state copy for the dashboard grid. Each view (search hit vs archived
 * vs fresh account) gets distinct, non-contradictory title + message. The
 * create CTA only appears in the active view (archived boards can't be created
 * from the archive list).
 */
export function getDashboardEmptyState(opts: { search?: string; showArchived?: boolean } = {}): DashboardEmptyState {
  const query = opts.search?.trim()
  if (query) {
    return {
      title: 'No Matching Whiteboards',
      message: `No whiteboards match "${query}".`,
      showCreate: !opts.showArchived,
    }
  }
  if (opts.showArchived) {
    return {
      title: 'No Archived Whiteboards',
      message: 'Nothing has been archived yet.',
      showCreate: false,
    }
  }
  return {
    title: 'No Whiteboards Yet',
    message: 'Create your first collaborative whiteboard to start collaborating with your team.',
    showCreate: true,
  }
}

export interface IndexQueryOptions {
  search?: string
  sort?: DashboardSort
  /** Pass `include_archived=1` so archived boards appear in the listing. */
  includeArchived?: boolean
}

/**
 * Build the `/api/whiteboards` query string for the given search + sort.
 * `sort` defaults to `recent` (the API's default), so an explicit recent sort
 * or an empty search leaves the URL as the plain `/api/whiteboards` — keeping
 * the default request byte-identical to today's.
 */
export function buildIndexQuery(opts: IndexQueryOptions = {}): string {
  const params = new URLSearchParams()
  const search = opts.search?.trim()
  if (search) params.set('search', search)
  if (opts.sort && opts.sort !== 'recent') params.set('sort', opts.sort)
  if (opts.includeArchived) params.set('include_archived', '1')
  const qs = params.toString()
  return qs ? `/api/whiteboards?${qs}` : '/api/whiteboards'
}

function boundsFromPoints(pts: { x: number; y: number }[]): Bounds | null {
  if (!pts.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Bounding box of a single element, or null when geometry is missing/empty. */
export function getElementBounds(element: CanvasElement): Bounds | null {
  const data = (element as any)?.data
  if (!data) return null

  switch (element.type) {
    case 'image':
    case 'stamp':
      if (![data.x, data.y, data.width, data.height].every(Number.isFinite)) return null
      return { x: data.x, y: data.y, width: data.width, height: data.height }
    case 'text':
      if (![data.x, data.y].every(Number.isFinite)) return null
      return {
        x: data.x,
        y: data.y,
        width: (data.fontSize || 16) * Math.max(1, data.text?.length ?? 1),
        height: data.fontSize || 16,
      }
    case 'text-annotation': {
      if (![data.x, data.y].every(Number.isFinite)) return null
      const pts = [{ x: data.x, y: data.y }]
      const end = data.leaderLine?.end
      if (Array.isArray(end) && end.length >= 2) pts.push({ x: end[0], y: end[1] })
      return boundsFromPoints(pts)
    }
    case 'measurement-distance':
      if (Array.isArray(data.start) && Array.isArray(data.end)) {
        return boundsFromPoints([
          { x: data.start[0], y: data.start[1] },
          { x: data.end[0], y: data.end[1] },
        ])
      }
      return null
    case 'measurement-area':
      // Measures another element by id — no geometry of its own.
      return null
    default: {
      const geo = getElementGeometry(element)
      if (!geo) return null
      if (geo.circle) {
        const { center, radius } = geo.circle
        return { x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2 }
      }
      const pts: { x: number; y: number }[] = []
      if (geo.points?.length) {
        for (const p of geo.points) pts.push({ x: p.x, y: p.y })
      }
      for (const seg of geo.segments ?? []) {
        pts.push({ x: seg.start.x, y: seg.start.y }, { x: seg.end.x, y: seg.end.y })
      }
      return boundsFromPoints(pts)
    }
  }
}

/**
 * Overall bounding box across every element in a board, or null when the board
 * has no drawable content (empty / all malformed). Drives both the thumbnail
 * fit-transform and the "show thumbnail vs fallback icon" decision.
 */
export function getCanvasBounds(elements: CanvasElement[]): Bounds | null {
  if (!Array.isArray(elements) || elements.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let any = false
  for (const el of elements) {
    const b = getElementBounds(el)
    if (!b) continue
    any = true
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  if (!any) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export interface ThumbnailOptions {
  background?: string
  stroke?: string
  /** Px inset between the content bounds and the canvas edge. */
  padding?: number
}

/** True for shapes whose outline path should be closed when drawing. */
function shouldClosePath(el: CanvasElement): boolean {
  const data = (el as any)?.data
  switch (el.type) {
    case 'rectangle':
    case 'ellipse':
      return true
    case 'polyline':
    case 'revision-cloud':
      return Boolean(data?.closed)
    default:
      return false
  }
}

function drawElementOutline(ctx: CanvasRenderingContext2D, el: CanvasElement): void {
  const data = (el as any)?.data
  if (!data) return

  switch (el.type) {
    case 'image':
    case 'stamp':
      ctx.strokeRect(data.x, data.y, data.width, data.height)
      return
    case 'text':
    case 'text-annotation': {
      const x = data.x
      const y = data.y
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fill()
      const len = Math.max(4, (data.text?.length ?? 4) * ((data.fontSize || 16) * 0.5))
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + len, y)
      ctx.stroke()
      return
    }
    case 'measurement-distance':
      ctx.beginPath()
      ctx.moveTo(data.start[0], data.start[1])
      ctx.lineTo(data.end[0], data.end[1])
      ctx.stroke()
      return
    case 'measurement-area':
      return
    default: {
      const geo = getElementGeometry(el)
      if (!geo) return
      ctx.beginPath()
      if (geo.circle) {
        ctx.arc(geo.circle.center.x, geo.circle.center.y, geo.circle.radius, 0, Math.PI * 2)
        ctx.stroke()
        return
      }
      const pts: { x: number; y: number }[] = []
      if (geo.points?.length) {
        for (const p of geo.points) pts.push({ x: p.x, y: p.y })
      }
      if (pts.length) {
        ctx.moveTo(pts[0]!.x, pts[0]!.y)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y)
        if (shouldClosePath(el)) ctx.closePath()
        ctx.stroke()
        return
      }
      // Fall back to raw segments (e.g. `line` returns segments only)
      let first = true
      for (const seg of geo.segments ?? []) {
        if (first) {
          ctx.moveTo(seg.start.x, seg.start.y)
          first = false
        }
        ctx.lineTo(seg.end.x, seg.end.y)
      }
      if (!first) ctx.stroke()
    }
  }
}

/**
 * Render a cheap vector-ish preview of a board's elements into `canvas`.
 * Returns false (and draws nothing) when there is nothing drawable or the
 * context is unavailable — never throws.
 */
export function drawThumbnail(
  canvas: HTMLCanvasElement,
  elements: CanvasElement[],
  opts: ThumbnailOptions = {},
): boolean {
  try {
    const bounds = getCanvasBounds(elements)
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    const w = canvas.width
    const h = canvas.height
    if (w <= 0 || h <= 0) return false

    const { background = '#f8fafc', stroke = '#3b82f6', padding = 6 } = opts
    ctx.clearRect(0, 0, w, h)
    if (background) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, w, h)
    }

    const scale = Math.min((w - padding * 2) / bounds.width, (h - padding * 2) / bounds.height)
    ctx.save()
    ctx.translate(
      (w - bounds.width * scale) / 2 - bounds.x * scale,
      (h - bounds.height * scale) / 2 - bounds.y * scale,
    )
    ctx.scale(scale, scale)
    ctx.strokeStyle = stroke
    ctx.fillStyle = stroke
    ctx.lineWidth = 2 / scale
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const el of elements) {
      drawElementOutline(ctx, el)
    }
    ctx.restore()
    return true
  } catch {
    return false
  }
}
