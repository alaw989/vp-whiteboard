import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from './global-setup'

// Local dev ports (must match playwright.config.ts webServer + frontend/.env).
const LARAVEL_URL = process.env.E2E_LARAVEL_URL || 'http://localhost:8002'
const FRONTEND_URL = process.env.E2E_FRONTEND_URL || 'http://localhost:3000'

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#email', E2E_OWNER_EMAIL)
  await page.fill('#password', E2E_OWNER_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(whiteboards?|$)/, { timeout: 15000 })
}

async function createWhiteboard(page: Page): Promise<string> {
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
async function waitForConnected(page: Page) {
  await expect(page.getByText('connected', { exact: true })).toBeVisible({ timeout: 20000 })
}

/**
 * Owner-only: create an edit-role share link via the API. The request must
 * present the login session cookie AND Sanctum's stateful-origin + XSRF headers
 * (local SANCTUM_STATEFUL_DOMAINS is localhost:3000, so origin must be the
 * frontend). Returns the raw /s/{token} path — the token is only ever returned
 * here, at creation time.
 */
async function createShareLink(context: BrowserContext, whiteboardId: string): Promise<string> {
  // The app hits /sanctum/csrf-cookie before every mutation; do the same so the
  // XSRF-TOKEN cookie is guaranteed fresh even if login didn't set one.
  await context.request.get(`${LARAVEL_URL}/sanctum/csrf-cookie`)
  const cookies = await context.cookies()
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
  const xsrf = cookies.find(c => c.name === 'XSRF-TOKEN')?.value

  const res = await context.request.post(`${LARAVEL_URL}/api/whiteboards/${whiteboardId}/shares`, {
    data: { role: 'edit' },
    headers: {
      origin: new URL(FRONTEND_URL).origin,
      referer: `${FRONTEND_URL}/`,
      accept: 'application/json',
      'x-requested-with': 'XMLHttpRequest',
      ...(xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } : {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
  })
  expect(res.status()).toBe(201)
  const body = (await res.json()) as { data: { url: string } }
  return body.data.url
}

/**
 * Coarse, deterministic hash of the main Konva layer's rendered pixels. The
 * canvas is reduced to a 24-wide grid of average luma (via getImageData, NOT
 * drawImage — headless Chromium serves a stale surface to drawImage, so a
 * freshly-drawn stroke would be invisible to it), so a stroke anywhere shifts
 * the hash. Read-only — proves a shape actually rendered, without touching app
 * internals.
 */
function canvasFingerprint(page: Page): Promise<string> {
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

async function selectPen(page: Page) {
  await page.getByRole('button', { name: 'Pen tool, press P', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Pen tool, press P', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
}

async function selectHighlighter(page: Page) {
  await page.getByRole('button', { name: 'Highlighter tool, press B', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Highlighter tool, press B', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
}

async function drawStroke(page: Page) {
  const box = await page.locator('.whiteboard-container canvas').first().boundingBox()
  if (!box) throw new Error('whiteboard stage not visible')
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 8 })
  await page.mouse.up()
}

/**
 * Sample a single RGBA pixel from the largest Konva layer canvas at a CSS
 * (viewport) coordinate, mapping through the canvas's own devicePixelRatio.
 * The highlighter renders at opacity 0.5, so a black highlight over the
 * #f5f5f5 background blends to ~mid-gray while a pen stroke is opaque black —
 * pixel color distinguishes which tool actually rendered.
 */
function pixelAt(page: Page, point: { x: number; y: number }): Promise<[number, number, number, number]> {
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

/**
 * Poll `page` until its canvas pixels differ from `baseline`, then re-check
 * after a settle window — proving a COMMITTED element arrived via the WS relay
 * (a transient remote active-stroke preview would vanish again on settle).
 */
async function expectCanvasToChange(page: Page, baseline: string) {
  await expect.poll(() => canvasFingerprint(page), {
    timeout: 20000,
    intervals: [250],
  }).not.toBe(baseline)
  await page.waitForTimeout(750)
  expect(await canvasFingerprint(page)).not.toBe(baseline)
}

test('owner and anonymous share viewer stay in live sync (both directions, no refresh)', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const viewerContext = await browser.newContext()
  try {
    // --- Owner: log in, create a fresh whiteboard, join the WS room. ---
    const owner = await ownerContext.newPage()
    await login(owner)
    const whiteboardId = await createWhiteboard(owner)
    await expect(owner.locator('.whiteboard-container canvas').first()).toBeAttached({ timeout: 20000 })
    await waitForConnected(owner)

    // --- Owner creates an edit-role share link. ---
    const shareUrl = await createShareLink(ownerContext, whiteboardId)

    // --- Anonymous viewer: no session, opens /s/{token} (sets the httpOnly
    // vp_share_token cookie, redirects to the board, WS authenticates via the
    // share token). The API returns the link with the LARAVEL origin — /s/ is a
    // Nuxt route, so normalize to the frontend origin first. ---
    const viewer = await viewerContext.newPage()
    const sharePath = new URL(shareUrl, FRONTEND_URL).pathname
    await viewer.goto(`${FRONTEND_URL}${sharePath}`)
    await viewer.waitForURL(/\/whiteboard\//, { timeout: 15000 })
    await expect(viewer.locator('.whiteboard-container canvas').first()).toBeAttached({ timeout: 20000 })
    await waitForConnected(viewer)

    // Both clients are authenticated to the relay (owner session + share token).
    await expect(owner.getByText('connected', { exact: true })).toBeVisible({ timeout: 20000 })

    // --- Direction 1: owner draws → viewer renders WITHOUT a reload. ---
    const viewerBaseline = await canvasFingerprint(viewer)
    await selectPen(owner)
    await drawStroke(owner)
    await expectCanvasToChange(viewer, viewerBaseline)

    // --- Direction 2: viewer draws → owner renders WITHOUT a reload. ---
    const ownerBaseline = await canvasFingerprint(owner)
    await selectPen(viewer)
    await drawStroke(viewer)
    await expectCanvasToChange(owner, ownerBaseline)

    // Connections still live after both directions.
    await expect(owner.getByText('connected', { exact: true })).toBeVisible()
    await expect(viewer.getByText('connected', { exact: true })).toBeVisible()
  } finally {
    await ownerContext.close()
    await viewerContext.close()
  }
})

test('desktop mouse highlighter renders translucent; pen renders opaque (regression)', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await expect(page.locator('.whiteboard-container canvas').first()).toBeAttached({ timeout: 20000 })

  const box = await page.locator('.whiteboard-container canvas').first().boundingBox()
  if (!box) throw new Error('whiteboard stage not visible')

  // Highlighter over the MOUSE path (the globalAlpha→opacity bug predated
  // touch, so guard both input paths): a committed highlight must blend at
  // 50% alpha → ~mid-gray, not opaque black.
  await selectHighlighter(page)
  const hlStart = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.2 }
  const hlEnd = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.35 }
  const hlMid = { x: box.x + box.width * 0.45, y: box.y + box.height * 0.275 }
  const hlBaseline = await canvasFingerprint(page)
  await page.mouse.move(hlStart.x, hlStart.y)
  await page.mouse.down()
  await page.mouse.move(hlEnd.x, hlEnd.y, { steps: 8 })
  await page.mouse.up()
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(hlBaseline)

  const hlPx = await pixelAt(page, hlMid)
  for (const ch of hlPx.slice(0, 3)) {
    expect(ch).toBeGreaterThan(60)
    expect(ch).toBeLessThan(200)
  }

  // Pen over the same canvas at its own midpoint is opaque black — the
  // contrast confirms the translucency is highlighter-specific.
  await selectPen(page)
  const penStart = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.35 }
  const penEnd = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.5 }
  const penMid = { x: box.x + box.width * 0.45, y: box.y + box.height * 0.425 }
  const penBaseline = await canvasFingerprint(page)
  await page.mouse.move(penStart.x, penStart.y)
  await page.mouse.down()
  await page.mouse.move(penEnd.x, penEnd.y, { steps: 8 })
  await page.mouse.up()
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(penBaseline)

  const penPx = await pixelAt(page, penMid)
  for (const ch of penPx.slice(0, 3)) {
    expect(ch).toBeLessThan(80)
  }
})
