# MindStore — Feature Backlog

**Owner of this file:** Claude (Opus 4.7), per `CLAUDE_TAKEOVER.md`.
**Companion files:** `STATUS.md` (current state), `PRODUCTION_READINESS.md` (the phased plan).

This is the build recipe book. Every entry is sized, sketched, and assigned to a phase. Existing features keep growing (additive-only); the items here are the *new* surface area we'll add and the *partial* features we'll finish.

Each entry has a fixed shape:

- **ID** — short slug used in commits and STATUS rows.
- **Status** — `shipped` / `partial` / `scaffold` / `absent`.
- **Phase** — the phase that lands it (per `PRODUCTION_READINESS.md`).
- **Why** — one-sentence "why does this exist".
- **Schema** — new tables / columns.
- **Server** — new modules / port files.
- **API** — new routes.
- **UI** — new pages / components.
- **Jobs** — scheduled work, if any.
- **Tests** — unit + E2E coverage.
- **Cost note** — for AI-heavy features.
- **Differentiator** — the user-visible "wow" (one sentence).
- **Build order dependencies** — what must land first.

---

## Part A — The 10 INNOVATIONS, repositioned

### A.1 Memory Consolidation Engine — `consolidation`

- **Status:** scaffold
- **Phase:** 2
- **Why:** wake up to "here's what your mind figured out you believe" — the OS-level insight system no other tool has.
- **Schema:**
  - `knowledge_consolidations(id uuid pk, user_id uuid, run_at timestamptz, summary text, insight_count int, source_memory_ids uuid[], llm_tokens_used int, status text)`
  - `consolidation_insights(id uuid pk, consolidation_id uuid, kind text /*connection|contradiction|theme|gap*/, payload jsonb, source_memory_ids uuid[], confidence real, dismissed boolean default false)`
- **Server:** `src/server/consolidation/engine.ts` (graph walk, candidate clustering, LLM verification with batched prompts).
- **API:**
  - `POST /api/v1/consolidate/run` (manual trigger; auth + rate-limit + per-user daily cap).
  - `GET /api/v1/consolidate/runs` (list past runs).
  - `GET /api/v1/consolidate/runs/[id]` (insight detail).
  - `POST /api/v1/consolidate/insights/[id]/dismiss`.
- **UI:** `/app/consolidations` — timeline of nightly runs, expandable insight cards with source citations.
- **Jobs:** nightly cron (`vercel.json` entry), bounded by per-user `consolidation_token_cap` setting.
- **Tests:** unit on cluster + verify; E2E on "run + dismiss + see filtering kick in next run".
- **Cost note:** ~10K input + 2K output tokens / user / night. Default cap 50K input/month; warn at 75%, hard-stop at 100%.
- **Differentiator:** "Your knowledge thinks about itself every night."
- **Dependencies:** Phase-1 per-user settings (ARCH-1) for cost cap; existing `connections` and `contradictions` tables.

---

### A.2 Knowledge Fingerprint snapshots & diffs — `fingerprint-time`

- **Status:** shipped (current page); add time-series.
- **Phase:** 2
- **Why:** watch your mind evolve as a 3D shape over weeks/months.
- **Schema:**
  - `mind_snapshots(id uuid pk, user_id uuid, taken_at timestamptz, memory_count int, source_breakdown jsonb, cluster_centroids jsonb, fingerprint_svg text)`
- **Server:** `src/server/fingerprint/snapshot.ts` — captures the same data the live `/app/fingerprint` derives, plus an SVG export.
- **API:**
  - `GET /api/v1/fingerprint/snapshots` (list).
  - `POST /api/v1/fingerprint/snapshots` (manual trigger).
  - `GET /api/v1/fingerprint/snapshots/[id]/svg` (badge export).
- **UI:** `/app/fingerprint` gains a "Compare to" date picker; small carousel of past snapshots; "Export badge" button.
- **Jobs:** weekly cron snapshot.
- **Tests:** snapshot-determinism unit test (same inputs → same SVG).
- **Cost note:** zero LLM cost; pure DB + canvas.
- **Differentiator:** "Your mind has a face. Watch it change."
- **Dependencies:** none.

---

### A.3 Adversarial Retrieval — `adversarial-search`

- **Status:** absent
- **Phase:** 2
- **Why:** every query also surfaces what *contradicts* the query — forces intellectual humility into the retrieval layer.
- **Schema:** none new (uses existing `contradictions`).
- **Server:** `src/server/retrieval-adversarial.ts` — runs normal retrieval, then queries `contradictions` for memories that pair-contradict the top results, then re-ranks.
- **API:**
  - `GET /api/v1/search/adversarial?q=...` — same shape as `/search` but inverts.
  - The existing `/search` route accepts `?mode=adversarial` for a unified surface.
- **UI:** toggle in `/app/explore` and `/app/chat` ("Show opposing views"). When on, results render with a small "challenge" badge and the source memory.
- **Jobs:** none new; relies on background contradiction discovery (A.6 dependency).
- **Tests:** unit on inversion math; E2E on "toggle on → results differ".
- **Cost note:** zero new LLM cost (uses precomputed contradictions).
- **Differentiator:** "Every query shows you what you were wrong about."
- **Dependencies:** A.6 (Cross-Pollination) feeding the contradictions table on its own; until then, manual contradiction scans suffice.

---

### A.4 Forgetting Curve (whole base) — `forgetting`

- **Status:** partial (flashcards have SM-2; whole base does not).
- **Phase:** 3
- **Why:** stop knowledge decay across the entire base, not just the cards you made flashcards from.
- **Schema:**
  - `memory_forgetting_risk(id uuid pk, user_id uuid, memory_id uuid, risk_score real, days_since_review int, recommendation_priority int, computed_at timestamptz)`
- **Server:** `src/server/forgetting/scorer.ts` — Ebbinghaus curve `R = e^(-t/S)` per memory; updates risk weekly.
- **API:**
  - `GET /api/v1/forgetting/at-risk?limit=20` — ordered list.
  - `POST /api/v1/forgetting/[memoryId]/review` — same shape as flashcard review, updates `memory_reviews` SM-2 state.
- **UI:** `/app/forgetting` — review session UI mirroring `/app/learn`'s flashcard flow but sourced from any memory.
- **Jobs:** weekly cron recomputes scores.
- **Tests:** unit on Ebbinghaus math; integration with existing `memory_reviews` SM-2.
- **Cost note:** zero LLM cost.
- **Differentiator:** "Notion is storage. MindStore makes you *use* what you know."
- **Dependencies:** none; reuses existing `memory_reviews` table.

---

### A.5 Mind Diff — `mind-diff`

- **Status:** partial (topic-evolution exists; diff doesn't).
- **Phase:** 2
- **Why:** "What did I learn this month?" answered with a real comparison, not a vibes-based summary.
- **Schema:** reuses `mind_snapshots` from A.2.
- **Server:** `src/server/mind-diff/compare.ts` — input: two snapshot IDs; output: new topics, abandoned topics, deepened areas, contradictions detected in the window, growth velocity.
- **API:** `GET /api/v1/mind-diff?from=<snapshotId>&to=<snapshotId>`.
- **UI:** `/app/mind-diff` — timeline picker, narrative summary (LLM-generated, cached), bar charts for deltas.
- **Jobs:** none new.
- **Tests:** unit on delta calc; snapshot of narrative consistency.
- **Cost note:** ~3K input + 1K output per diff request. Cache results for 24h.
- **Differentiator:** "Watch your thinking evolve in real time."
- **Dependencies:** A.2 (snapshots).

---

### A.6 Cross-Pollination Engine — `cross-pollination`

- **Status:** partial (table exists; no automated discovery).
- **Phase:** 2
- **Why:** the "aha" machine — finds bridges between distant clusters of your knowledge.
- **Schema:** uses existing `connections`. Add column: `surprise real` is already there; add `bridge_concept text` if missing; add `explanation text`.
- **Server:** `src/server/cross-pollination/discoverer.ts` — nightly: sample `N` random pairs across distant clusters (centroid distance > threshold), compute similarity; if both high similarity AND high cluster distance, the pair is "surprising"; LLM generates the bridge concept + explanation.
- **API:**
  - `GET /api/v1/connections/surprising?limit=10`.
  - `POST /api/v1/connections/[id]/save-as-memory` — turn a discovered insight into a new memory.
- **UI:** `/app/cross-pollination` — top bridges as 2-card spreads with the bridge concept between them.
- **Jobs:** nightly cron, bounded by per-user cap.
- **Tests:** synthetic memory pairs to verify scoring distinguishes related vs surprising.
- **Cost note:** ~5K input + 1K output / user / night.
- **Differentiator:** "Your knowledge generates ideas you didn't see."
- **Dependencies:** Phase-1 cost-cap settings.

---

### A.7 Thought Threading — `threading`

- **Status:** absent
- **Phase:** 3
- **Why:** "you've been circling around this idea for 6 months" — show the full arc.
- **Schema:**
  - `thought_threads(id uuid pk, user_id uuid, topic text, memory_ids uuid[], time_span tstzrange, narrative text, coherence_score real, last_updated timestamptz)`
- **Server:** `src/server/threading/detector.ts` — temporal clustering by topic; LLM narrates the thread.
- **API:**
  - `GET /api/v1/threads`.
  - `GET /api/v1/threads/[id]`.
- **UI:** `/app/threads` — list with sparkline + narrative; detail page with timeline of source memories.
- **Jobs:** monthly (high cost), or on-demand from page.
- **Tests:** synthetic thread of 5 memories across 3 months → detected as one thread.
- **Cost note:** ~8K input + 2K output / thread. Cap at 5 new threads / user / month.
- **Differentiator:** "Your unconscious patterns made visible."
- **Dependencies:** A.1 (consolidation) feeds clusters; A.5 (diff) reuses thread data.

---

### A.8 `.mind` Portable File — `mind-file`

- **Status:** absent (632-line spec exists in `docs/archive/MIND_FILE_SPEC_v0.md`).
- **Phase:** 4
- **Why:** "your mind in a file" — backup, share, time-travel, fork.
- **Schema:**
  - `portable_exports(id uuid pk, user_id uuid, export_format text, file_size_bytes bigint, memory_count int, blob_url text, expires_at timestamptz, created_at timestamptz)`
- **Server:** `src/server/mind-file/{writer,reader,merger}.ts`. Format v1: zip with sections (memories.jsonl, embeddings.bin, tree_index.json, connections.json, profile.json, manifest.json) + optional AES-256-GCM at the file level. Defer v2 (binary/HNSW/MMAP) to Phase 5.
- **API:**
  - `POST /api/v1/export/mind` (writes to Vercel Blob, returns expiring URL).
  - `POST /api/v1/import/mind` (reads, dedupes via fuzzy match, surfaces conflicts).
  - `GET /api/v1/import/mind/[importId]/conflicts` for the conflict-resolution UI.
- **UI:**
  - `/app/export` adds a "Portable .mind" option.
  - `/app/import` adds a "Import .mind" tab + conflict-resolver page.
- **Jobs:** none.
- **Tests:** round-trip test (export → import to fresh DB → verify equality).
- **Cost note:** zero LLM. Storage cost varies; default expiry 14 days.
- **Differentiator:** "Git for your brain."
- **Dependencies:** Vercel Blob (owner ask). Owner approval to surface the moonshot in marketing.

---

### A.9 Knowledge Metabolism Score — `metabolism`

- **Status:** absent
- **Phase:** 2
- **Why:** "your intellectual fitness tracker" — quantifies and motivates knowledge work.
- **Schema:**
  - `metabolism_scores(id uuid pk, user_id uuid, week_start date, score real, intake_rate real, connection_density real, retrieval_frequency real, growth_velocity real)`
- **Server:** `src/server/metabolism/calc.ts` — weekly aggregation from `memories`, `connections`, `search_history`, `chat_conversations`.
- **API:**
  - `GET /api/v1/metabolism/current`.
  - `GET /api/v1/metabolism/history?weeks=12`.
- **UI:** `/app/metabolism` — score card with sparkline, components breakdown, tips to improve.
- **Jobs:** weekly cron.
- **Tests:** deterministic calc against fixture data.
- **Cost note:** zero LLM.
- **Differentiator:** "A fitness tracker for your brain."
- **Dependencies:** none.

---

### A.10 MCP Server (extended tools) — `mcp-extend`

- **Status:** shipped (3 core tools); add 4 more.
- **Phase:** 0 (security harden) + 2 (new tools alongside the wave 1 features).
- **Why:** be the universal AI memory; the more tools, the better the integration with Claude Desktop / Cursor / etc.
- **Schema:** none new.
- **Server:** add tools in `src/server/mcp/runtime.ts`:
  - `get_timeline(topic, fromDate?, toDate?)` — topic memories over time.
  - `get_contradictions(query)` — exposes adversarial layer.
  - `get_threads(topic?)` — exposes thought threads.
  - `learn_fact(content, category?)` — user can teach MindStore from inside Claude.
- **API:** existing `/api/mcp` route picks them up automatically.
- **UI:** none (visible in MCP clients).
- **Jobs:** none.
- **Tests:** unit on each tool's schema validation; E2E using `@modelcontextprotocol/sdk` test client.
- **Cost note:** none beyond underlying retrieval.
- **Differentiator:** "Every AI you use can learn, contradict, and thread your knowledge — not just search it."
- **Dependencies:** Phase-0 SEC-6 (MCP auth) must land first; the new tools assume an authenticated caller.

---

## Part B — Ten new innovations

### B.1 Mind Marketplace — `marketplace`

- **Status:** absent
- **Phase:** 4
- **Why:** community lock-in via shared minds; turns MindStore into a *social* layer atop personal knowledge.
- **Schema:**
  - `public_minds(id uuid pk, user_id uuid, slug text unique, name text, description text, topic_tags text[], memory_count int, downloads int, avg_rating real, blob_url text, published_at timestamptz)`.
  - `mind_ratings(id uuid pk, public_mind_id uuid, user_id uuid, rating int 1-5, comment text, created_at timestamptz)`.
  - `mind_forks(id uuid pk, public_mind_id uuid, forked_by uuid, forked_at timestamptz, merge_conflict_count int)`.
- **Server:** `src/server/marketplace/{publish,fork,merge,moderate}.ts`. Moderation includes a PII scanner before publish.
- **API:**
  - `POST /api/v1/minds/publish` — produces a `.mind` from current state, uploads to Vercel Blob, registers in `public_minds`.
  - `GET /api/v1/minds/browse?topic=X&sort=rating`.
  - `POST /api/v1/minds/[slug]/fork` — imports into the caller's account with a conflict-resolution session.
  - `POST /api/v1/minds/[slug]/rate`.
- **UI:** `/app/marketplace` (public browse + filter), `/app/minds` (your published minds), `/app/marketplace/[slug]` (detail + fork CTA).
- **Jobs:** moderation queue worker (every 30 min).
- **Tests:** publish-fork-merge round trip.
- **Cost note:** Vercel Blob storage scales with users; moderation LLM ~2K tokens / publish.
- **Differentiator:** "Open Claw is personal; MindStore is *contagious*."
- **Dependencies:** A.8 (`.mind` format), owner sign-off on legal/moderation policy.

---

### B.2 Knowledge Attack Surface — `risks`

- **Status:** absent
- **Phase:** 4
- **Why:** "what's exposed in your second brain?" — a security audit *of your knowledge*.
- **Schema:**
  - `knowledge_risks(id uuid pk, user_id uuid, risk_type text /*secret|spof|silo|gap*/, severity text, description text, affected_memory_ids uuid[], detected_at timestamptz, dismissed boolean default false)`.
- **Server:** `src/server/risks/scanner.ts`:
  - Secret patterns: AWS keys, OpenAI/Anthropic keys, JWTs, private keys, `.env`-style values.
  - SPoF: critical knowledge held in 1-2 memories only.
  - Silos: source distribution heavily skewed.
  - Gaps: tool/topic mentioned but no coverage.
- **API:** `GET /api/v1/risks/audit`, `POST /api/v1/risks/[id]/dismiss`.
- **UI:** `/app/security` — risk dashboard with severity-sorted list.
- **Jobs:** weekly scan.
- **Tests:** synthetic memory with embedded secret → flagged.
- **Cost note:** zero LLM (regex + heuristics); optional LLM review for high-severity findings.
- **Differentiator:** "Your knowledge security posture."
- **Dependencies:** none.

---

### B.3 Knowledge Oracle — `oracle`

- **Status:** absent (chat exists; oracle is a different shape).
- **Phase:** 5
- **Why:** multi-turn conversational agent that reasons across the entire knowledge base; admits gaps; cites sources.
- **Schema:** `oracle_conversations(id uuid pk, user_id uuid, messages jsonb, reasoning_trace jsonb, model_used text, total_tokens int, created_at timestamptz)`.
- **Server:** `src/server/oracle/agent.ts`:
  - Adaptive RAG (high-confidence: cite; medium: clarify; low: admit gap).
  - Routes via Vercel AI Gateway: Claude Sonnet 4.6 default, Opus 4.7 for complex queries.
  - Long-context window pre-loads top clusters + active threads.
- **API:** `POST /api/v1/oracle/ask` (streaming).
- **UI:** `/app/oracle` — persistent conversation, reasoning-trace toggle, memory citation cards.
- **Jobs:** none.
- **Tests:** golden-set of 20 questions with expected citation lists; assert oracle never uncited-claims.
- **Cost note:** the most expensive feature. ~30K input + 3K output / question. Per-user monthly cap.
- **Differentiator:** "Your knowledge actually talks back, with receipts."
- **Dependencies:** AI Gateway configured (Vercel platform-native).

---

### B.4 Mind Scheduler — `scheduler`

- **Status:** absent
- **Phase:** 5
- **Why:** "MindStore tells you what to learn today" — closes the loop between Forgetting Curve, Metabolism, and the user's calendar.
- **Schema:** `learning_schedules(id uuid pk, user_id uuid, date date, scheduled_memory_ids uuid[], session_minutes int, completed boolean)`.
- **Server:** `src/server/scheduler/builder.ts` — picks tomorrow's memories using SM-2 due-dates, Forgetting Curve risk, and time budget.
- **API:** `GET /api/v1/schedule/today`, `POST /api/v1/schedule/today/complete`.
- **UI:** `/app/schedule` — day calendar, today's agenda card with quick-review buttons.
- **Jobs:** nightly schedule builder.
- **Tests:** schedule respects time budget; never schedules same memory twice in a week.
- **Cost note:** zero LLM.
- **Differentiator:** "Learning that fits your life."
- **Dependencies:** A.4 (Forgetting Curve), A.9 (Metabolism).

---

### B.5 Knowledge Genealogy — `genealogy`

- **Status:** absent
- **Phase:** 3
- **Why:** trace the lineage of any idea — what fed into this belief, what came before.
- **Schema:** `knowledge_genealogy(id uuid pk, user_id uuid, child_memory_id uuid, parent_memory_ids uuid[], relationship_type text, confidence real, detected_at timestamptz)`.
- **Server:** `src/server/genealogy/tracer.ts` — temporal + semantic similarity graph traversal.
- **API:** `GET /api/v1/genealogy/[memoryId]`.
- **UI:** `/app/genealogy/[memoryId]` — ancestor/descendant tree (reagraph 2D).
- **Jobs:** monthly trace.
- **Tests:** synthetic chain of 3 memories → genealogy detected.
- **Cost note:** ~3K tokens / memory traced; only run on request, not bulk.
- **Differentiator:** "Every idea has a history."
- **Dependencies:** A.7 (Threading) — same temporal-clustering primitives.

---

### B.6 Vercel Workflows backbone — `workflows`

- **Status:** absent (Vercel Workflows DevKit available on platform).
- **Phase:** 5
- **Why:** durable, retryable, observable async jobs for everything else in the plan.
- **Schema:** none new (workflow state lives in Vercel-managed storage).
- **Server:** `src/server/workflows/` — one definition per long-running pipeline (consolidation, threading, marketplace publish, etc.).
- **API:** `POST /api/v1/workflows/[name]/trigger` (auth-gated).
- **UI:** `/app/admin/workflows` — execution log with status, retries, durations.
- **Jobs:** all existing cron tasks migrate to workflows; legacy `run-due` and `tick` endpoints become triggers.
- **Tests:** workflow DAG executes in order; failures retry with backoff.
- **Cost note:** Vercel Workflows pricing applies.
- **Differentiator:** invisible to users; gives the team operational sanity.
- **Dependencies:** none for migration; Workflows must be GA on the deploy plan.

---

### B.7 Memory Journals — `journals`

- **Status:** absent (voice-to-memory exists as the foundation).
- **Phase:** 3
- **Why:** daily voice/text capture with auto-extraction → MindStore becomes a *journal* with intelligence.
- **Schema:** `journal_entries(id uuid pk, user_id uuid, date date, raw_content text, audio_blob_url text, generated_memory_ids uuid[], synthesis text, created_at timestamptz)`.
- **Server:** `src/server/journals/{capture,extract,synthesize}.ts`.
- **API:**
  - `POST /api/v1/journal/today` (text or audio upload).
  - `GET /api/v1/journal/week` (synthesis).
- **UI:** `/app/journal` — daily card, voice-record button (reuses voice-to-memory plugin), week-in-review screen.
- **Jobs:** weekly synthesis cron.
- **Tests:** voice-blob → transcript → 3 memories generated.
- **Cost note:** ~2K tokens / journal entry.
- **Differentiator:** "A journal that *understands* itself."
- **Dependencies:** voice-to-memory plugin (already shipped).

---

### B.8 Knowledge Diffusion — `diffusion`

- **Status:** absent
- **Phase:** 3
- **Why:** track how an idea propagates across your sources over time — Sankey-style.
- **Schema:** `idea_diffusion(id uuid pk, user_id uuid, idea_signature text, source_memory_ids uuid[], first_seen timestamptz, last_seen timestamptz, source_distribution jsonb)`.
- **Server:** `src/server/diffusion/tracker.ts` — clusters memories by semantic signature, records source breakdown.
- **API:** `GET /api/v1/diffusion`, `GET /api/v1/diffusion/[clusterId]`.
- **UI:** `/app/diffusion` — Sankey of idea flow across sources over time.
- **Jobs:** monthly recomputation.
- **Tests:** synthetic memories from 3 sources sharing one idea → one cluster, three source contributions.
- **Cost note:** ~1K tokens / cluster signature; otherwise free.
- **Differentiator:** "Where your ideas really came from."
- **Dependencies:** A.1 (Consolidation) provides clusters.

---

### B.9 Memory Audit Trail — `attribution`

- **Status:** absent
- **Phase:** 4
- **Why:** academic/professional integrity — provenance, citations, plagiarism detection in your own notes.
- **Schema:** add `attribution jsonb` column to `memories` (URL, importer, import date, edits log).
- **Server:** `src/server/attribution/{provenance,cite}.ts`. Citation formats: APA, MLA, Chicago.
- **API:** `GET /api/v1/memories/[id]/provenance`, `POST /api/v1/memories/export?format=apa`.
- **UI:** memory detail panel adds "Provenance" tab; export modal in `/app/export` adds citation format toggle.
- **Jobs:** none.
- **Tests:** import a URL → attribution chain present; export → cites correctly.
- **Cost note:** zero.
- **Differentiator:** "Your knowledge cites its sources."
- **Dependencies:** none.

---

### B.10 Mind Coaching — `coach`

- **Status:** absent
- **Phase:** 5
- **Why:** an AI coach that knows your goals, your knowledge, and pushes you toward growth.
- **Schema:**
  - `learning_goals(id uuid pk, user_id uuid, goal text, target_date date, metrics jsonb, status text, created_at timestamptz)`.
  - `coach_checkins(id uuid pk, goal_id uuid, week_start date, progress_pct real, feedback text)`.
- **Server:** `src/server/coach/{assess,recommend}.ts` — weekly assessment with LLM-generated guidance grounded in user's data.
- **API:** `POST /api/v1/coach/goals`, `GET /api/v1/coach/checkin/this-week`.
- **UI:** `/app/coach` — goals list, weekly check-in card, recommendations stream.
- **Jobs:** weekly check-in cron.
- **Tests:** goal → 4 weeks of fixture data → recommendations match expected pattern.
- **Cost note:** ~5K tokens / weekly check-in.
- **Differentiator:** "An AI mentor for your mind."
- **Dependencies:** A.9 (Metabolism), A.4 (Forgetting), B.5 (Genealogy) — coaching draws on all three.

---

## Build order summary

```
Phase 2 (Wave 1):  A.2 → A.9 → A.3 → A.6 → A.1 → A.5
                   (cheap → cheap → adversarial → cross-poll → consolidation → diff)

Phase 3 (Wave 2):  A.4 + A.7 (parallel) → B.5 → B.8 → B.7
                   (forgetting + threading → genealogy → diffusion → journals)

Phase 4 (Network): A.8 → B.9 → B.2 → B.1
                   (mind-file → attribution → risks → marketplace)

Phase 5 (System):  B.6 → B.3 → B.4 → B.10
                   (workflows → oracle → scheduler → coach)
```

A.10 (MCP extended tools) lands incrementally alongside its source features (e.g., `get_threads` lands with A.7).

---

## Telemetry per feature

Each feature, on ship, instruments:

- **Adoption:** % of active users who used it in the last 7 days.
- **Retention:** repeat-use within 7 days.
- **Cost:** mean tokens per invocation, p95 tokens.
- **Quality signal:** at least one feature-specific quality metric (e.g., consolidation insight dismissal rate, oracle uncited-claim rate, marketplace fork→retain ratio).

Telemetry surfaces in `/app/admin/metrics` (auth required).

---

## Owner approvals embedded in this backlog

| Feature | Approval needed |
|---|---|
| A.1, A.5, A.6, A.7 | Per-user nightly token cap default value |
| A.8 | Vercel Blob plan tier; expiry default; encryption-by-default toggle |
| B.1 | Public marketplace launch; moderation policy; legal terms |
| B.3 | Choice of Claude Opus 4.7 vs Sonnet 4.6 for Oracle; AI Gateway provider mix |
| B.6 | Vercel Workflows pricing on the project plan |

These are flagged in `STATUS.md` §8 (Open blockers) when their phase begins.

---

*This backlog is the "what". `PRODUCTION_READINESS.md` is the "when and how". `STATUS.md` is the "where we actually are".*
