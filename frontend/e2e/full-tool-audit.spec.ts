import { test, expect, type Page } from '@playwright/test'
import {
  login,
  createWhiteboard,
  canvasFingerprint,
  canvasBox,
  touchStroke,
  waitForCanvas,
  expandMobileToolbar,
} from './helpers'

/**
 * Fresh full-tool audit — drive EVERY whiteboard tool through the e2e harness
 * (mouse + touch) and assert each creates/persists a real element. This spec is
 * populated incrementally: each loop iteration adds a group of tools. First
 * batch: line, arrow, circle, ellipse — the four simplest create-from-scratch
 * shapes (down-drag-up commit on pointerup, same pipeline as the already-covered
 * rectangle). Fix any tool that fails to commit.
 *
 * Desktop: real toolbar button (aria-label `${Name} tool, press ${Shortcut}`) +
 * page.mouse. Mobile: expanded palette button (bare `title`) + synthetic touch
 * pointers via helpers.touchStroke.
 */

async function selectDesktopTool(page: Page, name: string, shortcut: string) {
  const btn = page
    .getByRole('toolbar', { name: 'Whiteboard tools' })
    .getByRole('button', { name: `${name} tool, press ${shortcut}`, exact: true })
  await btn.click()
  await expect(btn).toHaveAttribute('aria-pressed', 'true')
}

async function mouseDrag(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await page.mouse.up()
}

/** Select a tool, capture the baseline, draw, and assert an element committed. */
async function assertDesktopToolDraws(
  page: Page,
  name: string,
  shortcut: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  await selectDesktopTool(page, name, shortcut)
  const baseline = await canvasFingerprint(page)
  await mouseDrag(page, start, end)
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)
  await page.waitForTimeout(750)
  expect(await canvasFingerprint(page)).not.toBe(baseline)
}

test.describe('full tool audit — desktop mouse', () => {
  test('line tool creates a committed line element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    await assertDesktopToolDraws(
      page,
      'Line',
      'L',
      { x: box.x + box.width * 0.25, y: box.y + box.height * 0.3 },
      { x: box.x + box.width * 0.55, y: box.y + box.height * 0.5 },
    )
  })

  test('arrow tool creates a committed arrow element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    await assertDesktopToolDraws(
      page,
      'Arrow',
      'A',
      { x: box.x + box.width * 0.25, y: box.y + box.height * 0.4 },
      { x: box.x + box.width * 0.55, y: box.y + box.height * 0.6 },
    )
  })

  test('circle tool creates a committed circle element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    const cx = box.x + box.width * 0.4
    const cy = box.y + box.height * 0.4
    // Down = center, drag = radius (must exceed the 5px discard threshold).
    await assertDesktopToolDraws(
      page,
      'Circle',
      'C',
      { x: cx, y: cy },
      { x: cx + box.width * 0.2, y: cy },
    )
  })

  test('ellipse tool creates a committed ellipse element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    await assertDesktopToolDraws(
      page,
      'Ellipse',
      'E',
      { x: box.x + box.width * 0.25, y: box.y + box.height * 0.3 },
      { x: box.x + box.width * 0.6, y: box.y + box.height * 0.55 },
    )
  })
})

test.describe('full tool audit — mobile touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('line tool touch-drag creates a committed line element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const mobileToolbar = await expandMobileToolbar(page)
    await mobileToolbar.getByTitle('Line', { exact: true }).click()

    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    await touchStroke(
      page,
      { x: box.x + 50, y: box.y + 160 },
      { x: box.x + 250, y: box.y + 290 },
    )
    await expect
      .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
      .not.toBe(baseline)
  })

  test('arrow tool touch-drag creates a committed arrow element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const mobileToolbar = await expandMobileToolbar(page)
    await mobileToolbar.getByTitle('Arrow', { exact: true }).click()

    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    await touchStroke(
      page,
      { x: box.x + 50, y: box.y + 320 },
      { x: box.x + 250, y: box.y + 450 },
    )
    await expect
      .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
      .not.toBe(baseline)
  })

  test('circle tool touch-drag creates a committed circle element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const mobileToolbar = await expandMobileToolbar(page)
    await mobileToolbar.getByTitle('Circle', { exact: true }).click()

    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    // Center + horizontal drag for a >5px radius.
    await touchStroke(
      page,
      { x: box.x + 180, y: box.y + 240 },
      { x: box.x + 300, y: box.y + 240 },
    )
    await expect
      .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
      .not.toBe(baseline)
  })

  test('ellipse tool touch-drag creates a committed ellipse element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const mobileToolbar = await expandMobileToolbar(page)
    await mobileToolbar.getByTitle('Ellipse', { exact: true }).click()

    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    await touchStroke(
      page,
      { x: box.x + 60, y: box.y + 350 },
      { x: box.x + 260, y: box.y + 490 },
    )
    await expect
      .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
      .not.toBe(baseline)
  })
})
