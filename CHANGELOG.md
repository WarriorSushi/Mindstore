# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: pre-1.0, advancing on phase boundaries per `PRODUCTION_READINESS.md`.

Per-release deep dives live in [`docs/releases/`](docs/releases/). This file is the rolled-up view.

---

## [Unreleased] — Phase 1 (Production Hardening)

### Added
- `RUNBOOK.md` covering deploy, rollback, env-var rotation, DB migration, AI-provider switch, plugin disable, and incident triage.
- `CHANGELOG.md` (this file).
- `TESTING_STRATEGY.md` with the test architecture and mock policy.
- `docs/PLUGIN_MATURITY_MATRIX.md` extracted from `STATUS.md` §4.

### Security
- ARCH-13: applied non-breaking `npm audit fix` (15 → 7 advisories). The remaining 7 require breaking-change upgrades and are gated on owner sign-off.
- ARCH-14: in flight — fetch-time DNS-resolved IP check for `safeFetch` to harden against SSRF DNS-rebinding.

### Changed
- ARCH-10: in flight — `/api/v1/stats` deprecated in favor of `/api/v1/knowledge-stats`. `Deprecation` and `Sunset: 2026-08-01` HTTP headers will accompany the older endpoint until then.
- ARCH-11: in flight — legacy `src/server/apikey.ts` consolidating into `api-keys.ts`.
- ARCH-12: in flight — three plugin port files renamed to match registry slugs (`youtube-importer.ts`, `reddit-importer.ts`, `writing-analyzer.ts`); old slugs preserved as `aliases`.

---

## [0.2.0] — 2026-05-03 — Claude Takeover & Phase 0 Truth Pass

### Added
- `CLAUDE_TAKEOVER.md` — working contract (scope, constraints, commit policy).
- `STATUS.md` — live ground-truth dashboard.
- `PRODUCTION_READINESS.md` — 32-week phased plan.
- `FEATURE_BACKLOG.md` — 20-item innovation queue (10 from `INNOVATIONS.md` + 10 new).
- `docs/archive/` with `README.md` indexes preserving stale planning docs without losing history.
- 24 new unit tests under `tests/unit/security-phase0/` covering SEC-1..SEC-7 + the embedding-mode bug fix.
- `claude/**` branch trigger added to `.github/workflows/ci.yml` and `dco.yml`.
- Node 24 as the CI runtime (was 20).

### Security
- **SEC-1, SEC-2:** `/api/v1/settings` GET and POST now require `getUserId()`. POST also applies `RATE_LIMITS.write`.
- **SEC-3:** `/api/v1/embed` now requires auth + `RATE_LIMITS.standard` + Zod-validated body (`texts: string[1..50]`, each ≤ 8000 chars).
- **SEC-4:** `/api/v1/import-url` now requires auth + `RATE_LIMITS.write` + scheme/IP allow-list. Blocks RFC 1918, loopback, link-local, and IPv6 ULA/link-local ranges to prevent SSRF.
- **SEC-5:** `/api/v1/plugin-jobs/run-due` now accepts only `Authorization: Bearer <INTERNAL_JOB_TOKEN>`, a valid `api_keys` row, or the Vercel `x-vercel-cron` header.
- **SEC-6:** `/api/mcp` now requires Bearer API key. Single-user mode falls through when no bearer is present; invalid bearer is rejected. CORS now origin-echoes only when the request `Origin` is in the new `MCP_ALLOWED_ORIGINS` env-var allow-list.
- **SEC-7:** `/api/health` now returns minimal `{ status, timestamp }` only. Full diagnostics moved to `/api/v1/health` (auth-gated).

### Fixed
- Gemini embedding `taskType` mismatch: query-time embeddings now use `RETRIEVAL_QUERY` instead of `RETRIEVAL_DOCUMENT` (search relevance bug). New `generateEmbeddings(texts, { mode: 'document' | 'query' })` API; ingest paths default to `document`, search paths pass `query`.
- `src/lib/docs-manifest.ts` no longer references the archived `docs/codex/*` files; the docs-loader test passes again.

### Documentation
- README counts corrected (336→345 tests, 66→77 routes). Roadmap partitioned into Shipped / In flight / Next / Then; every existing claim preserved; 20 future innovations added.
- `GOVERNANCE.md` license claim corrected (MIT → FSL-1.1-MIT) to match `LICENSE`.
- `ARCHITECTURE.md` embedding default corrected (Gemini, not OpenAI). S3 claim replaced with the truth (DB-only today; Vercel Blob in Phase 4). Tree-layer scope clarified (no longer claiming "PageIndex-inspired reasoning" the implementation doesn't yet do).
- `CLAUDE.md` and `AGENTS.md` replaced with real agent context.
- `INNOVATIONS.md`, `MIND_FILE_SPEC.md`, `NEXT_PHASE.md`, `NEXT_STEPS.md`, `IMPROVEMENTS.md`, `docs/codex/` moved under `docs/archive/` with provenance headers.

### Audit baseline (recorded for posterity)
- 35 plugins in `PLUGIN_MANIFESTS`. All real code; zero stubs (audit confirmed). 23 PRODUCTION + 12 WORKS by maturity.
- 77 API routes under `src/app/api/`.
- 39 frontend pages, all backed by real API calls.
- 30+ Drizzle tables.
- 113 markdown docs (post-archive).
- 369 unit tests across 54 files (post-Phase-0 with new security tests).

---

## [0.1.x] — Pre-takeover (March 2026 and earlier)

The five most recent pre-takeover releases (full notes in `docs/releases/`):

- **2026-03-30 — Auth and diagnostics hardening.** `getUserId()` audit; identity-mode helpers; richer health diagnostics.
- **2026-03-30 — Chat provider unification.** Shared AI client across all chat code paths; OpenRouter/Custom support consolidated.
- **2026-03-30 — Import indexing durability.** `indexing_jobs` table + queue worker; embedding backfill survives restarts.
- **2026-03-30 — Phase 0/Phase 1 hardening.** Pre-takeover hardening pass; superseded by the 2026-05-03 `CLAUDE_TAKEOVER` charter.
- **2026-03-30 — Supabase SSL hardening.** `sslmode=require` enforced for Supabase hosts; pooler awareness; tests added.

For releases earlier than 2026-03-25, see `docs/releases/` and `docs/archive/IMPROVEMENTS_cron_log.md`.

---

## Release process

For phase boundaries (see `PRODUCTION_READINESS.md`), I cut a release with:

1. A new section in this file at the top (move "Unreleased" content into a dated version block).
2. A new `docs/releases/<YYYY-MM-DD>-<topic>.md` for each substantive change in that release.
3. A signed git tag `v<x.y.z>` on the release commit.
4. A GitHub Release pointing at the tag with the section content as the body.

Pre-1.0 versioning rule: each phase advances the minor version. Patch versions are reserved for cherry-picked fixes that ship between phases.
