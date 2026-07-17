import { test, expect } from '@playwright/test'

test.describe('Whiteboard smoke', () => {
  const email = `e2e-${Date.now()}@test.local`
  const password = 'password'

  test('register, create whiteboard, reload, verify persistence', async ({ page }) => {
    await page.goto('/register')
    await page.fill('input[name="name"]', 'E2E Test')
    await page.fill('input[name="email"]', email)
    await page.fill('input[name="password"]', password)
    await page.fill('input[name="password_confirmation"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(whiteboards?|$)/, { timeout: 15000 })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=New Whiteboard').or(page.locator('text=Create'))).toBeVisible({ timeout: 10000 })

    await page.goto('/whiteboard/new')
    await page.waitForURL(/\/whiteboard\//, { timeout: 15000 })

    const whiteboardUrl = page.url()
    await page.reload()
    await page.waitForURL(whiteboardUrl, { timeout: 15000 })
    await expect(page.locator('canvas')).toBeAttached({ timeout: 10000 })
  })
})
