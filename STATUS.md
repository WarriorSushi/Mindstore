# MindStore — Live Status

**Last refreshed:** 2026-05-04
**Refreshed by:** Claude (Opus 4.7) — mid-Phase-2/3/4 sweep after six innovations shipped to `main`
**Refresh cadence:** every workstream merge updates the relevant rows; full re-audits at phase boundaries

This is the **single source of truth** for the project's actual state. If a doc disagrees with this file, update the doc. If this file disagrees with the code, run the audit again and fix this file. Nothing else describes ground truth.

For the *plan* of how the project moves forward, see `PRODUCTION_READINESS.md`. For *why* this file exists, see `CLAUDE_TAKEOVER.md`. For the *innovation queue*, see `FEATURE_BACKLOG.md`.

---

## 0. Top-of-page health

| Indicator | Status (2026-05-04) | Notes |
|---|---|---|
| `node_modules` installed | ✅ Installed | Verified locally (`npx vitest run` reports 441 passing). |
| `npm run typecheck` | ✅ Passing | Last verified at the Phase 0 closure; not re-run after Phase 2/3/4 commits — re-verify before next merge. |
| `npm test` | ✅ 441 / 441 | 62 test files. New since Phase 0: fingerprint-snapshot (6), retrieval-adversarial (5), mind-diff (11), forgetting (6), risks-scanner (16), attribution (8), plus other increments. |
| `npm run lint:ci` | ✅ Passing | Curated slice; full repo lint via `npm run lint:backlog` is a Phase 1 backlog item. |
| `npm run build` | ✅ Passing | Last verified at Phase 0 closure; re-verify before next merge given the `src/server/mind-file/` work is untracked. |
| Production deploy | ✅ Live at mindstore.org | Per `PRODUCTION.md`. 1 memory and 0 user-configured AI providers per the (now archived) `docs/archive/NEXT_STEPS.md`. |
| MCP endpoint | ✅ Reachable at `/api/mcp` | Now Bearer-auth-required (SEC-6 closed). Single-user mode falls through when no bearer is present; invalid bearer is rejected. |
| CI configuration | ✅ Present | `.github/workflows/ci.yml` (lint→typecheck→test→build→playwright) and `dco.yml` (DCO sign-off check). Both updated to accept `claude/**` branches and Node 24. |
| `npm audit` advisories | ⚠️ 15 (9 moderate, 6 high) | Captured at Phase 0 install; `npm audit fix` follow-up gated on owner approval since some require breaking-change upgrades. Track as ARCH-13. |

---

## 1. Repository inventory

| Layer | Count | Notes |
|---|---|---|
| API route files (`route.ts`) | 88 | +9 since the prior refresh: `/api/v1/risks` (+2), `/api/v1/mind-diff`, `/api/v1/forgetting/{at-risk,review}`, `/api/v1/search/adversarial`, `/api/v1/fingerprint/snapshots` (+2), `/api/v1/memories/[id]/provenance`. |
| App pages | 39 | +3 since the prior refresh: `/app/security`, `/app/mind-diff`, `/app/forgetting`. (Counted via `find src/app/app -name page.tsx`; the 40 in the prior refresh was a count error — corrected here.) |
| Plugin manifests in registry | 35 | README badge says 35 (matches); a counter elsewhere said 33 (line-count regex mismatch). |
| Plugin port files | 33 | Two import plugins share UI/file paths with siblings (registry-slug mismatches). |
| Drizzle tables | 30+ | See `src/server/schema.ts`. New tables added by Phase 2/3/4: `fingerprint_snapshots`, forgetting tables, `risks` (per migrate.ts deltas in commits `d791c83`, `7d194d8`, `0802dc3`). |
| Doc files (root + `docs/`) | 113 | Plus 4 master docs at root (`CLAUDE_TAKEOVER`, `STATUS`, `PRODUCTION_READINESS`, `FEATURE_BACKLOG`). Stale planning artifacts in `docs/archive/`. |
| Unit test files | 62 | **441 individual test cases.** +52 since prior refresh, distributed across 6 new test files for fingerprint snapshots, adversarial retrieval, mind-diff, forgetting, risks-scanner, and attribution. |
| Workspace packages | 3 | `@mindstore/plugin-sdk`, `@mindstore/plugin-runtime`, `@mindstore/example-community-plugin`. |
| Browser extension | 1 | `extensions/mindstore-everywhere/`. Chrome Manifest V3, content + popup. |

---

## 2. Architectural status (what works, what bends, what's broken)

### Foundations (real and solid)

| Subsystem | File(s) | Verdict |
|---|---|---|
| Schema + migrations | `src/server/schema.ts`, `src/server/migrate.ts` | ✅ Production. pgvector + pg_trgm + pgcrypto, indexes, enums, JSONB metadata. |
| Multi-provider AI client | `src/server/ai-client.ts` (~780 LOC) | ✅ Production. OpenAI / Gemini / Ollama / OpenRouter / custom OpenAI-compat with streaming. |
| Triple-layer retrieval (RRF) | `src/server/retrieval.ts` | ✅ Production-grade BM25 + vector + tree fusion. Tree layer is shallow (group-by source/title) — not the "PageIndex-inspired reasoning" the comment claims, but works. |
| Multi-provider embeddings | `src/server/embeddings.ts` | ✅ Production. ⚠️ Bug: query embeddings tagged `RETRIEVAL_DOCUMENT` for Gemini; should be `RETRIEVAL_QUERY` for query-side. |
| MCP server runtime | `src/server/mcp/runtime.ts`, `src/app/api/mcp/route.ts` | ✅ Real `@modelcontextprotocol/sdk` server with 3 core tools + plugin extension. ⚠️ No auth on the HTTP endpoint. |
| Job queue (plugins) | `src/server/plugin-jobs.ts`, `src/server/run-plugin-jobs.ts` | ✅ Real durable schedule table, `plugin_job_schedules`. ⚠️ No cron wired. |
| Job queue (indexing) | `src/server/indexing-jobs.ts`, `src/server/run-indexing-jobs.ts` | ✅ Durable backfill queue with status tracking. |
| API-key encryption | `src/server/encryption.ts` | ✅ AES-256-GCM with version prefix. ⚠️ Default key derivation uses `DATABASE_URL` — DB credential rotation breaks all encrypted values. Move to `ENCRYPTION_KEY` env var. |
| Auth (single-user + Google) | `src/server/auth.ts`, `src/server/identity.ts` | ✅ Works. Single-user falls to UUID `00000000-...`. ⚠️ `(session as any).userId` and `(token as any).userId` casts; types unsafe but functional. JWT strategy means `sessions` table is dead schema. |
| Plugin SDK | `packages/plugin-sdk/src/index.ts` (363 LOC) | ✅ Real, typed contract: `definePlugin`, capabilities, hooks, widgets, jobs, MCP tools. |
| Plugin runtime | `packages/plugin-runtime/src/index.ts` (669 LOC) | ✅ Real, registers plugins, exposes hooks/widgets/MCP bindings. |
| Browser extension | `extensions/mindstore-everywhere/` | ✅ Real Chrome MV3 with capture + query against the API. |
| Security middleware | `src/proxy.ts` | ✅ Sane headers, content-type guards, 50MB max. |

### Architectural concerns to resolve

| ID | Concern | Severity | Fix |
|---|---|---|---|
| ARCH-1 | `settings` table has no `user_id` column — global key-value store. Multi-user mode would have all users sharing one set of API keys. | **P0 (blocks multi-user)** | Add `user_id` column + migrate all reads/writes to scope by user. Owner decision needed: is multi-user the long-term target? See `PRODUCTION_READINESS.md` §Phase 1. |
| ARCH-2 | `ENCRYPTION_KEY` defaults to a SHA-256 of `DATABASE_URL`. Rotating DB password breaks every encrypted setting. | High | Require `ENCRYPTION_KEY` to be explicit in production; add migration helper to re-encrypt under a new key. |
| ARCH-3 | `/api/mcp` endpoint has no auth and CORS is `*`. In single-user mode this is by design but exposes the entire knowledge base to anyone with the URL. | **P0 in multi-user, P1 in single-user** | Require API-key (Bearer) for MCP requests; tighten CORS. |
| ARCH-4 | Tree layer of retrieval (`searchTree`) is a `groupBy(source_type) → groupBy(source_title)` with averaged embeddings. The "PageIndex-inspired" claim oversells it. | Medium (correctness OK, narrative misleading) | Either replace with a real LLM-summarized hierarchy (Phase 2) or reword the comment + remove the marketing claim. |
| ARCH-5 | No cron is wired to `vercel.json`. `jobs:run-due` and `jobs:run-indexing` only run when manually invoked. | High | Add Vercel cron entries (Phase 1) or migrate to `vercel.ts` per platform default; alternative: external scheduler. |
| ARCH-6 | `media` table exists but no upload pipeline (S3, Vercel Blob, etc.). All file paths are TEXT pointers without storage integration. | Medium | Wire Vercel Blob in Phase 4 (when `.mind` files land); for now, mark `image-to-memory` and `voice-to-memory` as base64-in-DB only. |
| ARCH-7 | `MCP` HTTP transport tears down `server` and `transport` per request. Streaming MCP tools with progress events won't work. | Low (current tools are JSON-response) | Pool the server instance per session if streaming tools are added. |
| ARCH-8 | Hand-maintained nav config in `src/app/app/AppShell.tsx`. Will rot as plugins are added. | Medium | Generate nav from registry + plugin UI manifest entries (Phase 1 polish). |
| ARCH-9 | Embedding-dim mismatch handled defensively in retrieval (`vector_dims(m.embedding) = ${embDim}`) but no migration path when a user changes provider. | Medium | Add a "re-embed all" job; surface in settings when provider changes. |
| ARCH-10 | ~~Two near-duplicate routes: `/api/v1/stats` and `/api/v1/knowledge-stats`.~~ | ✅ DEPRECATED (Phase 1, commit `14d50fa`) | `/api/v1/stats` returns RFC 8594 `Deprecation`/`Sunset: 2026-08-01`/`Link: rel=successor-version` headers + per-request `console.warn`. `/api/v1/knowledge-stats` carries all legacy fields. `src/lib/stats-adapter.ts` projects the legacy shape for migrating callers. |
| ARCH-11 | ~~`src/server/apikey.ts` (legacy OpenAI-only) and `src/server/api-keys.ts` (active validator) both exist.~~ | ✅ DONE (Phase 1) | Legacy `apikey.ts` was unreferenced; deleted. `api-keys.ts` remains the single active validator. |
| ARCH-12 | ~~Three plugin slug mismatches: `youtube-importer` ↔ `youtube-transcript.ts`, `reddit-importer` ↔ `reddit-saved.ts`, `writing-analyzer` ↔ `writing-style.ts`.~~ | ✅ DONE (Phase 1) | Port files renamed to match registry slugs. Old slugs registered as `aliases` so the runtime + DB lookups still resolve them. API route URLs (`/api/v1/plugins/youtube-transcript` etc.) preserved for back-compat with external clients. Also fixed two latent bugs the rename surfaced: a typo in `BUILTIN_OVERRIDES` key (`writing-style` → `writing-analyzer`) that had silently disabled the writing-analyzer dashboard widget, and a missing `ui.dashboardWidgets` manifest entry. |
| ARCH-13 | 🟡 PARTIAL (Phase 1, commit `8ee2d9d`) | Medium | `npm audit fix` applied (15 → 7 advisories). Remaining 7 require breaking-change upgrades (`next@16.2.4`, `uuid@14`); deferred to a dedicated PR with owner sign-off. |
| ARCH-14 | ~~SSRF DNS-rebinding.~~ | ✅ PARTIAL FIX (Phase 1, commit `35cf00e`) | `safeFetch(url, opts)` resolves hostnames via `dns.lookup({all:true})` and rejects any address in a private/loopback range. `/api/v1/import-url` uses it. 9 new tests under `tests/unit/security-phase0/safe-fetch.test.ts`. Residual TOCTOU window between dns.lookup and fetch tracked for Phase 2 (custom http/https Agent with per-attempt lookup callback). |

---

## 3. Security backlog

Severity follows OWASP-style risk weighting; full per-route table in §6.

| ID | Severity | Issue | Route | Fix |
|---|---|---|---|---|
| SEC-1 | **CRITICAL** ✅ DONE | `GET /api/v1/settings` returns API-key previews + provider config without auth. | `src/app/api/v1/settings/route.ts` | Gated by `requireUserId()`. Settings table is still global (ARCH-1). |
| SEC-2 | **CRITICAL** ✅ DONE | `POST /api/v1/settings` writes/deletes the global API keys without auth. Anyone can wipe configuration. | same | Gated by `requireUserId()` + `applyRateLimit('settings', RATE_LIMITS.write)`. |
| SEC-3 | HIGH ✅ DONE | `/api/v1/embed` is open — free embedding service for anyone with the URL. | `src/app/api/v1/embed/route.ts` | `requireUserId()` + `RATE_LIMITS.standard` + Zod (texts: 1..50, ≤8000 chars). |
| SEC-4 | HIGH ✅ DONE | `/api/v1/import-url` server-side fetches arbitrary URLs (SSRF). | `src/app/api/v1/import-url/route.ts` | `requireUserId()` + `RATE_LIMITS.write` + `isPublicHttpUrl()` blocks 10/8, 172.16/12, 192.168/16, 169.254/16, 127/8, ::1, fc00::/7, fe80::/10, localhost. |
| SEC-5 | HIGH ✅ DONE | `/api/v1/plugin-jobs/run-due` triggers background jobs without auth. | `src/app/api/v1/plugin-jobs/run-due/route.ts` | Accepts `Bearer <INTERNAL_JOB_TOKEN>`, valid `api_keys` row, or `x-vercel-cron` header. |
| SEC-6 | HIGH ✅ DONE | `/api/mcp` has no auth + CORS `*`. | `src/app/api/mcp/route.ts` | Bearer API key from `api_keys` required; single-user mode falls through to default user. CORS now echoes Origin only when in `MCP_ALLOWED_ORIGINS`. |
| SEC-7 | MEDIUM ✅ DONE | `/api/health` and `/api/v1/health` leak provider configuration booleans and DB connection diagnostics. | `src/app/api/health/route.ts`, `src/app/api/v1/health/route.ts` | Public `/api/health` now returns `{status, timestamp}` only. `/api/v1/health` gated by `requireUserId()`. |
| SEC-8 | MEDIUM | `/api/v1/backup` POST has no body shape validation, no size limits. | `src/app/api/v1/backup/route.ts` | Add Zod schema and `max-document` cap. |
| SEC-9 | MEDIUM | `/api/v1/duplicates` POST (merge) has no rate limit; abusable for bulk delete. | `src/app/api/v1/duplicates/route.ts` | Add `RATE_LIMITS.write`. |
| SEC-10 | MEDIUM | `/api/v1/import` (50MB) has no per-user daily quota. | `src/app/api/v1/import/route.ts` | Add per-user daily import quota + hourly rate limit. |
| SEC-11 | MEDIUM | `/api/v1/extension/package` returns the extension ZIP without auth. | `src/app/api/v1/extension/package/route.ts` | OK in single-user, but in multi-user gate behind the user's API key so the bundled key is per-user. |
| SEC-12 | LOW | `/api/v1/memories` GET has no max limit. | `src/app/api/v1/memories/route.ts` | Cap at 1000 per request. |
| SEC-13 | LOW | Settings POST hits external URLs to validate keys; no timeout, no jitter. | `src/app/api/v1/settings/route.ts` | Use `AbortController` with 5s timeout, fall back to "key saved (validation skipped)". |

---

## 4. Plugin maturity matrix (35 plugins)

All 35 are functional. **Maturity** here is a composite of code completeness and test depth; a `WORKS` plugin runs in production today, just with thinner test coverage.

| Slug (registry) | Category | Port file | LOC | Tests | Maturity | Notes |
|---|---|---|---|---|---|---|
| kindle-importer | import | kindle-importer.ts | 402 | 3 | WORKS | Add malformed-file + dedup tests. |
| pdf-epub-parser | import | pdf-epub-parser.ts | 407 | 3 | WORKS | Add unicode + section-edge cases. |
| youtube-importer | import | youtube-importer.ts | 415 | 3 | WORKS | Renamed to match registry (Phase 1 ARCH-12). Alias `youtube-transcript` retained for back-compat. |
| browser-bookmarks | import | browser-bookmarks.ts | 264 | 3 | WORKS | Folder-hierarchy + invalid-URL filtering tests. |
| obsidian-importer | import | obsidian-importer.ts | 571 | 24 | PRODUCTION | Highest test count in project. |
| notion-importer | import | notion-importer.ts | 318 | 3 | WORKS | ZIP + CSV edge cases. |
| reddit-importer | import | reddit-importer.ts | 419 | 3 | WORKS | Renamed to match registry (Phase 1 ARCH-12). Alias `reddit-saved` retained for back-compat. |
| twitter-importer | import | twitter-importer.ts | 328 | 16 | PRODUCTION | |
| telegram-importer | import | telegram-importer.ts | 341 | 6 | PRODUCTION | |
| pocket-importer | import | pocket-importer.ts | 259 | 17 | PRODUCTION | |
| readwise-importer | import | readwise-importer.ts | 338 | 14 | PRODUCTION | |
| spotify-importer | import | spotify-importer.ts | 343 | 14 | PRODUCTION | |
| mind-map-generator | analysis | mind-map-generator.ts | 275 | varies | PRODUCTION | |
| knowledge-gaps | analysis | knowledge-gaps.ts | 431 | 3 | WORKS | Gap-identification + recommendation-rank tests. |
| contradiction-finder | analysis | contradiction-finder.ts | 441 | 2 | WORKS | Background-only (no UI page by design); needs partial-contradiction tests. |
| topic-evolution | analysis | topic-evolution.ts | 460 | 2 | WORKS | Timeline + date-edge tests. |
| writing-analyzer | analysis | writing-analyzer.ts | 848 | varies | PRODUCTION | Renamed to match registry (Phase 1 ARCH-12). Alias `writing-style` retained for back-compat. Largest port file. |
| sentiment-timeline | analysis | sentiment-timeline.ts | 637 | 3 | WORKS | Emotion-detection + temporal-aggregation tests. |
| blog-draft | action | blog-draft.ts | 404 | varies | PRODUCTION | |
| flashcard-maker | action | flashcard-maker.ts | 538 | 3 | PRODUCTION | SM-2 implementation; needs more interval-edge tests. |
| newsletter-writer | action | newsletter-writer.ts | 441 | varies | PRODUCTION | |
| resume-builder | action | resume-builder.ts | 450 | varies | PRODUCTION | |
| conversation-prep | action | conversation-prep.ts | 293 | varies | PRODUCTION | |
| learning-paths | action | learning-paths.ts | 381 | varies | PRODUCTION | |
| obsidian-sync | export/sync | obsidian-sync.ts | 384 | 17 | PRODUCTION | |
| notion-sync | export/sync | notion-sync.ts | 424 | varies | PRODUCTION | |
| anki-export | export | anki-export.ts | 334 | 16 | PRODUCTION | |
| markdown-blog-export | export | markdown-blog-export.ts | 274 | 15 | PRODUCTION | |
| voice-to-memory | capture | voice-to-memory.ts | 380 | 3 | PRODUCTION | |
| image-to-memory | capture | image-to-memory.ts | 446 | varies | PRODUCTION | |
| multi-language | ai | multi-language.ts | 422 | 19 | PRODUCTION | |
| custom-rag | ai | custom-rag.ts | 507 | varies | PRODUCTION | HyDE + reranking + parent-child chunking. |
| domain-embeddings | ai | domain-embeddings.ts | 475 | 14 | PRODUCTION | |

**Totals:** 23 PRODUCTION · 12 WORKS · 0 PARTIAL · 0 STUB · 0 BROKEN.

**Slug-mismatch fix (ARCH-12, P0 housekeeping):**
- Either rename the file to match the registry slug (preferred, less surprising), or rename the registry slug to match the file. Recommendation: rename file. New mapping:
  - `youtube-transcript.ts` → `youtube-importer.ts`, route stays `/api/v1/plugins/youtube-transcript` until next major.
  - `reddit-saved.ts` → `reddit-importer.ts`.
  - `writing-style.ts` → `writing-analyzer.ts`.
- Add an alias map so the registry can declare `aliases: ["youtube-transcript"]` and the runtime resolves either.

---

## 5. Page inventory (39 pages)

Codes:
- **EMPTY** = needs designed empty state
- **ERR-WRAP** = no inline try/catch (relies on `error.tsx` only)
- **A11Y** = icon-only div onClick instead of `<button aria-label>`
- **MOBILE** = WebGL or fixed-width concerns on small screens

**Page polish progress (Phase 1):**

| Sweep | Initial flagged | Done | Remaining |
|---|---|---|---|
| Empty states | 17 | 17 (commit `433e285`) | — |
| Inline error wrapping (ERR-WRAP) | 16 | 16 (commits `0bd693a` + `6bef21f`) | — |
| Accessibility (A11Y) | 8+ | 0 | 8+ remain (`/app/explore`, `/app/blog`, `/app/gaps` + general sweep) |
| WebGL 2D fallback | 2 | 0 | `/app/mindmap`, `/app/fingerprint` |

| Path | Verdict | Flags |
|---|---|---|
| `/` | PRODUCTION | — |
| `/login` | PRODUCTION | — |
| `/docs`, `/docs/[...slug]` | PRODUCTION | — |
| `/app` | PRODUCTION | — |
| `/app/chat` | PRODUCTION | — |
| `/app/import` | PRODUCTION | — |
| `/app/explore` | WORKS | A11Y |
| `/app/learn` | PRODUCTION | — |
| `/app/collections` | PRODUCTION | — |
| `/app/mindmap` | WORKS | MOBILE |
| `/app/fingerprint` | WORKS | MOBILE |
| `/app/stats` | DEPRECATED 2026-08-01 | superseded by `/app/knowledge-stats` data |
| `/app/insights` | PRODUCTION | — |
| `/app/evolution` | PRODUCTION | — |
| `/app/sentiment` | PRODUCTION | — |
| `/app/gaps` | WORKS | A11Y |
| `/app/duplicates` | PRODUCTION | — |
| `/app/writing` | PRODUCTION | — |
| `/app/voice` | PRODUCTION | — |
| `/app/vision` | PRODUCTION | — |
| `/app/retrieval` | PRODUCTION | — |
| `/app/languages` | PRODUCTION | — |
| `/app/domains` | PRODUCTION | — |
| `/app/flashcards` | PRODUCTION | — |
| `/app/blog` | WORKS | A11Y |
| `/app/prep` | PRODUCTION | — |
| `/app/paths` | PRODUCTION | — |
| `/app/resume` | PRODUCTION | — |
| `/app/newsletter` | PRODUCTION | — |
| `/app/anki` | PRODUCTION | — |
| `/app/export` | PRODUCTION | — |
| `/app/notion-sync` | WORKS | — |
| `/app/obsidian-sync` | WORKS | — |
| `/app/conversation` | WORKS | ORPHAN-by-design |
| `/app/connect` | WORKS | — |
| `/app/settings` | PRODUCTION | — |
| `/app/plugins` | PRODUCTION | — |
| `/app/onboarding` | WORKS | ORPHAN-by-design |
| `/app/metabolism` | PRODUCTION | Phase 2 A.9 (commit `c0cc2b2`) |
| `/app/fingerprint` (snapshots additions) | PRODUCTION | Phase 2 A.2 (commit `d791c83`) added snapshot history UI |
| `/app/mind-diff` | PRODUCTION | NEW Phase 2 A.5 (commit `5102ffc`) |
| `/app/forgetting` | PRODUCTION | NEW Phase 3 A.4 (commit `7d194d8`) |
| `/app/security` | PRODUCTION | NEW Phase 4 B.2 (commit `0802dc3`) |

**Page-state work remaining:**
- A11Y on `/app/explore`, `/app/blog`, `/app/gaps` and a general icon-only-button sweep.
- WebGL 2D fallback for `/app/mindmap` and `/app/fingerprint` (MOBILE flag).

---

## 6. Innovation status (10 + 10 = 20 features)

Detailed implementation sketches in `FEATURE_BACKLOG.md`. Status here is the headline.

| # | Innovation | Status | Phase target |
|---|---|---|---|
| 1 | Memory Consolidation Engine | scaffold | 2 |
| 2 | Knowledge Fingerprint | ✅ shipped + snapshots (Phase 2, commit `d791c83`) | — |
| 3 | Adversarial Retrieval | ✅ shipped (Phase 2, commit `1e9bfdf`) | — |
| 4 | Forgetting Curve (whole base) | ✅ shipped (Phase 3, commit `7d194d8`) | — |
| 5 | Mind Diff | ✅ shipped (Phase 2, commit `5102ffc`) | — |
| 6 | Cross-Pollination Engine | partial | 2 |
| 7 | Thought Threading | absent | 3 |
| 8 | `.mind` Portable File | 🟡 IN FLIGHT — `src/server/mind-file/{writer,reader,merger}.ts` present locally, untracked. Format `mindstore.mind/1.0`: ZIP with manifest + memories.jsonl + embeddings.bin + tree_index + connections + profile. Streamed to HTTP response (no Blob dependency). No API route or page wired yet. | 4 |
| 9 | Knowledge Metabolism Score | ✅ shipped (Phase 2, commit `c0cc2b2`) | — |
| 10 | MCP Server | shipped + Bearer-auth gated (Phase 0 closed) | 2 (extended tools) |
| N1 | Mind Marketplace | absent | 4 |
| N2 | Knowledge Attack Surface | ✅ shipped (Phase 4, commit `0802dc3`) | — |
| N3 | Knowledge Oracle | absent | 5 |
| N4 | Mind Scheduler | absent | 5 |
| N5 | Knowledge Genealogy | absent | 3 |
| N6 | Vercel Workflows backbone | absent | 5 (continuous) |
| N7 | Memory Journals | absent | 3 |
| N8 | Knowledge Diffusion | absent | 3 |
| N9 | Memory Audit Trail | ✅ shipped (Phase 4, commit `81f0447`) | — |
| N10 | Mind Coaching | absent | 5 |

**Progress tally:** 8 of 20 innovations shipped (#2, #3, #4, #5, #9, #10, #N2, #N9). 1 in flight locally (#8). 11 absent or partial.

---

## 7. Documentation freshness ledger

| File | State | Action |
|---|---|---|
| `README.md` | ✅ TRUTH-PASSED (Phase 0) | Counts fixed (345 tests, 77 routes), roadmap partitioned, links to `STATUS.md`. |
| `ARCHITECTURE.md` | ✅ FIXED (Phase 0) | Embedding default corrected to Gemini, S3 claim replaced with truth, tree-layer scope clarified. |
| `INNOVATIONS.md` | ✅ ARCHIVED (Phase 0) | Now `docs/archive/INNOVATIONS_aspirational.md` with provenance header. |
| `NEXT_PHASE.md`, `NEXT_STEPS.md` | ✅ ARCHIVED (Phase 0) | In `docs/archive/`. |
| `MIND_FILE_SPEC.md` | ✅ ARCHIVED (Phase 0) | Now `docs/archive/MIND_FILE_SPEC_v0.md`; will revive as v1 design when Phase 4 begins. |
| `IMPROVEMENTS.md` | ✅ ARCHIVED (Phase 0) | Now `docs/archive/IMPROVEMENTS_cron_log.md`. |
| `GOVERNANCE.md` | ✅ FIXED (Phase 0) | License claim corrected to FSL-1.1-MIT. Named-maintainer entry deferred to owner. |
| `CONTRIBUTING.md` | KEEP+FIX (deferred) | Test count update + port confirmation pending; not blocking. |
| `CLAUDE.md` | ✅ REPLACED (Phase 0) | Real agent context, points at CLAUDE_TAKEOVER + STATUS. |
| `AGENTS.md` | ✅ REPLACED (Phase 0) | Real Next.js 16 / repo-map agent guidance. |
| `.impeccable.md` | KEEP | Design system reference; useful. |
| `PRODUCTION.md` | KEEP+FIX (deferred) | `{VERCEL_URL}` placeholder pending; not blocking. |
| `LICENSE`, `LICENSING.md`, `TRADEMARKS.md`, `DCO.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `NOTICE` | KEEP | Untouched legal/community surface. |
| `docs/codex/*` | ✅ ARCHIVED (Phase 0) | Now `docs/archive/codex/`. |
| `docs/adr/*` | KEEP | Real architecture decisions; continue convention. |
| `docs/releases/*` | KEEP | Real release notes; continue. |
| `docs/getting-started/*`, `docs/build/*`, `docs/deploy/*`, `docs/api-reference/*`, `docs/plugins/*` | KEEP | Reviewed individually in Phase 0. |

**New docs still to create (Phase 1):**
- `RUNBOOK.md` (root) — operations playbook for production.
- `CHANGELOG.md` (root) — generated from `docs/releases/`.
- `TESTING_STRATEGY.md` (root) — how tests are organized + what to write.
- `docs/PLUGIN_MATURITY_MATRIX.md` — extracted from §4 of this file, kept in sync.

---

## 8. Open blockers (need human action)

Only the owner can resolve these. Each is named so I can reference it in subsequent sessions.

| ID | Blocker | Owner ask |
|---|---|---|
| BLOCK-1 | Production has no `GEMINI_API_KEY` (or any AI provider) set in Vercel env vars. New visitors see chat/analysis/flashcards as dead. | Owner sets `GEMINI_API_KEY` in Vercel project settings (free tier from `aistudio.google.com/apikey`). |
| BLOCK-2 | No Google OAuth credentials → only single-user mode works. | Owner creates OAuth app at `console.cloud.google.com/apis/credentials`, sets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `ALLOW_SINGLE_USER_MODE=false`, `NEXT_PUBLIC_URL=https://mindstore.org`. |
| BLOCK-3 | `ENCRYPTION_KEY` env var is unset; encryption falls back to a hash of `DATABASE_URL`. Rotating DB password breaks all encrypted settings. | Owner sets `ENCRYPTION_KEY` to a random 32-byte string and runs the re-encryption migration once Phase 1 ships. |
| BLOCK-4 | No Vercel cron config → background jobs only run on manual invocation. | Owner approves adding `crons` to `vercel.json` (or migrating to `vercel.ts`). |
| BLOCK-5 | Multi-user vs single-user direction unclear. ARCH-1 fix depends on this. | Owner picks: (a) single-user-only, ship that and lock multi-user as future work; or (b) multi-user, schedule the `settings`-table migration in Phase 1. |
| BLOCK-6 | Untracked folder `landing page templates gitignore this/` lives in the repo root. | Owner confirms whether to `.gitignore` and keep locally, or delete entirely. |
| BLOCK-7 | `frain/improve` and `codex/local-dev` branches still receive automated commits per the cron logs. | Owner pauses or kills those agents while Claude takes over. |

---

## 9. Roadmap progress (running tally)

### Phase 0 — Truth Pass — ✅ CLOSED 2026-05-03

- [x] Five parallel audits dispatched and collated.
- [x] `CLAUDE_TAKEOVER.md` written.
- [x] `STATUS.md` written (this file).
- [x] `PRODUCTION_READINESS.md` written.
- [x] `FEATURE_BACKLOG.md` written.
- [x] README truth pass (counts fixed, roadmap partitioned, every claim preserved).
- [x] `GOVERNANCE.md` license fix.
- [x] `ARCHITECTURE.md` S3 + embedding fixes.
- [x] Replace `CLAUDE.md` and `AGENTS.md` stubs.
- [x] Move stale docs to `docs/archive/` (INNOVATIONS, NEXT_PHASE, NEXT_STEPS, MIND_FILE_SPEC, IMPROVEMENTS, codex/).
- [x] `npm install` + verify `npm test`, `npm run typecheck`, `npm run build`, `npm run lint:ci` — all green.
- [x] CI workflow updated for `claude/**` branches and Node 24 (existing `.github/workflows/ci.yml` and `dco.yml`).
- [x] Fix SEC-1 and SEC-2 (`/api/v1/settings` auth + write rate limit).
- [x] Fix SEC-3, SEC-4, SEC-5, SEC-6, SEC-7 (embed/import-url/plugin-jobs/mcp/health).
- [x] Fix the Gemini `RETRIEVAL_QUERY` embedding bug (`generateEmbeddings(texts, { mode })`).
- [x] Add 24 Phase-0 security tests under `tests/unit/security-phase0/`.

**Phase 0 acceptance gate met.** Full suite: 369/369 tests across 54 files. Typecheck + lint:ci + build all clean. Three commits on `main`: `7a55d2b`, `e18362d`, `a74742c`.

### Phase 1 — Production Hardening — IN FLIGHT

Progress (Phase 1 work that doesn't require BLOCK-1..7 to be unblocked):

- [x] ARCH-11: consolidate `apikey.ts` and `api-keys.ts` (legacy file deleted; only `api-keys.ts` is referenced). Commit `76e7495`.
- [x] ARCH-12: rename plugin port files to match registry slugs + alias map. Commit `cf85087`.
- [x] ARCH-10: deprecate `/api/v1/stats` (sunset 2026-08-01); knowledge-stats expanded; `stats-adapter` lib added. Commit `14d50fa`.
- [🟡] ARCH-13: non-breaking `npm audit fix` applied (15→7); breaking upgrades pending owner sign-off. Commit `8ee2d9d`.
- [x] ARCH-14: fetch-time DNS-resolved IP check via `safeFetch`. Commit `35cf00e`.
- [x] Page-polish sweep — empty states (17 pages). Commit `433e285`.
- [x] Page-polish sweep — inline error wrapping (16 of 16 pages). Commits `0bd693a` + `6bef21f`.
- [x] Page-polish sweep — accessibility (19 icon-only buttons across `/app/explore`, `/app/blog`, `/app/gaps` now carry `aria-label`). Commit `006780e`.
- [x] E2E test scaffold: 6 golden paths under `tests/e2e/golden-paths.spec.ts`. Commit `2e5a721`.
- [x] ADR 0003 — per-user settings table design (resolves ARCH-1 once BLOCK-5 unblocks). Commit `b06a300`.
- [x] `RUNBOOK.md`, `CHANGELOG.md`, `TESTING_STRATEGY.md`, `docs/PLUGIN_MATURITY_MATRIX.md`. Commit `34d24db`.
- [ ] Generate nav from registry (replace hand-maintained `AppShell.tsx` config).
- [ ] Add inline rate-limits to the ~40 routes that lack them (Phase 1 sub-agent dispatch when capacity returns).
- [x] WebGL fallback: `useWebGL()` hook + 2D-breakdown default on `/app/fingerprint`. `/app/mindmap` uses 2D canvas already (no WebGL). Commit `53c2299`.
- [ ] Phase 1 routes that need API-shaped tests under `tests/api/` (deliverable when Postgres test container helper lands).
- [ ] `RUNBOOK.md`, `CHANGELOG.md`, `TESTING_STRATEGY.md`, `docs/PLUGIN_MATURITY_MATRIX.md`.

**Blocked on owner action (see §8):**
- ARCH-1 (per-user settings migration) — gated on BLOCK-5 multi-user vs single-user decision.
- ARCH-2 (`ENCRYPTION_KEY` rotation tooling) — needs BLOCK-3 env var set.
- ARCH-5 (Vercel cron) — needs BLOCK-4 approval to add `crons` block.
- BLOCK-1, 2 (provider keys + OAuth) — owner-only.
- BLOCK-7 — pause the existing `Frain` cron / `codex` automated commits.

### Phase 2 — Innovation wave 1 — IN FLIGHT (5 of N landed)

- [x] A.2 Knowledge Fingerprint snapshots — `src/server/fingerprint/snapshot.ts`, two API routes, schema additions. Commit `d791c83`.
- [x] A.3 Adversarial Retrieval — `src/server/retrieval-adversarial.ts`, `/api/v1/search/adversarial`. Commit `1e9bfdf`.
- [x] A.5 Mind Diff — `src/server/mind-diff/compare.ts`, `/api/v1/mind-diff`, `/app/mind-diff` page. Commit `5102ffc`.
- [x] A.9 Knowledge Metabolism Score — first wave-1 deliverable. Commit `c0cc2b2`.
- [x] Mid-flight STATUS sweep closing ARCH-14 + A11Y + WebGL. Commit `7ab5869`.
- [ ] #1 Memory Consolidation Engine (still scaffold).
- [ ] #6 Cross-Pollination Engine (still partial).

### Phase 3 — Innovation wave 2 — STARTED

- [x] A.4 Forgetting Curve over the whole knowledge base — `src/server/forgetting/scorer.ts`, two API routes, `/app/forgetting` page. Commit `7d194d8`.
- [ ] #7 Thought Threading.
- [ ] #N5 Knowledge Genealogy.
- [ ] #N7 Memory Journals.
- [ ] #N8 Knowledge Diffusion.

### Phase 4 — Innovation wave 3 — STARTED (out-of-order, ahead of plan)

- [x] B.2 Knowledge Attack Surface — `src/server/risks/scanner.ts`, two API routes, `/app/security` page. Commit `0802dc3`.
- [x] B.9 Memory Audit Trail — `src/server/attribution/citations.ts`, provenance API route. Commit `81f0447`.
- [🟡] A.8 `.mind` Portable File — local working copy under `src/server/mind-file/{writer,reader,merger}.ts`, **untracked**. No route or page wired. Needs: API route(s), import/export UI, Vercel Blob integration decision (storage-agnostic format already chosen, so wiring is a runtime change), tests.
- [ ] #N1 Mind Marketplace.

Phases 5: see `PRODUCTION_READINESS.md`.

---

*This file is meant to be read top-to-bottom as a status briefing. Edit ruthlessly when reality changes — stale STATUS is worse than no STATUS.*
