# VP Whiteboard - Continuous Work Notes

## Status: CODE-COMPLETE + INDEPENDENTLY VERIFIED — awaiting MANUAL UAT only

The `bright-shimmying-lampson` plan (AutoCAD toolbar redesign + Revision Cloud tool) is implemented and independently re-verified end-to-end (2026-06-13). The diff is stable and ready for commit/push by the automation.

**⚠️ Headless iterations: there is NO remaining work for you here.** Every plan step is done and verified. Do NOT churn working code looking for trivial edits (past iterations already exhausted this — a dead-code removal was the last real change). Making spurious edits risks regressing verified geometry/UI. The correct action for a headless run is to confirm green (`typecheck` + `build`) and stop. The single open item is a **human** browser UAT + the optional `@iconify-json/mdi` decision (user sign-off). If you are a human with a browser, see the UAT checklist below.

**Last verification (2026-06-13, full independent re-check):** walked all 16 integration touchpoints — types union + interface, `revisionCloudPath` math, tool state machine, canvas render/config/preview/bbox/vertex-markers/drag-map/snap-points, command registration, desktop 2-col grouped dark toolbar, AND mobile palette (`v-for tool in tools` includes revision-cloud). `npm run typecheck` clean, `npm run build` complete.

## Automated checks (all green, re-confirmed 2026-06-13)
- `npm run typecheck` — clean.
- `npm run build` — passes (only a generic Rollup chunk-size advisory; confirms the 5-panel toolbar template + canvas `v-line` revision-cloud render + open preview all compile).
- `npm run dev:all` — Nuxt `:3000` → 302 (auth-gated login, working), WS `:3001` → 200. Both healthy.
- **No browser UAT is possible from a headless iteration** — canvas flow is password-gated (`vpassociates2024`) + Supabase-dependent + needs interactive drawing. This is a human task.

## Geometry confidence (hand-proven — do NOT "fix")
`revisionCloudPath()` bulges lobes **outward** for BOTH screen-winding directions:
- CW polygon → `signedArea ≥ 0` → `side = -1` → `sweep = +π` → apex on outward side.
- CCW polygon → `signedArea < 0` → `side = +1` → `sweep = -π` → outward.
- The **open live preview** passes the same `points` to `signedArea`, so the side matches the finished closed cloud — **no inward→outward flip on Enter**. Preview is open + dashed so it builds segment-by-segment (no phantom cursor→start lobe).
- Independently re-traced 2026-06-13 with concrete coordinates (not just hand-proof): CW square's top segment → apex `(stepLen/2, -r)` = up = outward; CCW square's left segment → apex `(-r, …)` = left = outward. The `signedArea → side → sweep` chain is correct — no need to re-verify the bulge math next iteration.
- `hitStrokeWidth: 0` on the render config is **intentional and identical** to polyline/arc/fillet-arc (comment: "Disable pixel-perfect hit detection"). Selection is generic `stage.getAllIntersections` + node `id`. Do NOT change it for revision-cloud alone.

## Integration touchpoints (all confirmed present)
types union + `RevisionCloudElement` · `revisionCloudPath` · `useRevisionCloudTool` · canvas `getRevisionCloudConfig` + open dashed preview · `getElementBoundingBox` case (padded `size/2 + arcLength/2 + 10` for lobe bulge) · drag-transform point map · `getRevisionCloudSnapPoints` (OSNAP vertices) · `REVCLOUD`/`RC`/`REVC` command · toolbar DRAW group (`mdi:cloud-outline`, `RC`, width 8.5rem) + mobile palette.

## TODO for next iteration — MANUAL UAT (needs a human + browser)
1. **Toolbar**: 2-col grouped layout; all 5 headers (NAV/DRAW/MODIFY/ANNOTATE/MEASURE) visible; every tool activates; Stamp dropdown opens from ANNOTATE; dark CAD chrome (`bg-neutral-900` / blue-600 active).
2. **Revision Cloud**: click cloud icon OR type `REVCLOUD`/`RC`; click ≥3 points → Enter renders a **closed** cloud of outward lobes looping back to start. Also test `c` to close, Backspace to undo a vertex, Escape to cancel, click-near-start to finish early.
3. Confirm preview builds segment-by-segment with NO cursor→start lobe while placing points.
4. Drag the finished cloud (`draggable=true`). 2nd browser/incognito → real-time sync (Yjs). Reload → persists (Supabase JSONB round-trip).
5. `arcLength` is a fixed 26px (world coords) matching AutoCAD's fixed-unit arc length — do NOT scale by viewport. The data model (`data.arcLength`) already supports a future UI control if wanted post-UAT.

## Known cosmetic issue (optional, needs user sign-off)
- `[Icon] Collection mdi is not found locally` — icons still load from CDN. Fix = install `@iconify-json/mdi`, but it adds package size. Left as-is pending user decision.

## Gotchas for future iterations touching this code
- Command registration lives in `useCommandEngine.ts` (alongside POLYLINE/ARC) — the plan doc says `useCommandRegistry.ts`, but that file exists separately and commands are registered in the engine.
- The broader VP Whiteboard project also has a hardware UAT backlog (perf at 500+ elements, GC heap, offline backoff, multi-user, touch/stylus, two-finger pan, mobile toolbar) — see MEMORY.md. Not part of this plan.
