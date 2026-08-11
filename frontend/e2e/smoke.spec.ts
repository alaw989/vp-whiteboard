import { test, expect } from '@playwright/test'
import { login } from './helpers'
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from './global-setup'

test.describe('Whiteboard smoke', () => {
  const email = E2E_OWNER_EMAIL
  const password = E2E_OWNER_PASSWORD

  // Registration is owner-approved (new users are `pending` and can't log in),
  // so the suite uses the pre-seeded, approved owner from global-setup.
  test('login, create whiteboard, reload, verify persistence', async ({ page }) => {
    await login(page, { email, password })
    await page.waitForURL(/\/(whiteboards?|$)/, { timeout: 15000 })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('a[href="/whiteboard/new"]')).toBeVisible({ timeout: 10000 })

    await page.goto('/whiteboard/new')
    await page.waitForURL(/\/whiteboard\//, { timeout: 15000 })

    const whiteboardUrl = page.url()
    await page.reload()
    await page.waitForURL(whiteboardUrl, { timeout: 15000 })
    await expect(page.locator('.whiteboard-container canvas').first()).toBeAttached({ timeout: 10000 })
  })
})
