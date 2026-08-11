import { test, expect } from '@playwright/test'
import {
  login,
  createWhiteboard,
  createShareLink,
  expireShareLink,
  waitForCanvas,
} from './helpers'

const FRONTEND_URL = process.env.E2E_FRONTEND_URL || 'http://localhost:3000'

test.describe('Share-link expiry / revocation UX', () => {
  test('valid token redirects straight to the whiteboard', async ({ browser }) => {
    const ownerContext = await browser.newContext()
    const viewerContext = await browser.newContext()
    try {
      const owner = await ownerContext.newPage()
      await login(owner)
      const whiteboardId = await createWhiteboard(owner)
      await waitForCanvas(owner)

      const sharePath = await createShareLink(ownerContext, whiteboardId)

      // Anonymous viewer: full page load of /s/{token} → straight to the board,
      // NOT the friendly error page.
      const viewer = await viewerContext.newPage()
      await viewer.goto(`${FRONTEND_URL}${sharePath}`)
      await viewer.waitForURL(/\/whiteboard\//, { timeout: 15000 })
      await waitForCanvas(viewer)
      await expect(viewer.getByTestId('share-invalid-page')).toHaveCount(0)
    } finally {
      await ownerContext.close()
      await viewerContext.close()
    }
  })

  test('expired token shows the friendly expired message (no redirect home)', async ({ browser }) => {
    const ownerContext = await browser.newContext()
    const viewerContext = await browser.newContext()
    try {
      const owner = await ownerContext.newPage()
      await login(owner)
      const whiteboardId = await createWhiteboard(owner)

      // Create a share that expires in 1 day, then backdate it in the DB.
      const sharePath = await createShareLink(ownerContext, whiteboardId, 1)
      expireShareLink(sharePath)

      const viewer = await viewerContext.newPage()
      await viewer.goto(`${FRONTEND_URL}${sharePath}`)

      // Friendly page, NOT a silent redirect to / (nor to the board).
      await expect(viewer.getByTestId('share-invalid-page')).toBeVisible({ timeout: 15000 })
      await expect(viewer.getByTestId('share-invalid-heading')).toContainText('expired')
      await expect(viewer).toHaveURL(/\/share-invalid\?reason=expired/)
    } finally {
      await ownerContext.close()
      await viewerContext.close()
    }
  })

  test('unknown token shows the friendly revoked message (no redirect home)', async ({ browser }) => {
    const viewerContext = await browser.newContext()
    try {
      const viewer = await viewerContext.newPage()
      await viewer.goto(`${FRONTEND_URL}/s/definitely-not-a-real-share-token`)

      await expect(viewer.getByTestId('share-invalid-page')).toBeVisible({ timeout: 15000 })
      await expect(viewer.getByTestId('share-invalid-heading')).toContainText('revoked')
      await expect(viewer).toHaveURL(/\/share-invalid\?reason=not_found/)
    } finally {
      await viewerContext.close()
    }
  })
})
