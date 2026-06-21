# Agent Instructions

**Read first:** `.specify/memory/constitution.md`

That file is the single source of truth for agent behavior on this project —
loop-mode rules, core principles, autonomy & branch safety, pre-commit checks,
and spec conventions.

See also:
- `CLAUDE.md` — full project / tech-stack reference (loaded automatically by Claude Code).
- `README.md` — application overview.

**Ralph loop:** `./scripts/ralph-loop.sh` — never run on `master` / `develop` / `main`
(they auto-deploy). Use a dedicated `feat/*` branch only.
