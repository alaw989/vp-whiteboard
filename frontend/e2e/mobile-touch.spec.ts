import { test, expect, type Page } from '@playwright/test'
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from './global-setup'

// Mobile device emulation: small viewport + touch + mobile UA, so the app
// renders the md:hidden bottom toolbar and pointer events can be `touch`.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#email', E2E_OWNER_EMAIL)
  await page.fill('#password', E2E_OWNER_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(whiteboards?|$)/, { timeout: 15000 })
}

async function createWhiteboard(page: Page): Promise<string> {
  await page.goto('/whiteboard/new')
  await page.waitForURL(
    (url) => /^\/whiteboard\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
    { timeout: 15000 },
  )
  const pathname = new URL(page.url()).pathname
  return pathname.substring(pathname.lastIndexOf('/') + 1)
}

/**
 * Coarse, deterministic hash of the main Konva layer's rendered pixels — same
 * helper as collab.spec.ts. Read-only proof that a shape actually rendered.
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

/**
 * Dispatch a real PointerEvent sequence (pointerType 'touch') on the Konva
 * stage content element. Playwright's mouse API always emits pointerType
 * 'mouse' and touchscreen.tap() fires no pointermove, so neither can drive a
 * Konva stroke (down → moves → up). Konva's stage listens on the content div
 * and computes positions from clientX/clientY, so synthetic events carrying
 * those coords behave like real touches.
 */
async function touchPointer(
  page: Page,
  events: Array<{
    type: 'pointerdown' | 'pointermove' | 'pointerup'
    pointerId: number
    clientX: number
    clientY: number
    pressure?: number
    buttons?: number
  }>,
) {
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
async function touchStroke(page: Page, start: { x: number; y: number }, end: { x: number; y: number }) {
  const events: Array<{
    type: 'pointerdown' | 'pointermove' | 'pointerup'
    pointerId: number
    clientX: number
    clientY: number
    buttons?: number
  }> = [{ type: 'pointerdown', pointerId: 1, clientX: start.x, clientY: start.y }]
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

async function canvasBox(page: Page) {
  const box = await page.locator('.whiteboard-container canvas').first().boundingBox()
  if (!box) throw new Error('whiteboard stage not visible')
  return box
}

test('mobile toolbar selects pen; a touch pen stroke lands on the canvas', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await expect(page.locator('.whiteboard-container canvas').first()).toBeAttached({ timeout: 20000 })

  // md:hidden bottom toolbar is shown on a mobile viewport.
  const mobileToolbar = page.getByRole('toolbar', { name: 'Mobile whiteboard tools' })
  await expect(mobileToolbar).toBeVisible({ timeout: 20000 })

  // Pick the pen from the mobile primary strip and wait until it's active
  // (currentTool must propagate to the canvas before we draw).
  await mobileToolbar.getByTitle('Pen (P)').click()
  await expect(mobileToolbar.getByTitle('Pen (P)')).toHaveClass(/bg-blue-100/)

  const baseline = await canvasFingerprint(page)
  const box = await canvasBox(page)
  await touchStroke(
    page,
    { x: box.x + box.width * 0.3, y: box.y + box.height * 0.3 },
    { x: box.x + box.width * 0.6, y: box.y + box.height * 0.5 },
  )

  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)
})

test('two-finger pan moves the viewport without committing a stroke', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await expect(page.locator('.whiteboard-container canvas').first()).toBeAttached({ timeout: 20000 })

  const mobileToolbar = page.getByRole('toolbar', { name: 'Mobile whiteboard tools' })
  await expect(mobileToolbar).toBeVisible({ timeout: 20000 })
  await mobileToolbar.getByTitle('Pen (P)').click()
  await expect(mobileToolbar.getByTitle('Pen (P)')).toHaveClass(/bg-blue-100/)

  const baseline = await canvasFingerprint(page)
  const box = await canvasBox(page)
  const cx = box.x + box.width * 0.5
  const cy = box.y + box.height * 0.4
  const spread = 60

  // Pan gesture: two pointers hold a fixed spread, both translate (+40,+30).
  // The content renders with the viewport baked in, so the fingerprint MUST
  // change (the pan took effect)…
  await touchPointer(page, [
    { type: 'pointerdown', pointerId: 1, clientX: cx - spread, clientY: cy },
    { type: 'pointerdown', pointerId: 2, clientX: cx + spread, clientY: cy },
    { type: 'pointermove', pointerId: 1, clientX: cx - spread + 40, clientY: cy + 30 },
    { type: 'pointermove', pointerId: 2, clientX: cx + spread + 40, clientY: cy + 30 },
    { type: 'pointerup', pointerId: 1, clientX: cx - spread + 40, clientY: cy + 30, buttons: 0 },
    { type: 'pointerup', pointerId: 2, clientX: cx + spread + 40, clientY: cy + 30, buttons: 0 },
  ])
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)

  // …and panning back by the exact inverse restores the original viewport with
  // no elements committed (a touch draw would have left pixels behind, so the
  // fingerprint would NOT return to the baseline).
  await touchPointer(page, [
    { type: 'pointerdown', pointerId: 1, clientX: cx - spread + 40, clientY: cy + 30 },
    { type: 'pointerdown', pointerId: 2, clientX: cx + spread + 40, clientY: cy + 30 },
    { type: 'pointermove', pointerId: 1, clientX: cx - spread, clientY: cy },
    { type: 'pointermove', pointerId: 2, clientX: cx + spread, clientY: cy },
    { type: 'pointerup', pointerId: 1, clientX: cx - spread, clientY: cy, buttons: 0 },
    { type: 'pointerup', pointerId: 2, clientX: cx + spread, clientY: cy, buttons: 0 },
  ])
  await expect.poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] }).toBe(baseline)
})

test('mobile toolbar color and size selection flow through to a stroke', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await expect(page.locator('.whiteboard-container canvas').first()).toBeAttached({ timeout: 20000 })

  const mobileToolbar = page.getByRole('toolbar', { name: 'Mobile whiteboard tools' })
  await expect(mobileToolbar).toBeVisible({ timeout: 20000 })
  await mobileToolbar.getByTitle('Pen (P)').click()
  await expect(mobileToolbar.getByTitle('Pen (P)')).toHaveClass(/bg-blue-100/)

  // Expand the toolbar via the collapsed color swatch (the strip's button whose
  // child swatch div has the rounded size classes).
  const colorSwatch = mobileToolbar
    .locator('button')
    .filter({ has: page.locator('.w-7.h-7.rounded-md') })
  await colorSwatch.click()
  await expect(mobileToolbar.getByText('Tools', { exact: true })).toBeVisible({ timeout: 10000 })

  // Color: type a valid hex into the color-wheel's input — the header hex
  // readout reflects the new currentColor once the toolbar propagated it.
  await mobileToolbar.locator('input[type="text"]').fill('#ff0000')
  await expect(mobileToolbar.getByText('#FF0000', { exact: true })).toBeVisible({ timeout: 10000 })

  // Size: pick size 8 from the Stroke Size row.
  await mobileToolbar.getByRole('button', { name: '8', exact: true }).click()
  await expect(mobileToolbar.getByRole('button', { name: '8', exact: true })).toHaveClass(/bg-blue-100/)

  const baseline = await canvasFingerprint(page)
  const box = await canvasBox(page)
  await touchStroke(
    page,
    { x: box.x + box.width * 0.3, y: box.y + box.height * 0.25 },
    { x: box.x + box.width * 0.65, y: box.y + box.height * 0.45 },
  )
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)
})
