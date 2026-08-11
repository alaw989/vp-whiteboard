import { test, expect, type Page } from '@playwright/test'
import {
  login,
  createWhiteboard,
  canvasFingerprint,
  canvasBox,
  touchPointer,
  touchStroke,
  waitForCanvas,
  expandMobileToolbar,
} from './helpers'

/**
 * Fresh full-tool audit — drive EVERY whiteboard tool through the e2e harness
 * (mouse + touch) and assert each creates/persists a real element. This spec is
 * populated incrementally: each loop iteration adds a group of tools. First
 * batch: line, arrow, circle, ellipse (down-drag-up commit). Second batch:
 * polyline, arc, revision-cloud, stamp (click-sequence / click-only commit).
 * Fix any tool that fails to commit.
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

/** Synthetic single-finger TAP (pointerdown + pointerup at the same point). */
async function touchTap(page: Page, pt: { x: number; y: number }) {
  await touchPointer(page, [
    { type: 'pointerdown', pointerId: 1, clientX: pt.x, clientY: pt.y },
    { type: 'pointerup', pointerId: 1, clientX: pt.x, clientY: pt.y, buttons: 0 },
  ])
}

/**
 * Assert a real element committed: the canvas fingerprint differs from the
 * baseline AND stays different after a settle window (not a transient preview).
 */
async function assertCommitted(page: Page, baseline: string) {
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)
  await page.waitForTimeout(750)
  expect(await canvasFingerprint(page)).not.toBe(baseline)
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

  test('polyline tool click-sequence commits a polyline element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    await selectDesktopTool(page, 'Polyline', 'PL')
    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.3)
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.25)
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45)
    // Polyline is click-based (no drag); Enter commits the ≥2 vertex chain.
    await page.keyboard.press('Enter')
    await assertCommitted(page, baseline)
  })

  test('arc tool 3-click sequence commits an arc element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    await selectDesktopTool(page, 'Arc', 'ARC')
    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    // Non-collinear start → through → end; the 3rd click commits.
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4)
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6)
    await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.4)
    await assertCommitted(page, baseline)
  })

  test('revision-cloud click-sequence commits a closed cloud element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    await selectDesktopTool(page, 'Revision Cloud', 'RC')
    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    const v1 = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.3 }
    await page.mouse.click(v1.x, v1.y)
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.25)
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45)
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.5)
    // Clicking within 10px of the first vertex closes (finishes) the cloud.
    await page.mouse.click(v1.x, v1.y)
    await assertCommitted(page, baseline)
  })

  test('stamp tool click commits a stamp element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const toolbar = page.getByRole('toolbar', { name: 'Whiteboard tools' })
    // The stamp button has a dynamic aria-label; selecting a type from the
    // dropdown both confirms the tool is active and sets the stamp variant.
    await toolbar.getByRole('button', { name: /Stamp tool, press S/ }).click()
    await toolbar
      .getByRole('menu', { name: 'Select stamp type' })
      .getByRole('menuitem', { name: 'Select REVISED stamp', exact: true })
      .click()
    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.4)
    await assertCommitted(page, baseline)
  })

  test('dimension tool 3-click sequence commits a dimension element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    await selectDesktopTool(page, 'Dimension', 'DIM')
    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    // start → end → offset; the 3rd click commits the dimension.
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.4)
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45)
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.25)
    await assertCommitted(page, baseline)
  })

  test('measure distance tool 2-click sequence commits a measurement element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    await selectDesktopTool(page, 'Measure Distance', 'M')
    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    // start → end; the 2nd click commits the measurement.
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.4)
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.55)
    await assertCommitted(page, baseline)
  })

  test('text annotation tool leader drag + modal commit creates an annotation element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    await selectDesktopTool(page, 'Text Annotation', 'T')
    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    // Draw the leader line (down at the annotation origin, up at the target);
    // the modal opens on pointerup.
    await mouseDrag(
      page,
      { x: box.x + box.width * 0.25, y: box.y + box.height * 0.35 },
      { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 },
    )
    await expect(page.getByRole('heading', { name: 'Add Annotation' })).toBeVisible()
    await page.getByPlaceholder('Enter your annotation...').fill('Reviewed on site')
    // Enter in the textarea commits the annotation.
    await page.keyboard.press('Enter')
    await assertCommitted(page, baseline)
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

  test('polyline tool touch-taps commit a polyline element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const mobileToolbar = await expandMobileToolbar(page)
    await mobileToolbar.getByTitle('Polyline', { exact: true }).click()

    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    await touchTap(page, { x: box.x + 60, y: box.y + 160 })
    await touchTap(page, { x: box.x + 180, y: box.y + 150 })
    await touchTap(page, { x: box.x + 200, y: box.y + 280 })
    await page.keyboard.press('Enter')
    await assertCommitted(page, baseline)
  })

  test('arc tool touch-taps commit an arc element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const mobileToolbar = await expandMobileToolbar(page)
    await mobileToolbar.getByTitle('Arc', { exact: true }).click()

    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    await touchTap(page, { x: box.x + 70, y: box.y + 200 })
    await touchTap(page, { x: box.x + 170, y: box.y + 320 })
    await touchTap(page, { x: box.x + 250, y: box.y + 210 })
    await assertCommitted(page, baseline)
  })

  test('revision-cloud tool touch-taps commit a closed cloud element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const mobileToolbar = await expandMobileToolbar(page)
    await mobileToolbar.getByTitle('Revision Cloud', { exact: true }).click()

    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    const v1 = { x: box.x + 70, y: box.y + 180 }
    await touchTap(page, v1)
    await touchTap(page, { x: box.x + 190, y: box.y + 170 })
    await touchTap(page, { x: box.x + 210, y: box.y + 290 })
    await touchTap(page, { x: box.x + 100, y: box.y + 300 })
    await touchTap(page, v1)
    await assertCommitted(page, baseline)
  })

  test('stamp tool touch-tap commits a stamp element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const mobileToolbar = await expandMobileToolbar(page)
    await mobileToolbar.getByTitle('Stamp', { exact: true }).click()
    await mobileToolbar
      .getByRole('menu', { name: 'Select stamp type' })
      .getByRole('menuitem', { name: 'Select REVISED stamp', exact: true })
      .click()

    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    await touchTap(page, { x: box.x + 150, y: box.y + 200 })
    await assertCommitted(page, baseline)
  })

  test('dimension tool touch-taps commit a dimension element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const mobileToolbar = await expandMobileToolbar(page)
    await mobileToolbar.getByTitle('Dimension', { exact: true }).click()

    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    await touchTap(page, { x: box.x + 70, y: box.y + 220 })
    await touchTap(page, { x: box.x + 250, y: box.y + 240 })
    await touchTap(page, { x: box.x + 160, y: box.y + 120 })
    await assertCommitted(page, baseline)
  })

  test('measure distance tool touch-taps commit a measurement element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const mobileToolbar = await expandMobileToolbar(page)
    await mobileToolbar.getByTitle('Measure Distance', { exact: true }).click()

    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    await touchTap(page, { x: box.x + 70, y: box.y + 220 })
    await touchTap(page, { x: box.x + 250, y: box.y + 340 })
    await assertCommitted(page, baseline)
  })

  test('text annotation tool touch-drag + modal commit creates an annotation element', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const mobileToolbar = await expandMobileToolbar(page)
    await mobileToolbar.getByTitle('Text Annotation', { exact: true }).click()

    const baseline = await canvasFingerprint(page)
    const box = await canvasBox(page)
    await touchStroke(
      page,
      { x: box.x + 60, y: box.y + 200 },
      { x: box.x + 200, y: box.y + 320 },
    )
    await expect(page.getByRole('heading', { name: 'Add Annotation' })).toBeVisible()
    await page.getByPlaceholder('Enter your annotation...').fill('Reviewed on site')
    await page.keyboard.press('Enter')
    await assertCommitted(page, baseline)
  })
})
