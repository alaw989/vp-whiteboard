import { test, expect, type Page } from '@playwright/test'
import {
  login,
  createWhiteboard,
  canvasFingerprint,
  pixelAt,
  darkRowSpan,
  touchPointer,
  touchStroke,
  canvasBox,
  waitForConnected,
  waitForCanvas,
  expectCanvasToReturn,
  openMobileToolbar,
} from './helpers'

// Mobile device emulation: small viewport + touch + mobile UA, so the app
// renders the md:hidden bottom toolbar and pointer events can be `touch`.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

async function selectMobilePen(page: Page) {
  const mobileToolbar = await openMobileToolbar(page)
  await mobileToolbar.getByTitle('Pen (P)').click()
  await expect(mobileToolbar.getByTitle('Pen (P)')).toHaveClass(/bg-blue-100/)
}

async function selectMobileHighlighter(page: Page) {
  const mobileToolbar = await openMobileToolbar(page)
  await mobileToolbar.getByTitle('Highlighter (B)').click()
  await expect(mobileToolbar.getByTitle('Highlighter (B)')).toHaveClass(/bg-blue-100/)
}

async function selectMobileEraser(page: Page) {
  const mobileToolbar = await openMobileToolbar(page)
  await mobileToolbar.getByTitle('Eraser (X)').click()
  await expect(mobileToolbar.getByTitle('Eraser (X)')).toHaveClass(/bg-blue-100/)
}

test('mobile toolbar selects pen; a touch pen stroke lands on the canvas', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await waitForCanvas(page)

  // md:hidden bottom toolbar is shown on a mobile viewport.
  const mobileToolbar = await openMobileToolbar(page)

  // Pick the pen from the mobile primary strip and wait until it's active
  // (currentTool must propagate to the canvas before we draw).
  await selectMobilePen(page)

  const baseline = await canvasFingerprint(page)
  const box = await canvasBox(page)
  await touchStroke(
    page,
    { x: box.x + box.width * 0.3, y: box.y + box.height * 0.3 },
    { x: box.x + box.width * 0.6, y: box.y + box.height * 0.5 },
  )

  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)
})

test('mobile toolbar selects the highlighter; a touch highlight renders as a translucent stroke', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await waitForCanvas(page)

  const mobileToolbar = await openMobileToolbar(page)

  // Highlighter (B) is in the collapsed primary strip, like the pen.
  await selectMobileHighlighter(page)

  const baseline = await canvasFingerprint(page)
  const box = await canvasBox(page)

  // One diagonal for the highlighter, a parallel one for the pen, so each
  // tool's stroke can be sampled at its own midpoint (the two never overlap).
  const hlStart = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.2 }
  const hlEnd = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.35 }
  const hlMid = { x: box.x + box.width * 0.45, y: box.y + box.height * 0.275 }
  const penStart = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.35 }
  const penEnd = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.5 }
  const penMid = { x: box.x + box.width * 0.45, y: box.y + box.height * 0.425 }

  // A touch highlight lands on the canvas (a real stroke is committed)…
  await touchStroke(page, hlStart, hlEnd)
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)

  // …and it renders at 50% alpha: black over the #f5f5f5 background blends to
  // ~mid-gray at the stroke center. This proves the highlighter's translucent
  // rendering (globalAlpha 0.5) actually ran, not just "some stroke landed".
  const hlPx = await pixelAt(page, hlMid)
  for (const ch of hlPx.slice(0, 3)) {
    expect(ch).toBeGreaterThan(60)
    expect(ch).toBeLessThan(200)
  }

  // The pen over the same canvas at its own midpoint is opaque black — the
  // contrast confirms the sampled translucency is highlighter-specific.
  await selectMobilePen(page)
  await touchStroke(page, penStart, penEnd)
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)

  const penPx = await pixelAt(page, penMid)
  for (const ch of penPx.slice(0, 3)) {
    expect(ch).toBeLessThan(80)
  }
})

test('two-finger pan moves the viewport without committing a stroke', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await waitForCanvas(page)

  await selectMobilePen(page)

  const baseline = await canvasFingerprint(page)
  const box = await canvasBox(page)
  const cx = box.x + box.width * 0.5
  const cy = box.y + box.height * 0.4
  const spread = 60

  // Pan gesture: two pointers hold a fixed spread, both translate (+40,+30).
  // The content renders with the viewport baked in, so the fingerprint MUST
  // change (the pan took effect)…
  await touchPointer(page, [
    { type: 'pointerdown', pointerId: 1, clientX: cx - spread, clientY: cy },
    { type: 'pointerdown', pointerId: 2, clientX: cx + spread, clientY: cy },
    { type: 'pointermove', pointerId: 1, clientX: cx - spread + 40, clientY: cy + 30 },
    { type: 'pointermove', pointerId: 2, clientX: cx + spread + 40, clientY: cy + 30 },
    { type: 'pointerup', pointerId: 1, clientX: cx - spread + 40, clientY: cy + 30, buttons: 0 },
    { type: 'pointerup', pointerId: 2, clientX: cx + spread + 40, clientY: cy + 30, buttons: 0 },
  ])
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)

  // …and panning back by the exact inverse restores the original viewport with
  // no elements committed (a touch draw would have left pixels behind, so the
  // fingerprint would NOT return to the baseline).
  await touchPointer(page, [
    { type: 'pointerdown', pointerId: 1, clientX: cx - spread + 40, clientY: cy + 30 },
    { type: 'pointerdown', pointerId: 2, clientX: cx + spread + 40, clientY: cy + 30 },
    { type: 'pointermove', pointerId: 1, clientX: cx - spread, clientY: cy },
    { type: 'pointermove', pointerId: 2, clientX: cx + spread, clientY: cy },
    { type: 'pointerup', pointerId: 1, clientX: cx - spread, clientY: cy, buttons: 0 },
    { type: 'pointerup', pointerId: 2, clientX: cx + spread, clientY: cy, buttons: 0 },
  ])
  await expectCanvasToReturn(page, baseline)
})

test('two-finger pinch-zoom zooms the viewport without committing a stroke', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await waitForCanvas(page)

  await selectMobilePen(page)

  const baseline = await canvasFingerprint(page)
  const box = await canvasBox(page)
  const cx = box.x + box.width * 0.5
  const cy = box.y + box.height * 0.4
  const spread = 60
  const zoomedSpread = 2 * spread

  // Pinch OUT: both fingers move away from the (fixed) centroid, doubling the
  // finger distance (120 → 240) → zoom doubles to 2x. Konva bakes zoom into the
  // layer pixels, so the fingerprint MUST change (the pinch took effect)…
  await touchPointer(page, [
    { type: 'pointerdown', pointerId: 1, clientX: cx - spread, clientY: cy },
    { type: 'pointerdown', pointerId: 2, clientX: cx + spread, clientY: cy },
    { type: 'pointermove', pointerId: 1, clientX: cx - zoomedSpread, clientY: cy },
    { type: 'pointermove', pointerId: 2, clientX: cx + zoomedSpread, clientY: cy },
    { type: 'pointerup', pointerId: 1, clientX: cx - zoomedSpread, clientY: cy, buttons: 0 },
    { type: 'pointerup', pointerId: 2, clientX: cx + zoomedSpread, clientY: cy, buttons: 0 },
  ])
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)

  // …and pinching back in by the exact inverse restores the original viewport
  // with no elements committed (a touch draw would have left pixels behind that
  // no zoom can undo).
  await touchPointer(page, [
    { type: 'pointerdown', pointerId: 1, clientX: cx - zoomedSpread, clientY: cy },
    { type: 'pointerdown', pointerId: 2, clientX: cx + zoomedSpread, clientY: cy },
    { type: 'pointermove', pointerId: 1, clientX: cx - spread, clientY: cy },
    { type: 'pointermove', pointerId: 2, clientX: cx + spread, clientY: cy },
    { type: 'pointerup', pointerId: 1, clientX: cx - spread, clientY: cy, buttons: 0 },
    { type: 'pointerup', pointerId: 2, clientX: cx + spread, clientY: cy, buttons: 0 },
  ])
  await expectCanvasToReturn(page, baseline)
})

test('a two-finger pinch started mid-stroke cancels the partial stroke (regression)', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await waitForCanvas(page)

  await selectMobilePen(page)

  const baseline = await canvasFingerprint(page)
  const box = await canvasBox(page)
  const cx = box.x + box.width * 0.5
  const cy = box.y + box.height * 0.4
  const spread = 60
  const zoomedSpread = 2 * spread

  // Finger 1 starts a stroke and draws a point, THEN finger 2 lands. That must
  // transition to a two-finger gesture and CANCEL the partial stroke — the same
  // Iteration-3 fix the pan variant covers, but exercised through the PINCH path
  // (the "thumb lands mid-stroke, then I pinch-zoom" scenario): no stray
  // pixels, no committed element, and the pinch must still engage cleanly.
  await touchPointer(page, [
    { type: 'pointerdown', pointerId: 1, clientX: cx - spread, clientY: cy },
    { type: 'pointermove', pointerId: 1, clientX: cx - spread - 20, clientY: cy },
    { type: 'pointermove', pointerId: 1, clientX: cx - spread, clientY: cy },
    { type: 'pointerdown', pointerId: 2, clientX: cx + spread, clientY: cy },
    { type: 'pointermove', pointerId: 1, clientX: cx - zoomedSpread, clientY: cy },
    { type: 'pointermove', pointerId: 2, clientX: cx + zoomedSpread, clientY: cy },
    { type: 'pointerup', pointerId: 1, clientX: cx - zoomedSpread, clientY: cy, buttons: 0 },
    { type: 'pointerup', pointerId: 2, clientX: cx + zoomedSpread, clientY: cy, buttons: 0 },
  ])

  // The pinch zoomed the viewport (finger distance 120 → 240 = 2x), so the
  // fingerprint MUST differ from baseline…
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)

  // …but pinching back in by the exact inverse restores the original viewport
  // with no elements committed: the partial stroke was cancelled, not committed
  // (a committed stroke would leave pixels no zoom can undo).
  await touchPointer(page, [
    { type: 'pointerdown', pointerId: 1, clientX: cx - zoomedSpread, clientY: cy },
    { type: 'pointerdown', pointerId: 2, clientX: cx + zoomedSpread, clientY: cy },
    { type: 'pointermove', pointerId: 1, clientX: cx - spread, clientY: cy },
    { type: 'pointermove', pointerId: 2, clientX: cx + spread, clientY: cy },
    { type: 'pointerup', pointerId: 1, clientX: cx - spread, clientY: cy, buttons: 0 },
    { type: 'pointerup', pointerId: 2, clientX: cx + spread, clientY: cy, buttons: 0 },
  ])
  await expectCanvasToReturn(page, baseline)
})

test('a two-finger gesture started mid-stroke cancels the partial stroke (regression)', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await waitForCanvas(page)

  await selectMobilePen(page)

  const baseline = await canvasFingerprint(page)
  const box = await canvasBox(page)
  const cx = box.x + box.width * 0.5
  const cy = box.y + box.height * 0.4
  const spread = 60

  // Finger 1 starts a stroke and draws a couple of points, THEN finger 2 lands.
  // That must transition to a two-finger gesture and CANCEL the partial stroke
  // (no stray pixels, no committed element) rather than commit it on release.
  // The pan after finger 2 lands is a pure translation (+40,+30) for BOTH
  // fingers so the inverse pan restores the exact viewport.
  await touchPointer(page, [
    { type: 'pointerdown', pointerId: 1, clientX: cx - spread - 30, clientY: cy - 20 },
    { type: 'pointermove', pointerId: 1, clientX: cx - spread - 10, clientY: cy - 20 },
    { type: 'pointerdown', pointerId: 2, clientX: cx + spread, clientY: cy },
    { type: 'pointermove', pointerId: 1, clientX: cx - spread + 30, clientY: cy + 10 },
    { type: 'pointermove', pointerId: 2, clientX: cx + spread + 40, clientY: cy + 30 },
    { type: 'pointerup', pointerId: 2, clientX: cx + spread + 40, clientY: cy + 30, buttons: 0 },
    { type: 'pointerup', pointerId: 1, clientX: cx - spread + 30, clientY: cy + 10, buttons: 0 },
  ])

  // The gesture panned the viewport (fingerprint differs)…
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)

  // …but panning back by the exact inverse restores the baseline: the partial
  // stroke was cancelled, not committed (a committed stroke would leave pixels
  // no pan can undo).
  await touchPointer(page, [
    { type: 'pointerdown', pointerId: 1, clientX: cx - spread + 30, clientY: cy + 10 },
    { type: 'pointerdown', pointerId: 2, clientX: cx + spread + 40, clientY: cy + 30 },
    { type: 'pointermove', pointerId: 1, clientX: cx - spread - 10, clientY: cy - 20 },
    { type: 'pointermove', pointerId: 2, clientX: cx + spread, clientY: cy },
    { type: 'pointerup', pointerId: 1, clientX: cx - spread - 10, clientY: cy - 20, buttons: 0 },
    { type: 'pointerup', pointerId: 2, clientX: cx + spread, clientY: cy, buttons: 0 },
  ])
  await expectCanvasToReturn(page, baseline)
})

test('a pointercancel mid-stroke cancels the partial stroke instead of committing it (regression)', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await waitForCanvas(page)

  await selectMobilePen(page)

  const baseline = await canvasFingerprint(page)
  const box = await canvasBox(page)
  const sx = box.x + box.width * 0.3
  const sy = box.y + box.height * 0.35

  // Finger 1 draws a couple of points (down + moves, NO pointerup), then the
  // browser cancels the pointer (palm rejection, notification shade, system
  // gesture). That must CANCEL the partial stroke — no stray element committed,
  // canvas returns to its pre-stroke state. The old handler treated
  // pointercancel like a pointerup (touch always reports buttons: 0, so the
  // mouse-button check always passed) and committed the half-drawn stroke as a
  // stray shape.
  await touchPointer(page, [
    { type: 'pointerdown', pointerId: 1, clientX: sx, clientY: sy },
    { type: 'pointermove', pointerId: 1, clientX: sx + 20, clientY: sy + 10 },
    { type: 'pointermove', pointerId: 1, clientX: sx + 40, clientY: sy + 20 },
    { type: 'pointercancel', pointerId: 1, clientX: sx + 40, clientY: sy + 20 },
  ])

  // A pure cancel leaves the viewport untouched, so returning to the baseline
  // fingerprint — and STAYING there after the settle window — proves the partial
  // stroke was cancelled, not committed.
  await expectCanvasToReturn(page, baseline)
})

test('a touch pen stroke lands exactly where the finger drew (coordinate probe)', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await waitForCanvas(page)

  await selectMobilePen(page)

  const baseline = await canvasFingerprint(page)
  const box = await canvasBox(page)

  // A short horizontal stroke fully inside the stage canvas (auto-sized to the
  // container, 390x729 at DPR 1). On a fresh board the viewport is identity
  // (x:0,y:0,zoom:1), so client coords map 1:1 to stage coords — ink must appear
  // exactly where the finger touched.
  const x0 = box.x + 120
  const x1 = box.x + 320
  const y = box.y + 220
  const mid = { x: (x0 + x1) / 2, y }

  await touchStroke(page, { x: x0, y }, { x: x1, y })
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)

  // Coordinate probe 1: scan the stroke's own row. The ink's LEFT edge is
  // anchored to where the finger touched down (perfect-freehand never pulls the
  // head inward), so a container-offset or viewport/zoom mapping error would
  // shift it away from x0. The TAIL is legitimately rendered a few px short of
  // x1 — streamline+smoothing shorten the outline's end — so assert it at least
  // reaches 75% of the way to the lift point.
  const span = await darkRowSpan(page, y)
  expect(span).not.toBeNull()
  expect(span!.count).toBeGreaterThan(0)
  expect(Math.abs(span!.minX - x0)).toBeLessThan(8)
  expect(span!.maxX).toBeGreaterThan(x0 + (x1 - x0) * 0.75)

  // Coordinate probe 2: the stroke centerline is on the finger's row. The
  // midpoint pixel is ink, and a row 12px off the centerline (outside the 4px
  // stroke width) is still the #f5f5f5 background — proving the stroke did NOT
  // land offset above or below where the finger drew.
  const midPx = await pixelAt(page, mid)
  for (const ch of midPx.slice(0, 3)) {
    expect(ch).toBeLessThan(80)
  }
  const above = await pixelAt(page, { x: mid.x, y: y - 12 })
  const below = await pixelAt(page, { x: mid.x, y: y + 12 })
  for (const px of [above, below]) {
    for (const ch of px.slice(0, 3)) {
      expect(ch).toBeGreaterThan(230)
    }
  }
})

test('mobile toolbar selects the eraser; a touch tap removes a committed stroke', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await waitForCanvas(page)

  // Draw a committed pen stroke at known coords (identity viewport, same
  // geometry as the coordinate-probe test) so the eraser can tap its midpoint.
  await selectMobilePen(page)
  const baseline = await canvasFingerprint(page)
  const box = await canvasBox(page)
  const x0 = box.x + 120
  const x1 = box.x + 320
  const y = box.y + 220

  await touchStroke(page, { x: x0, y }, { x: x1, y })
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)

  // Eraser is a primary tool in the collapsed md:hidden strip. Selecting it and
  // TAPPING the stroke must delete the whole element via the touch pointer path
  // (pointerdown → handleMouseDown → dispatchMouseDown('eraser')) — the same
  // unified pointer pipeline the pen uses, so a touch mapping error here would
  // miss the stroke (it would erase nothing and the fingerprint would stay
  // dirty).
  await selectMobileEraser(page)
  const midX = (x0 + x1) / 2
  await touchPointer(page, [
    { type: 'pointerdown', pointerId: 1, clientX: midX, clientY: y },
    { type: 'pointerup', pointerId: 1, clientX: midX, clientY: y, buttons: 0 },
  ])

  // The stroke is gone: the fingerprint returns to the pre-stroke baseline and
  // stays there (the element was deleted, not just covered up).
  await expectCanvasToReturn(page, baseline)
})

test('a remote touch stroke preview appears on a peer and clears when the drawer cancels into a gesture', async ({ browser }) => {
  // Two touch browsers logged in as the same owner: each tab gets a RANDOM
  // per-page userId (pages/whiteboard/[id].vue), so the owner tab's in-flight
  // stroke is NOT filtered as "own" on the peer tab and renders as a live
  // remote preview — the same setup collab.spec proves for committed elements,
  // here for the IN-PROGRESS active-stroke broadcast.
  const mobile = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
  const ownerCtx = await browser.newContext(mobile)
  const peerCtx = await browser.newContext(mobile)
  try {
    const owner = await ownerCtx.newPage()
    await login(owner)
    const whiteboardId = await createWhiteboard(owner)
    await waitForCanvas(owner)
    await waitForConnected(owner)

    // Peer tab joins the same board with its own session (same account, fresh
    // random userId). Both are in the relay's room before we draw.
    const peer = await peerCtx.newPage()
    await login(peer)
    await peer.goto(`/whiteboard/${whiteboardId}`)
    await waitForCanvas(peer)
    await waitForConnected(peer)

    const ownerBaseline = await canvasFingerprint(owner)
    const peerBaseline = await canvasFingerprint(peer)

    // Owner picks the pen from the md:hidden toolbar and starts a stroke with
    // finger 1 — down + a couple of moves, but NO pointerup, so it stays an
    // in-progress active stroke.
    await selectMobilePen(owner)

    const box = await canvasBox(owner)
    const sx = box.x + box.width * 0.35
    const sy = box.y + box.height * 0.35
    await touchPointer(owner, [
      { type: 'pointerdown', pointerId: 1, clientX: sx, clientY: sy },
      { type: 'pointermove', pointerId: 1, clientX: sx + 20, clientY: sy + 10 },
      { type: 'pointermove', pointerId: 1, clientX: sx + 40, clientY: sy + 20 },
    ])

    // The peer must see the in-progress stroke as a live preview (pixels
    // appear) — NOT wait for a commit that never comes.
    await expect
      .poll(() => canvasFingerprint(peer), { timeout: 15000, intervals: [250] })
      .not.toBe(peerBaseline)

    // Finger 2 lands while the stroke is in flight: the app must treat this
    // as a gesture and CANCEL the partial stroke (Iteration-3 fix). No finger
    // moves afterwards, so the viewport is unchanged — a pure cancel.
    await touchPointer(owner, [
      { type: 'pointerdown', pointerId: 2, clientX: sx + 80, clientY: sy + 30 },
      { type: 'pointerup', pointerId: 1, clientX: sx + 40, clientY: sy + 20, buttons: 0 },
      { type: 'pointerup', pointerId: 2, clientX: sx + 80, clientY: sy + 30, buttons: 0 },
    ])

    // The peer's preview must clear (fingerprint returns to baseline) and the
    // owner must NOT have committed a stray element either — the cancel
    // broadcast reaches the peer, so no stuck preview remains. Both settle:
    // the preview stays gone (it was cancelled, not committed).
    await expectCanvasToReturn(peer, peerBaseline)
    await expectCanvasToReturn(owner, ownerBaseline)
  } finally {
    await ownerCtx.close()
    await peerCtx.close()
  }
})

test('a remote touch stroke preview clears when the browser cancels the pointer mid-stroke (regression)', async ({ browser }) => {
  // Same two-browser, same-owner setup as the gesture-cancel test: the peer tab
  // gets a RANDOM per-page userId, so the owner's in-flight stroke renders on
  // the peer as a live remote preview. This variant cancels via pointercancel
  // instead of a second finger — proving handlePointerCancel goes through the
  // same cancelActiveStroke broadcast (the Iteration-3 gesture-cancel fix) and
  // clears the peer's preview, rather than committing a stray element.
  const mobile = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
  const ownerCtx = await browser.newContext(mobile)
  const peerCtx = await browser.newContext(mobile)
  try {
    const owner = await ownerCtx.newPage()
    await login(owner)
    const whiteboardId = await createWhiteboard(owner)
    await waitForCanvas(owner)
    await waitForConnected(owner)

    const peer = await peerCtx.newPage()
    await login(peer)
    await peer.goto(`/whiteboard/${whiteboardId}`)
    await waitForCanvas(peer)
    await waitForConnected(peer)

    const ownerBaseline = await canvasFingerprint(owner)
    const peerBaseline = await canvasFingerprint(peer)

    await selectMobilePen(owner)

    const box = await canvasBox(owner)
    const sx = box.x + box.width * 0.35
    const sy = box.y + box.height * 0.35
    await touchPointer(owner, [
      { type: 'pointerdown', pointerId: 1, clientX: sx, clientY: sy },
      { type: 'pointermove', pointerId: 1, clientX: sx + 20, clientY: sy + 10 },
      { type: 'pointermove', pointerId: 1, clientX: sx + 40, clientY: sy + 20 },
    ])

    // The peer sees the in-progress stroke as a live preview.
    await expect
      .poll(() => canvasFingerprint(peer), { timeout: 15000, intervals: [250] })
      .not.toBe(peerBaseline)

    // The browser cancels the pointer mid-stroke — NO finger-up, NO gesture.
    // The cancel must abort the partial stroke and broadcast cancelActiveStroke,
    // so the peer's preview clears too (a commit would leave a real element
    // that no cancel could undo, and the peer fingerprint would never return).
    await touchPointer(owner, [
      { type: 'pointercancel', pointerId: 1, clientX: sx + 40, clientY: sy + 20 },
    ])

    await expectCanvasToReturn(peer, peerBaseline)
    await expectCanvasToReturn(owner, ownerBaseline)
  } finally {
    await ownerCtx.close()
    await peerCtx.close()
  }
})

test('mobile toolbar color and size selection flow through to a stroke', async ({ page }) => {
  await login(page)
  await createWhiteboard(page)
  await waitForCanvas(page)

  const mobileToolbar = await openMobileToolbar(page)
  await selectMobilePen(page)

  // Expand the toolbar via the collapsed color swatch (the strip's button whose
  // child swatch div has the rounded size classes).
  const colorSwatch = mobileToolbar
    .locator('button')
    .filter({ has: page.locator('.w-7.h-7.rounded-md') })
  await colorSwatch.click()
  await expect(mobileToolbar.getByText('Tools', { exact: true })).toBeVisible({ timeout: 10000 })

  // Color: type a valid hex into the color-wheel's input — the header hex
  // readout reflects the new currentColor once the toolbar propagated it.
  await mobileToolbar.locator('input[type="text"]').fill('#ff0000')
  await expect(mobileToolbar.getByText('#FF0000', { exact: true })).toBeVisible({ timeout: 10000 })

  // Size: pick size 8 from the Stroke Size row.
  await mobileToolbar.getByRole('button', { name: '8', exact: true }).click()
  await expect(mobileToolbar.getByRole('button', { name: '8', exact: true })).toHaveClass(/bg-blue-100/)

  const baseline = await canvasFingerprint(page)
  const box = await canvasBox(page)
  await touchStroke(
    page,
    { x: box.x + box.width * 0.3, y: box.y + box.height * 0.25 },
    { x: box.x + box.width * 0.65, y: box.y + box.height * 0.45 },
  )
  await expect
    .poll(() => canvasFingerprint(page), { timeout: 10000, intervals: [250] })
    .not.toBe(baseline)
})
