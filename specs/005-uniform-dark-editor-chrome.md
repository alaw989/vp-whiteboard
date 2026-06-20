# Spec 005: Uniform dark editor chrome + matching sidebar scrollbar

Verify: npm run typecheck && test "$(grep -RIn 'bg-chrome' components/ pages/ | wc -l)" -ge 5

## Overview
The editor's chrome uses several different colors at once. The top navigation bar is `bg-white` (light) while the side toolbar beside it is `bg-neutral-900` (dark), so there is a visible color seam between the two. The dark surfaces don't even agree with each other: toolbar `neutral-900`, command line and coordinate display `gray-900`, scale badge `slate-800` — three different darks shown simultaneously. Finally, the toolbar's scrollbar uses the light `.scrollbar-thin` style (a light thumb on a dark panel), so it looks wrong against the dark toolbar.

User complaint (verbatim): "i just want the ui color to be the same and style the sidebar's scroll bar to match."

Goal: every piece of editor chrome shares ONE dark color, enforced by a single design token so it cannot drift; and the toolbar (sidebar) scrollbar is styled to match that dark chrome.

## Context
- No `tailwind.config.*` exists today (`@nuxtjs/tailwindcss` at `nuxt.config.ts:10` runs on defaults; CSS registered via `css: ['~/assets/css/main.css']` at `nuxt.config.ts:21`). Create `tailwind.config.ts` to add semantic tokens — the module auto-loads it.
- Existing token layer in `assets/css/main.css` (`@layer components` `.card`/`.btn-*`; `@layer utilities` `.scrollbar-thin` at lines 42–66). Add the new scrollbar variant in the same `@layer utilities` block.
- Chrome surfaces and their CURRENT backgrounds:
  - Top nav header — `pages/whiteboard/[id].vue:4` — `bg-white border-b border-neutral-200`
  - Desktop side toolbar — `components/whiteboard/WhiteboardToolbar.vue:3` — `bg-neutral-900 border-r border-neutral-800`; its scroll area at `:4` uses `scrollbar-thin`
  - Command line — `components/whiteboard/CommandLine.vue:2` — `bg-gray-900 text-gray-200 border-t border-gray-700`
  - Coordinate display — `components/whiteboard/CoordinateDisplay.vue:2` — `bg-gray-900/80 text-gray-300`
  - Scale badge — `components/whiteboard/ScaleBadge.vue:3` — `bg-slate-800/90 hover:bg-slate-700/90`
  - Active-prompt banner — `components/whiteboard/WhiteboardCanvas.vue:942` — `border-gray-700 bg-gray-900/90`
- `.scrollbar-thin` (`main.css:43–65`) is light (`neutral-300` thumb / `neutral-100` track) and is ALSO used by `LayerPanel.vue:25` (a light surface), so it must NOT be changed globally — add a separate `.scrollbar-dark` variant instead.
- Standardize on the `neutral` scale (the app's existing gray scale): surface = neutral-900 (`#171717`), border = neutral-800 (`#262626`), text = neutral-100/200/400.

## Requirements
- Introduce a single source of truth via `tailwind.config.ts` `theme.extend.colors` semantic tokens (`chrome`, `chrome-border`, `chrome-fg`, `chrome-fg-muted`) backed by CSS variables in `assets/css/main.css` `:root`, using the `rgb(var(--x) / <alpha-value>)` pattern so opacity modifiers like `bg-chrome/80` work. Values map to neutral-900 / neutral-800 / neutral-100 / neutral-400.
- Apply `bg-chrome` (+ `border-chrome-border`, `text-chrome-fg` / `text-chrome-fg-muted`) to ALL editor chrome surfaces: top nav header, desktop toolbar, command line, coordinate display, scale badge, and the active-prompt banner. After the change none of these may use `bg-white`, `bg-gray-900`, or `bg-slate-800`.
- The top nav and the desktop toolbar must render as the SAME color with no visible seam between them.
- All text, icons, inputs, and controls inside the top nav must stay legible on the dark background (light text; restyle the title input, connection-status pill, and back button away from their current light-on-white treatment). Standalone white buttons (`.btn-secondary`) on the dark bar are acceptable.
- Add a `.scrollbar-dark` utility to `assets/css/main.css` (dark thumb/track — e.g. `neutral-600` thumb on `neutral-900` track, mirroring the `.scrollbar-thin` structure) and apply it to the desktop toolbar's scroll area (`WhiteboardToolbar.vue:4`) in place of `scrollbar-thin`. Do NOT change `.scrollbar-thin` globally.
- The canvas drawing workspace (`bg-neutral-100`) is NOT chrome and must stay light.
- No functional changes: tools, command line, snapping, layers, and real-time collaboration behave exactly as before.

## Acceptance Criteria
- [ ] Load a whiteboard (`/whiteboard/[id]`): top nav, left toolbar, command line, coordinate display, and scale badge all share one dark color — no visible seam between top nav and toolbar.
- [ ] `grep -RInE 'bg-(white|gray-900|slate-800)'` over the chrome surfaces in Context returns nothing (all replaced by the `chrome` token).
- [ ] `grep -RIn 'bg-chrome' components/ pages/` shows the token on the top nav, toolbar, command line, coordinate display, scale badge, and prompt banner.
- [ ] All text/controls in the top nav are legible (light on dark); the title is still editable and Share/Upload still work.
- [ ] With enough tools to overflow the toolbar, the toolbar scrollbar thumb is dark and clearly visible against the dark panel (not the old light thumb).
- [ ] The canvas drawing area remains light; drawings render unchanged.
- [ ] `npm run typecheck` passes; no regression to tools, command line, layers, snapping, or collaboration.

## Out of Scope
- Mobile bottom toolbar (`WhiteboardToolbar.vue:371`, `bg-white/95`) and mobile-only scroll areas — self-consistent, no sidebar.
- Modal/dialog restyling (Confirm, Export, Share, Shortcuts, ScaleToolPalette, Upload).
- Marketing/auth/list pages (`/`, `/login`, `/new`, `/whiteboard/new`, `/s/[id]`).
- Accent-color standardization (blue-600 vs blue-100 active states, green mode toggles, amber vs yellow warnings) — candidate for a future Spec 006.
- Canvas workspace darkening.

<!-- NR_OF_TRIES: 0 -->
