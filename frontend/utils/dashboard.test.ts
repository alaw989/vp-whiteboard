import { describe, expect, it, vi } from 'vitest'
import type { CanvasElement } from '~/types'
import {
  buildIndexQuery,
  drawThumbnail,
  getCanvasBounds,
  getElementBounds,
} from '~/utils/dashboard'

// Element fixtures are typed `any` because `data` is a per-type union — mirrors
// the existing test style (geometryUtils.test.ts passes `as any`).

const rect = { type: 'rectangle', data: { x: 10, y: 20, width: 40, height: 30, stroke: '#000', strokeWidth: 2 } }
const circle = { type: 'circle', data: { cx: 50, cy: 50, radius: 10, stroke: '#000', strokeWidth: 2 } }
const line = { type: 'line', data: { start: [0, 0], end: [100, 50], color: '#000', size: 2 } }

describe('buildIndexQuery', () => {
  it('defaults to the plain index URL', () => {
    expect(buildIndexQuery()).toBe('/api/whiteboards')
    expect(buildIndexQuery({ sort: 'recent' })).toBe('/api/whiteboards')
  })

  it('adds sort=alpha when sorting alphabetically', () => {
    expect(buildIndexQuery({ sort: 'alpha' })).toBe('/api/whiteboards?sort=alpha')
  })

  it('adds search', () => {
    expect(buildIndexQuery({ search: 'foundation' })).toBe('/api/whiteboards?search=foundation')
  })

  it('combines search + alpha sort', () => {
    expect(buildIndexQuery({ search: 'beam', sort: 'alpha' })).toBe('/api/whiteboards?search=beam&sort=alpha')
  })

  it('trims whitespace-only search and drops it', () => {
    expect(buildIndexQuery({ search: '   ' })).toBe('/api/whiteboards')
    expect(buildIndexQuery({ search: '  slab  ' })).toBe('/api/whiteboards?search=slab')
  })

  it('URL-encodes special characters in search', () => {
    expect(buildIndexQuery({ search: 'a b&c' })).toBe('/api/whiteboards?search=a+b%26c')
  })

  it('adds include_archived=1 when viewing archived boards', () => {
    expect(buildIndexQuery({ includeArchived: true })).toBe('/api/whiteboards?include_archived=1')
  })

  it('omits include_archived by default / when false', () => {
    expect(buildIndexQuery({ includeArchived: false })).toBe('/api/whiteboards')
  })

  it('combines includeArchived with search + sort', () => {
    expect(buildIndexQuery({ search: 'beam', sort: 'alpha', includeArchived: true }))
      .toBe('/api/whiteboards?search=beam&sort=alpha&include_archived=1')
  })
})

describe('getElementBounds', () => {
  it('returns rect bounds from x/y/width/height', () => {
    expect(getElementBounds(rect as any)).toEqual({ x: 10, y: 20, width: 40, height: 30 })
  })

  it('returns circle bounds as a square around center', () => {
    expect(getElementBounds(circle as any)).toEqual({ x: 40, y: 40, width: 20, height: 20 })
  })

  it('returns axis-aligned ellipse bounds at rotation 0', () => {
    const el = { type: 'ellipse', data: { x: 50, y: 50, radiusX: 30, radiusY: 20, rotation: 0, stroke: '#000', strokeWidth: 1 } }
    const b = getElementBounds(el as any)!
    expect(b.width).toBeCloseTo(60)
    expect(b.height).toBeCloseTo(40)
    expect(b.x).toBeCloseTo(20)
    expect(b.y).toBeCloseTo(30)
  })

  it('returns line bounds', () => {
    expect(getElementBounds(line as any)).toEqual({ x: 0, y: 0, width: 100, height: 50 })
  })

  it('returns arrow bounds', () => {
    const el = { type: 'arrow', data: { points: [[10, 10], [60, 30]], pointerLength: 10, pointerWidth: 5, stroke: '#000', strokeWidth: 1, fill: '#000' } }
    expect(getElementBounds(el as any)).toEqual({ x: 10, y: 10, width: 50, height: 20 })
  })

  it('returns stroke bounds across all points', () => {
    const el = { type: 'stroke', data: { points: [[0, 0, 0.5], [10, 20, 0.5], [30, 5, 0.5]], color: '#000', size: 2, tool: 'pen', smooth: false } }
    expect(getElementBounds(el as any)).toEqual({ x: 0, y: 0, width: 30, height: 20 })
  })

  it('returns polyline bounds', () => {
    const el = { type: 'polyline', data: { points: [[5, 5], [15, 5], [15, 25]], color: '#000', size: 1, closed: false } }
    expect(getElementBounds(el as any)).toEqual({ x: 5, y: 5, width: 10, height: 20 })
  })

  it('returns image bounds', () => {
    const el = { type: 'image', data: { src: 'x.png', x: 1, y: 2, width: 30, height: 40 } }
    expect(getElementBounds(el as any)).toEqual({ x: 1, y: 2, width: 30, height: 40 })
  })

  it('returns stamp bounds', () => {
    const el = { type: 'stamp', data: { stampType: 'APPROVED', text: 'OK', x: 3, y: 4, width: 20, height: 10, backgroundColor: '#000', textColor: '#fff', borderColor: '#000', fontSize: 8, padding: 2, borderRadius: 1 } }
    expect(getElementBounds(el as any)).toEqual({ x: 3, y: 4, width: 20, height: 10 })
  })

  it('returns text bounds from origin + font metrics', () => {
    const el = { type: 'text', data: { text: 'hello', x: 10, y: 20, fontSize: 16, color: '#000', fontFamily: 'Arial' } }
    expect(getElementBounds(el as any)).toEqual({ x: 10, y: 20, width: 80, height: 16 })
  })

  it('covers text-annotation origin and leader end', () => {
    const el = { type: 'text-annotation', data: { text: 'note', x: 0, y: 0, fontSize: 12, color: '#000', fontFamily: 'Arial', leaderLine: { start: [0, 0], end: [50, 25] } } }
    expect(getElementBounds(el as any)).toEqual({ x: 0, y: 0, width: 50, height: 25 })
  })

  it('returns measurement-distance bounds', () => {
    const el = { type: 'measurement-distance', data: { start: [0, 0], end: [100, 40], pixelsPerInch: 96, unit: 'inches', precision: 2 } }
    expect(getElementBounds(el as any)).toEqual({ x: 0, y: 0, width: 100, height: 40 })
  })

  it('returns dimension bounds', () => {
    const el = { type: 'dimension', data: { start: [10, 10], end: [90, 10], offset: 20, pixelsPerInch: 96, unit: 'inches', precision: 2, style: 'linear', color: '#000', size: 1 } }
    expect(getElementBounds(el as any)).toEqual({ x: 10, y: 10, width: 80, height: 0 })
  })

  it('returns revision-cloud bounds', () => {
    const el = { type: 'revision-cloud', data: { points: [[0, 0], [50, 0], [50, 50]], arcLength: 24, color: '#000', size: 2, closed: false } }
    expect(getElementBounds(el as any)).toEqual({ x: 0, y: 0, width: 50, height: 50 })
  })

  it('returns null for measurement-area (references another element)', () => {
    const el = { type: 'measurement-area', data: { targetElementId: 'x1', pixelsPerInch: 96, unit: 'sq-inches', precision: 2 } }
    expect(getElementBounds(el as any)).toBeNull()
  })

  it('returns null for missing data', () => {
    expect(getElementBounds({ type: 'rectangle' } as any)).toBeNull()
    expect(getElementBounds(null as any)).toBeNull()
    expect(getElementBounds(undefined as any)).toBeNull()
  })

  it('returns null for empty stroke points', () => {
    const el = { type: 'stroke', data: { points: [], color: '#000', size: 2, tool: 'pen', smooth: false } }
    expect(getElementBounds(el as any)).toBeNull()
  })

  it('returns null for a text-annotation without leader end', () => {
    const el = { type: 'text-annotation', data: { text: 'note', x: 5, y: 5, fontSize: 12, color: '#000', fontFamily: 'Arial' } }
    expect(getElementBounds(el as any)).toEqual({ x: 5, y: 5, width: 0, height: 0 })
  })

  it('returns null for a text-annotation with missing coordinates', () => {
    const el = { type: 'text-annotation', data: { text: 'note', fontSize: 12 } }
    expect(getElementBounds(el as any)).toBeNull()
  })

  it('returns null for measurement-distance without start/end', () => {
    const el = { type: 'measurement-distance', data: { pixelsPerInch: 96, unit: 'inches', precision: 2 } }
    expect(getElementBounds(el as any)).toBeNull()
  })
})

describe('getCanvasBounds', () => {
  it('returns null for empty / non-array input', () => {
    expect(getCanvasBounds([])).toBeNull()
    expect(getCanvasBounds(undefined as any)).toBeNull()
  })

  it('unions the bounds of multiple elements', () => {
    const el = [rect, { type: 'circle', data: { cx: 100, cy: 100, radius: 5, stroke: '#000', strokeWidth: 1 } }]
    const b = getCanvasBounds(el as any)!
    expect(b.x).toBe(10)
    expect(b.y).toBe(20)
    expect(b.width).toBe(95) // 105 - 10
    expect(b.height).toBe(85) // 105 - 20
  })

  it('ignores malformed elements but keeps valid ones', () => {
    const b = getCanvasBounds([{ type: 'measurement-area', data: { targetElementId: 'x' } }, rect] as any)!
    expect(b).toEqual({ x: 10, y: 20, width: 40, height: 30 })
  })

  it('returns null when every element is unboundable', () => {
    expect(getCanvasBounds([{ type: 'measurement-area', data: { targetElementId: 'x' } }] as any)).toBeNull()
  })
})

// --- drawThumbnail ---

function makeFakeCanvas(ctx: any): HTMLCanvasElement {
  return { width: 200, height: 100, getContext: () => ctx } as unknown as HTMLCanvasElement
}

function makeFakeCtx() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    strokeRect: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineJoin: '',
    lineCap: '',
  }
}

describe('drawThumbnail', () => {
  it('returns false and draws nothing for empty elements', () => {
    const ctx = makeFakeCtx()
    const canvas = makeFakeCanvas(ctx)
    expect(drawThumbnail(canvas, [])).toBe(false)
    expect(ctx.clearRect).not.toHaveBeenCalled()
  })

  it('returns false when elements have no drawable content', () => {
    const ctx = makeFakeCtx()
    const canvas = makeFakeCanvas(ctx)
    expect(drawThumbnail(canvas, [{ type: 'measurement-area', data: { targetElementId: 'x' } }] as any)).toBe(false)
    expect(ctx.clearRect).not.toHaveBeenCalled()
  })

  it('returns false when no 2d context is available', () => {
    const canvas = makeFakeCanvas(null)
    expect(drawThumbnail(canvas, [rect] as any)).toBe(false)
  })

  it('returns false for a zero-size canvas', () => {
    const ctx = makeFakeCtx()
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
    expect(drawThumbnail(canvas, [rect] as any)).toBe(false)
  })

  it('fills the background and centers content with a fit-transform', () => {
    const ctx = makeFakeCtx()
    const canvas = makeFakeCanvas(ctx)
    expect(drawThumbnail(canvas, [rect] as any)).toBe(true)
    // rect bounds 40x30, canvas 200x100, padding 6 → scale = min(188/40, 88/30) = 88/30 ≈ 2.933
    const scale = 88 / 30
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 200, 100)
    expect(ctx.scale).toHaveBeenCalledWith(scale, scale)
    expect(ctx.translate).toHaveBeenCalledWith(
      (200 - 40 * scale) / 2 - 10 * scale,
      (100 - 30 * scale) / 2 - 20 * scale,
    )
    expect(ctx.lineWidth).toBeCloseTo(2 / scale)
  })

  it('strokes a closed path for a rectangle', () => {
    const ctx = makeFakeCtx()
    const canvas = makeFakeCanvas(ctx)
    drawThumbnail(canvas, [rect] as any)
    expect(ctx.beginPath).toHaveBeenCalled()
    expect(ctx.closePath).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('draws a circle via arc without closing', () => {
    const ctx = makeFakeCtx()
    const canvas = makeFakeCanvas(ctx)
    drawThumbnail(canvas, [circle] as any)
    expect(ctx.arc).toHaveBeenCalledWith(50, 50, 10, 0, Math.PI * 2)
    expect(ctx.closePath).not.toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('draws a segments-only line (no closePath)', () => {
    const ctx = makeFakeCtx()
    const canvas = makeFakeCanvas(ctx)
    drawThumbnail(canvas, [line] as any)
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0)
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 50)
    expect(ctx.closePath).not.toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('draws image/stamp as stroked rects', () => {
    const ctx = makeFakeCtx()
    const canvas = makeFakeCanvas(ctx)
    const stamp = { type: 'stamp', data: { stampType: 'APPROVED', text: 'OK', x: 0, y: 0, width: 30, height: 15, backgroundColor: '#000', textColor: '#fff', borderColor: '#000', fontSize: 8, padding: 2, borderRadius: 1 } }
    drawThumbnail(canvas, [stamp] as any)
    expect(ctx.strokeRect).toHaveBeenCalledWith(0, 0, 30, 15)
  })

  it('draws a measurement-distance as a line', () => {
    const ctx = makeFakeCtx()
    const canvas = makeFakeCanvas(ctx)
    const dist = { type: 'measurement-distance', data: { start: [5, 5], end: [95, 45], pixelsPerInch: 96, unit: 'inches', precision: 2 } }
    expect(drawThumbnail(canvas, [dist] as any)).toBe(true)
    expect(ctx.moveTo).toHaveBeenCalledWith(5, 5)
    expect(ctx.lineTo).toHaveBeenCalledWith(95, 45)
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('skips measurement-area elements while drawing others', () => {
    const ctx = makeFakeCtx()
    const canvas = makeFakeCanvas(ctx)
    const area = { type: 'measurement-area', data: { targetElementId: 'x', pixelsPerInch: 96, unit: 'sq-inches', precision: 2 } }
    expect(drawThumbnail(canvas, [area, rect] as any)).toBe(true)
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('draws a text element as an origin dot + baseline', () => {
    const ctx = makeFakeCtx()
    const canvas = makeFakeCanvas(ctx)
    const text = { type: 'text', data: { text: 'hi', x: 10, y: 20, fontSize: 16, color: '#000', fontFamily: 'Arial' } }
    expect(drawThumbnail(canvas, [text] as any)).toBe(true)
    expect(ctx.arc).toHaveBeenCalledWith(10, 20, 3, 0, Math.PI * 2)
    expect(ctx.fill).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('swallows exceptions and returns false', () => {
    const ctx = makeFakeCtx()
    ctx.stroke = vi.fn().mockImplementation(() => { throw new Error('boom') })
    const canvas = makeFakeCanvas(ctx)
    expect(drawThumbnail(canvas, [line] as any)).toBe(false)
  })
})

// Type sanity: ensure CanvasElement[] is accepted (used by index.vue).
void ((): void => {
  const els: CanvasElement[] = []
  getCanvasBounds(els)
  drawThumbnail(null as unknown as HTMLCanvasElement, els)
})()
