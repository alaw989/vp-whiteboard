import { test, expect } from '@playwright/test'
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_PENDING_EMAIL,
  E2E_PENDING_PASSWORD,
  E2E_DENY_EMAIL,
  E2E_DENY_PASSWORD,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
} from './global-setup'
import { login, seedPendingUser } from './helpers'

test.describe('Admin approvals', () => {
  // Each mutating test re-seeds its own fixture first, so a retried or
  // re-ordered run still finds a pending user (approve flips status to
  // approved, deny hard-deletes). `login` re-uses the seeded, approved,
  // NON-admin owner for the guard test below.

  test('pending user is blocked, admin approves, pending user can sign in', async ({ page }) => {
    seedPendingUser(E2E_PENDING_EMAIL)

    // 1. A pending registration cannot sign in yet — the login API rejects it.
    await page.goto('/login')
    await page.fill('#email', E2E_PENDING_EMAIL)
    await page.fill('#password', E2E_PENDING_PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page.getByText(/pending approval/i)).toBeVisible({ timeout: 10000 })
    await expect(page).toHaveURL(/\/login$/)

    // 2. Admin signs in on the same form; the dashboard shows the Approvals
    //    link (visible only once the client-side admin check resolves).
    await page.fill('#email', E2E_ADMIN_EMAIL)
    await page.fill('#password', E2E_ADMIN_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(whiteboards?|$)/, { timeout: 15000 })
    await expect(page.getByTestId('nav-approvals')).toBeVisible({ timeout: 10000 })

    // 3. Navigate to /approvals: the pending user is listed.
    await page.getByTestId('nav-approvals').click()
    await page.waitForURL(/\/approvals$/, { timeout: 15000 })
    const row = page.locator('.card', { hasText: E2E_PENDING_EMAIL })
    await expect(row).toBeVisible({ timeout: 10000 })

    // 4. Approve → the row leaves the pending list.
    await row.getByRole('button', { name: /Approve/ }).click()
    await expect(row).toHaveCount(0)

    // 5. Sign out; the now-approved user can sign in.
    await page.getByRole('button', { name: /Sign Out/ }).click()
    await page.waitForURL(/\/login$/, { timeout: 15000 })
    await page.fill('#email', E2E_PENDING_EMAIL)
    await page.fill('#password', E2E_PENDING_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(whiteboards?|$)/, { timeout: 15000 })
  })

  test('admin deny removes the pending user and they cannot sign in', async ({ page }) => {
    seedPendingUser(E2E_DENY_EMAIL)

    await page.goto('/login')
    await page.fill('#email', E2E_ADMIN_EMAIL)
    await page.fill('#password', E2E_ADMIN_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(whiteboards?|$)/, { timeout: 15000 })
    await page.goto('/approvals')
    await page.waitForURL(/\/approvals$/, { timeout: 15000 })

    const row = page.locator('.card', { hasText: E2E_DENY_EMAIL })
    await expect(row).toBeVisible({ timeout: 10000 })

    // Deny hard-deletes the user (backend) — the row leaves the pending list.
    await row.getByRole('button', { name: /Deny/ }).click()
    await expect(row).toHaveCount(0)

    // The deleted user's credentials now fail to authenticate.
    await page.getByRole('button', { name: /Sign Out/ }).click()
    await page.waitForURL(/\/login$/, { timeout: 15000 })
    await page.fill('#email', E2E_DENY_EMAIL)
    await page.fill('#password', E2E_DENY_PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.locator('form div.text-red-600')).toBeVisible({ timeout: 10000 })
  })

  test('non-admin gets no Approvals link and is blocked from /approvals', async ({ page }) => {
    // Owner is approved but NOT admin. Wait for the client-side /api/user
    // check (fires during the post-login dashboard mount) before asserting the
    // link's absence, so the assertion can't pass before checkAdmin resolves.
    const adminCheck = page.waitForResponse((r) => r.url().includes('/api/user'))
    await login(page)
    await adminCheck
    await expect(page.getByTestId('nav-approvals')).toHaveCount(0)

    // Direct navigation shows the forbidden state, never the pending list.
    await page.goto('/approvals')
    await expect(page.getByText('Admins Only')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(E2E_PENDING_EMAIL)).toHaveCount(0)
  })
})
