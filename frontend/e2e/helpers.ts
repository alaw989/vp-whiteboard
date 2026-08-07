import { expect, type Page } from '@playwright/test'
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from './global-setup'

/** Log in as the pre-seeded, approved e2e owner. */
export async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#email', E2E_OWNER_EMAIL)
  await page.fill('#password', E2E_OWNER_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(whiteboards?|$)/, { timeout: 15000 })
}

/** Create a fresh whiteboard and return its UUID (from the redirected URL). */
export async function createWhiteboard(page: Page): Promise<string> {
  await page.goto('/whiteboard/new')
  // The /new route POSTs the board then redirects to /whiteboard/{id}; wait
  // for the real board URL, NOT the /whiteboard/new creation page (whose last
  // path segment is "new", not the UUID).
  await page.waitForURL(
    (url) => /^\/whiteboard\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
    { timeout: 15000 },
  )
  const pathname = new URL(page.url()).pathname
  return pathname.substring(pathname.lastIndexOf('/') + 1)
}

/**
 * Wait until the real-time connection badge reads "connected". The relay only
 * sets it once the WS handshake authenticated — the owner via the
 * laravel_session cookie, the share viewer via the /s/{token} share token — so
 * this is the assertion that both auth paths were exercised end to end.
 */
export async function waitForConnected(page: Page) {
  await expect(page.getByText('connected', { exact: true })).toBeVisible({ timeout: 20000 })
}

/**
 * Coarse, deterministic hash of the main Konva layer's rendered pixels. The
 * canvas is reduced to a 24-wide grid of average luma (via getImageData, NOT
 * drawImage — headless Chromium serves a stale surface to drawImage, so a
 * freshly-drawn stroke would be invisible to it), so a stroke anywhere shifts
 * the hash. Read-only — proves a shape actually rendered, without touching app
 * internals.
 */
export function canvasFingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const container = document.querySelector('.whiteboard-container')
    if (!container) return 'no-container'
    const canvases = Array.from(container.querySelectorAll('canvas')) as HTMLCanvasElement[]
    if (canvases.length === 0) return 'no-canvas'
    const main = canvases.reduce((a, b) =>
      a.width * a.height >= b.width * b.height ? a : b,
    )
    const ctx = main.getContext('2d')!
    const data = ctx.getImageData(0, 0, main.width, main.height).data
    const grid = 24
    const gw = grid
    const gh = Math.max(1, Math.round((grid * main.height) / main.width))
    const sums = new Array<number>(gw * gh).fill(0)
    for (let y = 0; y < main.height; y++) {
      const gy = Math.min(gh - 1, Math.floor((y * gh) / main.height))
      for (let x = 0; x < main.width; x++) {
        const gx = Math.min(gw - 1, Math.floor((x * gw) / main.width))
        sums[gy * gw + gx]! += data[(y * main.width + x) * 4]!
      }
    }
    const per = Math.floor((main.width * main.height) / (gw * gh))
    let h = 2166136261
    for (let i = 0; i < sums.length; i++) {
      h ^= Math.round(sums[i]! / per)
      h = Math.imul(h, 16777619)
    }
    return (h >>> 0).toString(16)
  })
}

/**
 * Sample a single RGBA pixel from the largest Konva layer canvas at a CSS
 * (viewport) coordinate, mapping through the canvas's own devicePixelRatio.
 * The highlighter renders at opacity 0.5, so a black highlight over the
 * #f5f5f5 background blends to ~mid-gray while a pen stroke is opaque black —
 * pixel color distinguishes which tool actually rendered.
 */
export function pixelAt(
  page: Page,
  point: { x: number; y: number },
): Promise<[number, number, number, number]> {
  return page.evaluate(({ x, y }) => {
    const container = document.querySelector('.whiteboard-container')
    if (!container) return [0, 0, 0, 0]
    const canvases = Array.from(container.querySelectorAll('canvas')) as HTMLCanvasElement[]
    if (canvases.length === 0) return [0, 0, 0, 0]
    const main = canvases.reduce((a, b) =>
      a.width * a.height >= b.width * b.height ? a : b,
    )
    const rect = main.getBoundingClientRect()
    const px = Math.round((x - rect.left) * (main.width / rect.width))
    const py = Math.round((y - rect.top) * (main.height / rect.height))
    const d = main.getContext('2d')!.getImageData(px, py, 1, 1).data
    return [d[0], d[1], d[2], d[3]]
  }, point)
}

export type TouchEvent = {
  type: 'pointerdown' | 'pointermove' | 'pointerup'
  pointerId: number
  clientX: number
  clientY: number
  pressure?: number
  buttons?: number
}

/**
 * Dispatch a real PointerEvent sequence (pointerType 'touch') on the Konva
 * stage content element. Playwright's mouse API always emits pointerType
 * 'mouse' and touchscreen.tap() fires no pointermove, so neither can drive a
 * Konva stroke (down → moves → up). Konva's stage listens on the content div
 * and computes positions from clientX/clientY, so synthetic events carrying
 * those coords behave like real touches.
 */
export async function touchPointer(page: Page, events: TouchEvent[]) {
  await page.evaluate((evts) => {
    const canvas = document.querySelector('.whiteboard-container canvas')
    if (!canvas) throw new Error('stage canvas not found')
    const content = canvas.parentElement
    if (!content) throw new Error('stage content element not found')
    for (const evt of evts) {
      content.dispatchEvent(
        new PointerEvent(evt.type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: evt.pointerId,
          pointerType: 'touch',
          isPrimary: evt.pointerId === 1,
          clientX: evt.clientX,
          clientY: evt.clientY,
          pressure: evt.pressure ?? 0.5,
          buttons: evt.buttons ?? 1,
        }),
      )
    }
  }, events)
}

/** A single-finger touch pen stroke from start to end (pressure 0.5). */
export async function touchStroke(page: Page, start: { x: number; y: number }, end: { x: number; y: number }) {
  const events: TouchEvent[] = [{ type: 'pointerdown', pointerId: 1, clientX: start.x, clientY: start.y }]
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    events.push({
      type: 'pointermove',
      pointerId: 1,
      clientX: start.x + (end.x - start.x) * t,
      clientY: start.y + (end.y - start.y) * t,
    })
  }
  events.push({ type: 'pointerup', pointerId: 1, clientX: end.x, clientY: end.y, buttons: 0 })
  await touchPointer(page, events)
}

/** Bounding box of the whiteboard stage's first canvas (viewport CSS px). */
export async function canvasBox(page: Page) {
  const box = await page.locator('.whiteboard-container canvas').first().boundingBox()
  if (!box) throw new Error('whiteboard stage not visible')
  return box
}

/**
 * Poll `page` until its canvas pixels differ from `baseline`, then re-check
 * after a settle window — proving a COMMITTED element arrived via the WS relay
 * (a transient remote active-stroke preview would vanish again on settle).
 */
export async function expectCanvasToChange(page: Page, baseline: string) {
  await expect.poll(() => canvasFingerprint(page), {
    timeout: 20000,
    intervals: [250],
  }).not.toBe(baseline)
  await page.waitForTimeout(750)
  expect(await canvasFingerprint(page)).not.toBe(baseline)
}
