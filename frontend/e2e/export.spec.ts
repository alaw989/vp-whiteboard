import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { login, createWhiteboard, canvasFingerprint, waitForCanvas } from './helpers'

/**
 * Real-download coverage for PNG/PDF export (frontend/composables/useExport.ts).
 *
 * The export path is Konva `stage.toDataURL()` → `<a download>` click, so the
 * strongest assertion available is Playwright intercepting the ACTUAL download
 * and verifying the file on disk: PNG magic bytes (not a corrupt/blank file),
 * PDF `%PDF` header, and a non-trivial size. Empty-canvas + drawn-content cases
 * both exercise the dialog end to end.
 */

/** Open the export dialog via the desktop toolbar's Export button. */
async function openExportDialog(page: Page) {
  // Two buttons carry `title="Export canvas"` (desktop + mobile strips); on a
  // desktop viewport only the desktop toolbar is visible, so scope the click to
  // it rather than a bare getByTitle (which strict-mode would reject).
  await page
    .getByRole('toolbar', { name: 'Whiteboard tools' })
    .getByTitle('Export canvas')
    .click()
  await expect(page.getByTestId('export-submit')).toBeVisible({ timeout: 10000 })
}

/** Click the PNG/PDF format card, then Export, and resolve with the download. */
async function exportAndDownload(
  page: Page,
  format: 'png' | 'pdf',
): Promise<{ suggestedFilename: string; size: number; magic: Buffer }> {
  await page.getByTestId(`export-format-${format}`).click()
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByTestId('export-submit').click(),
  ])
  const path = await download.path()
  if (!path) throw new Error(`download produced no file on disk: ${download.suggestedFilename()}`)
  const data = await readFile(path)
  return {
    suggestedFilename: download.suggestedFilename(),
    size: data.length,
    magic: data.subarray(0, 8),
  }
}

test('empty canvas exports a valid non-empty PNG and PDF', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await waitForCanvas(page)

  await openExportDialog(page)
  const png = await exportAndDownload(page, 'png')
  expect(png.suggestedFilename).toMatch(/\.png$/)
  // PNG magic: 89 50 4E 47 0D 0A 1A 0A
  expect(png.magic.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true)
  expect(png.size).toBeGreaterThan(100)

  // Dialog closes after export; reopen for the PDF pass.
  await openExportDialog(page)
  const pdf = await exportAndDownload(page, 'pdf')
  expect(pdf.suggestedFilename).toMatch(/\.pdf$/)
  expect(pdf.magic.toString('ascii')).toMatch(/^%PDF/)
  expect(pdf.size).toBeGreaterThan(100)
})

test('canvas with drawn content exports a valid non-empty PNG and PDF', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await waitForCanvas(page)

  // Draw a real pen stroke (desktop mouse path) and wait for it to render.
  const baseline = await canvasFingerprint(page)
  await page.getByRole('button', { name: 'Pen tool, press P', exact: true }).click()
  const box = await page.locator('.whiteboard-container canvas').first().boundingBox()
  if (!box) throw new Error('whiteboard stage not visible')
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 8 })
  await page.mouse.up()
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)

  await openExportDialog(page)
  const png = await exportAndDownload(page, 'png')
  expect(png.suggestedFilename).toMatch(/\.png$/)
  expect(png.magic.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true)
  expect(png.size).toBeGreaterThan(100)

  await openExportDialog(page)
  const pdf = await exportAndDownload(page, 'pdf')
  expect(pdf.suggestedFilename).toMatch(/\.pdf$/)
  expect(pdf.magic.toString('ascii')).toMatch(/^%PDF/)
  expect(pdf.size).toBeGreaterThan(100)
})
