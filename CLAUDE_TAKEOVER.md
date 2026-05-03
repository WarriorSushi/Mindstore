# MindStore — Claude Takeover & Production Readiness Charter

**Audit date:** 2026-05-03
**Audit scope:** every file under the repo root excluding `node_modules`, `.next`, and the untracked `landing page templates gitignore this/` folder.
**Author of this document:** Claude (Opus 4.7), acting under direct authorization from the project owner (Irfan, `Nrrdenterprises@gmail.com`).
**Authority:** broad — instructed to "make this a production-ready project, no matter how long it takes; only add features, never remove them (unless duplicate or redundant); use sub-agents; aim for Open-Claw-tier reputation."

This document records that takeover, the constraints I'm operating under, the working contract with the owner, and the map of supporting documents that govern day-to-day execution.

It is a **living document**. When the contract changes, this file changes first; everything else follows.

---

## 1. Why this document exists

Before this charter, MindStore was being maintained by a mix of:
- The human owner (occasional commits, Vercel deploys, env-var management).
- Two automated agent loops (`Frain` cron, `codex/local-dev`) that produced 2,233 lines of `IMPROVEMENTS.md` and 4 separate planning files (`NEXT_PHASE.md`, `NEXT_STEPS.md`, `docs/codex/ROADMAP.md`, `docs/codex/PRODUCT_COMPLETION_PLAN.md`).
- Anyone who happened to read `INNOVATIONS.md` and assumed the 10 differentiating features it described were shipped.

That setup produced a real product underneath but a *fictional reputation* for it. Five parallel audits dispatched on 2026-05-03 confirmed:

- **The plugins are real.** All 35 of them. None are stubs.
- **The retrieval engine is real.** RRF over BM25 + vector + tree, 490 lines of working SQL.
- **The MCP server is real.** Conforms to `@modelcontextprotocol/sdk`, exposes 3 core tools plus plugin extension.
- **The schema is real.** 30+ tables, properly indexed.
- **The marketing is fiction.** 8 of 10 INNOVATIONS.md features don't exist. README badges are off (336→345 tests, 35→33 in some counts, 66→77 routes). GOVERNANCE.md falsely claims MIT licensing when LICENSE is FSL-1.1-MIT.

The takeover purpose, in one sentence: **close the gap between what the code does and what the docs claim, then build forward to the reputation the owner wants.**

---

## 2. Constraints I will obey

These come directly from the owner's brief. Where they conflict with anything else in the repo (CLAUDE.md, AGENTS.md, prior planning docs), the owner's instructions win.

1. **Additive only.** Features can be added, expanded, or polished. They can be *removed* only if (a) they duplicate another feature, (b) they are redundant because another feature subsumes them, or (c) the owner explicitly approves removal. Stale **documentation** can be archived (not deleted) freely; that is housekeeping, not feature loss.

2. **Production track, not MVP.** No "we'll fix this later" shortcuts. If a feature exists, it must work end-to-end with auth, rate limits, validation, error states, empty states, loading skeletons, and tests, before it counts as done.

3. **Innovation bias.** The owner's stated target is Open-Claw-tier reputation. That means we ship the 10 INNOVATIONS that don't exist yet, plus a second wave of 10 *new* innovations layered on top. No safe-and-boring "production hardening only" plan; the plan must include the moat features.

4. **Sub-agents allowed and encouraged.** Long-running parallel work (audits, plugin upgrades, doc rewrites, scaffolding new features) goes to dispatched agents so the main session can keep coordinating. Each agent gets a self-contained brief and a defined report shape.

5. **Owner remains the merge authority.** I will draft, scaffold, refactor, write tests, and produce production-ready PRs. The owner approves merges to `main`. Production deploys, environment variable changes, paid integrations, domain changes, and anything that affects external users go through explicit owner sign-off.

6. **Reversibility for risky actions.** Anything destructive (force-push, branch deletion, dropping tables, rotating API keys, changing DCO/licensing) requires owner confirmation per turn — even if the owner has approved similar actions before.

---

## 3. Working contract

### 3.1 Branching

- `main` — production. Direct commits only for trivial doc fixes; everything else lands via PR.
- `claude/<topic>` — branches I create for individual workstreams. Naming pattern: `claude/phase-1-truth-pass`, `claude/feature-mind-diff`, etc.
- `frain/improve` and `codex/local-dev` — preserved (no destructive operations) but treated as inactive until the owner says otherwise. Their planning docs are archived in `docs/archive/codex/` — content preserved, not lost.

### 3.2 Commits

- DCO sign-off on every commit (`git commit -s`), per existing project policy.
- Commit messages describe *why*, not *what* the diff already shows.
- Co-Author trailer when commits are produced by Claude:
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- One commit = one logical change. No drive-by edits in unrelated files.
- Pre-commit hooks are respected. If a hook fails, fix the underlying issue rather than bypassing it.

### 3.3 PRs

Each PR includes:
- Plain-English summary of what changed and why.
- Test plan (commands run + expected output).
- Screenshots/recordings for any UI change, captured against the dev server.
- A link to the relevant phase in `PRODUCTION_READINESS.md` and the relevant entry in `STATUS.md`.
- A risk note: what could break, what's the rollback plan.

### 3.4 Definition of Done (per workstream)

A workstream is **done** when *all* of the following are true:

- [ ] Code merged to `main`.
- [ ] Type-check passes (`npm run typecheck`).
- [ ] Linter passes (`npm run lint:ci`, plus the file is added to `lint:ci` if it wasn't).
- [ ] Unit tests pass and cover the new behavior (`npm test`).
- [ ] If user-facing: empty state, loading state, error state all designed and tested.
- [ ] If API: auth, rate limit, input validation, error responses all wired.
- [ ] If schema-changing: migration written and tested against a fresh DB.
- [ ] If a feature: README and the relevant `docs/` page updated.
- [ ] `STATUS.md` row updated to reflect new state.
- [ ] Manual verification via the dev server or production smoke test, with output captured in the PR.

### 3.5 Reporting cadence

I report progress in three places:

1. **`STATUS.md`** — updated whenever a row changes. This is the live truth file. The owner reads this first.
2. **PR descriptions** — narrative for each merge, with the test plan and risk note.
3. **End-of-session summaries in chat** — what merged, what's blocked, what's next, in 5–10 bullets.

When I'm blocked on something only the owner can resolve (env var, paid integration, domain config, legal), I open a `BLOCKER` row in `STATUS.md` and surface it explicitly in the next chat reply.

---

## 4. Map of governing documents

This charter sits at the top of a small constellation of files that together govern the takeover. No other doc may contradict this one without explicit owner sign-off.

| File | Purpose | Update cadence |
|---|---|---|
| **`CLAUDE_TAKEOVER.md`** *(this file)* | Charter, scope, constraints, working contract. | When the contract changes. |
| **`STATUS.md`** | Live ground-truth dashboard: every plugin's maturity, every route's security posture, every page's polish level, every innovation's progress, every doc's freshness, every open blocker. | Every workstream merge. |
| **`PRODUCTION_READINESS.md`** | The phased engineering plan: definition of "production ready", phase goals, deliverables, acceptance criteria, sub-agent dispatch plans, risk register. | When phases close or scope shifts. |
| **`FEATURE_BACKLOG.md`** | The innovation queue: every feature (existing partials, the 10 INNOVATIONS, the 10 new proposals), each with implementation sketch, schema additions, build order. | When a feature lands or is reprioritized. |
| **`README.md`** | The public face. Truth-passed: every claim citable to code, every roadmap checkbox honest. | When user-visible features ship. |
| **`docs/archive/`** | Preserves stale planning artifacts (NEXT_PHASE, NEXT_STEPS, INNOVATIONS_aspirational, MIND_FILE_SPEC_v0, IMPROVEMENTS cron log, codex/ folder) so history isn't lost. | Append-only. |

Anything else under the project root or `docs/` may be edited freely by the workstream that owns it. ADRs (`docs/adr/`) and release notes (`docs/releases/`) continue under their existing conventions.

---

## 5. What I will and won't touch

### Will touch (non-destructive, default-allowed)

- Any `.ts`, `.tsx`, `.md`, `.css`, `.json` config under the repo, with the exceptions below.
- Drizzle schema and migrations, including new tables and indexes.
- Tests under `tests/` and `extensions/*/tests/`.
- New API routes, new pages, new plugin ports, new background jobs.
- New docs under `docs/` and the project root.
- The browser extension scaffold (`extensions/mindstore-everywhere/`).
- The plugin SDK and runtime packages (`packages/plugin-sdk`, `packages/plugin-runtime`, `packages/example-community-plugin`).
- ESLint and Prettier config to expand the `lint:ci` slice as I clean up files.

### Will NOT touch without explicit owner sign-off

- `LICENSE`, `LICENSING.md`, `TRADEMARKS.md`, `DCO.md` — legal surface.
- `.env.local`, secrets, encryption keys, deploy environment.
- `vercel.json` *production* settings (regions, max duration), Vercel project config, domain bindings. Local development changes are fine.
- `package.json` engine versions, major-version dependency upgrades, removal of any dependency.
- Any commit on a non-Claude branch (no rewriting `frain/improve` or `codex/local-dev` history).
- The owner's existing GitHub/Vercel/Cloud/Supabase accounts or projects.

### Asks I will surface to the owner (rather than guess)

- Production env-var changes (e.g., setting `GEMINI_API_KEY`, `AUTH_SECRET`, `ENCRYPTION_KEY`, Google OAuth client secrets).
- Decisions about whether multi-user mode is the long-term target (because the `settings` table is currently global, which is a multi-user blocker — see STATUS.md §"Architectural").
- Whether to wire Vercel cron jobs (and what schedule), or use a separate scheduler.
- Whether to ship `.mind` portable files using Vercel Blob, S3, or a self-hosted store.
- Whether to enable the public Mind Marketplace at all, given moderation/legal load.
- Pricing/tier definitions if/when revenue work begins.

---

## 6. The five-audit baseline (2026-05-03)

The takeover is anchored to five parallel audits whose findings populate `STATUS.md`. Each audit's full output lives in the agent transcripts; the summarized findings are below.

### 6.1 API route audit (77 routes)

- 5 routes are open (no auth): `/api/health`, `/api/mcp`, `/api/v1/embed`, `/api/v1/import-url`, `/api/v1/extension/package`. Plus `/api/v1/settings` and `/api/v1/onboarding` GETs are open by oversight.
- 5 routes have explicit rate limiting; the rest don't.
- One CRITICAL: `/api/v1/settings` GET reveals API key previews and provider config without auth.
- One HIGH: `/api/v1/embed` is a free embedding service for anyone with the URL.
- One HIGH: `/api/v1/import-url` server-side fetches arbitrary URLs (SSRF surface).
- One HIGH: `/api/v1/plugin-jobs/run-due` lets anyone trigger background jobs.
- Health endpoints leak provider-configured booleans and database diagnostics.
- Two near-duplicates: `/api/v1/stats` vs `/api/v1/knowledge-stats`. Candidate for consolidation.

### 6.2 Frontend page audit (39 pages)

- 100% real-API-backed; zero mock data in production code. Better than initial suspicion.
- 39/39 pages have `loading.tsx` and `error.tsx` siblings.
- 17 pages need real empty states (currently blank or sparse).
- 33 pages don't wrap fetches in component-level try/catch (rely solely on `error.tsx`).
- 8+ accessibility violations (icon-only `<div onClick>` instead of `<button aria-label>`).
- 2 intentional orphans (`/app/conversation`, `/app/onboarding`).
- WebGL pages (`mindmap`, `fingerprint`) need mobile-degraded rendering paths.
- Nav is hand-maintained in `AppShell.tsx`; will become a maintenance hazard as plugins multiply.

### 6.3 Doc rot audit (113 doc files)

- README badges off: tests 336→345, plugins 35→33-or-35 (counts disagree across counters), routes 66→77.
- GOVERNANCE.md falsely claims MIT licensing — actual license is FSL-1.1-MIT.
- ARCHITECTURE.md claims OpenAI default embeddings; code defaults to Gemini.
- ARCHITECTURE.md claims S3-compatible media storage; only `file_path TEXT` exists.
- INNOVATIONS.md describes 10 features; 8 don't exist, 1 is partial, 1 (MCP) shipped.
- NEXT_PHASE.md and NEXT_STEPS.md dated 2026-03-26, 38+ days stale.
- IMPROVEMENTS.md is 2,233 lines of cron output disguised as documentation.
- AGENTS.md is a one-line `@AGENTS.md` self-reference (effectively empty).
- 5 files in `docs/codex/` are agent process artifacts, not user docs.

### 6.4 Plugin maturity audit (35 plugins)

- All 35 are functional. Zero stubs.
- 23 PRODUCTION (full implementation + good test coverage).
- 12 WORKS (full implementation, lighter test coverage — 2-3 tests per plugin).
- Largest port files: `writing-style.ts` (848 LOC), `sentiment-timeline.ts` (637 LOC), `obsidian-importer.ts` (571 LOC), `custom-rag.ts` (507 LOC).
- 3 registry-slug mismatches (registry says `youtube-importer`, file is `youtube-transcript.ts`; same pattern for `reddit-importer`/`reddit-saved` and `writing-analyzer`/`writing-style`). Functional, but a maintenance hazard.

### 6.5 Innovation feasibility audit (10 + 10)

The 10 INNOVATIONS.md items, repositioned by current evidence:

| # | Innovation | Status | Effort to ship |
|---|---|---|---|
| 1 | Memory Consolidation Engine | scaffold | M (3-4 wk) |
| 2 | Knowledge Fingerprint | **shipped** (polish only) | S |
| 3 | Adversarial Retrieval | absent | S (1-2 wk) |
| 4 | Forgetting Curve (whole base) | partial (flashcards exist) | M (2-3 wk) |
| 5 | Mind Diff | partial (topic-evolution exists) | M (2-3 wk) |
| 6 | Cross-Pollination Engine | partial (connections table) | M (2-3 wk) |
| 7 | Thought Threading | absent | L (4-6 wk) |
| 8 | `.mind` Portable File | absent (632-line spec exists) | L (3-4 wk) |
| 9 | Knowledge Metabolism Score | absent | S (1-2 wk) |
| 10 | MCP Server | **shipped** (more tools optional) | S |

Plus 10 new proposals, sized and ordered, in `FEATURE_BACKLOG.md`:

> Mind Marketplace · Knowledge Attack Surface · Knowledge Oracle · Mind Scheduler · Knowledge Genealogy · Vercel Workflows · Memory Journals · Knowledge Diffusion · Memory Audit Trail · Mind Coaching

---

## 7. Phased plan (high level)

The detailed phase plan, with file paths and acceptance criteria, lives in `PRODUCTION_READINESS.md`. The high-level shape:

| Phase | Window | Goal | Exit criterion |
|---|---|---|---|
| **0 — Truth Pass** | Week 1 | Reconcile docs, archive stale planning artifacts, fix critical security findings, install dependencies, run a real test suite, produce honest README. | `npm install && npm test && npm run typecheck && npm run build` all green; STATUS.md reflects ground truth; no false claim left in README/ARCHITECTURE/GOVERNANCE. |
| **1 — Production Hardening** | Weeks 2-3 | Auth, rate limits, validation everywhere; per-user settings (multi-user prerequisite); empty/loading/error states on every page; CI with real test/typecheck/build gates; observability hooks. | Every API route in STATUS.md row green for auth/ratelimit/validation. CI runs on every PR. Every page row green for empty/loading/error. |
| **2 — Innovation Wave 1** | Weeks 4-9 | Adversarial Retrieval, Knowledge Metabolism Score, Cross-Pollination automation, Memory Consolidation Engine, Mind Diff. The "thinking about your thinking" layer. | Each ships behind a feature flag, has docs, has tests, has an Open-Claw-quality demo on the landing page. |
| **3 — Innovation Wave 2** | Weeks 10-16 | Thought Threading, Forgetting Curve (whole-base), Knowledge Genealogy, Knowledge Diffusion, Memory Journals. The "introspection" layer. | Same bar as Wave 1. |
| **4 — Portability & Network** | Weeks 17-24 | `.mind` file format (export + import + viewer), Mind Marketplace, Memory Audit Trail with citations, Knowledge Attack Surface. The "shareable + defensible" layer. | A user can publish their mind, fork another's, merge with conflict resolution, all with provenance preserved. |
| **5 — System Layer** | Weeks 25-32 | Knowledge Oracle (long-context conversational agent), Mind Scheduler, Mind Coaching, Vercel Workflows backbone. The "MindStore tells you what to do" layer. | A user has a daily learning agenda, a coach, and an oracle that can reason across their full history. Every async job goes through Vercel Workflows. |

Each phase has its own go/no-go gate based on user-visible signal: if Phase 1 doesn't make the existing product *feel* solid, we don't move to Phase 2. If Wave 1 doesn't produce the "wow" demo, we don't expand to Wave 2 — we polish Wave 1 first.

---

## 8. How the human tracks me

The owner doesn't need to read every PR. The owner reads:

1. **`STATUS.md`** at any time — it's the dashboard.
2. **End-of-session summaries** in chat — what shipped today, what's blocked.
3. **Vercel preview URLs** when feature work lands — every PR gets a preview deploy.
4. **GitHub releases** at phase boundaries — release notes generated from the merged PRs in that phase.

The owner's escalation channel is the chat itself. If anything in the plan should change, telling me is enough — I update this charter, then `PRODUCTION_READINESS.md`, then act on the new direction.

---

## 9. Acknowledgements & limits

I am not infallible. Specifically:

- I cannot run paid integrations (Vercel deploys, Supabase upgrades, AI model billing) without owner credentials and consent.
- I cannot speak for the licensing or legal posture of the project — that is the owner's domain. I will flag legal concerns (like the GOVERNANCE.md MIT/FSL bug) but won't unilaterally resolve them.
- My "tests pass locally" only counts after `node_modules` is installed and the dev DB is reachable. Right now `node_modules` is missing in the working tree; my Phase 0 first action is to install and verify.
- AI-call-heavy features (consolidation, threading, coaching) will need cost-control design or they'll bankrupt the deployment. Each such feature's PR includes a usage estimate.

If a future Claude session reads this file: **trust this contract**, run the checklist in §3.4 before claiming anything is done, and update `STATUS.md` whenever you change reality.

---

*Last updated: 2026-05-03 by Claude. Next update: when the working contract changes.*
