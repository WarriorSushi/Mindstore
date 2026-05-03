# MindStore — Production Readiness Plan

**Owner of this plan:** Claude (Opus 4.7), per `CLAUDE_TAKEOVER.md`.
**Source of ground truth:** `STATUS.md`. This plan describes how the rows in STATUS turn green.
**Source of innovation specs:** `FEATURE_BACKLOG.md`. This plan schedules them.

This is a 32-week plan, partitioned into six phases. Each phase has a goal, a concrete deliverable list with file paths, sub-agent dispatch instructions, an acceptance gate, and a risk note. Phases ship behind `main` once the gate is met; nothing slips into the next phase early.

---

## 0. Definition of "Production Ready"

When this plan finishes (end of Phase 5), MindStore meets every condition below. Until then, "production ready" is a moving target — each phase tightens the bar.

**Code-quality bar (must hold from end of Phase 1 onward):**

- `npm run typecheck` — zero errors on full repo (not just `lint:ci` slice).
- `npm run lint:ci` covers the entire `src/`, `tests/`, `packages/`, `extensions/` tree.
- `npm test` — all tests pass; coverage ≥ 70% on `src/server/`, ≥ 50% on `src/app/api/`, ≥ 40% on `src/components/`.
- `npm run build` — succeeds with no warnings the team has not explicitly suppressed.
- E2E tests via `playwright test` cover the golden paths: sign-in, import, search, chat, plugin install, MCP query.
- CI runs all of the above on every PR before merge.

**Security bar:**

- Every API route in `STATUS.md` §6 has auth, rate limit, and input validation, or a documented exception.
- No secret values are returned by any unauthenticated endpoint.
- `ENCRYPTION_KEY` is required (not optional) in production.
- Penetration-test report (run by an external party or the Vercel BotID flow) shows no HIGH or CRITICAL findings.

**User-experience bar:**

- Every page has a designed empty state, loading skeleton, and error boundary.
- Every error message is human-readable; no stack traces leak to the UI.
- All interactive elements meet WCAG AA (keyboard, focus, contrast, ARIA).
- Mobile pages don't horizontally overflow; WebGL pages have a 2D fallback.
- Time-to-first-result on `/app/explore` and `/app/chat` is under 2 seconds at the 95th percentile.

**Operational bar:**

- A `RUNBOOK.md` covers: deployment, rollback, env-var rotation, DB migration, AI-provider switch, plugin disable, incident triage.
- `/api/v1/health` returns full diagnostics (gated by API key); a public `/api/health` returns minimal status.
- Logs are structured JSON; an observability target (Vercel built-in or external) is wired.
- Vercel cron schedules are checked into `vercel.json`/`vercel.ts`; jobs run on schedule, not by manual trigger.
- Backups: a daily `pg_dump` is taken (or Supabase native backups are on, documented in RUNBOOK).

**Documentation bar:**

- Every claim in `README.md` links to the file or test that proves it.
- `STATUS.md` reflects reality at all times (every PR updates the relevant rows).
- The roadmap distinguishes Done / In Flight / Next / Aspirational.
- `docs/PLUGIN_MATURITY_MATRIX.md` is generated from a single source — not hand-maintained twice.

**Innovation bar (the Open-Claw differentiator):**

- All 10 INNOVATIONS.md features ship with real implementations and a public-facing demo.
- All 10 new innovations from `FEATURE_BACKLOG.md` ship.
- Each innovation has its own ADR documenting the design choice + the alternative considered.
- `mindstore.org` landing page demonstrates 5 of them as live screenshots/recordings, not Lorem-ipsum mockups.

---

## Phase 0 — Truth Pass (Week 1)

**Goal:** stop the bleeding. Reconcile docs with code, fix critical security findings, install dependencies, get a real test/typecheck/build baseline, archive stale planning artifacts. Nothing built; everything aligned.

### Workstream 0.1 — Document reconciliation

**Files written:**
- `CLAUDE_TAKEOVER.md` ✅ (already shipped this audit)
- `STATUS.md` ✅
- `PRODUCTION_READINESS.md` (this file) ✅
- `FEATURE_BACKLOG.md`
- `RUNBOOK.md`
- `CHANGELOG.md`
- `TESTING_STRATEGY.md`
- `docs/PLUGIN_MATURITY_MATRIX.md`

**Files edited:**
- `README.md` — fix counts (336→345 tests, 35 plugins, 77 routes), partition roadmap, add link to `STATUS.md`, no feature claim removed.
- `ARCHITECTURE.md` — fix embedding-default claim, fix S3 claim, clarify tree-layer reality, add link to `STATUS.md`.
- `GOVERNANCE.md` — line 60 "MIT-licensed" → "FSL-1.1-MIT licensed"; add named maintainer.
- `CONTRIBUTING.md` — fix test count, port, lint tool naming.
- `CLAUDE.md` — replace 6-line stub with real agent context (links to `CLAUDE_TAKEOVER.md` + `STATUS.md` + Next.js 16 conventions).
- `AGENTS.md` — replace `@AGENTS.md` self-reference with real Next.js 16 / repo map content.

**Files moved (to `docs/archive/`):**
- `INNOVATIONS.md` → `docs/archive/INNOVATIONS_aspirational.md` with header explaining provenance.
- `MIND_FILE_SPEC.md` → `docs/archive/MIND_FILE_SPEC_v0.md` (will be revived as Phase-4 design when work starts).
- `NEXT_PHASE.md`, `NEXT_STEPS.md` → `docs/archive/`.
- `IMPROVEMENTS.md` → `docs/archive/IMPROVEMENTS_cron_log.md`.
- `docs/codex/` → `docs/archive/codex/`.
- `.impeccable.md` → keep at root (still useful design system).

**Files added to `.gitignore`:**
- `landing page templates gitignore this/` (the folder name itself instructs this).

### Workstream 0.2 — Critical security fixes

These ship in Phase 0 because they're CRITICAL or HIGH and easy to fix:

| Fix | File | Change |
|---|---|---|
| SEC-1, SEC-2 | `src/app/api/v1/settings/route.ts` | Add `getUserId()` to GET and POST. |
| SEC-3 | `src/app/api/v1/embed/route.ts` | Add `getUserId()` + `RATE_LIMITS.standard`. |
| SEC-4 | `src/app/api/v1/import-url/route.ts` | Add `getUserId()`, allow-list `http`/`https`, block private/loopback IPs, add `RATE_LIMITS.write`. |
| SEC-5 | `src/app/api/v1/plugin-jobs/run-due/route.ts` | Require `INTERNAL_JOB_TOKEN` header (env var) or owner API key. |
| SEC-7 | `src/app/api/health/route.ts`, `src/app/api/v1/health/route.ts` | Public `/api/health` returns `{status, timestamp}`; `/api/v1/health` returns full diagnostics behind auth. |
| Embedding bug | `src/server/embeddings.ts` | Add `taskType` parameter; document side: `RETRIEVAL_DOCUMENT` for ingest, `RETRIEVAL_QUERY` for search-time. |

### Workstream 0.3 — Dependency + build baseline

**Steps:**

1. `npm install` — record installed versions in PR.
2. `npm run typecheck` — fix or document every error. Tests need `@types/node` exposed.
3. `npm run lint:ci` — record passing baseline.
4. `npm run lint:backlog` — count violations. Don't fix yet; just count.
5. `npm test` — record `345 passed` (or whatever the real number is).
6. `npx playwright install` — verify E2E browsers present.
7. `npm run build` — production build baseline.
8. Resolve `apikey.ts` vs `api-keys.ts` duplication (ARCH-11).
9. Fix `vitest.config.ts` `__dirname` typing.

### Workstream 0.4 — CI scaffold

**File added:** `.github/workflows/ci.yml`

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint:ci
      - run: npm test
      - run: npm run build
```

E2E job is added in Phase 1 once a Postgres test container is wired.

### Phase 0 acceptance gate

- [ ] All Workstream 0.1 docs written, all Workstream 0.1 file moves merged.
- [ ] All SEC-1 through SEC-7 fixes merged with tests asserting auth requirement.
- [ ] `npm install` succeeds; `npm run typecheck` passes; `npm test` reports the real test count; `npm run build` succeeds.
- [ ] CI workflow merged and green on a probe PR.
- [ ] `STATUS.md` §0 row "node_modules installed" flips to ✅.
- [ ] `STATUS.md` §3 SEC-1 through SEC-7 marked DONE.

### Phase 0 sub-agent dispatch plan

- **Agent A (doc moves):** does all the `docs/archive/` shuffles + the README/ARCHITECTURE/GOVERNANCE/CONTRIBUTING edits in one branch. Brief: "rewrite these specific files to match `STATUS.md` claims; preserve all feature mentions; only counts and stale planning text get adjusted."
- **Agent B (security fixes):** lands the 6 SEC fixes plus tests in one branch. Brief: "for each route, add the listed gate, write a test that the gate triggers a 401 without auth and 200 with."
- **Agent C (dependency baseline):** installs, runs the four checks, files PRs for any required tsconfig/vitest fixes. Brief: "make `npm test`, `npm run typecheck`, `npm run build` all pass cleanly; no new lint suppressions."

The three agents run in parallel; the security branch and the dependency branch are independent.

### Phase 0 risk note

- **Doc shuffles can break inbound links.** Mitigation: leave a stub redirect at the old path for a release before deletion.
- **Security fixes can break clients in single-user mode.** Mitigation: fall through to `getUserId()` (which returns the default user UUID in single-user mode), so behavior is preserved for the default case.

---

## Phase 1 — Production Hardening (Weeks 2-3)

**Goal:** every existing page and route meets the production bar. No new features. The product the user already has becomes one we'd hand to a stranger without apology.

### Workstream 1.1 — Per-user settings (resolves ARCH-1)

This is the largest single change in Phase 1. It unblocks multi-user mode.

**Schema migration:**
- Add `user_id UUID REFERENCES users(id)` to `settings`.
- Backfill existing rows with `DEFAULT_USER_ID` ('00000000-...').
- Add `UNIQUE(user_id, key)` index, drop the global `UNIQUE(key)`.

**Code changes:**
- `src/server/ai-client.ts` — every settings read takes `userId`.
- `src/server/embeddings.ts` — `getEmbeddingConfig(userId)`.
- `src/app/api/v1/settings/route.ts` — every read/write scoped by caller's userId.
- All plugin ports that read settings — pass userId from request context.

**Acceptance:**
- A second user signing in via Google OAuth gets their own `settings` rows.
- The default user (single-user mode) keeps working unchanged.
- Test: two users, two API keys, no leakage between them.

### Workstream 1.2 — Rate limiting + validation everywhere

**Pattern:** every write route gets `RATE_LIMITS.write` (or `.ai` if it calls a model). Every read route that returns user data gets `RATE_LIMITS.standard`.

**Files touched:** ~40 route handlers under `src/app/api/v1/` that currently lack a rate limiter.

**Validation rollout:**
- Adopt Zod uniformly for body parsing. Helper: `src/server/api-validation.ts` exports `parseBody(req, schema)` that returns `{ data, error }` and short-circuits on error.
- Each route imports its schema from `src/server/api-schemas/<route>.ts`.

### Workstream 1.3 — Observability

**Files added:**
- `src/server/logger.ts` already exists; expand with structured fields (`requestId`, `userId`, `route`).
- `src/server/api-instrumentation.ts` — wraps each route handler with timing + error capture.
- `src/app/api/v1/health/route.ts` — full diagnostics behind auth.

**Vercel-side:**
- Enable Vercel Analytics (free tier).
- Optional: integrate Vercel Agent (public beta) for AI-powered incident investigation.

### Workstream 1.4 — Page polish (UX bar)

For each row flagged in `STATUS.md` §5:

- **17 EMPTY pages** — designed empty states with a primary CTA (import / connect AI / start a deck etc.).
- **16 ERR-WRAP pages** — wrap fetches in try/catch, display friendly errors via `sonner` toast.
- **8 A11Y pages** — convert `<div onClick>` icon buttons to `<button>` with `aria-label`.
- **WebGL pages** (`/app/mindmap`, `/app/fingerprint`) — detect WebGL availability; fall back to a 2D Reagraph variant or a static placeholder with a "view full graph on desktop" CTA.

**Generated nav:** `src/app/app/AppShell.tsx` rewires its nav config to derive from `pluginRuntime.getNav()` + a small static list of system pages. New plugins automatically appear in the nav based on their UI manifest entries.

### Workstream 1.5 — Cron + jobs

**Files added/edited:**
- `vercel.json` — add cron entries:
  ```json
  {
    "crons": [
      { "path": "/api/v1/plugin-jobs/run-due", "schedule": "*/15 * * * *" },
      { "path": "/api/v1/reindex/tick", "schedule": "*/30 * * * *" }
    ]
  }
  ```
  Both endpoints require `INTERNAL_JOB_TOKEN`. Vercel passes the project's internal cron header automatically; the route checks it.
- `src/app/api/v1/reindex/tick/route.ts` — new lightweight endpoint that pages through pending indexing jobs.

**Owner ask:** confirm `*/15` and `*/30` schedules; set `INTERNAL_JOB_TOKEN` env var.

### Workstream 1.6 — E2E tests

**File added:** `tests/e2e/golden-paths.spec.ts`

Six scenarios:
1. New user lands on `/`, signs in (mocked Google OAuth), reaches `/app`.
2. Imports a 5-memory ChatGPT JSON file; sees them in `/app/explore`.
3. Searches; gets ranked results with citation badges.
4. Chats; receives a streaming response that cites at least one memory.
5. Installs a plugin; confirms it appears in the nav.
6. Calls `/api/mcp` with a Bearer key; gets a JSON-RPC response.

CI gains a Postgres service container so these run against a real DB.

### Phase 1 acceptance gate

- [ ] All Phase-1 workstreams merged.
- [ ] `STATUS.md` §3 (security backlog) is empty or every row is documented exception.
- [ ] `STATUS.md` §5 (page inventory) has zero EMPTY/ERR-WRAP/A11Y/MOBILE flags.
- [ ] `STATUS.md` §2 (architectural concerns) ARCH-1, ARCH-2, ARCH-3, ARCH-5, ARCH-8, ARCH-10, ARCH-11 are CLOSED.
- [ ] CI is green on every PR.
- [ ] E2E suite of 6 golden paths passes locally and in CI.
- [ ] Lighthouse score ≥ 90 on `/`, `/app`, `/app/explore`, `/app/chat`.

### Phase 1 sub-agent dispatch plan

- **Agent D (per-user settings)** — owns ARCH-1 end-to-end; schema migration, code propagation, multi-user test.
- **Agent E (rate-limit + validation)** — sweeps ~40 routes; produces a single PR per category (read, write, AI).
- **Agent F (page polish)** — owns the 17 EMPTY + 16 ERR-WRAP + 8 A11Y pages; one PR per category.
- **Agent G (cron + jobs)** — wires `vercel.json` + the tick endpoint + tests.
- **Agent H (E2E)** — writes the 6 golden paths.
- Agents D and G are sequential (D's schema migration must merge before G enables cron-driven jobs that read settings). E, F, H are independent.

---

## Phase 2 — Innovation Wave 1: "Thinking About Your Thinking" (Weeks 4-9)

**Goal:** ship the five innovations that turn MindStore from a knowledge retriever into a knowledge reasoner. Each ships behind a feature flag (`feature_flag_x` setting per user, default off in week 4, default on by week 9).

**Order, with rationale:**

1. **Knowledge Fingerprint snapshots/diffs** (Week 4, 1 wk). Cheapest win; UI exists. Adds `mind_snapshots` table, weekly cron writes a snapshot, `/app/fingerprint` gains a "compare to" date picker.
2. **Knowledge Metabolism Score** (Weeks 4-5, 1.5 wk). Numbers-only feature; reuses existing tables. New `metabolism_scores` table, weekly cron, `/app/metabolism` page with sparklines.
3. **Adversarial Retrieval** (Weeks 5-6, 1.5 wk). Inverts the existing retrieval; surfaces contradictions inline. New endpoint `/api/v1/search/adversarial`, toggle in `/app/explore` and `/app/chat` ("Show opposing views").
4. **Cross-Pollination Engine — automation** (Weeks 6-7, 2 wk). Makes the existing `connections` table grow on its own. New nightly job computes similarity × cluster-distance for "surprise"; `/app/cross-pollination` page renders the top bridges.
5. **Memory Consolidation Engine** (Weeks 7-9, 3 wk). The marquee feature. New `knowledge_consolidations` table, nightly job that scans recent memories, finds connections + contradictions + summary insights, generates a "report" the user can scroll. Prompt costs are bounded per user per night (configurable, default 10K input tokens).
6. **Mind Diff** (Weeks 8-9, 2 wk, parallel with #5). Compares two `mind_snapshots`. New `/app/mind-diff` with a date pair picker, narrative summary via LLM, charts of new/abandoned/deepened topics.

**Each feature's deliverables:**

- New schema migration in `src/server/migrate.ts`.
- New port file under `src/server/plugins/ports/<feature>.ts` if it's plugin-shaped, or a new module under `src/server/<feature>/` if it's core.
- New API route(s) under `src/app/api/v1/<feature>/`.
- New page under `src/app/app/<feature>/page.tsx` with full UX (empty/loading/error/mobile/a11y).
- New unit tests under `tests/unit/<feature>.test.ts`.
- New ADR under `docs/adr/00NN-<feature>.md`.
- README mention under "Features" + roadmap update.
- `STATUS.md` row updated.
- Landing-page demo recording added to `public/demos/<feature>.mp4`.

**Cost-control discipline:**

Every Phase-2 feature includes a per-user spend cap and a "preview mode" so a user can run it once on a sample before turning on automation.

### Phase 2 acceptance gate

- [ ] All 6 features merged with full deliverable list above.
- [ ] Each feature has a public demo on the landing page.
- [ ] Token-cost measurements for nightly jobs are documented in the runbook.
- [ ] `STATUS.md` §6 rows for innovations 1, 2, 3, 5, 6, 9 marked SHIPPED.

### Phase 2 sub-agent dispatch plan

- One agent per feature, scoped to the deliverable list above.
- A coordination agent runs `STATUS.md` updates after each merge.
- Daily progress digest from each agent → owner.

### Phase 2 risk note

- **LLM cost runaway** — single biggest risk. Every nightly job reads its per-user cost cap from settings before running; if exceeded, defers. Owner gets a "cost report" weekly.
- **Hallucinated insights** — Consolidation and Cross-Pollination both use LLM to generate prose. Mitigation: every insight cites the source memories; UI lets users dismiss bad ones; dismissals feed back into a "filter" prompt the next night.

---

## Phase 3 — Innovation Wave 2: "Introspection" (Weeks 10-16)

**Goal:** the deeper layer — how *you* think, not just what you know.

**Features:**

1. **Forgetting Curve (whole base)** (Weeks 10-11, 2 wk). Extends SM-2 to all memories, not just flashcards. New `memory_forgetting_risk` table, weekly compute, `/app/forgetting` review UI mirroring the flashcard flow.
2. **Thought Threading** (Weeks 10-13, 4 wk, parallel with #1). New `thought_threads` table, monthly job clusters memories by topic+temporal span, LLM narrates the thread, `/app/threads` displays.
3. **Knowledge Genealogy** (Weeks 12-14, 3 wk). New `knowledge_genealogy` table, monthly job links memories that build on each other, `/app/genealogy/<memoryId>` shows ancestor/descendant tree.
4. **Knowledge Diffusion** (Weeks 13-15, 2 wk). New `idea_diffusion` table, periodic job tracks idea propagation across sources, `/app/diffusion` Sankey diagram.
5. **Memory Journals** (Weeks 14-16, 3 wk). New `journal_entries` table, voice-to-text + memory extraction, weekly synthesis. Reuses `voice-to-memory` plugin foundation; promotes it from a button to a daily ritual UX.

### Phase 3 acceptance gate

- All 5 features ship with the standard deliverable list.
- Combined LLM cost per active user per month measured and documented.
- 3 of the 5 have measurable "wow" telemetry (e.g., users open `/app/threads` more than once).

---

## Phase 4 — Portability & Network (Weeks 17-24)

**Goal:** make MindStore *shareable* and *defensible*. This is where the network-effect moat starts.

**Features:**

1. **`.mind` portable file format** (Weeks 17-20, 4 wk). Full MIND_FILE_SPEC v1 implementation:
   - Export pipeline: streams memories, embeddings, tree_index, connections, profile to a single binary file with checksum + optional encryption.
   - Import pipeline: reads back, dedupes against existing memories via fuzzy match.
   - Storage: Vercel Blob (private). API: `POST /api/v1/export/mind`, `POST /api/v1/import/mind`.
   - Optional: an embedded HTML viewer for `.mind` files via a static page that uses the file's index sections directly.
2. **Memory Audit Trail** (Weeks 19-21, 2 wk, parallel with tail of #1). Adds `attribution` JSONB to memories; export includes APA/MLA/Chicago citations; UI shows provenance chain on every memory detail.
3. **Knowledge Attack Surface** (Weeks 21-23, 3 wk). New `knowledge_risks` table, weekly scan for exposed secrets / single points of failure / knowledge silos, `/app/security` dashboard.
4. **Mind Marketplace** (Weeks 22-24, 4 wk, parallel). New `public_minds` table, publish flow, browse/fork UI at `/app/marketplace`, conflict-resolution merge UI.

**Owner asks for Phase 4:**
- Vercel Blob plan tier confirmed.
- Moderation policy for the marketplace (does anyone moderate uploaded minds? automated only?).
- Legal sign-off on user-uploaded content terms.

### Phase 4 acceptance gate

- A user can: export their mind → email it → another user imports it → merge succeeds with conflict UI → both can browse the imported memories.
- Marketplace has 5 seeded "starter minds" that exist as exemplars (e.g., "MindStore Dogfood", "Productivity Classics", "AI History").

---

## Phase 5 — System Layer (Weeks 25-32)

**Goal:** MindStore stops being a tool and becomes a *system*. It tells you what to learn, when to learn it, and answers questions across your full history.

**Features:**

1. **Vercel Workflows backbone** (Weeks 25-26, 2 wk, foundation for the rest). All async jobs migrate to Vercel Workflows: durable, retryable, observable.
2. **Knowledge Oracle** (Weeks 26-29, 3 wk). Multi-turn long-context conversational agent. Adaptive RAG (high-confidence answer → cite; medium → ask clarifying; low → admit gap). Routes to Claude Sonnet 4.6 / Opus 4.7 via Vercel AI Gateway based on complexity. New `oracle_conversations` table, `/app/oracle` page.
3. **Mind Scheduler** (Weeks 28-30, 2 wk). New `learning_schedules` table, weekly schedule builder using SM-2 + Forgetting Curve + free-time hints. `/app/schedule` calendar UI.
4. **Mind Coaching** (Weeks 30-32, 3 wk). New `learning_goals` table, weekly progress assessment, motivational + corrective coaching prompts. `/app/coach` dashboard with goals, progress, weekly check-in.

### Phase 5 acceptance gate

- Daily users see their schedule, take their review session, and check in with the coach without leaving MindStore.
- Oracle's hallucination rate (manual eval against held-out questions) is below 5%.
- Vercel Workflows handle all async jobs; no `setInterval` left in code.

---

## Cross-cutting concerns (run through every phase)

### Testing strategy

- **Unit tests** under `tests/unit/` — every port file gets ≥ 5 tests covering parse, error, edge, and one happy-path integration with a mocked DB.
- **API tests** under `tests/api/` (new) — every route handler tested for auth gate, validation, success, and rate-limit behavior.
- **E2E tests** under `tests/e2e/` — golden paths only; expand by ~2 scenarios per phase.
- **Property tests** for retrieval scoring and SM-2 math.
- **Snapshot tests** for plugin manifest → registry serialization.

### Observability

- Structured logs from `src/server/logger.ts`.
- Vercel Analytics for client metrics.
- Sentry or equivalent for error reporting (Phase 1 evaluation).
- Vercel Agent (public beta) for AI-powered incident summaries (Phase 2 evaluation).
- A `/api/v1/admin/metrics` endpoint (auth required) returns request counts, p50/p95/p99 latencies, error rate, LLM token spend per provider per day.

### Security ongoing

- Quarterly dependency audit (`npm audit --omit=dev`).
- Annual external pen-test starting Phase 4.
- Vercel BotID enabled for sign-in and import endpoints in Phase 1.
- Enable rate-limit telemetry in Phase 1 so we can see who's bumping into limits.

### Performance budget

- Initial page load (Lighthouse on `/`): LCP < 2s, CLS < 0.05.
- `/app` dashboard time-to-interactive < 1.5s on a fast connection, < 3s on 3G.
- Search p95 latency < 800ms (DB + embedding + retrieval + serialize).
- MCP `search_mind` p95 latency < 1500ms.
- Bundle size for `/app` route group ≤ 250KB gzipped (excluding reagraph and dynamic imports).

### Cost discipline

- Each AI-call-heavy feature reads a per-user monthly cap from settings before invoking the LLM.
- Daily cost report job (Phase 2) writes a JSON file with per-feature, per-user spend; surfaced in `/app/admin/costs` for the owner.
- Embeddings are batched (already implemented for OpenAI and Gemini); no single-text embed calls in production paths.

---

## Risk register

| Risk | Phase | Mitigation |
|---|---|---|
| LLM cost runaway from Consolidation/Threading/Coaching | 2, 3, 5 | Per-user monthly cap; preview mode; alerts at 50%/75%/100% of cap. |
| Multi-user settings migration breaks single-user | 1 | `DEFAULT_USER_ID` backfill + integration test for both modes. |
| `.mind` file format design decisions don't survive contact with users | 4 | Ship behind a feature flag; iterate on format spec before locking v1. |
| Marketplace abuse (uploaded minds with PII or copyrighted content) | 4 | Moderation queue, automated PII scanner before publish, takedown flow. |
| MCP-shaped attacks (prompt injection from imported memories) | All | Sanitize memory content before injecting into system prompts; never let memory content reach tool-call payloads unredacted. |
| Vercel platform limits (function timeout, memory) on long jobs | 2, 3, 5 | Move to Vercel Workflows in Phase 5; until then, chunk jobs to fit 300s default. |
| Embedding-dim drift when a user changes provider | 1+ | Phase 1: re-embed-all job + UI flow. Phase 2: track per-row embedding model + dimension. |
| Plugin slug mismatches break new contributors | 0 | File renames in Phase 0; alias map in registry to preserve back-compat. |

---

## Reporting

- `STATUS.md` updated per merge.
- Weekly digest (every Friday): bullets on what merged, what's blocked, what's next, posted in chat.
- Phase-end retro: comparison of plan vs reality, items moved to next phase, items added, items dropped (with rationale).

---

*This plan is meant to be edited. If reality diverges, update the plan and document why in the next phase retro.*
