# Branch Convergence Program

Date: March 25, 2026

This document records the branch strategy for MindStore after the public feature and hotfix lines converged.

## Current Rule

`main` is the only source of truth for product behavior, schema, docs, CI, and deploys.

`codex/local-dev` and `frain/improve` are mirror branches. They exist to keep historical context and agent continuity, not to carry independent long-lived product state.

That means:

- all new work starts from current `main`
- feature batches land on `main` only after local verification and a green preview deploy
- after merge, `codex/local-dev` and `frain/improve` must be fast-forwarded to the exact same commit
- unpublished VPS-only frain work is reference material until it is pushed publicly

## Why This Changed

The earlier codex/frain split was useful while feature parity and runtime convergence were still in progress. That stage is over.

Public `main` now contains the production hotfixes, the converged plugin/runtime work, and the most reliable deployable state. Keeping multiple first-class branches alive would only recreate drift.

## Branch Responsibilities

### `main`

- trunk branch for all product work
- source of deploys and release history
- source of truth for schema, package metadata, docs, and test expectations

### `codex/local-dev`

- mirror of `main`
- safe landing zone for Codex continuity between sessions
- may temporarily host a short-lived topic branch during active work, but must be re-aligned to `main` immediately after merge

### `frain/improve`

- mirror of `main`
- historical reference for frain-originated work
- not a place for new parallel architecture or unmerged product state

## Operating Workflow

1. Branch from `main` into a short-lived `codex/*` topic branch.
2. Implement the change there.
3. Run the local quality gates relevant to the slice:
   - `npm run build`
   - `npm run typecheck`
   - `npm run test`
   - `npm run test:e2e` or document the exact infra blocker
4. Push the topic branch and confirm a green Vercel preview when the change affects deployed behavior.
5. Fast-forward `main` to the verified commit.
6. Fast-forward `codex/local-dev` and `frain/improve` to the same commit.
7. Record the landing and deploy outcome in `docs/codex/WORKLOG.md`.

## Stabilization Priorities

The remaining convergence work is no longer feature parity. It is stabilization and discipline:

- preserve the current green production baseline
- keep route handlers thin and business logic in `src/server/plugins/ports/*`
- centralize shared provider/config behavior instead of re-duplicating it
- fix controlled slices of lint debt, starting with recently drifting UI/search surfaces
- remove or suppress known non-blocking build noise only when the solution is explicit and safe

## Success Condition

The branch program is successful when all of these stay true:

1. `origin/main`, `origin/codex/local-dev`, and `origin/frain/improve` point to the same commit after each landing.
2. Production deploys come from `main` only.
3. No agent does new feature work directly on a mirror branch.
4. Worklog entries make it obvious which commit was verified, deployed, and mirrored.
