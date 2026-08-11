# Iteration Notes

## Goal
Fresh full-tool audit: drive EVERY whiteboard tool through the e2e harness (mouse + touch) asserting each creates/persists an element; fix anything that doesn't. Covered already: pen, highlighter, eraser, select, pan, rectangle (mouse/touch). ADD e2e coverage for: line, arrow, circle, ellipse, polyline, arc, revision-cloud, stamp, text-annotation, dimension, measure-distance, measure-area, offset, mirror, rotate, scale, trim, extend, fillet — in frontend/e2e/ (new full-tool-audit.spec.ts or per-group specs), reusing helpers.ts, exercising BOTH the desktop mouse path (getByRole toolbar button + page.mouse) and the touch path (mobile emulation + existing touchPointer/touchStroke/touchDrag helpers), asserting each tool commits a real element (canvasFingerprint change / element count / transformer selection / dialog flow). Fix any tool that fails to create/persist an element. Keep npm run typecheck + npm test green, and run the new spec via npx playwright test to verify (playwright auto-boots the stack via webServer).

## State

### Iteration 1 (Aug 10, 2026) — first batch: line, arrow, circle, ellipse (mouse + touch)

**Changed:** Added `frontend/e2e/full-tool-audit.spec.ts` with 8 tests driving the four simplest create-from-scratch tools (line, arrow, circle, ellipse) on BOTH input paths: desktop mouse (toolbar aria-label button + `page.mouse` drag) and mobile touch (expanded palette `title` button + `helpers.touchStroke` drag). Each test selects the tool, captures `canvasFingerprint`, draws, and asserts the fingerprint changes AND stays changed after a settle window (a real committed element, not a transient preview). All 8 pass. No product code needed fixing — these four tools commit correctly.

**Covered so far toward the 18-tool audit target:** line, arrow, circle, ellipse (mouse + touch). Still uncovered: polyline, arc, revision-cloud, stamp, text-annotation, dimension, measure-distance, measure-area, offset, mirror, rotate, scale, trim, extend, fillet.

**Next iteration:** append the click-sequence draw tools (polyline — clicks + Enter; arc — 3 clicks; revision-cloud — clicks + close; stamp — click-only) to the spec, mouse path first, then touch. Then dimension/measure-distance (3/2-click flows), then the modify tools (offset/mirror/rotate/scale/trim/extend/fillet need a pre-drawn shape + their own select-step state machines), then measure-area (click an existing shape), then text-annotation (modal flow).

**Gotchas:**
- Each test logs in + creates a fresh whiteboard (isolation). Stack is booted by playwright `webServer` (php artisan serve :8002, nuxt :3000 TEST=1, ws relay :3001); cold start ~60-90s, then fast.
- Desktop selectors: scope to `getByRole('toolbar', { name: 'Whiteboard tools' })` then `getByRole('button', { name: '${Name} tool, press ${Shortcut}', exact: true })`; assert `aria-pressed` true. Mobile: `expandMobileToolbar(page)` then `getByTitle('${Name}', { exact: true })` scoped to the mobile toolbar (exact is MANDATORY — the hidden desktop sidebar keeps `'Line (L)'`-style titles in the DOM).
- Circle: down = center, drag = radius; keep radius > 5 (discard threshold). Ellipse/line/arrow: skip zero-length/too-small drags (threshold 5 / 1 px). Ortho is off by default, so no constrainPoint surprises.
- Don't press keyboard shortcuts in e2e for these tools — clicking the button avoids shortcut-related focus/keyboard interactions (e.g. `C` closes polylines, which would interfere with later click-sequence tests).
- Loop gate green: `npm run typecheck` clean, `npm test` 438/438.

## Context (from prior code review — read before changing code)

### What "every tool" means
24 tools total. **Already covered in e2e:** pen, highlighter, eraser, select, pan, rectangle (mobile-touch.spec.ts touch; collab.spec.ts desktop mouse for pen/highlighter). **ZERO coverage for:** line, arrow, circle, ellipse, polyline, arc, revision-cloud, stamp, text-annotation, dimension, measure-distance, measure-area, offset, mirror, rotate, scale, trim, extend, fillet. Those 18 are the audit target.

### Tool registry + selectors (from WhiteboardToolbar.vue — single component, desktop sidebar + md:hidden mobile bottom sheet)
- `primaryTools` (line ~698): select, pan, pen, highlighter, eraser — the 5 in the COLLAPSED mobile strip.
- `navTools`: select (V), pan (H). `drawTools`: pen (P), highlighter (B), line (L), arrow (A), rectangle (R), circle (C), ellipse (E), polyline (PL), arc (ARC), revision-cloud (RC). `modifyTools`: offset (OFF), mirror (MI), rotate (RO), scale (SC), trim (TR), extend (EX), fillet (F), eraser (X). `annotateTools`: text-annotation (T), dimension (DIM). `measureTools`: measure-distance (M), measure-area (Shift+M). Stamp = separate dropdown button (title `Stamp (S)` desktop / `Stamp` mobile expanded).
- **Desktop buttons:** `:title="Name (Shortcut)"`, `:aria-label="Name tool, press Shortcut"`, `:aria-pressed="currentTool === tool.id"`. Reliable selector: scope to `getByRole('toolbar', { name: 'Whiteboard tools' })` then `getByRole('button', { name: 'Circle tool, press C', exact: true })`. Active = `toHaveAttribute('aria-pressed', 'true')`.
- **Mobile collapsed strip** (`role="toolbar" aria-label="Mobile whiteboard tools"`, `role="group" aria-label="Primary drawing tools"`): `:title="Name (Shortcut)"` ONLY — e.g. `getByTitle('Pen (P)')`; active = `toHaveClass(/bg-blue-100/)`.
- **Mobile expanded palette** (open via `expandMobileToolbar()` in helpers.ts — clicks the color swatch, waits for "Tools" header): buttons `:title="tool.name"` — **bare name, no shortcut, NO aria-label**. `getByTitle('Circle', { exact: true })` scoped to the mobile toolbar. **exact: true is MANDATORY** — the desktop sidebar (hidden md:flex) stays in the DOM with `Circle (C)` titles, so a non-exact `getByTitle('Circle')` hits strict-mode. Undo/Redo are ambiguous too — always scope + exact.
- Stamp: desktop `aria-label="Stamp tool, press S. Current: APPROVED"` (dynamic currentStampType); menu items `role="menuitem"`, `aria-label="Select APPROVED stamp, currently selected"` etc.

### Interaction pattern per uncovered tool (all go through the unified pointer pipeline → input-agnostic; drive with page.mouse on desktop, synthetic `pointerType:'touch'` via helpers on mobile)
**Create-from-scratch (mouse + touch drag):**
- line: down-drag-up; zero-length discarded. arrow: same, 2 pts + head. circle: down=center, drag=radius (`radius>5`). ellipse: bbox drag. 
- **polyline: CLICKS only** (pointerup is a no-op). ≥2 vertices; finish via **Enter**, **double-click** (2nd click <10px of last vertex), or **`C`** (closes, needs ≥3). Backspace pops, Esc cancels.
- **arc: 3 clicks** (start, through, end); commits on 3rd click; collinear discarded. **dimension: 3 clicks** (start → end → offset); 3rd commits. **measure-distance: 2 clicks** (start → end); 2nd commits.
- **revision-cloud: clicks per vertex**, ≥2; finish via click <10px of first/last vertex, Enter, or `C`; always closed.
- **stamp: click/tap only** — commits on pointerdown; centered on click.
- **text-annotation: down-drag-up** draws a leader line, OPENS A MODAL on pointerup (`<textarea>` placeholder "Enter your annotation...", commit via **Enter** or **Add** button; empty text closes without creating). Test must type text + press Enter, then assert an element persisted (canvasFingerprint or element count).
**Modify tools (own selection state machine, do NOT need select-tool selection first):**
- offset: click 1 on a line/polyline/rectangle → click 2 → emits a PARALLEL COPY (original kept).
- mirror: select-step clicks (toggle elements; Enter or empty-click advances) → axis-first click pt → axis-second click pt → mirrored COPIES (originals kept).
- rotate: select-step → basepoint click → move + click to set angle → adds rotated + DELETES originals (a transform — assert the selected element moved, not just "something changed").
- scale: select-step → basepoint click → click to commit scale (factor = dist(base,cursor)/referenceDist) → replaces originals.
- trim: click 1 = cutting edge, click 2 = element to trim (click-side removed; needs intersecting line/polyline geometry).
- extend: click 1 = boundary, click 2 = element to extend (endpoint nearer click extends to boundary; needs line/polyline).
- fillet: click 1 = first LINE, click 2 = second LINE → trims both + emits a `fillet-arc` element (radius default 10).
**measure-area: click on an EXISTING shape** (rect/circle/ellipse/polyline/revision-cloud/arc/stroke) → creates a measurement overlay; empty-click shows a toast error. Test must draw a shape first, then measure it.

### e2e harness facts
- helpers.ts already exports: `login`, `createWhiteboard`, `canvasFingerprint`, `transformerFingerprint`, `pixelAt`, `darkRowSpan`, `touchPointer`, `touchStroke`, `touchDrag`, `canvasBox`, `waitForCanvas`, `waitForConnected`, `expectCanvasToChange`, `expectCanvasToReturn`, `openMobileToolbar`, `expandMobileToolbar`.
- `canvasFingerprint` = deterministic hash of the main layer's rendered pixels → the primary "an element committed" assertion. `transformerFingerprint` = hash of the transformer layer → proves a select-tool selection rendered. `darkRowSpan(page, yCss)` + `pixelAt` prove geometry landed at expected coords.
- Mobile emulation: `test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })`.
- **playwright.config.ts `webServer` auto-boots the WHOLE stack:** `php artisan serve --port=8002` (cwd `..`), `npm run dev` with `TEST=1` on :3000, and `LARAVEL_URL=http://localhost:8002 WS_PORT=3001 node server/ws-server.js` on :3001. So `npx playwright test e2e/<new-spec>.spec.ts` boots everything (cold ~60-90s). `reuseExistingServer: true`.
- global-setup seeds the e2e owner (`E2E_OWNER_EMAIL/PASSWORD`). `login(page)` + `createWhiteboard(page)` per test.

### Verification
- Loop gate: `cd frontend && npm run typecheck && npm test` (438 tests, 44 files).
- **Run the new spec to prove the tools actually work:** `cd frontend && npx playwright test e2e/<spec>.spec.ts` (playwright boots the stack). FIRST cold run can flake on the login-button hydration race (pre-existing; re-run to confirm, don't chase).
- Backend untouched by this goal (`php artisan test` need not change, but must stay green — run it if any backend file is touched, which it shouldn't be).
- After ALL_DONE: re-run `npm run typecheck && npm test` + full `npx playwright test` before shipping.
