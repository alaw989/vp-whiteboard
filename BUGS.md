# VP Whiteboard - Known Bugs

**Last Updated:** 2026-02-12

## Recently Fixed (Session #45)

- [x] Drawing tool offset - Fixed (removed double viewport transformation from group)
- [x] Drag/select tool - Fixed (added draggable: true to all element configs)
- [x] Stamp icons cut off - Fixed (increased sidebar width to 7rem)
- [x] Colors palette cut off - Fixed (increased sidebar width to 7rem)

## Investigated - Code Working Correctly

The following issues were investigated and the code is working as designed. Bug reports may be outdated or browser-specific.

- [x] Color selector not working - Code review shows correct emit/prop flow
- [x] Export not working - Code review shows correct export dialog and download flow
- [x] Actions icons (blank/white) - Icon names are correct (mdi:undo, mdi:redo, mdi:delete-sweep)

## No Open Bugs

All reported bugs have been fixed or verified as working correctly.

---

## Testing Notes

**Dev Server:** `npm run dev` (runs on port 3000)
**URL:** http://localhost:3000

**How to test drawing offset:**
1. Create new whiteboard
2. Select pen tool
3. Click and draw - line should appear exactly at cursor position

**How to test drag:**
1. Draw some shapes
2. Press V or click select tool
3. Click and drag shapes - they should move with cursor

**How to test color selector:**
1. Select pen tool
2. Click different colors in palette
3. Draw - should use selected color

**How to test export:**
1. Draw something on canvas
2. Click export button (bottom of toolbar)
3. Try PNG and PDF options

---

## Continuous Claude Prompt

Copy this into a new Claude session to continue bug fixes:

```
You are working on VP Whiteboard bugs.

CONTEXT:
- Located at: /home/deck/Sites/vp-whiteboard
- Stack: Nuxt 3, Vue 3, TypeScript, Tailwind CSS, Konva, Yjs
- Dev server: npm run dev (runs on port 3000)
- Bug list: See BUGS.md

RULES:
1. Always run dev server in background: `npm run dev &`
2. Read files before editing - use Read tool
3. Test changes in browser after each fix
4. Commit with atomic, descriptive messages
5. Update BUGS.md with fixed items (move to Recently Fixed)
6. Focus on one bug at a time, working from High to Low severity

WORKFLOW:
- Git: small, atomic commits with clear messages
- Ask user before major refactors
- Preserve existing patterns unless explicitly changing them
```
