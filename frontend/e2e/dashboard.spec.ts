import { test, expect, type Page } from '@playwright/test'
import { cleanupDashboardBoards, login, seedDashboardBoards } from './helpers'

/**
 * Dashboard (index.vue) search / sort / archive / thumbnail coverage.
 *
 * The dashboard lists EVERY whiteboard (no per-user filter on the index route),
 * so each test seeds a UNIQUE token and searches it before asserting card
 * counts or order — keeping assertions deterministic even though the dev DB
 * accumulates boards across runs. `seedDashboardBoards` seeds alpha (1 rect,
 * updated 2h ago), beta (1 rect, updated 1h ago), empty (no elements, 3h ago).
 */

function openCardMenu(page: Page, name: string) {
  const card = page.locator('.card').filter({ hasText: name })
  return { card, open: async () => {
    await card.hover()
    await card.locator('button').first().click()
  } }
}

test.describe('Whiteboard dashboard', () => {
  test.beforeEach(() => {
    // Tidy the dev DB of any dash-* fixtures from prior/interrupted runs so
    // search assertions below stay scoped to boards seeded by THIS test.
    cleanupDashboardBoards()
  })
  test.afterAll(() => {
    // Leave the dev DB as clean as we found it (the last test's fixtures
    // would otherwise accumulate across runs).
    cleanupDashboardBoards()
  })

  test('search filters the card grid and shows an empty state on no match', async ({ page }) => {
    const token = Date.now().toString(36)
    seedDashboardBoards(token)
    await login(page)
    await page.goto('/')

    const search = page.getByTestId('board-search')
    const card = (name: string) => page.locator('.card').filter({ hasText: name })

    // Seed boards first: type the token → exactly the 3 seeded cards render.
    await search.fill(`dash-${token}`)
    await expect(card(`dash-${token}-alpha`)).toBeVisible({ timeout: 10000 })
    await expect(card(`dash-${token}-beta`)).toBeVisible({ timeout: 10000 })
    await expect(card(`dash-${token}-empty`)).toBeVisible({ timeout: 10000 })

    // Narrowing the query hides the non-matching cards.
    await search.fill(`dash-${token}-alpha`)
    await expect(card(`dash-${token}-alpha`)).toBeVisible({ timeout: 10000 })
    await expect(card(`dash-${token}-beta`)).toHaveCount(0)
    await expect(card(`dash-${token}-empty`)).toHaveCount(0)

    // A no-match query shows the search-aware empty state, not a blank grid.
    await search.fill(`dash-${token}-nonexistent`)
    await expect(page.getByText('No Matching Whiteboards')).toBeVisible({ timeout: 10000 })

    // Clearing the query restores the full list (the 3 seeded cards are back).
    await search.fill('')
    await expect(card(`dash-${token}-alpha`)).toBeVisible({ timeout: 10000 })
    await expect(card(`dash-${token}-beta`)).toBeVisible({ timeout: 10000 })
  })

  test('sort flips Recent and Alphabetical order', async ({ page }) => {
    const token = Date.now().toString(36)
    seedDashboardBoards(token)
    await login(page)
    await page.goto('/')

    // Scope the grid to exactly the seeded boards so order is unambiguous.
    await page.getByTestId('board-search').fill(`dash-${token}`)
    const firstCard = page.locator('.card h3').first()
    await expect(firstCard).toHaveText(`dash-${token}-beta`, { timeout: 10000 })

    // Recent (default, updated_at desc): beta (1h) > alpha (2h) > empty (3h).
    const cardNames = page.locator('.card h3')
    await expect(cardNames.nth(0)).toHaveText(`dash-${token}-beta`)
    await expect(cardNames.nth(1)).toHaveText(`dash-${token}-alpha`)
    await expect(cardNames.nth(2)).toHaveText(`dash-${token}-empty`)

    // A-Z: alpha < beta < empty.
    await page.getByTestId('sort-alpha').click()
    await expect(cardNames.nth(0)).toHaveText(`dash-${token}-alpha`)
    await expect(cardNames.nth(1)).toHaveText(`dash-${token}-beta`)
    await expect(cardNames.nth(2)).toHaveText(`dash-${token}-empty`)

    // Back to Recent restores the recency order.
    await page.getByTestId('sort-recent').click()
    await expect(cardNames.nth(0)).toHaveText(`dash-${token}-beta`)
  })

  test('archive hides a card; archived view lists and unarchives it', async ({ page }) => {
    const token = Date.now().toString(36)
    seedDashboardBoards(token)
    await login(page)
    await page.goto('/')

    await page.getByTestId('board-search').fill(`dash-${token}`)
    const alpha = page.locator('.card').filter({ hasText: `dash-${token}-alpha` })
    await expect(alpha).toBeVisible({ timeout: 10000 })

    // Archive via the card overflow menu → the card leaves the active list.
    const { open } = openCardMenu(page, `dash-${token}-alpha`)
    await open()
    await alpha.getByRole('button', { name: 'Archive' }).click()
    await expect(alpha).toHaveCount(0)

    // The Archived toggle surfaces it again (search query is preserved).
    await page.getByTestId('archived-toggle-off').click()
    const archivedAlpha = page.locator('.card').filter({ hasText: `dash-${token}-alpha` })
    await expect(archivedAlpha).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('archived-toggle-on')).toBeVisible()

    // Unarchive removes it from the archived view…
    const archivedMenu = openCardMenu(page, `dash-${token}-alpha`)
    await archivedMenu.open()
    await archivedAlpha.getByRole('button', { name: 'Unarchive' }).click()
    await expect(archivedAlpha).toHaveCount(0)

    // …and toggling back to Active shows it again.
    await page.getByTestId('archived-toggle-on').click()
    await expect(alpha).toBeVisible({ timeout: 10000 })
  })

  test('boards with elements render a canvas thumbnail; empty boards fall back to the icon', async ({ page }) => {
    const token = Date.now().toString(36)
    seedDashboardBoards(token)
    await login(page)
    await page.goto('/')

    await page.getByTestId('board-search').fill(`dash-${token}`)
    const withContent = page.locator('.card').filter({ hasText: `dash-${token}-alpha` })
    const empty = page.locator('.card').filter({ hasText: `dash-${token}-empty` })
    await expect(withContent).toBeVisible({ timeout: 10000 })
    await expect(empty).toBeVisible({ timeout: 10000 })

    // A board with a rectangle element gets a real thumbnail canvas…
    await expect(withContent.locator('canvas').first()).toBeVisible({ timeout: 10000 })

    // …while a board with no drawable elements keeps the canvas hidden and
    // shows the fallback icon instead (drawable=false → invisible class).
    await expect(empty.locator('canvas').first()).toBeHidden()

    // A viewport resize reflows the responsive grid (lg:grid-cols-3 →
    // md:grid-cols-2) and the thumbnail's ResizeObserver must re-render — the
    // canvas stays visible/backed rather than going stale or blurry.
    await page.setViewportSize({ width: 800, height: 900 })
    await expect(withContent.locator('canvas').first()).toBeVisible({ timeout: 10000 })
    await expect(empty.locator('canvas').first()).toBeHidden()
  })
})
