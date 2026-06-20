# VP Associates Collaborative Whiteboard — Constitution

> A real-time collaborative whiteboard for VP Associates — teams sketch, annotate,
> and do CAD-style drafting (lines, polylines, arcs, dimensions, revision clouds)
> together on shared boards, with CRDT-based multi-user sync, layers, an
> AutoCAD-style command line, PDF/image export, and client share links.

---

## Context Detection

**Ralph Loop Mode** (started by `./scripts/ralph-loop.sh`):
- Pick the highest-priority incomplete spec from `specs/` (lower number = higher priority).
- Implement, test, commit, push.
- Output `<promise>DONE</promise>` only when 100% complete; `<promise>ALL_DONE</promise>` when no work remains.

**Interactive Mode** (normal conversation): be helpful, guide decisions, create specs.

---

## Core Principles

1. **Production stability first** — the app is live at whiteboard.vp-associates.com and `master` auto-deploys. Never ship breaking changes to prod unverified.
2. **Real-time correctness** — Yjs CRDT sync must stay conflict-free; collaboration is the core feature and cannot regress.
3. **Performance at scale** — keep the canvas smooth with 500+ elements / large boards; preserve viewport culling.
4. **Ship incrementally** — small, reviewable, well-tested changes over big risky pushes.

---

## Technical Stack

Nuxt 3 · Vue 3 (Composition API, `<script setup>`) · TypeScript · Tailwind CSS ·
Konva.js + vue-konva · Yjs / y-websocket (real-time CRDT) · Supabase (Postgres +
Storage, RLS) · jspdf / pdfjs-dist · Vitest / Playwright. Dual-server: Nuxt HTTP
:3000 + WebSocket :3001. Deploy: DigitalOcean / PM2.

**Branch model: `master` = prod (auto-deploys), `develop` = staging (auto-deploys).**

---

## Autonomy & Branch Safety (CRITICAL — read every iteration)

YOLO Mode: **ENABLED** (the headless loop requires `--dangerously-skip-permissions` to function).

> **`ralph-loop.sh` runs `git push origin <current-branch>` UNCONDITIONALLY after
> every iteration.** Because `master` and `develop` both auto-deploy, this is the
> single most dangerous part of this setup.

- **NEVER run the loop on `master` or `develop`.** Only run it on a dedicated
  feature branch (e.g. `feat/<spec-slug>`). Verify the branch before each run.
- Each iteration's commit lands on that feature branch only. A human must review
  and merge — do not merge to `master`/`develop` without explicit review + verification.
- If you ever find yourself on `master` or `develop` mid-loop, **stop immediately**.

Git Autonomy (auto-merge to deploy branches): **DISABLED.**

---

## Pre-commit Checks (non-negotiable)

Before signaling `<promise>DONE</promise>` on any spec:
- `npm run typecheck` passes (vue-tsc — Nuxt `build` does NOT typecheck).
- Existing tests still pass (`npm run test` / Playwright where relevant).
- No regressions to real-time sync, canvas rendering, auth, or the AutoCAD tools.

---

## Verification

Prefer a **runnable check** over screenshot self-judgment. If a spec's acceptance can
be expressed as a command, add a `Verify: <cmd>` line to the spec (e.g.
`Verify: npm test -- geometryUtils`). The loop runs that command each iteration and
treats exit 0 as authoritative — it will reject `<promise>DONE</promise>` if `Verify:`
fails. Specs without a `Verify:` line fall back to the agent's judgment, which is
unreliable for interactive features.

**Canvas-interaction traps (learned the hard way on spec 001):**
- Synthetic pointer events must use a **single, properly-released pointerId**.
  `WhiteboardCanvas.handlePointerDown` treats a 2nd tracked pointer as a two-finger
  pan and swallows the click before it reaches the tool.
- Konva hit-tests element **edges** (an 8px band around `getElementGeometry` segments),
  not the fill — a click on a shape's interior registers nothing.
- Therefore prefer asserting **tool/state** (e.g. `selectedIds` populates, a Vitest on
  `getElementGeometry`) over visual screenshot inspection.

The loop now enforces a default cap (25 iterations) and halts via the circuit breaker
(no progress) and per-spec `NR_OF_TRIES` (stuck). It still pushes after every iteration,
so **never run it on `master`/`develop`/`main`**.

---

## Specs

Specs live in `specs/` as markdown. Pick the highest-priority incomplete spec
(lower number = higher priority). A spec is incomplete if it lacks
`## Status: COMPLETE`. Each spec needs **specific, testable acceptance criteria** —
not "works correctly" but e.g. *"user can rotate a rectangle 45°; a faithful
rotated copy commits and the original is preserved."*

Spec template: https://raw.githubusercontent.com/github/spec-kit/refs/heads/main/templates/spec-template.md

When all specs are complete, re-verify a random one before signaling done.

---

## NR_OF_TRIES

Track attempts per spec via `<!-- NR_OF_TRIES: N -->` at the bottom of the spec
file. Increment each attempt. At 10+, the spec is too hard — split it into smaller specs.

---

## History & Completion Log

After completing a spec:
- Append a 1-line summary to `history.md`.
- Write `history/YYYY-MM-DD--spec-name.md` with lessons / decisions / issues.
- Log the completed spec in `completion_log/`.

Check history before starting work on any spec.

---

## Completion Signal

All acceptance criteria verified, `npm run typecheck` passes, tests pass, changes
committed to the **feature branch** and pushed → output `<promise>DONE</promise>`.
Never output this until truly complete.

---

_Generated from [fstandhartinger/ralph-wiggum](https://github.com/fstandhartinger/ralph-wiggum) @ `3f15f0f`._
