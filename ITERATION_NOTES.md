# Iteration Notes

## Goal
Fresh full-tool audit: drive EVERY whiteboard tool through the e2e harness (mouse + touch) asserting each creates/persists an element; fix anything that doesn't. Covered already: pen, highlighter, eraser, select, pan, rectangle (mouse/touch). ADD e2e coverage for: line, arrow, circle, ellipse, polyline, arc, revision-cloud, stamp, text-annotation, dimension, measure-distance, measure-area, offset, mirror, rotate, scale, trim, extend, fillet — in frontend/e2e/ (new full-tool-audit.spec.ts or per-group specs), reusing helpers.ts, exercising BOTH the desktop mouse path (getByRole toolbar button + page.mouse) and the touch path (mobile emulation + existing touchPointer/touchStroke/touchDrag helpers), asserting each tool commits a real element (canvasFingerprint change / element count / transformer selection / dialog flow). Fix any tool that fails to create/persist an element. Keep npm run typecheck + npm test green, and run the new spec via npx playwright test to verify (playwright auto-boots the stack via webServer).

## State

### Iteration 4 (Aug 10, 2026) — final batch: modify tools + measure-area (mouse + touch) → AUDIT COMPLETE

**Changed:** Appended 16 tests to `frontend/e2e/full-tool-audit.spec.ts` (2 new describes: "desktop modify tools" + "mobile modify tools") driving the 7 modify tools AND measure-area on BOTH input paths. Every test draws a base shape first (line for offset/trim/extend/fillet; rectangle for mirror/rotate/scale/measure-area), then drives the tool's own click-step state machine:
- offset: 2 clicks (near-line to set distance → move to populate preview → click to commit; the 2nd commit-click NEEDS a prior pointermove because the offset commits on the pointerdown that reads `previewResult`). Desktop `mouse.move` then `mouse.click`; mobile a tiny `touchStroke` to force the move, then a `touchTap`.
- mirror/rotate/scale: click element (ON an EDGE — `findElementAtPosition` is 8px-from-segment, interior clicks miss) → `Enter` to advance past select → axis/basepoint clicks (mirror: 2 axis clicks; rotate/scale: basepoint + commit click). Rotate's commit angle point is DIAGONAL (~30°) — never 0/90/180/360 (an axis-aligned rect can look identical). Scale's basepoint is a rect corner; commit click 250px/160px away for ~1.4-1.5x.
- trim: click cutting edge, then click target line on the side to remove. extend: click boundary, then click target near its free end. fillet: click line 1, then line 2 of an L-corner (default radius 20).
- measure-area: click INSIDE the rect (Konva `getAllIntersections` hit region covers the transparent-fill interior) → `measurement-area` label element.
- Assertions: `assertCommitted` (fingerprint change + 750ms settle) for all, PLUS a `pixelAt` corner-pixel check for fillet (the corner junction is trimmed away → red channel returns to background; the tiny radius-20 arc alone could be too subtle for the 24-wide fingerprint grid).
- All 38 spec tests pass (1.5m). No product code needed fixing — every tool commits a real, persisting element.

**AUDIT COMPLETE — all 18 target tools covered (mouse + touch):** line, arrow, circle, ellipse, polyline, arc, revision-cloud, stamp, dimension, measure-distance, text-annotation, offset, mirror, rotate, scale, trim, extend, fillet, measure-area. Combined with the pre-existing coverage (pen, highlighter, eraser, select, pan, rectangle in collab.spec.ts + mobile-touch.spec.ts), EVERY whiteboard tool now has e2e coverage asserting it creates/persists an element on both input paths.

**Next iteration:** none — the goal is fully achieved. Before shipping: re-run `npm run typecheck` + `npm test` (gate, green: 438/438) and the full `npx playwright test` suite (all e2e specs), then ship per the CI/CD protocol (mark the backlog item done).

**Gotchas (all prior gotchas still apply):**
- Modify-tool selection clicks MUST land within 8px of a segment (edge/corner), NOT the interior — `findElementAtPosition` is segment-distance based; `measure-area` is the exception (it uses Konva hit detection, interior works).
- offset commits on a pointerdown that reads `previewResult`, which is only populated by a PRIOR `onMouseMove` — the test must `mouse.move`/drag (mobile) between the two clicks or the 2nd click is a silent no-op.
- mirror/rotate/scale `Enter` advances the select step to axis/basepoint (`selectedIds.length > 0` required — the click must land before Enter).
- rotate commit angle is `atan2` of the click ray: pick a diagonal commit point; 0/90/180/360 about a rect center can look identical and pass nothing.
- fillet's arc (radius 20) alone can be too subtle for the 24-wide fingerprint grid — assert the trimmed corner pixel via `pixelAt` too.
- Mobile modify tests must re-`expandMobileToolbar` between the base draw tool and the modify tool (tool selection collapses the palette). `selectMobilePaletteTool` helper encapsulates this.
- Loop gate green: `npm run typecheck` clean, `npm test` 438/438; `npx playwright test e2e/full-tool-audit.spec.ts` → 38 passed (16 new + 22 prior).

### Iteration 3 (Aug 10, 2026) — third batch: dimension, measure-distance, text-annotation (mouse + touch)

**Changed:** Appended 6 tests to `frontend/e2e/full-tool-audit.spec.ts` driving the annotate/measure click-sequence + modal tools on BOTH input paths:
- Desktop mouse: dimension (3 clicks: start → end → offset; 3rd commits), measure-distance (2 clicks: start → end; 2nd commits), text-annotation (`mouseDrag` leader line → modal opens on pointerup → fill `Enter your annotation...` textarea → Enter commits).
- Mobile touch: same tools via expanded-palette `title` buttons (Dimension / Measure Distance / Text Annotation) + `touchTap` (dimension/measure) and `touchStroke` (text-annotation leader) + the same modal flow.
- Assertions: each test captures `canvasFingerprint` baseline, runs the sequence, asserts the modal appears for text-annotation (`getByRole('heading', { name: 'Add Annotation' })`), then `assertCommitted` (fingerprint change + 750ms settle re-check). All 22 spec tests pass (1.5m second run; first run had 2 pre-existing cold-start flakes in arc/circle, confirmed transient on re-run). No product code needed fixing.

**Covered so far toward the 18-tool audit target (11/18):** line, arrow, circle, ellipse, polyline, arc, revision-cloud, stamp, dimension, measure-distance, text-annotation (mouse + touch). Still uncovered: measure-area (needs a pre-drawn shape), and the modify tools offset, mirror, rotate, scale, trim, extend, fillet (each needs a pre-drawn shape + its own select-step state machine).

**Next iteration:** the modify tools. Each test draws a base shape first (line for offset/trim/extend/fillet; rectangle for mirror/rotate/scale), then drives the tool's select-step → click/Enter state machine and asserts the transform (offset/mirror emit PARALLEL COPIES — originals kept, so element count/fingerprint both change; rotate/scale REPLACE originals; fillet emits a `fillet-arc` + trims two lines). Then measure-area (click an existing rectangle → measurement overlay). Consider reading `useOffsetTool.ts`/`useMirrorTool.ts`/`useRotateTool.ts`/`useScaleTool.ts`/`useTrimTool.ts`/`useExtendTool.ts`/`useFilletTool.ts` for each tool's exact click-step order before writing.

**Gotchas:**
- All gotchas from Iterations 1-2 still apply (fresh board per test, desktop/mobile selector scoping, exact:true on mobile `title` lookups).
- Measure/annotate tools are click-sequence or drag+modal, never plain drags: dimension/measure-distance commit on CLICKS (use `page.mouse.click` or `touchTap`, not a drag); text-annotation needs a real down→move→up drag to open its modal (`mouseDrag` / `touchStroke`).
- Text-annotation modal: heading `Add Annotation`, textarea placeholder `Enter your annotation...` (global locator, not scoped to a toolbar). Type text then `page.keyboard.press('Enter')` — the textarea's `@keydown.enter.prevent` calls `confirmAnnotation`; empty text closes WITHOUT creating (don't test that here — an assertion that a committed element exists is the point).
- Mobile tool selection collapses the palette (`handleMobileToolSelect` sets `toolbarExpanded=false` on nextTick) — fine, the tool stays active; just don't expect the palette to stay open after clicking these buttons (unlike stamp).
- Dimension discards the 2nd point if start→end < 1px; measure-distance discards if < 1px — keep clicks well apart.
- Desktop sidebar is `max-h-screen overflow-y-auto` — the annotate/measure buttons are below the fold at the default 1280x720 viewport, but Playwright's click auto-scrolls, so no scrollIntoView needed.
- Loop gate green: `npm run typecheck` clean, `npm test` 438/438; `npx playwright test e2e/full-tool-audit.spec.ts` → 22 passed (re-run after first-run cold flakes: arc + circle-login hydration race, pre-existing).

### Iteration 2 (Aug 10, 2026) — second batch: polyline, arc, revision-cloud, stamp (mouse + touch)

**Changed:** Appended 8 tests to `frontend/e2e/full-tool-audit.spec.ts` driving the four click-sequence / click-only tools on BOTH input paths:
- Desktop mouse: polyline (3 clicks + `Enter` to finish), arc (3 non-collinear clicks), revision-cloud (4 vertex clicks + a click within 10px of the first vertex to close), stamp (toolbar button → pick REVISED from the dropdown menu → click to place).
- Mobile touch: same tools via expanded-palette `title` buttons + a new `touchTap` helper (`touchPointer` down+up at one point) for the click-based flows; polyline still finishes with `page.keyboard.press('Enter')`.
- Each test captures `canvasFingerprint` baseline, runs the click sequence, then `assertCommitted` polls for a fingerprint change AND re-checks after a 750ms settle window (a committed element, not a transient preview). All 16 spec tests pass (41s), no product code needed fixing.

**Covered so far toward the 18-tool audit target (8/18):** line, arrow, circle, ellipse, polyline, arc, revision-cloud, stamp (mouse + touch). Still uncovered: text-annotation, dimension, measure-distance, measure-area, offset, mirror, rotate, scale, trim, extend, fillet.

**Next iteration:** append the click-sequence measure/annotate tools — dimension (3 clicks: start → end → offset), measure-distance (2 clicks), text-annotation (down-drag-up leader + modal `<textarea>` + Enter). Then the modify tools (offset/mirror/rotate/scale/trim/extend/fillet need a pre-drawn shape + their own select-step state machines), then measure-area (click an existing shape).

**Gotchas:**
- All gotchas from Iteration 1 still apply (fresh board per test, desktop/mobile selector scoping, exact:true on mobile `title` lookups).
- Click-sequence tools commit on CLICKS — pointerup is a no-op for polyline/arc/revision-cloud, so use `page.mouse.click` (desktop) or `touchTap` (mobile), never a drag.
- Polyline/revision-cloud finish via `Enter` OR a click <10px of the last/first vertex — the tests exercise Enter (polyline) and close-click (revision-cloud) to cover both commit paths.
- Arc needs 3 NON-collinear clicks; keep the through point well off the start→end chord (collinear points are discarded with a `console.warn`).
- Stamp is a dropdown tool, NOT a plain `getByRole('button', ...)` with a static aria-pressed: click the toolbar button (`aria-label` regex `/Stamp tool, press S/`), pick a type from `role="menu"` (aria-label `Select stamp type`) — BOTH the hidden desktop sidebar and the mobile sheet render the menu when open, so scope the menu query to the active toolbar locator to avoid strict-mode ambiguity. Commit happens on pointerdown.
- Mobile stamp keeps the palette expanded (it uses `handleStampClick`, not `handleMobileToolSelect`); synthetic taps bypass hit-testing so the canvas is still reachable.
- `touchTap` was added inline to the spec (down+up via the existing `touchPointer` export) — no helpers.ts change needed.
- Loop gate green: `npm run typecheck` clean, `npm test` 438/438; `npx playwright test e2e/full-tool-audit.spec.ts` → 16 passed.

### Iteration 1 (Aug 10, 2026) — first batch: line, arrow, circle, ellipse (mouse + touch)

**Changed:** Created `frontend/e2e/full-tool-audit.spec.ts` with 8 tests driving the four simplest create-from-scratch tools (line, arrow, circle, ellipse) on BOTH input paths: desktop mouse (toolbar aria-label button + `page.mouse` drag) and mobile touch (expanded palette `title` button + `helpers.touchStroke` drag). Each test selects the tool, captures `canvasFingerprint`, draws, and asserts the fingerprint changes AND stays changed after a settle window (a real committed element, not a transient preview). All 8 pass. No product code needed fixing.

**Gotchas (still apply):**
- Each test logs in + creates a fresh whiteboard (isolation). Stack is booted by playwright `webServer` (php artisan serve :8002, nuxt :3000 TEST=1, ws relay :3001); cold start ~60-90s, then fast.
- Desktop selectors: scope to `getByRole('toolbar', { name: 'Whiteboard tools' })` then `getByRole('button', { name: '${Name} tool, press ${Shortcut}', exact: true })`; assert `aria-pressed` true. Mobile: `expandMobileToolbar(page)` then `getByTitle('${Name}', { exact: true })` scoped to the mobile toolbar (exact is MANDATORY — the hidden desktop sidebar keeps `'Line (L)'`-style titles in the DOM).
- Circle: down = center, drag = radius; keep radius > 5 (discard threshold). Ellipse/line/arrow: skip zero-length/too-small drags (threshold 5 / 1 px). Ortho is off by default, so no constrainPoint surprises.
- Don't press keyboard shortcuts in e2e for these tools — clicking the button avoids shortcut-related focus/keyboard interactions (e.g. `C` closes polylines, which would interfere with later click-sequence tests).

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
