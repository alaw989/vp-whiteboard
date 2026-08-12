import { execFileSync } from 'node:child_process'
import { expect, type BrowserContext, type Page } from '@playwright/test'
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from './global-setup'

// Local dev ports (must match playwright.config.ts webServer + frontend/.env).
const LARAVEL_URL = process.env.E2E_LARAVEL_URL || 'http://localhost:8002'
const FRONTEND_URL = process.env.E2E_FRONTEND_URL || 'http://localhost:3000'

/**
 * The hydration-safe login core: fill the form, assert the values actually
 * stuck, then leave the submit button enabled.
 *
 * Root cause this fixes: on a COLD boot Nuxt SSR renders the login page and
 * Playwright fills the inputs before Vue has attached its v-model listeners,
 * so the input events are dropped and `email`/`password` refs stay empty → the
 * submit button (`:disabled="loading || !email || !password"`, login.vue:46)
 * stays disabled → `page.click` times out on "element is not enabled".
 *
 * Unlike a one-shot fill + `toBeEnabled` (which only *detects* the race by
 * timing out after 10s), this SELF-HEALS: fill → assert the value stuck →
 * re-fill on failure. Once hydration finishes a re-fill always sticks, so the
 * loop converges instead of hard-failing. The final `toBeEnabled` is the last
 * line of defense.
 */
async function fillLoginForm(page: Page, email: string, password: string) {
  // A COLD boot can still bite here even after the fill-before-hydration fix:
  // the FIRST /login SSR compile on a fresh Nuxt (or one that just re-warmed)
  // routinely exceeds Playwright's 30s default navigation timeout, killing the
  // whole test before a single fill runs (seen as `page.goto: Test timeout of
  // 30000ms exceeded` on the cold-boot mobile-touch run). Give the initial
  // navigation an explicit generous budget; the self-healing fill loop below
  // handles the hydration value-drop, this handles the navigation itself.
  await page.goto('/login', { timeout: 60000 })
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    try {
      await expect(page.locator('#email')).toHaveValue(email, { timeout: 2000 })
      await expect(page.locator('#password')).toHaveValue(password, { timeout: 2000 })
      break
    } catch {
      // hydration dropped the value (or replaced the input mid-fill); re-fill.
    }
  }
  await expect(page.locator('#email')).toHaveValue(email, { timeout: 5000 })
  await expect(page.locator('#password')).toHaveValue(password, { timeout: 5000 })
  await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 10000 })
}

/** Fill the login form + submit (used where a redirect is NOT expected, e.g. a
 * pending/denied login that renders an inline error instead). */
export async function loginSubmit(page: Page, email: string, password: string) {
  await fillLoginForm(page, email, password)
  await page.click('button[type="submit"]')
}

/** Log in as the pre-seeded, approved e2e owner (or the given credentials). */
export async function login(page: Page, creds: { email: string; password: string } = {
  email: E2E_OWNER_EMAIL,
  password: E2E_OWNER_PASSWORD,
}) {
  await fillLoginForm(page, creds.email, creds.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(whiteboards?|$)/, { timeout: 15000 })
}

/**
 * Reset a registration-request fixture to `pending` (idempotent, re-runnable).
 *
 * The approvals spec MUTATES these rows (approve flips status, deny hard-deletes),
 * so a retried or re-ordered run would otherwise find an empty pending list.
 * Seeding the fixture at the start of each test — not just in global-setup —
 * makes every approvals test independent and retry-safe. Same tinker recipe as
 * global-setup.ts (plaintext password lets the `hashed` cast hash it).
 */
export function seedPendingUser(email: string) {
  const php = `
App\\Models\\User::updateOrCreate(
  ['email' => '${email}'],
  ['name' => 'E2E Pending', 'password' => 'e2e-password', 'status' => 'pending', 'is_admin' => false]
);
echo App\\Models\\User::where('email', '${email}')->value('status');
`.trim()
  execFileSync('php', ['artisan', 'tinker', '--execute', php], {
    cwd: '..',
    stdio: 'pipe',
    encoding: 'utf8',
  })
}

/**
 * Seed deterministic whiteboards for the dashboard spec (search/sort/archive
 * tests need known names + updated_at ordering). Creates three boards owned by
 * the e2e owner:
 *   - `dash-{token}-alpha`: has one rectangle element (thumbnail renders), updated 2h ago
 *   - `dash-{token}-beta`:  has one rectangle element, updated 1h ago
 *   - `dash-{token}-empty`: empty canvas_state (thumbnail falls back to icon)
 * Pass a UNIQUE token per test (e.g. Date.now()) so search assertions stay
 * scoped even though the boards accumulate in the dev DB across runs.
 * Idempotent per token (each token creates fresh rows).
 */
export function seedDashboardBoards(token: string) {
  const php = `
$owner = App\\Models\\User::where('email', '${E2E_OWNER_EMAIL}')->first();
if (!$owner) { echo 'no-owner'; return; }
$canvas = ['version' => 1, 'elements' => [
  ['id' => 'e1', 'type' => 'rectangle', 'userId' => 'u1', 'userName' => 'E2E', 'timestamp' => 1,
   'data' => ['x' => 10, 'y' => 10, 'width' => 100, 'height' => 60, 'stroke' => '#000000', 'strokeWidth' => 2]],
]];
$alpha = App\\Models\\Whiteboard::create([
  'user_id' => $owner->id, 'name' => 'dash-${token}-alpha', 'created_by' => (string) $owner->id,
  'canvas_state' => $canvas, 'share_token' => \\Illuminate\\Support\\Str::random(8),
]);
$alpha->updated_at = now()->subHours(2);
$alpha->save();
$beta = App\\Models\\Whiteboard::create([
  'user_id' => $owner->id, 'name' => 'dash-${token}-beta', 'created_by' => (string) $owner->id,
  'canvas_state' => $canvas, 'share_token' => \\Illuminate\\Support\\Str::random(8),
]);
$beta->updated_at = now()->subHours(1);
$beta->save();
$empty = App\\Models\\Whiteboard::create([
  'user_id' => $owner->id, 'name' => 'dash-${token}-empty', 'created_by' => (string) $owner->id,
  'canvas_state' => ['version' => 1, 'elements' => []], 'share_token' => \\Illuminate\\Support\\Str::random(8),
]);
$empty->updated_at = now()->subHours(3);
$empty->save();
echo App\\Models\\Whiteboard::where('name', 'like', 'dash-${token}%')->count();
`.trim()
  execFileSync('php', ['artisan', 'tinker', '--execute', php], {
    cwd: '..',
    stdio: 'pipe',
    encoding: 'utf8',
  })
}

/**
 * Delete every `dash-%` fixture board the dashboard spec seeded (or any that a
 * previous/interrupted run left behind). The index route lists ALL boards (no
 * per-user filter), so without cleanup the dev DB would accumulate dash-*
 * rows across runs. Call at the START of each dashboard test so the DB is tidy
 * even when a prior run crashed mid-test. Idempotent.
 */
export function cleanupDashboardBoards() {
  const php = `
App\\Models\\Whiteboard::where('name', 'like', 'dash-%')->delete();
echo App\\Models\\Whiteboard::where('name', 'like', 'dash-%')->count();
`.trim()
  execFileSync('php', ['artisan', 'tinker', '--execute', php], {
    cwd: '..',
    stdio: 'pipe',
    encoding: 'utf8',
  })
}

/** Create a fresh whiteboard and return its UUID (from the redirected URL). */
export async function createWhiteboard(page: Page): Promise<string> {
  await page.goto('/whiteboard/new')
  // The /new route POSTs the board then redirects to /whiteboard/{id}; wait
  // for the real board URL, NOT the /whiteboard/new creation page (whose last
  // path segment is "new", not the UUID).
  await page.waitForURL(
    (url) => /^\/whiteboard\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
    { timeout: 15000 },
  )
  const pathname = new URL(page.url()).pathname
  return pathname.substring(pathname.lastIndexOf('/') + 1)
}

/**
 * Owner-only: create a share link via the API. The request must present the
 * login session cookie AND Sanctum's stateful-origin + XSRF headers (local
 * SANCTUM_STATEFUL_DOMAINS is localhost:3000, so origin must be the frontend).
 * Returns the raw /s/{token} path — the token is only ever returned here, at
 * creation time. `days` (optional) sets an expiry; omit for a never-expiring
 * link.
 */
export async function createShareLink(
  context: BrowserContext,
  whiteboardId: string,
  days?: number,
): Promise<string> {
  await context.request.get(`${LARAVEL_URL}/sanctum/csrf-cookie`)
  const cookies = await context.cookies()
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
  const xsrf = cookies.find(c => c.name === 'XSRF-TOKEN')?.value

  const res = await context.request.post(`${LARAVEL_URL}/api/whiteboards/${whiteboardId}/shares`, {
    data: days ? { role: 'edit', days } : { role: 'edit' },
    headers: {
      origin: new URL(FRONTEND_URL).origin,
      referer: `${FRONTEND_URL}/`,
      accept: 'application/json',
      'x-requested-with': 'XMLHttpRequest',
      ...(xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } : {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
  })
  expect(res.status()).toBe(201)
  const body = (await res.json()) as { data: { url: string } }
  return new URL(body.data.url, FRONTEND_URL).pathname
}

/**
 * Force a share link to expire by backdating its `expires_at` past now in the
 * DB (idempotent). The share model hashes the token, so we look up by
 * `token_hash`. Mirrors `seedPendingUser`'s tinker recipe.
 */
export function expireShareLink(sharePath: string) {
  const token = sharePath.substring(sharePath.lastIndexOf('/') + 1)
  const php = `
App\\Models\\WhiteboardShare::where('token_hash', hash('sha256', '${token}'))
  ->update(['expires_at' => now()->subDay()]);
echo App\\Models\\WhiteboardShare::where('token_hash', hash('sha256', '${token}'))->value('expires_at');
`.trim()
  execFileSync('php', ['artisan', 'tinker', '--execute', php], {
    cwd: '..',
    stdio: 'pipe',
    encoding: 'utf8',
  })
}

/**
 * Wait until the real-time connection badge reads "connected". The relay only
 * sets it once the WS handshake authenticated — the owner via the
 * laravel_session cookie, the share viewer via the /s/{token} share token — so
 * this is the assertion that both auth paths were exercised end to end.
 */
export async function waitForConnected(page: Page) {
  await expect(page.getByText('connected', { exact: true })).toBeVisible({ timeout: 20000 })
}

/**
 * Coarse, deterministic hash of the main Konva layer's rendered pixels. The
 * canvas is reduced to a 24-wide grid of average luma (via getImageData, NOT
 * drawImage — headless Chromium serves a stale surface to drawImage, so a
 * freshly-drawn stroke would be invisible to it), so a stroke anywhere shifts
 * the hash. Read-only — proves a shape actually rendered, without touching app
 * internals.
 */
export function canvasFingerprint(page: Page): Promise<string> {
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
 * Fingerprint of the TRANSFORMER layer canvas — the LAST canvas (Konva renders
 * layers in template order; the transformer layer is declared after the main
 * layer). Selection handles (blue border + anchors) render here, so a
 * select-tool tap that successfully selects an element changes this hash while
 * the main layer (canvasFingerprint) stays put. Empty = no selection.
 */
export function transformerFingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const container = document.querySelector('.whiteboard-container')
    if (!container) return 'no-container'
    const canvases = Array.from(container.querySelectorAll('canvas')) as HTMLCanvasElement[]
    if (canvases.length === 0) return 'no-canvas'
    const layer = canvases[canvases.length - 1]!
    const ctx = layer.getContext('2d')!
    const data = ctx.getImageData(0, 0, layer.width, layer.height).data
    // Hash only the alpha channel on a coarse grid: the transformer draws thin
    // blue handles + a dashed border, so a handful of opaque pixels distinguishes
    // "selected" from the empty (all-transparent) layer.
    const grid = 24
    const gw = grid
    const gh = Math.max(1, Math.round((grid * layer.height) / layer.width))
    const sums = new Array<number>(gw * gh).fill(0)
    for (let y = 0; y < layer.height; y++) {
      const gy = Math.min(gh - 1, Math.floor((y * gh) / layer.height))
      for (let x = 0; x < layer.width; x++) {
        const gx = Math.min(gw - 1, Math.floor((x * gw) / layer.width))
        sums[gy * gw + gx]! += data[(y * layer.width + x) * 4 + 3]!
      }
    }
    const per = Math.max(1, Math.floor((layer.width * layer.height) / (gw * gh)))
    let h = 2166136261
    for (let i = 0; i < sums.length; i++) {
      h ^= Math.round(sums[i]! / per)
      h = Math.imul(h, 16777619)
    }
    return (h >>> 0).toString(16)
  })
}

/**
 * Sample a single RGBA pixel from the largest Konva layer canvas at a CSS
 * (viewport) coordinate, mapping through the canvas's own devicePixelRatio.
 * The highlighter renders at opacity 0.5, so a black highlight over the
 * #f5f5f5 background blends to ~mid-gray while a pen stroke is opaque black —
 * pixel color distinguishes which tool actually rendered.
 */
export function pixelAt(
  page: Page,
  point: { x: number; y: number },
): Promise<[number, number, number, number]> {
  return page.evaluate(({ x, y }) => {
    const container = document.querySelector('.whiteboard-container')
    if (!container) return [0, 0, 0, 0]
    const canvases = Array.from(container.querySelectorAll('canvas')) as HTMLCanvasElement[]
    if (canvases.length === 0) return [0, 0, 0, 0]
    const main = canvases.reduce((a, b) =>
      a.width * a.height >= b.width * b.height ? a : b,
    )
    const rect = main.getBoundingClientRect()
    const px = Math.round((x - rect.left) * (main.width / rect.width))
    const py = Math.round((y - rect.top) * (main.height / rect.height))
    const d = main.getContext('2d')!.getImageData(px, py, 1, 1).data
    return [d[0], d[1], d[2], d[3]]
  }, point)
}

/**
 * Scan a horizontal row of the largest Konva layer canvas (at viewport CSS
 * `yCss`) and return the horizontal span of "ink" (luma < threshold) in CSS
 * x-coordinates, or null if the canvas isn't ready. Used by the coordinate-probe
 * regression: a fresh board has only the drawn stroke, so its dark pixels on
 * the stroke's own row must start where the finger touched down — proving touch
 * client coords map to the same stage position (no container-offset/zoom error).
 * The ink's HEAD is the coordinate invariant; perfect-freehand's streamline can
 * pull the tail a few px short of the lift point, so callers assert on the head.
 */
export async function darkRowSpan(
  page: Page,
  yCss: number,
  threshold = 128,
): Promise<{ minX: number; maxX: number; count: number } | null> {
  return page.evaluate(
    ({ yCss, threshold }) => {
      const container = document.querySelector('.whiteboard-container')
      if (!container) return null
      const canvases = Array.from(container.querySelectorAll('canvas')) as HTMLCanvasElement[]
      if (canvases.length === 0) return null
      const main = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b))
      const rect = main.getBoundingClientRect()
      const py = Math.round((yCss - rect.top) * (main.height / rect.height))
      if (py < 0 || py >= main.height) return { minX: -1, maxX: -1, count: 0 }
      const ctx = main.getContext('2d')!
      const data = ctx.getImageData(0, py, main.width, 1).data
      let minX = -1
      let maxX = -1
      let count = 0
      for (let x = 0; x < main.width; x++) {
        if (data[x * 4]! < threshold) {
          if (minX === -1) minX = x
          maxX = x
          count++
        }
      }
      const toCss = (px: number) => rect.left + (px / main.width) * rect.width
      return minX === -1
        ? { minX: -1, maxX: -1, count: 0 }
        : { minX: toCss(minX), maxX: toCss(maxX), count }
    },
    { yCss, threshold },
  )
}

export type TouchEvent = {
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel'
  pointerId: number
  clientX: number
  clientY: number
  pressure?: number
  buttons?: number
}

/**
 * Dispatch a real PointerEvent sequence (pointerType 'touch') on the Konva
 * stage content element. Playwright's mouse API always emits pointerType
 * 'mouse' and touchscreen.tap() fires no pointermove, so neither can drive a
 * Konva stroke (down → moves → up). Konva's stage listens on the content div
 * and computes positions from clientX/clientY, so synthetic events carrying
 * those coords behave like real touches.
 */
export async function touchPointer(page: Page, events: TouchEvent[]) {
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

/**
 * A single-finger touch DRAG of an already-selected element. Konva's draggable
 * machinery (DragAndDrop) listens for NATIVE touch events on window
 * (touchstart/touchmove/touchend), NOT pointer events — the app's own drawing
 * and gesture handlers use the unified pointer pipeline, but moving a selected
 * element goes through Konva's drag. A real device fires BOTH, so this helper
 * dispatches the pointer sequence (for the app's handlers) AND the native touch
 * sequence (for Konva's drag) with matching identifiers.
 */
export async function touchDrag(page: Page, start: { x: number; y: number }, end: { x: number; y: number }) {
  await page.evaluate(({ start, end }) => {
    const canvas = document.querySelector('.whiteboard-container canvas')
    if (!canvas) throw new Error('stage canvas not found')
    const content = canvas.parentElement
    if (!content) throw new Error('stage content element not found')

    const mkTouch = (clientX: number, clientY: number) =>
      new Touch({ identifier: 1, target: content, clientX, clientY })

    // Pointer sequence (unified pipeline: selection, gesture state)…
    const pointerEvents: { type: string; clientX: number; clientY: number }[] = [
      { type: 'pointerdown', clientX: start.x, clientY: start.y },
    ]
    const steps = 8
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      pointerEvents.push({
        type: 'pointermove',
        clientX: start.x + (end.x - start.x) * t,
        clientY: start.y + (end.y - start.y) * t,
      })
    }
    pointerEvents.push({ type: 'pointerup', clientX: end.x, clientY: end.y })
    for (const evt of pointerEvents) {
      content.dispatchEvent(
        new PointerEvent(evt.type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          clientX: evt.clientX,
          clientY: evt.clientY,
          pressure: 0.5,
          buttons: evt.type === 'pointerup' ? 0 : 1,
        }),
      )
    }

    // Native touch sequence (Konva's drag)…
    content.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [mkTouch(start.x, start.y)],
        targetTouches: [mkTouch(start.x, start.y)],
        changedTouches: [mkTouch(start.x, start.y)],
      }),
    )
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const cx = start.x + (end.x - start.x) * t
      const cy = start.y + (end.y - start.y) * t
      window.dispatchEvent(
        new TouchEvent('touchmove', {
          bubbles: true,
          cancelable: true,
          touches: [mkTouch(cx, cy)],
          targetTouches: [mkTouch(cx, cy)],
          changedTouches: [mkTouch(cx, cy)],
        }),
      )
    }
    window.dispatchEvent(
      new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: [],
        targetTouches: [],
        changedTouches: [mkTouch(end.x, end.y)],
      }),
    )
  }, { start, end })
}

/** A single-finger touch pen stroke from start to end (pressure 0.5). */
export async function touchStroke(page: Page, start: { x: number; y: number }, end: { x: number; y: number }) {
  const events: TouchEvent[] = [{ type: 'pointerdown', pointerId: 1, clientX: start.x, clientY: start.y }]
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

/** Bounding box of the whiteboard stage's first canvas (viewport CSS px). */
export async function canvasBox(page: Page) {
  const box = await page.locator('.whiteboard-container canvas').first().boundingBox()
  if (!box) throw new Error('whiteboard stage not visible')
  return box
}

/**
 * Poll `page` until its canvas pixels differ from `baseline`, then re-check
 * after a settle window — proving a COMMITTED element arrived via the WS relay
 * (a transient remote active-stroke preview would vanish again on settle).
 */
export async function expectCanvasToChange(page: Page, baseline: string) {
  await expect.poll(() => canvasFingerprint(page), {
    timeout: 20000,
    intervals: [250],
  }).not.toBe(baseline)
  await page.waitForTimeout(750)
  expect(await canvasFingerprint(page)).not.toBe(baseline)
}

/**
 * Poll `page` until its canvas pixels return to `baseline`, then re-check after
 * a settle window — proving a cancelled stroke or restored viewport did NOT
 * commit (a stray element rendering after the viewport returned would re-dirty
 * the fingerprint and fail the settle re-check). Symmetric to
 * `expectCanvasToChange`.
 */
export async function expectCanvasToReturn(page: Page, baseline: string) {
  await expect.poll(() => canvasFingerprint(page), {
    timeout: 20000,
    intervals: [250],
  }).toBe(baseline)
  await page.waitForTimeout(750)
  expect(await canvasFingerprint(page)).toBe(baseline)
}

/** Wait until the whiteboard stage canvas is attached (mounts after fetch). */
export async function waitForCanvas(page: Page) {
  await expect(page.locator('.whiteboard-container canvas').first()).toBeAttached({ timeout: 20000 })
}

/** The md:hidden mobile bottom toolbar, once visible. */
export async function openMobileToolbar(page: Page) {
  const toolbar = page.getByRole('toolbar', { name: 'Mobile whiteboard tools' })
  await expect(toolbar).toBeVisible({ timeout: 20000 })
  return toolbar
}

/**
 * Expand the md:hidden mobile toolbar into its full palette by clicking the
 * collapsed color swatch (the strip's button whose child swatch div has the
 * rounded size classes), then wait for the "Tools" header. Shape tools like
 * Rectangle live only in the expanded palette, not the collapsed primary strip.
 */
export async function expandMobileToolbar(page: Page) {
  const toolbar = await openMobileToolbar(page)
  const colorSwatch = toolbar
    .locator('button')
    .filter({ has: page.locator('.w-7.h-7.rounded-md') })
  await colorSwatch.click()
  await expect(toolbar.getByText('Tools', { exact: true })).toBeVisible({ timeout: 10000 })
  return toolbar
}
