# `docs/archive/` — preserved planning artifacts

This folder holds documents that are **historically valuable but no longer authoritative**. They were moved here on 2026-05-03 during the Claude takeover audit (see `../../CLAUDE_TAKEOVER.md`) because they were either:

- Stale relative to the current plan (and a fresher doc supersedes them), or
- Aspirational / pre-implementation specs that need to be revived as design docs when their phase begins, or
- Automated logs that shipped as if they were docs.

Nothing in here was deleted — git history is preserved via `git mv`. If anything in here has the answer to a question, the *current* answer lives in:

- **`../../STATUS.md`** for "what's the state of X right now?"
- **`../../PRODUCTION_READINESS.md`** for "what's the plan for X?"
- **`../../FEATURE_BACKLOG.md`** for "how does feature X get implemented?"
- **`../../CLAUDE_TAKEOVER.md`** for "why are we doing all this?"

## Contents

| File | Why archived | Likely fate |
|---|---|---|
| `INNOVATIONS_aspirational.md` | Pre-takeover marketing of 10 features; 8 not yet shipped. | Items reframed in `FEATURE_BACKLOG.md` part A; the hype copy stays here as a record. |
| `MIND_FILE_SPEC_v0.md` | 632-line spec for the `.mind` portable format; zero implementation. | Will be revived as the v1 design doc when Phase 4 begins. |
| `NEXT_PHASE.md` | March-2026 phase plan, 38 days stale at audit. | Replaced by `PRODUCTION_READINESS.md`. |
| `NEXT_STEPS.md` | March-2026 priority list, 38 days stale at audit. | Replaced by `STATUS.md` §9 + `PRODUCTION_READINESS.md`. |
| `IMPROVEMENTS_cron_log.md` | 2,233 lines of automated 30-min agent loop logs. | Useful as history; not a doc. |
| `codex/` | 5 strategy docs from a parallel agent loop (BRANCH_CONVERGENCE, CONVERGENCE_PROGRAM, PRODUCT_COMPLETION_PLAN, ROADMAP, WORKLOG). | Folded into `PRODUCTION_READINESS.md`; raw originals preserved. |

If you find yourself referencing one of these from a fresh document, stop — the citation belongs in the new doc, not in archive-by-archive.
