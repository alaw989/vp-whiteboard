# Iteration Notes

## Goal
Verify and harden mobile/touch drawing on the whiteboard: with touch input (Playwright mobile/touch emulation), drawing with the pen/highlighter tools must produce real strokes (unified pointer events exist — confirm pointerType touch works end-to-end and fix any bugs), two-finger pan and pinch-zoom gestures must work, the md:hidden mobile toolbar must let a user select tool/color/size and draw, and any breakage found must be fixed with a regression test. Add mobile-emulated e2e coverage (extend the existing Playwright setup in frontend/e2e/) proving a touch draw lands on the canvas, and keep npm run typecheck + npm test green.

## State
- **Iteration 1 (touch gestures):** Fixed the two-finger pan/pinch gesture in `WhiteboardCanvas.vue` — it previously entered "pan mode" (enablePan/disablePan + Konva draggable) but NEVER moved the viewport, so two-finger gestures were dead on touch. Added `computePinchViewport()` + `toStagePoint()` in `composables/useViewport.ts` + 5 unit tests. `handlePointerUp` calls `setViewport(...)` once to sync the final viewport.
- **Iteration 2 (mobile-touch e2e + real mobile-toolbar bug fix):**
  - Added `frontend/e2e/mobile-touch.spec.ts` — 3 tests on a `hasTouch/isMobile` 390×844 viewport that dispatch real `PointerEvent`s (`pointerType: 'touch'`, `pointerId` held constant) on the Konva stage content element:
    1. Mobile toolbar selects pen (collapsed strip) → a one-finger touch stroke lands on the canvas (`canvasFingerprint` changes).
    2. Two-finger pan moves the viewport **without committing a stroke** — pan by (+40,+30) changes the fingerprint, then pan back by the exact inverse RESTORES the baseline fingerprint (proves no element was committed).
    3. Mobile toolbar color (hex input `#ff0000` → header readout `#FF0000`) and size (button `8` → active class) flow through to a touch stroke.
  - **Real bug found & fixed:** the `md:hidden` mobile toolbar was rendered BELOW the visible viewport in mobile emulation (`fixed bottom-0` anchors to the LAYOUT viewport, whose `innerHeight` is 970 vs the 844 visual viewport), so `<main>` (and Nuxt DevTools) intercepted taps — the toolbar was unclickable. Fix: `WhiteboardToolbar.vue` mobile bar `fixed` → `absolute bottom-0`, anchored by adding `relative` to the `flex-1 flex overflow-hidden` wrapper in `pages/whiteboard/[id].vue`, plus root `h-screen` → `h-dvh` (canonical mobile-height fix).
  - **E2E infra fix:** `playwright.config.ts` now runs the Nuxt webServer with `TEST=1` so `@nuxt/devtools` bails in module setup — its floating widget used to swallow clicks on the bottom toolbar (absent in prod, so purely a dev/e2e artifact).
  - Verified this session by booting the real stack (:8002 Laravel + :3000 Nuxt + :3001 WS relay): **full e2e suite 5/5 green** (smoke + collab mouse-sync + the 3 mobile-touch tests), `npm run typecheck` clean, `npm test` 399/399.
- **Next:** (c) cancel an in-progress stroke when the 2nd finger lands during a gesture (currently the frozen partial stroke — 1 point — safely never commits, but a dedicated cancel would let `currentPointerType`/pressure reset cleanly); add a touch-pen regression unit test if we change `WhiteboardCanvas.vue` again; optionally cover highlighter on touch and pinch-zoom (not just pan) in the e2e spec.
- **Gotchas:**
  - The loop gate is only `npm run typecheck && npm test` (unit); e2e is NOT auto-run by the gate. This session I started the e2e stack manually (`php artisan serve --port=8002`, `TEST=1 npm run dev`, `node server/ws-server.js`) and verified the suite by hand — e2e must be run separately.
  - In Playwright mobile emulation the LAYOUT viewport (`window.innerHeight` = 970) is taller than the visual viewport (844); `position: fixed; bottom: 0` resolves against the layout viewport → off-screen UI. Anchor mobile bars inside the app frame with `absolute` + a `relative` wrapper (and use `h-dvh`), not `fixed`.
  - `@nuxt/devtools`' floating widget intercepts pointer events at the bottom of the viewport during e2e; run the Nuxt dev server with `TEST=1` (see playwright.config.ts). `reuseExistingServer: true` means a stale manually-started server without `TEST=1` will be reused — restart it when devtools appears.
  - Gesture math must use stage-relative coords (via `toStagePoint`), not raw `clientX/clientY`, or pinch anchor drifts by the container's page offset.
  - `setViewportDirect` does NOT sync; call `setViewport` once on gesture end (kept — don't sync per-move or you spam the relay).
  - Konva bakes the viewport transform into the layer-canvas PIXELS (no CSS transform), so pan/zoom changes `canvasFingerprint`; the two-finger test exploits pan-back-to-baseline to prove "no stroke committed".

## Context (from prior code review — read before changing code)

### Current touch/mobile state
- **Unified pointer events already exist** in `frontend/components/whiteboard/WhiteboardCanvas.vue`: the stage root binds `@pointerdown`/`@pointermove`/`@pointerup`/`@pointerleave`/`@pointercancel` → `handlePointerDown/Move/Up/Leave/Cancel`. `currentPointerType` tracks `'mouse' | 'pen' | 'touch'` (set from `evt.pointerType`). There is gesture state for two-finger pan (comment at ~line 1709) and `getStagePositionFromEvent` converts client coords to stage space. Touch pressure is defaulted to 0.5 when unsupported (see the pressure extraction ~line 2214).
- **Mobile toolbar** exists in `frontend/components/whiteboard/WhiteboardToolbar.vue` (the `md:hidden` bottom bar) with `handleMobileToolSelect`/`handleMobileColorSelect`/`handleMobileSizeSelect` and a `primaryTools` list (~line 698). `frontend/pages/whiteboard/[id].vue` wires toolbar → canvas via `@select-tool` etc.
- **E2E infra exists**: `frontend/playwright.config.ts` boots the full stack (Laravel :8002 + Nuxt :3000 + WS relay :3001), `frontend/e2e/global-setup.ts` seeds an approved owner, `frontend/e2e/collab.spec.ts` proves two-browser live sync using a mouse draw + a `getImageData` canvas fingerprint. `frontend/e2e/smoke.spec.ts` covers login/create/reload.

### What to verify (and fix if broken) with touch emulation
1. **Touch draw end-to-end**: on a mobile viewport with `hasTouch: true, isMobile: true`, a pen stroke (pointerdown → pointermove → pointerup with `pointerType: 'touch'`) must produce a rendered stroke element (same canvas-fingerprint / Konva-node assertion the collab spec uses).
2. **Toolbar on mobile**: the `md:hidden` bottom bar must render and let the user pick the pen tool, a color, and a size, then draw.
3. **Two-finger gestures**: two-pointer pan and pinch-zoom must not fight touch-drawing (a single finger draws, two fingers pan/zoom). Verify the existing gesture code actually engages for touch pointers; fix if it doesn't.
4. **Coords under touch**: `getStagePositionFromEvent` must map touch client coords correctly (Konva layers are scaled; check the draw lands where the finger is — use the fingerprint + a coordinate probe).
5. Fix any breakage found with a regression test (unit and/or e2e). Do NOT break the existing mouse path (collab.spec must stay green).

### How to emulate touch in Playwright
- `test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })`.
- Playwright's `page.touchscreen.tap()` is limited; Konva relies on **Pointer Events**, so the most reliable simulation is dispatching real pointer events with `pointerType: 'touch'` on the stage root, e.g. `page.locator('.whiteboard-container').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX, clientY, isPrimary: true, pressure: 0.5 })` followed by pointermove/pointerup with `pointerId` held constant. Multi-touch = two `pointerId`s (pointerId 1 + 2) for the pinch/pan gesture.
- Reuse the existing fingerprint helper approach from `collab.spec.ts` to assert a stroke rendered (getImageData-based, since headless Chromium serves a stale surface to drawImage).

### Verification (do end-to-end before DONE)
1. `cd frontend && npm run typecheck && npm test` green (currently 394 tests).
2. `npm run test:e2e` green: existing smoke + collab (mouse) still pass, plus the new mobile/touch spec.
3. If you fixed canvas/toolbar code, the touch draw must visibly land on screen and the mouse path must be unaffected.
4. `php artisan test` only if Laravel touched (shouldn't be).

### Gotchas
- Do not regress the live-sync path (SYNC_FULL/SYNC_DELTA, reconnect, presence) — those are covered and must stay green.
- The e2e stack already runs on :8002/:3000/:3001; Playwright webServer `reuseExistingServer: true` will reuse running ones.
- `currentPointerType` and pressure defaults matter for stroke rendering (perfect-freehand `getStroke`); a touch stroke with pressure 0.5 is valid.
- Keep changes minimal and inside the canvas/toolbar/e2e files. Do not touch the Goal section. Update the State section every iteration.

## Log

- Iteration 1: two-finger pan/pinch-zoom implemented (was a no-op); `computePinchViewport` in useViewport.ts + 5 unit tests; typecheck + 399 unit tests green.
- Iteration 2: added `frontend/e2e/mobile-touch.spec.ts` (touch draw lands, two-finger pan without a stroke, mobile toolbar tool/color/size). Fixed real mobile bug: mobile toolbar was off-screen (`fixed bottom-0` anchors to the 970px layout viewport, not the 844px visual viewport) — now `absolute` in a `relative` wrapper + root `h-dvh`. Disabled Nuxt DevTools in e2e via `TEST=1` webServer env. Full e2e suite 5/5 green, typecheck clean, 399 unit tests green.
