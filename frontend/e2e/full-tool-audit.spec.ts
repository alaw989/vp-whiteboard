import { test, expect, type Locator, type Page } from '@playwright/test'
import {
  login,
  createWhiteboard,
  canvasFingerprint,
  canvasBox,
  pixelAt,
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

type Box = { x: number; y: number; width: number; height: number }
type Segment = { a: [number, number]; b: [number, number] }

/** Draw N line segments with the line tool (desktop mouse, box-fraction coords). */
async function drawDesktopLineSegments(page: Page, box: Box, segments: Segment[]) {
  await selectDesktopTool(page, 'Line', 'L')
  for (const seg of segments) {
    await mouseDrag(
      page,
      { x: box.x + box.width * seg.a[0], y: box.y + box.height * seg.a[1] },
      { x: box.x + box.width * seg.b[0], y: box.y + box.height * seg.b[1] },
    )
  }
  // Let the base shapes commit + render before the modify sequence starts.
  await page.waitForTimeout(150)
}

/** Draw a rectangle with the rectangle tool (desktop mouse). */
async function drawDesktopRect(page: Page, box: Box, rx0: number, ry0: number, rx1: number, ry1: number) {
  await selectDesktopTool(page, 'Rectangle', 'R')
  await mouseDrag(page, { x: rx0, y: ry0 }, { x: rx1, y: ry1 })
  await page.waitForTimeout(150)
}

/** Draw N line segments with the line tool (mobile touch, box-fraction coords). */
async function drawMobileLineSegments(page: Page, mobileToolbar: Locator, box: Box, segments: Segment[]) {
  await mobileToolbar.getByTitle('Line', { exact: true }).click()
  for (const seg of segments) {
    await touchStroke(
      page,
      { x: box.x + box.width * seg.a[0], y: box.y + box.height * seg.a[1] },
      { x: box.x + box.width * seg.b[0], y: box.y + box.height * seg.b[1] },
    )
  }
  await page.waitForTimeout(150)
}

/** Draw a rectangle with the rectangle tool (mobile touch). */
async function drawMobileRect(page: Page, mobileToolbar: Locator, box: Box, rx0: number, ry0: number, rx1: number, ry1: number) {
  await mobileToolbar.getByTitle('Rectangle', { exact: true }).click()
  await touchStroke(page, { x: rx0, y: ry0 }, { x: rx1, y: ry1 })
  await page.waitForTimeout(150)
}

/** Expand the mobile palette and select a tool by its bare `title` name. */
async function selectMobilePaletteTool(page: Page, name: string) {
  const mobileToolbar = await expandMobileToolbar(page)
  await mobileToolbar.getByTitle(name, { exact: true }).click()
  return mobileToolbar
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

test.describe('full tool audit — desktop modify tools', () => {
  test('offset tool clones a line a parallel distance away', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    await drawDesktopLineSegments(page, box, [{ a: [0.25, 0.5], b: [0.6, 0.5] }])

    await selectDesktopTool(page, 'Offset', 'OFF')
    const baseline = await canvasFingerprint(page)
    const lineY = box.y + box.height * 0.5
    // Step 1: click NEAR the line to set the offset distance (clicking ON it
    // gives distance 0 → a degenerate overlapping copy).
    await page.mouse.click(box.x + box.width * 0.4, lineY - 40)
    // Step 2: move onto the far side (populates the preview), then click to commit.
    await page.mouse.move(box.x + box.width * 0.45, lineY + 50)
    await page.mouse.click(box.x + box.width * 0.45, lineY + 50)
    await assertCommitted(page, baseline)
  })

  test('mirror tool emits a reflected copy across a user-defined axis', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    const rx0 = box.x + box.width * 0.25
    const ry0 = box.y + box.height * 0.3
    const rx1 = box.x + box.width * 0.5
    const ry1 = box.y + box.height * 0.55
    await drawDesktopRect(page, box, rx0, ry0, rx1, ry1)

    await selectDesktopTool(page, 'Mirror', 'MI')
    const baseline = await canvasFingerprint(page)
    // Select the rect via its top edge (the hit-test is 8px from a segment, so
    // a click at the interior center would miss).
    await page.mouse.click((rx0 + rx1) / 2, ry0)
    await page.keyboard.press('Enter')
    // Vertical mirror axis just right of the rect → the copy lands on-canvas.
    await page.mouse.click(rx1 + box.width * 0.05, ry0)
    await page.mouse.click(rx1 + box.width * 0.05, ry1)
    await assertCommitted(page, baseline)
  })

  test('rotate tool swings the selection around a pivot and replaces the original', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    const rx0 = box.x + box.width * 0.25
    const ry0 = box.y + box.height * 0.3
    const rx1 = box.x + box.width * 0.5
    const ry1 = box.y + box.height * 0.55
    await drawDesktopRect(page, box, rx0, ry0, rx1, ry1)

    await selectDesktopTool(page, 'Rotate', 'RO')
    const baseline = await canvasFingerprint(page)
    await page.mouse.click((rx0 + rx1) / 2, ry0)
    await page.keyboard.press('Enter')
    const cx = (rx0 + rx1) / 2
    const cy = (ry0 + ry1) / 2
    await page.mouse.click(cx, cy)
    // Commit at a diagonal point → ~30° rotation (never 0/90/180/360, which can
    // leave an axis-aligned rect looking identical).
    await page.mouse.click(cx + box.width * 0.12, cy + box.height * 0.12)
    await assertCommitted(page, baseline)
  })

  test('scale tool enlarges the selection from a base point and replaces the original', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    const rx0 = box.x + box.width * 0.25
    const ry0 = box.y + box.height * 0.3
    const rx1 = box.x + box.width * 0.5
    const ry1 = box.y + box.height * 0.55
    await drawDesktopRect(page, box, rx0, ry0, rx1, ry1)

    await selectDesktopTool(page, 'Scale', 'SC')
    const baseline = await canvasFingerprint(page)
    await page.mouse.click((rx0 + rx1) / 2, ry0)
    await page.keyboard.press('Enter')
    // Base point at the rect's bottom-left corner; clicking 250px right of it
    // yields ~1.5x (reference distance = half the bounding-box diagonal).
    await page.mouse.click(rx0, ry1)
    await page.mouse.click(rx0 + 250, ry1)
    await assertCommitted(page, baseline)
  })

  test('trim tool cuts an element at its intersection with a cutting edge', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    // Cutting edge: a vertical line. Target: a horizontal line crossing it.
    await drawDesktopLineSegments(page, box, [
      { a: [0.4, 0.2], b: [0.4, 0.8] },
      { a: [0.2, 0.5], b: [0.6, 0.5] },
    ])

    await selectDesktopTool(page, 'Trim', 'TR')
    const baseline = await canvasFingerprint(page)
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.3)
    // Click the horizontal line on the side to remove (left of the crossing).
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5)
    await assertCommitted(page, baseline)
  })

  test('extend tool lengthens an element to meet a boundary line', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    await drawDesktopLineSegments(page, box, [
      { a: [0.6, 0.2], b: [0.6, 0.8] },
      { a: [0.25, 0.5], b: [0.5, 0.5] },
    ])

    await selectDesktopTool(page, 'Extend', 'EX')
    const baseline = await canvasFingerprint(page)
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.3)
    // Click the target line near its free end (extends the end nearer the click).
    await page.mouse.click(box.x + box.width * 0.48, box.y + box.height * 0.5)
    await assertCommitted(page, baseline)
  })

  test('fillet tool rounds the corner between two lines with a fillet arc', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    const cornerX = box.x + box.width * 0.45
    const cornerY = box.y + box.height * 0.5
    // Two lines meeting at an L-shaped corner.
    await drawDesktopLineSegments(page, box, [
      { a: [0.25, 0.5], b: [0.45, 0.5] },
      { a: [0.45, 0.5], b: [0.45, 0.7] },
    ])

    await selectDesktopTool(page, 'Fillet', 'F')
    const baseline = await canvasFingerprint(page)
    const cornerInkBefore = await pixelAt(page, { x: cornerX, y: cornerY })
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.5)
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.6)
    await assertCommitted(page, baseline)
    // The corner junction is trimmed away (the fillet arc bulges around it):
    // the corner pixel returns to the light background.
    const cornerInkAfter = await pixelAt(page, { x: cornerX, y: cornerY })
    expect(cornerInkAfter[0]).toBeGreaterThan(cornerInkBefore[0] + 100)
  })

  test('measure area tool labels an existing shape with its area', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    const rx0 = box.x + box.width * 0.25
    const ry0 = box.y + box.height * 0.3
    const rx1 = box.x + box.width * 0.5
    const ry1 = box.y + box.height * 0.55
    await drawDesktopRect(page, box, rx0, ry0, rx1, ry1)

    await selectDesktopTool(page, 'Measure Area', 'Shift+M')
    const baseline = await canvasFingerprint(page)
    // Click inside the shape → a measurement-area label element is created.
    await page.mouse.click((rx0 + rx1) / 2, (ry0 + ry1) / 2)
    await assertCommitted(page, baseline)
  })
})

test.describe('full tool audit — mobile modify tools', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('offset tool touch-flow clones a line a parallel distance away', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    let mt = await expandMobileToolbar(page)
    await drawMobileLineSegments(page, mt, box, [{ a: [0.2, 0.45], b: [0.7, 0.45] }])

    mt = await selectMobilePaletteTool(page, 'Offset')
    const baseline = await canvasFingerprint(page)
    const lineY = box.y + box.height * 0.45
    // Step 1: tap NEAR the line to set the offset distance.
    await touchTap(page, { x: box.x + box.width * 0.45, y: lineY - 30 })
    // Step 2: a small drag populates the offset preview (the commit needs a
    // pointermove first — offset commits on the SECOND pointerdown).
    await touchStroke(
      page,
      { x: box.x + box.width * 0.5, y: lineY + 40 },
      { x: box.x + box.width * 0.52, y: lineY + 40 },
    )
    await touchTap(page, { x: box.x + box.width * 0.55, y: lineY + 50 })
    await assertCommitted(page, baseline)
  })

  test('mirror tool touch-flow emits a reflected copy across an axis', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    const rx0 = box.x + box.width * 0.2
    const ry0 = box.y + box.height * 0.3
    const rx1 = box.x + box.width * 0.5
    const ry1 = box.y + box.height * 0.55
    let mt = await expandMobileToolbar(page)
    await drawMobileRect(page, mt, box, rx0, ry0, rx1, ry1)

    mt = await selectMobilePaletteTool(page, 'Mirror')
    const baseline = await canvasFingerprint(page)
    await touchTap(page, { x: (rx0 + rx1) / 2, y: ry0 })
    await page.keyboard.press('Enter')
    await touchTap(page, { x: rx1 + box.width * 0.05, y: ry0 })
    await touchTap(page, { x: rx1 + box.width * 0.05, y: ry1 })
    await assertCommitted(page, baseline)
  })

  test('rotate tool touch-flow swings the selection around a pivot', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    const rx0 = box.x + box.width * 0.2
    const ry0 = box.y + box.height * 0.3
    const rx1 = box.x + box.width * 0.5
    const ry1 = box.y + box.height * 0.55
    let mt = await expandMobileToolbar(page)
    await drawMobileRect(page, mt, box, rx0, ry0, rx1, ry1)

    mt = await selectMobilePaletteTool(page, 'Rotate')
    const baseline = await canvasFingerprint(page)
    await touchTap(page, { x: (rx0 + rx1) / 2, y: ry0 })
    await page.keyboard.press('Enter')
    const cx = (rx0 + rx1) / 2
    const cy = (ry0 + ry1) / 2
    await touchTap(page, { x: cx, y: cy })
    await touchTap(page, { x: cx + box.width * 0.15, y: cy + box.height * 0.2 })
    await assertCommitted(page, baseline)
  })

  test('scale tool touch-flow enlarges the selection from a base point', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    const rx0 = box.x + box.width * 0.2
    const ry0 = box.y + box.height * 0.3
    const rx1 = box.x + box.width * 0.5
    const ry1 = box.y + box.height * 0.55
    let mt = await expandMobileToolbar(page)
    await drawMobileRect(page, mt, box, rx0, ry0, rx1, ry1)

    mt = await selectMobilePaletteTool(page, 'Scale')
    const baseline = await canvasFingerprint(page)
    await touchTap(page, { x: (rx0 + rx1) / 2, y: ry0 })
    await page.keyboard.press('Enter')
    await touchTap(page, { x: rx0, y: ry1 })
    await touchTap(page, { x: rx0 + 160, y: ry1 })
    await assertCommitted(page, baseline)
  })

  test('trim tool touch-flow cuts an element at a cutting edge', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    let mt = await expandMobileToolbar(page)
    await drawMobileLineSegments(page, mt, box, [
      { a: [0.4, 0.15], b: [0.4, 0.85] },
      { a: [0.15, 0.5], b: [0.65, 0.5] },
    ])

    mt = await selectMobilePaletteTool(page, 'Trim')
    const baseline = await canvasFingerprint(page)
    await touchTap(page, { x: box.x + box.width * 0.4, y: box.y + box.height * 0.3 })
    await touchTap(page, { x: box.x + box.width * 0.28, y: box.y + box.height * 0.5 })
    await assertCommitted(page, baseline)
  })

  test('extend tool touch-flow lengthens an element to a boundary', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    let mt = await expandMobileToolbar(page)
    await drawMobileLineSegments(page, mt, box, [
      { a: [0.65, 0.15], b: [0.65, 0.85] },
      { a: [0.2, 0.5], b: [0.5, 0.5] },
    ])

    mt = await selectMobilePaletteTool(page, 'Extend')
    const baseline = await canvasFingerprint(page)
    await touchTap(page, { x: box.x + box.width * 0.65, y: box.y + box.height * 0.3 })
    await touchTap(page, { x: box.x + box.width * 0.48, y: box.y + box.height * 0.5 })
    await assertCommitted(page, baseline)
  })

  test('fillet tool touch-flow rounds an L-shaped corner with a fillet arc', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    const cornerX = box.x + box.width * 0.45
    const cornerY = box.y + box.height * 0.5
    let mt = await expandMobileToolbar(page)
    await drawMobileLineSegments(page, mt, box, [
      { a: [0.15, 0.5], b: [0.45, 0.5] },
      { a: [0.45, 0.5], b: [0.45, 0.75] },
    ])

    mt = await selectMobilePaletteTool(page, 'Fillet')
    const baseline = await canvasFingerprint(page)
    const cornerInkBefore = await pixelAt(page, { x: cornerX, y: cornerY })
    await touchTap(page, { x: box.x + box.width * 0.3, y: box.y + box.height * 0.5 })
    await touchTap(page, { x: box.x + box.width * 0.45, y: box.y + box.height * 0.62 })
    await assertCommitted(page, baseline)
    const cornerInkAfter = await pixelAt(page, { x: cornerX, y: cornerY })
    expect(cornerInkAfter[0]).toBeGreaterThan(cornerInkBefore[0] + 100)
  })

  test('measure area tool touch-flow labels an existing shape with its area', async ({ page }) => {
    await login(page)
    await createWhiteboard(page)
    await waitForCanvas(page)

    const box = await canvasBox(page)
    const rx0 = box.x + box.width * 0.2
    const ry0 = box.y + box.height * 0.3
    const rx1 = box.x + box.width * 0.5
    const ry1 = box.y + box.height * 0.55
    let mt = await expandMobileToolbar(page)
    await drawMobileRect(page, mt, box, rx0, ry0, rx1, ry1)

    mt = await selectMobilePaletteTool(page, 'Measure Area')
    const baseline = await canvasFingerprint(page)
    await touchTap(page, { x: (rx0 + rx1) / 2, y: (ry0 + ry1) / 2 })
    await assertCommitted(page, baseline)
  })
})
