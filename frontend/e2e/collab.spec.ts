import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import {
  login,
  createWhiteboard,
  canvasFingerprint,
  pixelAt,
  waitForConnected,
  waitForCanvas,
  expectCanvasToChange,
} from './helpers'

// Local dev ports (must match playwright.config.ts webServer + frontend/.env).
const LARAVEL_URL = process.env.E2E_LARAVEL_URL || 'http://localhost:8002'
const FRONTEND_URL = process.env.E2E_FRONTEND_URL || 'http://localhost:3000'

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

test('owner and anonymous share viewer stay in live sync (both directions, no refresh)', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const viewerContext = await browser.newContext()
  try {
    // --- Owner: log in, create a fresh whiteboard, join the WS room. ---
    const owner = await ownerContext.newPage()
    await login(owner)
    const whiteboardId = await createWhiteboard(owner)
    await waitForCanvas(owner)
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
    await waitForCanvas(viewer)
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
  await waitForCanvas(page)

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
