# Codex Worklog

This file is the durable engineering log for Codex work in `codex/*` branches.

## Session: 2026-03-29

### 2026-03-30 03:15 IST: Auth Proxy Regression + Product Completion Program

#### Scope

- Fix the live Google sign-in regression on public deployments.
- Record the repo-level completion program so future work stays tied to product trust, not feature count.

#### Changes Completed

- Fixed `src/proxy.ts` so NextAuth form-encoded posts to `/api/auth/*` are allowed instead of being rejected with `415 Unsupported Media Type`.
- Added `tests/unit/proxy.test.ts` to lock the regression:
  - auth form posts are allowed
  - unsupported non-auth API content types are still rejected
- Added `docs/codex/PRODUCT_COMPLETION_PLAN.md` as the durable product-completion program for trunk work.

#### Why this slice matters

The login flow is the trust boundary for public deployments. Breaking it makes the rest of the multi-user work irrelevant. This also resets the repo around a concrete completion program instead of a drifting feature list.

### 2026-03-30 03:45 IST: Import and Indexing Durability

#### Scope

- Make imports tell the truth when embeddings are skipped.
- Add a durable backfill path instead of leaving large imports permanently half-indexed.
- Surface backfill state through the reindex API and operator docs.

#### Changes Completed

- Added `indexing_jobs` to the canonical schema and migration.
- Added `src/server/indexing-jobs.ts` for:
  - indexing snapshot/status
  - embedding backfill scheduling
  - batch processing
- Added `src/server/run-indexing-jobs.ts` and `npm run jobs:run-indexing`.
- Updated `src/server/import-service.ts` so plugin/capture imports queue backfill jobs when vectors are skipped.
- Updated `src/app/api/v1/import/route.ts` so the core import route also queues and reports indexing work.
- Updated `src/server/memory-ingest.ts` so single-memory creation can queue backfill when embeddings are unavailable.
- Reworked `src/app/api/v1/reindex/route.ts` to expose the latest job state and run or queue batches through the shared indexing service.
- Updated `src/app/app/settings/page.tsx` to stop infinite reindex loops when a job is blocked or fails.
- Added:
  - `tests/unit/indexing-jobs.test.ts`
  - `docs/api-reference/reindex.md`
  - `docs/releases/2026-03-30-import-indexing-durability.md`

#### Why this slice matters

The old behavior was functional for demos but misleading for real users. This slice makes indexing recoverable and visible, which is necessary before claiming imports are production-ready.

### 2026-03-30 02:25 IST: Phase 0 + Phase 1 Trust Slice

#### Scope

- Fix setup and deployment truth drift before more feature work.
- Move request-time schema creation into the canonical migration.
- Unify the shared-user identity contract so routes stop hardcoding their own defaults.
- Prepare the codebase for the new Supabase-backed production database.

#### Changes Completed

- Added `src/server/identity.ts` as the shared source of truth for:
  - default user constants
  - Google OAuth configuration checks
  - single-user fallback mode checks
- Updated `src/server/user.ts` to use that shared identity contract.
- Updated `src/server/auth.ts` so providers are conditional instead of assuming Google env vars are always present.
- Moved the following runtime-created tables into `src/server/migrate.ts`:
  - `search_history`
  - `chat_conversations`
  - `memory_reviews`
  - `tags`
  - `memory_tags`
  - `notifications`
  - `image_analyses`
- Added matching schema definitions to `src/server/schema.ts` for the missing runtime tables.
- Removed request-time table bootstrap logic from:
  - `src/app/api/v1/search/history/route.ts`
  - `src/app/api/v1/chat/history/route.ts`
  - `src/app/api/v1/review/route.ts`
  - `src/app/api/v1/tags/route.ts`
  - `src/app/api/v1/notifications/route.ts`
  - `src/server/plugins/ports/image-to-memory.ts`
- Fixed the notifications user mismatch by replacing the `...0001` hardcoded default with request-scoped `getUserId()`.
- Updated `src/server/notifications.ts` so server-side notifications can be user-scoped instead of assuming one global user.
- Added Supabase transaction-pooler compatibility in:
  - `src/server/postgres-client.ts`
  - `src/server/db.ts`
  - `src/server/migrate.ts`
  This disables prepared statements automatically for Supabase pooler URLs.
- Fixed setup/deployment truth in:
  - `README.md`
  - `.env.example`
  - `docs/getting-started/quickstart.md`
  - `docs/getting-started/index.md`
  - `docs/deploy/index.md`
  - `docs/deploy/deployment-modes.md`
- Added operator checklists:
  - `docs/getting-started/first-run-checklist.md`
  - `docs/deploy/checklist.md`
- Added release note `docs/releases/2026-03-30-phase0-phase1-hardening.md`.

#### Verification

- `npm run typecheck`
- `npm run test`
- `npm run lint:ci`
- `npm run build`
- `npm run test:e2e`

### 2026-03-30: Auth + Diagnostics Hardening

#### Scope

Follow-up to the trust slice. Convert the app from “auth exists somewhere in the backend” to “public deployments have an explicit login boundary”, and expose safe runtime diagnostics so Supabase/Vercel issues can be diagnosed without reading source.

#### Changes Completed

- Moved the large client-only `/app` shell into `src/components/AppShell.tsx`
- Added a server `src/app/app/layout.tsx` wrapper that:
  - allows private single-user installs to keep working
  - redirects unauthenticated public users to `/login`
  - shows a configuration redirect when single-user fallback is disabled but OAuth is still missing
- Added `src/app/login/page.tsx` and `src/components/LoginButton.tsx`
- Changed NextAuth sign-in page from `/app` to `/login`
- Added sanitized DB connection diagnostics to `/api/health`, `/api/v1/health`, and `/api/v1/settings`
- Updated Settings UI to show current identity mode
- Updated landing/README/docs copy to stop implying that public no-auth mode is acceptable

#### Why this slice matters

This is the first product-level enforcement of multi-user boundaries. Public deployments now have a real path toward “each user gets their own workspace” rather than relying on hidden assumptions.

### 2026-03-30: Chat Provider Unification

#### Scope

Remove the split-brain provider logic between `/api/v1/chat` and `src/server/ai-client.ts`.

#### Changes Completed

- Added encrypted-setting decoding to the shared AI client
- Added shared streaming helpers for OpenAI-compatible providers, Gemini, and Ollama
- Refactored `/api/v1/chat` to use `getStreamingTextGenerationConfig()` and `streamTextGeneration()`
- Added unit coverage for:
  - encrypted setting decoding
  - request-scoped model overrides

#### Why this slice matters

Chat is part of the core product loop. It should not carry a separate provider-selection and decryption stack from the plugins. This slice makes provider fixes apply to both chat and plugin features at once.

### 2026-03-30: Supabase SSL Hardening

#### Scope

Remove the remaining production footgun around Supabase connection strings on Vercel.

#### Changes Completed

- Auto-force SSL for Supabase pooler and direct hosts in `src/server/postgres-client.ts`
- Kept prepared statements disabled for Supabase transaction poolers
- Added unit coverage for:
  - pooler detection
  - forced SSL
  - diagnostics output
- Verified locally against the real project’s pooler URL shape **without** `sslmode=require`

#### Why this slice matters

The live health route showed that production had the correct Supabase pooler host but `sslRequired=false`. That meant the environment variable format, not the database itself, was the blocker. This change makes MindStore tolerant of that common Vercel/Supabase misconfiguration.

All of the above passed on the topic branch.

#### Production / Infra Outcome

- Ran `npm run migrate` successfully against the Supabase database configured for the deployment.
- The hosted database now has the new tables and indexes before the next app deploy uses them.

#### Decisions

- Public deployments must be documented as unsafe unless real auth is configured and single-user fallback is disabled.
- Pooler compatibility is a production requirement, not a deployment note, so it belongs in the DB client code.
- This slice intentionally favors trust and structural correctness over shipping new feature surfaces.

### 2026-03-29 22:05 IST: Search and Retrieval Stabilization Slice

#### Scope

- Take the next trunk-only stabilization batch from `main`.
- Clean up the search/discovery API path and the shared retrieval engine.
- Ratchet `lint:ci` forward to include the stabilized search slice.

#### Changes Completed

- Typed and cleaned the search endpoints:
  - `src/app/api/v1/search/route.ts`
  - `src/app/api/v1/search/fuzzy/route.ts`
  - `src/app/api/v1/search/history/route.ts`
  - `src/app/api/v1/search/suggestions/route.ts`
- Removed broad `any` casts in `src/server/retrieval.ts` and replaced them with narrow row/result types for BM25, vector, and tree retrieval.
- Added safer local parsing helpers for numeric result fields and stored embeddings.
- Removed stale unused imports and request/error variables in the search slice.
- Expanded `npm run lint:ci` in `package.json` so it now includes the stabilized search/retrieval files in addition to the earlier docs/UI slice.

#### Verification

- `npm run lint:ci`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e`

All of the above passed on the topic branch before merge.

### 2026-03-29 20:40 IST: Trunk Takeover + Mirror Branch Rules

#### Scope

- Turn the earlier codex/frain convergence plan into a trunk-based branch program.
- Clean up the docs loader so Turbopack stops tracing the whole repository during docs builds.
- Start a controlled lint-hardening slice for the recently drifting UI/search surfaces before more feature work resumes.

#### Changes Completed

- Rewrote `docs/codex/CONVERGENCE_PROGRAM.md` so it now reflects the real branch strategy:
  - `main` is trunk
  - `codex/local-dev` and `frain/improve` are mirrors
  - new work must land on short-lived topic branches from `main`
- Updated `CONTRIBUTING.md` to describe the same trunk-based workflow for contributors.
- Replaced the recursive docs filesystem walk with a checked-in `src/lib/docs-manifest.ts` and static slug generation in `src/app/docs/[...slug]/page.tsx`.
- Changed `src/lib/docs.ts` to use the manifest as the source of truth for doc discovery and root-slug resolution.
- Began the first controlled lint-hardening slice on the recent drift surfaces:
  - `src/app/app/explore/page.tsx`
  - `src/app/app/duplicates/page.tsx`
  - `src/app/app/collections/page.tsx`
  - `src/app/app/languages/page.tsx`
  - `src/app/app/paths/page.tsx`
  - `src/app/app/writing/page.tsx`
  - `src/components/EmptyFeatureState.tsx`
  - `src/components/SearchResultCard.tsx`
- Removed several stale unused imports/state holders and replaced a set of `any`-typed request/response shapes with explicit local types in the drift slice.
- Split linting into two explicit tracks in `package.json`:
  - `npm run lint:ci` for the stabilized controlled slice
  - `npm run lint:backlog` for the broader repo-wide debt queue

#### Verification

- `npm run build`
- `npm run typecheck`
- `npm run lint:ci`
- `npm run test`
- `npm run test:e2e`

All of the above passed after the docs manifest/root-slug fix landed.

#### Decisions

- The public branch problem is now operational, not architectural: mirrors must track trunk exactly.
- Controlled lint ratchets are more valuable than attempting a repo-wide lint cleanup in one pass.
- The docs-loader warning should be solved by reducing dynamic filesystem discovery, not by suppressing the warning in config.

#### Branch Sync Outcome

- Verified topic-branch preview for commit `03432cb` via the GitHub `Vercel` commit status.
- Fast-forwarded local `main` from `origin/main`, then fast-forwarded `main` to the verified topic-branch commit.
- Pushed the same commit to:
  - `origin/main`
  - `origin/codex/local-dev`
  - `origin/frain/improve`
- Confirmed all three public refs now resolve to `03432cb55e47d427a103986e3c6bcf40896422a6`.
- Deleted the short-lived `codex/trunk-takeover` branch after merge to keep the trunk workflow clean.

### 2026-03-29 14:45 UTC: Production Hotfix + Codex Resync

#### Scope

- Repair the `main` deployment failure on Vercel.
- Bring `codex/local-dev` back onto the real mainline after it fell behind the public `main` branch.
- Remove the highest-signal Next 16 build warnings on the converged codex branch.

#### Changes Completed

- Fixed the production build blocker on `main`:
  - restored the missing `EmptyFeatureState` import on `src/app/app/duplicates/page.tsx`
  - repaired partially landed Explore UI by adding:
    - `src/components/SavedSearchPills.tsx`
    - `src/components/SearchStats.tsx`
    - `src/components/DidYouMean.tsx`
    - `src/components/SearchResultCard.tsx`
  - removed dangling references in `src/app/app/explore/page.tsx` to unshipped autocomplete and advanced-filter surfaces

- Merged the hotfix to `main` and verified Vercel production recovered successfully.

- Fast-forwarded `codex/local-dev` from stale commit `54bce70` to current `main`, making codex inherit the entire public mainline again.

- Cleaned up two Next 16 warnings on codex:
  - renamed `src/middleware.ts` to `src/proxy.ts` and updated the exported function from `middleware` to `proxy`
  - removed the custom `/_next/static/:path*` cache-control override from `next.config.ts`

- Tightened docs filesystem scoping in `src/lib/docs.ts` to a statically scoped `docs/` root. The Turbopack NFT warning still remains, but it is now explicitly documented as non-blocking.

#### Verification

- `npx tsc --noEmit`
- `npm run build`
- Vercel production deployment for `main` reached `READY`

#### Convergence Status

- `main` is now the public source of truth.
- `codex/local-dev` has been fast-forwarded onto `main`.
- The public `origin/frain/improve` ref is still behind the effective product state visible on `main`.
- Going forward, codex should branch from current `main`, and frain should pull from `main` instead of continuing from the older public ref.

## Session: 2026-03-26

### 2026-03-26 05:30 UTC: Shared Utility Test Coverage + Gap Audit (Frain)

#### Scope

Audit full project for test and doc coverage gaps, then close them. All 35 plugin ports were already complete with tests and docs, but shared utility modules (`plugin-config.ts` and `shared-vectors.ts`) were untested and undocumented.

#### Changes Completed

- **plugin-config.ts** — Added `tests/unit/plugin-config.test.ts` (12 tests):
  - `createPluginScopedId`: prefix, uniqueness, segment structure
  - `stripMarkdownFence`: json fences, plain fences, passthrough, whitespace, empty blocks
  - `parseJsonValue`: plain JSON, fenced JSON, nested objects, error cases

- **shared-vectors.ts** — Added `tests/unit/shared-vectors.test.ts` (25 tests):
  - `parseEmbedding`: falsy input, numeric arrays, mixed arrays, string parsing, malformed strings, non-array objects
  - `cosineSimilarity`: identical, orthogonal, opposite, empty, mismatched, non-unit vectors
  - `kMeansClustering`: empty input, k >= items, cluster assignment completeness
  - `computeCoherence`: single member, similar items
  - `extractKeywords`: frequency, stop word filtering, empty content
  - `extractTopicLabel`: dominant source, keyword fallback, empty fallback
  - `countSourceTypes`: frequency counting, empty input

- Added docs: `docs/plugins/plugin-config.md` and `docs/plugins/shared-vectors.md`
- Updated porting guide: 299 → 336 tests, 42 → 44 test files

#### Quality

- **Tests:** 44 files, 336 tests, all passing
- **TypeScript:** Clean `tsc --noEmit`
- **Color violations:** Zero (matches in test assertions/comments only — checking for absence)
- **Lint:** New files clean (existing codebase has 216 pre-existing lint issues, not in scope)

#### Gap Audit Results

- ✅ Every port module has a matching test file
- ✅ Every port module has a matching doc file
- ✅ Shared utilities now covered
- ✅ Zero TODO/FIXME/HACK markers in code (one `[TODO: ...]` in resume-builder is an AI prompt instruction, not a code TODO)
- ✅ Routes range 20-157 lines, all thin wrappers

#### What's Left (Not Porting)

The porting mission is complete. Remaining codex/local-dev work is convergence, not porting:
1. UI page reconciliation (38 pages differ in content/styling)
2. Root-level doc merge (README, CONTRIBUTING, config files)
3. Lint cleanup (216 pre-existing issues across codebase)
4. frain/improve has 94 commits not on codex (mostly UI polish: animations, error states, PWA icons, page titles, route slimming)

### 2026-03-26 04:00 UTC: Test Coverage Expansion — obsidian-importer & mind-map-generator (Frain)

#### Scope

Expand unit test coverage for the two thinnest test files in the project. Both had only 3 tests each despite having rich pure-function surfaces.

#### Changes Completed

**obsidian-importer: 3 → 24 tests**
- parseFrontmatter: string/boolean/number/array YAML values, empty frontmatter, multi-line dash arrays
- extractWikilinks: aliased links, image embed exclusion, deduplication
- extractInlineTags: inline tags, digit-starting non-tags
- extractHeadings: levels and positions, empty content
- parseNote: full parsing, name/folder derivation, no-frontmatter, tag dedup, word count
- stripVaultRoot: common prefix stripping, mixed-root no-op
- analyzeVault: links/backlinks/orphans, alias resolution, date range computation
- formatNoteContent: metadata formatting, wikilink resolution
- chunkNote: single chunk for short notes, splitting for long content
- buildObsidianPreview: graph stats and sample notes

**mind-map-generator: 3 → 10 tests**
- Empty set, deterministic clustering, similarity grouping
- maxTopics cap (20), maxDepth cap (4)
- Connection validation (source/target format, strength range)
- Source type tracking per topic
- Sub-topic creation for large clusters
- Pinned status preservation in simplified memories

#### Quality

- All 254 tests pass (up from 225)
- Zero TypeScript errors
- Zero color violations

### 2026-03-26 03:00 UTC: Final Route Slimming — 35/35 Routes DB-Free (Frain)

#### Scope

Deep-slim the last 2 routes that still had inline DB access: image-to-memory and obsidian-importer.

#### Changes Completed

**image-to-memory route (156L → 137L):**
- Replaced inline `ensureInstalled()` (raw SQL + registry import) with shared `ensurePluginInstalled()` via new `ensureInstalled()` export in port module
- Removed `db`, `sql`, and `PLUGIN_MANIFESTS` imports from route
- Route now imports only from its port module + Next.js + user utils

**obsidian-importer route (185L → 66L, 64% reduction):**
- Extracted `extractNotesFromZip()` — ZIP parsing, note filtering, vault root stripping
- Extracted `importVault()` — full orchestration: chunking, batch embeddings, memory insertion, connection creation, tree index rebuild
- Extracted `createWikilinkConnections()` — wikilink-based connection graph builder
- Route is now a pure thin wrapper: validate file → extract → analyze → preview or import

#### Quality

- **TypeScript:** Clean (zero errors)
- **Tests:** 42 files, 225 tests, all passing
- **Route audit:** **35/35 routes are now DB-free thin wrappers** — zero routes import `db`, `drizzle-orm`, or `registry` directly
- **Color violations:** Zero

#### Milestone

This completes the route slimming campaign. Every plugin route in the codebase follows the gold-standard pattern: import only from port module, handle HTTP marshalling only, delegate all business logic/DB/config to `src/server/plugins/ports/`.

### 2026-03-26 02:00 UTC: Deep Route Slimming — image-to-memory, custom-rag, multi-language (Frain)

#### Scope

Post-completion polish. All plugin ports were done, but three routes still had substantial
inline DB operations and orchestration logic. Extracted everything into port modules so
routes are truly thin wrappers (validate → call port → return JSON).

#### Changes

- **image-to-memory** (205L → 156L route): Moved `listImages`, `getImageStats`,
  `storeAnalysis`, `saveImageAsMemory`, `reanalyzeImage`, `deleteImage`,
  `updateImageTitle` into port. Port grew 284L → 465L.
- **custom-rag** (187L → 157L route): Moved `getRAGConfig`, `saveRAGConfig`,
  `getRAGStats` into port. Port grew 453L → 507L.
- **multi-language** (200L → 139L route): Moved `getLanguageStats`,
  `tagMemoryLanguage`, `batchTagLanguages`, `crossLanguageSearch`,
  `translateMemory`, `saveLanguageConfig` into port. Port grew 240L → 422L.

#### Quality

- TypeScript: zero errors
- Tests: 42 files, 225 tests, all passing
- Color violations: zero

### Branch

- `codex/local-dev`

### Route Slimming: domain-embeddings, notion-sync, spotify-importer

#### Scope

- Continue slimming the fattest remaining routes by extracting inline DB logic and document-building into port modules.

#### Changes Completed

- **domain-embeddings route**: 249 → 129 lines (48% reduction)
  - Extracted `ensureInstalled()`, `getProviderAvailability()`, `getPluginConfig()`, `saveDomainConfig()`, `getDomainStats()`, `tagMemoryDomain()`, `batchDetectDomains()` into `ports/domain-embeddings.ts`
  - Port grew from ~300 → 475 lines, now contains all business + DB logic
  - Route is a pure HTTP dispatcher

- **notion-sync route**: 244 → 202 lines (17% reduction)
  - Replaced inline batch push loop + filter with port's existing `pushBatch()` and `filterUnsyncedMemories()` helpers
  - Extracted `loadUserMemories()` helper to reduce duplication between preview and sync actions

- **spotify-importer route**: 214 → 153 lines (28% reduction)
  - Extracted `buildImportDocuments()` into port — taste profile, artist summaries, monthly listening document construction moved out of the route

#### Quality Metrics

- **TypeScript:** Clean `tsc --noEmit`
- **Tests:** 42 files, 225 tests, all passing
- **Build:** `next build` clean, all pages render
- **Color violations:** Zero
- **Net:** 295 insertions, 278 deletions across 5 files

#### Route Fat Ranking (current)

Top remaining routes (for future slimming reference):
1. readwise-importer: 217 lines
2. image-to-memory: 205 lines
3. notion-sync: 202 lines
4. multi-language: 200 lines
5. obsidian-sync: 199 lines

All routes ≤217 lines. No route exceeds 250 anymore (was domain-embeddings at 249).

#### Convergence Status

The route slimming phase is reaching diminishing returns — the remaining routes are in the 150–217 range, which is within acceptable "thin wrapper" territory. The next convergence focus should shift to either:
1. **UI page reconciliation** (38 pages still diverge in content/styling)
2. **Root-level doc merge** (README, CONTRIBUTING, config files)

### Branch

- `codex/local-dev`

### Convergence: Color Violations + AI Client Migration

#### Scope

- Eliminate last color violations (violet/purple/fuchsia) across codebase
- Migrate routes with inline AI provider logic to shared ai-client.ts

#### Changes Completed

- Fixed `#7c3aed` (violet) in `layout.tsx` theme-color → `#14b8a6` (teal)
- Added apple-touch-icon link to layout head (parity with frain/improve)
- Replaced violet/fuchsia gradient in `opengraph-image.tsx` with teal/sky
- Replaced `#8b5cf6` in fingerprint chart colors with sky `#0ea5e9`
- **custom-rag route**: Removed 40-line inline AI provider (3 separate fetch calls to OpenAI/Gemini/OpenRouter), replaced with `getTextGenerationConfig()` + `callTextPrompt()` from shared `ai-client.ts`
- **multi-language route**: Removed 20-line inline AI provider + `getAIProvider()` + `makeCallAI()`, replaced with shared ai-client
- Zero inline AI provider calls remaining in any plugin route

#### Quality Metrics

- **Color violations:** 0 (was 3)
- **Inline AI providers in routes:** 0 (was 2)
- **TypeScript:** Clean `tsc --noEmit`
- **Tests:** 42 files, 225 tests, all passing
- **Net lines removed:** ~80 (29 added, 111 removed)

#### Decisions

- image-to-memory port keeps its own vision-specific AI calls because the shared ai-client is text-only and image analysis requires multimodal API support
- The `provider` field in multi-language check response now returns `providerLabel` from the shared config instead of the old custom string

### Route Slimming: image-to-memory

#### Scope

- Slim the fattest remaining route on codex/local-dev by extracting duplicated logic into the port module.

#### Changes Completed

- Moved `getVisionConfig()`, `analyzeImage()`, `ensureImageTable()`, and `VisionConfig` type into `src/server/plugins/ports/image-to-memory.ts`.
- Rewrote `src/app/api/v1/plugins/image-to-memory/route.ts` as a thin wrapper importing from the port.
- Route: 521 → 205 lines (61% reduction, -316 lines).
- Port: 167 → 284 lines (absorbed the extracted logic).
- Net: 173 insertions, 372 deletions across the two files.

#### Quality Metrics

- **TypeScript:** Clean `tsc --noEmit`
- **Tests:** 42 files, 225 tests, all passing
- **Build:** `next build` clean
- **Color violations:** Zero

#### Convergence Status

All plugin ports remain complete. The remaining route fat spots (domain-embeddings 249, notion-sync 244, custom-rag 244) are moderate and within acceptable range — they delegate to ports but keep route-level DB wiring that's appropriate for thin wrappers. No further slimming is high-priority.

The remaining branch divergence (282 files) is infrastructure and UI styling, not plugin architecture. The plugin convergence mission is effectively done.

---

## Session: 2026-03-25

### Branch

- `codex/local-dev`

### Scope

- Preserve and carry forward the initial client-side React lint fixes.
- Establish repository trust and contributor scaffolding.
- Add a real documentation surface under `/docs`.
- Introduce a config-driven plugin runtime foundation and a sample external plugin.
- Start turning MCP discovery into a runtime-driven surface instead of a hardcoded list.
- Ship the first serious `MindStore Everywhere` capture and query surface.
- Raise the branch-specific quality bar with lint, unit tests, docs smoke tests, and typecheck.

### Changes Completed

- Fixed client-side React lint issues in:
  - `src/app/app/connect/page.tsx`
  - `src/components/KeyboardShortcuts.tsx`
  - `src/components/Onboarding.tsx`
- Added docs content structure under `docs/`.
- Added a docs web surface backed by markdown files in the repository.
- Added `mindstore.config.ts`.
- Added package scaffolding for:
  - `@mindstore/plugin-sdk`
  - `@mindstore/plugin-runtime`
  - `@mindstore/example-community-plugin`
- Added canonical plugin alias handling for legacy slugs.
- Updated plugin registry and MCP plumbing to begin using runtime-loaded plugin definitions.
- Added governance and trust files:
  - `LICENSE`
  - `SECURITY.md`
  - `CONTRIBUTING.md`
  - `CODE_OF_CONDUCT.md`
- Sanitized `PRODUCTION.md` and added credential-rotation guidance.
- Added API key generation, revocation, and bearer-token resolution for external clients.
- Added `GET` and `POST /api/v1/capture/query` plus `POST /api/v1/capture`.
- Added shared import, memory-ingest, and capture-normalization helpers so thin clients do not talk directly to import internals.
- Added API key generation, revocation, and bearer-token resolution for browser extension and external client auth.
- Added a real `MindStore Everywhere` setup section in Settings with API key management and doc links.
- Upgraded the browser extension popup with smarter source detection, richer capture modes, and lightweight query flow.
- Added manifest-driven plugin settings validation plus generated settings forms in the Plugins UI.
- Added runtime-backed plugin widgets and manual jobs, including persisted job-run summaries.
- Added a generic dashboard widget surface powered by active plugins.
- Added the first built-in runtime-backed widget for Writing Style.
- Expanded the example community plugin to demonstrate widgets and jobs alongside MCP.
- Added `tsconfig.build.json` plus `next.config.ts` build-time TypeScript routing so production checks avoid the malformed `.next/dev/types` route file generated by Next/Turbopack.
- Added plugin-aware ingestion: runtime import-tab discovery plus transform-capable `onImport` and `onCapture` hook processing.
- Upgraded the Import page to render runtime-discovered plugin importers with generic fallback panels.
- Added extension setup/package endpoints and centralized extension metadata so the browser install flow is version-aware and easier to verify.
- Upgraded the browser extension popup with a `Test connection` flow, setup diagnostics, and direct links to docs/package downloads.
- Expanded extension conversation detection to cover Gemini alongside ChatGPT, Claude, and OpenClaw.
- Reworked the Connect page to clarify browser extension setup, hosted versus local MCP auth, and remote MCP configuration patterns.
- Added a runtime requirements and provider-access model so users can see what MindStore actually requires today and what auth modes are planned next.
- Added branch roadmap documentation tying provider access, MCP modernization, runtime integration, jobs, and extension work into one sequence.
- Refactored MCP logic into a shared runtime module and added an official MCP SDK-backed server builder so the current route and future SDK path share the same definitions.
- Added persistent per-user plugin job schedules plus a due-job runner endpoint so scheduled plugin jobs can move from metadata into real automation groundwork.
- Added a CLI due-job runner (`npm run jobs:run-due`) so self-hosted cron/VPS setups can execute scheduled plugin work without waiting for a dedicated worker service.
- Upgraded the Plugins page to show scheduled job state, next-run timing, scheduled execution summaries, and one-click auto-run toggles.
- Migrated `POST` and `DELETE /api/mcp` onto the official MCP TypeScript SDK transport in JSON-response mode while preserving the simple discovery `GET`.
- Expanded docs with:
  - browser extension guide
  - capture API reference
  - extension setup API reference
  - provider access guide
  - MCP server architecture notes
  - plugin authoring and plugin runtime notes
  - plugin settings reference
  - plugin widgets and jobs reference
  - plugin job API reference
  - ingestion hook contract
  - plugin importer guide
  - MindStore Everywhere build notes
  - codex roadmap
  - release note for provider access and MCP foundation
  - deployment modes
  - MCP client setup
  - release note for capture and extension work
  - release note for plugin runtime surfaces
  - release note for plugin-aware ingestion
  - release note for extension setup and connectivity
  - release note for MCP SDK route and plugin scheduling groundwork
- Tightened settings-page typing so the codex lint ratchet stays green.
- Added unit coverage for plugin scheduling time computation.
- Added licensing clarity files (`LICENSING.md`, `TRADEMARKS.md`, `DCO.md`) plus explicit package license metadata so the repo's current legal state and contributor expectations are visible.
- Updated README, contributing guidance, and PR template to separate code license, trademark rights, and contribution-origin expectations.
- Synced `IMPROVEMENTS.md` and restored `MIND_FILE_SPEC.md` from the active `frain` line so product context docs are preserved on codex as requested.
- Added a branch convergence playbook and plugin porting guide so `frain` feature work can be adapted into the codex runtime/test/docs model instead of landing as an uncontrolled merge.
- Added DCO enforcement, governance docs, and a legal notice so the repo's licensing/contribution policy is enforceable and visible while the branches converge.

### Decisions

- Documentation is treated as product surface, not cleanup.
- Community plugins will first target safe extension surfaces: MCP, settings, widgets, panels, and jobs.
- `mindstore.config.ts` is the source of truth for deployment mode and loaded plugins.
- Canonical slugs win, but legacy aliases remain resolvable for compatibility.
- Capture clients are normalized server-side; browser extensions and future lightweight clients should stay thin.
- Backward compatibility matters for payload shapes during active parallel development, so capture routes accept both top-level and nested payload forms.
- Runtime widget and job handlers must match manifest metadata by id; invalid plugin packages fail fast instead of silently drifting.
- Import and capture hooks now support a documented transform shape: replace documents, append documents, and patch metadata across a batch.

### Risks and Follow-Ups

- The visible `origin/frain/*` refs still lag the VPS status updates.
- MCP is now more runtime-aware, but a full official SDK migration is still a follow-up.
- Browser capture now has an authenticated path, but richer extension UX, stronger hosted auth ergonomics, and more robust site adapters are still follow-up work.
- The MCP route now uses the official SDK transport for request handling, but it is still in stateless JSON-response mode rather than richer streaming/session modes.
- Next.js/Turbopack still emits a tracing warning for the docs filesystem loader in `src/lib/docs.ts`; builds succeed, but the loader should be revisited for cleaner static tracing.
- Plugin jobs now support persisted schedules and due-job execution, but they still need a long-running worker or cron-backed runner for fully automatic operation.
- Local dev route-type generation under `.next/dev/types` can still be malformed; the codex branch now routes production `build` and `typecheck` through `tsconfig.build.json` as the stable workaround.
- Many import plugins still need richer dedicated UIs or OAuth flows; runtime import tabs currently provide the shared discovery layer and fallback panel.
- The repository remains MIT today; any future move to a stronger core license still requires deliberate contributor-rights and governance handling.
- The branches still diverge heavily in implementation style; feature parity requires structured ports, not a single blind merge.
- DCO enforcement may require current contributors to update their commit habits with `Signed-off-by:` lines.
- The first `frain` feature port is now underway with Flashcard Maker; this is the new reference slice for future convergence work.
- Shared AI client extraction plus Voice-to-Memory now define the convergence pattern for media-aware AI plugins.
- Branch convergence is now tracked as a formal multi-phase program in `docs/codex/CONVERGENCE_PROGRAM.md`.
- Kindle Importer is now the codex-side importer reference port for future frain import feature convergence.
- Contradiction Finder now kicks off the codex analysis parity batch and serves as the shared-AI analysis reference port.

### Verification

- `npm run lint:ci`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e`

### 2026-03-25: Flashcard Maker Port

#### Scope

- Port the `frain` Flashcard Maker feature into the codex runtime-first branch as the first full convergence example.
- Keep the user-facing page while extracting route logic into reusable server helpers.
- Add user-owned deck persistence, unit coverage, and documentation so future ports have a concrete template.

#### Changes Completed

- Added `flashcard_decks` storage and migration coverage.
- Added `src/server/plugins/ports/flashcard-maker.ts` as the extracted port module.
- Added `GET/POST /api/v1/plugins/flashcard-maker` as a thin route wrapper around shared logic.
- Added `/app/flashcards` and surfaced it in the sidebar and command palette.
- Registered Flashcard Maker as a sidebar-visible plugin page in the plugin registry.
- Added unit coverage for SM-2 state transitions and generated-card normalization.
- Added user-facing and convergence docs for the port.

#### Decisions

- Flashcard decks are stored as user-owned application data, not embedded in plugin config blobs.
- The first convergence port should preserve a real workflow page rather than forcing everything through generic plugin panels.
- Ported feature logic should move into `src/server/plugins/ports/*` before any further runtime abstraction.

#### Risks and Follow-Ups

- The Flashcard Maker route still uses provider settings directly; a more unified model invocation layer is still a follow-up.
- E2E coverage for this slice is currently blocked by the Playwright web server timing out during local startup, even though `build`, `lint`, `typecheck`, and unit tests pass.
- Future convergence work should use Flashcard Maker as the template before porting Voice to Memory or importer-heavy slices.

#### Verification

- `npm run lint:ci`
- `npm run typecheck`
- `npm run test`

### 2026-03-25: Mind Map Generator Port

#### Scope

- Port Mind Map Generator into the codex runtime-first branch.
- Reuse the shared vector/clustering helper instead of leaving clustering logic embedded in the route.
- Keep the existing `/app/mindmap` UX while turning the backend into a real codex port module.

#### Changes Completed

- Added `src/server/plugins/ports/mind-map-generator.ts` as the extracted clustering and topology engine.
- Replaced `GET /api/v1/plugins/mind-map-generator` with a thin route wrapper.
- Added unit coverage for empty and deterministic small-memory outputs.
- Added plugin docs and a release note for the port.
- Corrected the registry page path from `map` to `mindmap` to match the actual app route.

#### Decisions

- Mind Map Generator should share vector math through `shared-vectors.ts` rather than maintaining a private copy.
- The existing frontend page was good enough to preserve; convergence work focused on the backend contract and correctness.
- The route continues to accept `maxTopics` and `maxDepth` query parameters so the current page stays compatible.

#### Risks and Follow-Ups

- The current route logic still uses k-means randomness for larger datasets, so future work may want seeded clustering for perfect reproducibility.
- The frontend remains the older richer page rather than a freshly simplified codex page, which is acceptable here but may want a visual pass later.
- Analysis parity is now effectively complete; the next major convergence batch should move into action or import features.

#### Verification

- `npm run lint:ci`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e` (currently blocked locally by Playwright `webServer` startup timeout)

### 2026-03-25: Shared AI Client and Voice-to-Memory Port

#### Scope

- Extract a shared AI client so text-generation and transcription plugins stop duplicating provider-resolution logic.
- Refactor Flashcard Maker onto the shared AI client.
- Port Voice-to-Memory from the `frain` feature line into the codex runtime-first branch.

#### Changes Completed

- Added `src/server/ai-client.ts` for shared text-generation and transcription provider resolution plus no-throw caller helpers.
- Refactored Flashcard Maker to use the shared AI client instead of an embedded provider implementation.
- Added `voice_recordings` schema and migration coverage.
- Added `src/server/plugins/ports/voice-to-memory.ts` as the extracted voice/transcription/save-to-memory port module.
- Added `GET/POST /api/v1/plugins/voice-to-memory` as the thin API wrapper.
- Added `/app/voice` and surfaced it in navigation, plugin metadata, and the command palette.
- Added unit coverage for shared AI config resolution and voice-title helpers.
- Added docs for the shared AI layer and Voice-to-Memory feature.

#### Decisions

- Shared provider-resolution belongs in `src/server/ai-client.ts`, not inside plugin routes.
- Voice recordings are stored as metadata plus transcript today; raw audio asset retention remains a follow-up.
- Voice-to-Memory should use the same `createMemory(...)` ingestion path as other app-generated memories.

#### Risks and Follow-Ups

- The new shared AI client is used by Flashcard Maker and Voice-to-Memory first; other AI-heavy routes still need migration.
- Voice-to-Memory currently supports OpenAI Whisper and Gemini transcription paths; broader provider support is still future work.
- Raw audio retention, richer playback UX, and deeper job automation are intentionally deferred to keep the first convergence port clean.

#### Verification

- `npm run lint:ci`
- `npm run typecheck`
- `npm run test`
- `npm run build`

### 2026-03-25: Writing Style Port

#### Scope

- Port the `frain` Writing Style Analyzer into the codex runtime-first branch.
- Preserve a dedicated analyzer page while moving the analysis engine into a reusable server module.
- Turn Writing Style into a real codex plugin page instead of widget-only metadata.

#### Changes Completed

- Added `src/server/plugins/ports/writing-style.ts` as the extracted writing-style analysis engine and profile builder.
- Added `GET /api/v1/plugins/writing-style` as a thin route wrapper around the shared port module.
- Added `/app/writing` with the codex-side analyzer UI for complexity, tone, phrase usage, source comparison, and style evolution.
- Updated plugin registry metadata so Writing Style now declares a page surface in addition to its dashboard widget.
- Added unit coverage for readability metrics, tone classification, syllable counting, and complexity scoring.
- Added user docs and a release note for the port.

#### Decisions

- Writing Style should be treated as an analysis-page plugin, not only a dashboard widget.
- The first codex-side page keeps the highest-signal analysis surfaces instead of copying every UI detail verbatim from the frain line.
- Pure text analysis belongs in a reusable local engine with no provider dependency.

#### Risks and Follow-Ups

- The current page is a streamlined codex version; deeper charting polish and more visual detail can still be layered on later.
- The broader analysis parity batch still needs Knowledge Gaps, Topic Evolution, Sentiment Timeline, and Mind Map Generator.
- Source labels in the page are currently raw source keys; a richer display map can improve polish later.

#### Verification

- `npm run lint:ci`
- `npm run typecheck`
- `npm run test`

### 2026-03-25: Knowledge Gaps Port

#### Scope

- Port Knowledge Gaps into the codex runtime-first branch.
- Create a codex-side shared vector/clustering helper for the rest of the analysis batch.
- Add a dedicated page, thin route, tests, and docs for the feature.

#### Changes Completed

- Added `src/server/plugins/ports/shared-vectors.ts` for embedding parsing, cosine similarity, k-means clustering, keyword extraction, and topic labeling.
- Added `src/server/plugins/ports/knowledge-gaps.ts` as the extracted Knowledge Gaps analysis module.
- Added `GET /api/v1/plugins/knowledge-gaps` as a thin route wrapper.
- Added `/app/gaps` with codex-side topic coverage, gap review, and suggestion UI.
- Updated plugin registry metadata so Knowledge Gaps now declares a page surface.
- Added unit coverage and docs for the feature.

#### Decisions

- Shared vector math now lives in one codex helper instead of being re-copied into each analysis route.
- Knowledge Gaps keeps AI suggestions optional; the core topic-gap analysis remains local and deterministic.
- The first codex page focuses on the highest-signal workflow rather than copying every frain interaction detail.

#### Risks and Follow-Ups

- The fetched `origin/frain/improve` ref still does not expose the new `ports/*` extraction that frain reported, so codex is still rebuilding some ports from visible route/page implementations.
- Topic Evolution, Sentiment Timeline, and Mind Map Generator should reuse the new shared vector helper next.
- The current page is a streamlined codex version and can still gain richer visualization over time.

#### Verification

- `npm run lint:ci`
- `npm run typecheck`
- `npm run test`

### 2026-03-25: Topic Evolution Port

#### Scope

- Port Topic Evolution into the codex runtime-first branch.
- Reuse the new shared vector/clustering helper instead of rebuilding topic math yet again.
- Add a dedicated page, thin route, tests, and docs for the feature.

#### Changes Completed

- Added `src/server/plugins/ports/topic-evolution.ts` as the extracted timeline and shift-analysis module.
- Added `GET /api/v1/plugins/topic-evolution` as a thin route wrapper.
- Added `/app/evolution` with codex-side timeline, topic summary, and shift UI.
- Added unit coverage for period construction and shift detection.
- Added plugin docs and a release note for the port.

#### Decisions

- Topic Evolution should be built directly on top of `shared-vectors.ts` instead of carrying its own copy of clustering helpers.
- The codex page focuses on the most important workflow surfaces first: trend line, topic summary, and shift interpretation.
- Topic Evolution remains a local analysis feature with no provider dependency.

#### Risks and Follow-Ups

- The current page is still a streamlined codex version rather than the richest frain visualization pass.
- Mind Map and Sentiment Timeline should now reuse the same shared vector layer next.
- The fetched `origin/frain/improve` ref is still visibly behind the VPS update stream, so codex is still reconstructing some ports from visible route/page code.

#### Verification

- `npm run lint:ci`
- `npm run typecheck`
- `npm run test`

### 2026-03-25: Sentiment Timeline Port

#### Scope

- Port Sentiment Timeline into the codex runtime-first branch.
- Preserve the dedicated analysis page while extracting the AI and lexicon logic into a reusable server module.
- Add tests, docs, and page metadata so the feature behaves like the other converged analysis tools.

#### Changes Completed

- Added `src/server/plugins/ports/sentiment-timeline.ts` as the extracted sentiment-analysis and aggregation engine.
- Added `GET /api/v1/plugins/sentiment-timeline` as a thin route wrapper.
- Added `/app/sentiment` with codex-side mood overview, heatmap, trend summary, and source breakdown UI.
- Updated plugin registry metadata and command palette navigation so Sentiment Timeline is discoverable as a real page surface.
- Added unit coverage for lexicon fallback, score classification, and aggregate builders.
- Added plugin docs and a release note for the port.

#### Decisions

- Sentiment analysis should reuse `src/server/ai-client.ts` for provider-backed runs instead of embedding provider logic again.
- A local lexicon fallback remains first-class so the feature still works without an AI provider.
- Cached metadata on memories remains the storage layer for sentiment results to keep repeated loads fast.

#### Risks and Follow-Ups

- The current page is a codex-side port and not yet the fullest visualization pass from frain's line.
- Mind Map Generator is now the last major remaining analysis-parity port in this batch.
- AI sentiment scoring is intentionally conservative and may still benefit from future prompt tuning or provider-specific evaluation.

#### Verification

- `npm run lint:ci`
- `npm run typecheck`
- `npm run test`

### 2026-03-25: Action Parity Batch

#### Scope

- Complete the codex-side action parity batch from frain.
- Port Blog Draft, Conversation Prep, Newsletter Writer, Resume Builder, and Learning Paths into codex runtime-first architecture.
- Add dedicated app pages, thin routes, tests, docs, and discoverability wiring for the full batch.

#### Changes Completed

- Added shared plugin-config helpers in `src/server/plugins/ports/plugin-config.ts` to standardize manifest-backed install/bootstrap and plugin config persistence.
- Added codex server ports for:
  - `src/server/plugins/ports/blog-draft.ts`
  - `src/server/plugins/ports/conversation-prep.ts`
  - `src/server/plugins/ports/newsletter-writer.ts`
  - `src/server/plugins/ports/resume-builder.ts`
  - `src/server/plugins/ports/learning-paths.ts`
- Added thin route wrappers for:
  - `src/app/api/v1/plugins/blog-draft/route.ts`
  - `src/app/api/v1/plugins/conversation-prep/route.ts`
  - `src/app/api/v1/plugins/newsletter-writer/route.ts`
  - `src/app/api/v1/plugins/resume-builder/route.ts`
  - `src/app/api/v1/plugins/learning-paths/route.ts`
- Added dedicated app pages for:
  - `/app/blog`
  - `/app/conversation`
  - `/app/newsletter`
  - `/app/resume`
  - `/app/paths`
- Updated plugin registry metadata, command palette entries, layout navigation, plugin docs index, and lint coverage so the new action surfaces are treated as first-class codex pages.
- Added action-plugin unit coverage in `tests/unit/action-plugins.test.ts`.

#### Decisions

- Action plugins use canonical plugin-config persistence first instead of introducing more dedicated tables in this batch.
- Shared AI provider logic stays centralized in `src/server/ai-client.ts`; action ports call it rather than duplicating provider resolution.
- Dedicated pages are intentionally functional and codex-native rather than waiting for a perfect UI-only reconciliation pass.
- Batch B is now considered complete on codex, which means future convergence should move into import, export/sync, and advanced AI parity.

#### Risks and Follow-Ups

- The new action pages are strong functional codex pages, but frain may still carry richer visual polish worth borrowing during later UX reconciliation.
- Resume export is currently markdown-only in the codex page because the current converged API does not expose PDF generation.
- `npm run test:e2e` timed out in this session; there was no compile failure, but a fresh E2E pass should still be re-run on the committed branch.
- The existing non-blocking Turbopack docs tracing warning from `src/lib/docs.ts` remains unchanged.

#### Verification

- `npm run typecheck`
- `npm run lint:ci`
- `npm run test`
- `npm run build`
- `npm run test:e2e` timed out in this session

### 2026-03-25: Import Parity Batch 1

#### Scope

- Start Batch C import parity with the importer flows already surfaced in the codex Import page.
- Move existing route-heavy importers into codex-style portable server modules.
- Preserve current preview/import contracts so the frontend does not need a rewrite.

#### Changes Completed

- Added `preChunked` support to the shared import service so smart importer chunk boundaries survive import intact.
- Added `assertPluginEnabled(...)` to `src/server/plugins/ports/plugin-config.ts` for manifest-backed importer bootstrapping.
- Added codex port modules for:
  - `src/server/plugins/ports/youtube-transcript.ts`
  - `src/server/plugins/ports/pdf-epub-parser.ts`
  - `src/server/plugins/ports/browser-bookmarks.ts`
  - `src/server/plugins/ports/reddit-saved.ts`
  - `src/server/plugins/ports/obsidian-importer.ts`
- Replaced the route-heavy importer implementations with thinner wrappers in:
  - `src/app/api/v1/plugins/youtube-transcript/route.ts`
  - `src/app/api/v1/plugins/pdf-epub-parser/route.ts`
  - `src/app/api/v1/plugins/browser-bookmarks/route.ts`
  - `src/app/api/v1/plugins/reddit-saved/route.ts`
  - `src/app/api/v1/plugins/obsidian-importer/route.ts`
- Added unit coverage for the new importer ports.
- Added plugin docs and a release note for the batch.

#### Decisions

- Import parity is starting with the built-in flows already exposed by the codex Import page because that yields the cleanest convergence with the least user disruption.
- Binary/archive parsing can stay in routes when it depends on platform libraries; the text, chunking, normalization, and preview logic still belongs in `ports/*`.
- The shared import service now supports preserved chunk boundaries because smart importer chunking is a first-class product behavior, not an implementation detail.

#### Risks and Follow-Ups

- Obsidian import still keeps route-level DB writes because connection creation needs note-to-memory mapping; a deeper codex import runtime abstraction could simplify that later.
- This batch does not yet include the remaining frain import/sync/media surfaces such as Twitter, Telegram, Pocket, Readwise, Spotify, Notion, or Image-to-Memory.
- Import Batch 2 should move next into the frain-only importer set rather than revisiting these now-converged built-ins.

### 2026-03-25: Notion Importer Port

#### Scope

- Replace the old markdown-only Notion fallback in the Import page with the richer ZIP-based importer from the convergence plan.
- Port Notion export parsing and chunking into a codex `ports/*` module.
- Keep the user workflow preview-first instead of pushing a blind import.

#### Changes Completed

- Added `src/server/plugins/ports/notion-importer.ts` as the portable Notion export parser and chunker.
- Added `src/app/api/v1/plugins/notion-importer/route.ts` as the codex route wrapper for ZIP preview/import.
- Updated `src/server/plugins/registry.ts` so Notion declares an import-tab surface with `.zip` support.
- Reworked the Notion section in `src/app/app/import/page.tsx` to use preview/import against the new route instead of the old markdown-file fallback.
- Added unit coverage for Notion title cleanup, CSV parsing, export parsing, and chunk preparation.
- Added plugin docs and a release note for the port.

#### Decisions

- Notion import belongs in Batch C because it is a major real-world knowledge source and the old codex fallback was materially behind frain.
- The Notion UI now prefers the export ZIP because that is the only way to preserve database rows cleanly.
- The Import page keeps its existing hardcoded Notion tab for now, but it now talks to the plugin route instead of bypassing the plugin architecture.

#### Risks and Follow-Ups

- The Import page itself still has a large pre-existing lint backlog, so codex kept the current branch lint ratchet scoped rather than expanding it to the full file.
- Notion Sync is still pending; this port only closes the importer side.
- Remaining Batch C work is now concentrated in Twitter, Telegram, Pocket, Readwise, Spotify, and other frain-only import/media flows.

### 2026-03-25: Batch C/D/E Completion & Convergence Audit (Frain)

#### Scope

- Complete all remaining plugin ports from frain/improve to codex/local-dev.
- Audit full convergence status after all batches are done.

#### Status: ALL PLUGIN PORTS COMPLETE

Every plugin from the convergence plan has been ported:

- **Batch C (Imports):** twitter-importer, telegram-importer, pocket-importer, readwise-importer, spotify-importer, image-to-memory — all ported with ports, routes, docs, and tests.
- **Batch D (Export/Sync):** anki-export, markdown-blog-export, notion-sync, obsidian-sync — all ported.
- **Batch E (Advanced AI):** custom-rag, domain-embeddings, multi-language — all ported.

#### Quality Metrics

- **TypeScript:** Clean `tsc --noEmit` — zero errors
- **Tests:** 42 files, 225 tests, all passing
- **Build:** `next build` succeeds, all pages render
- **Color violations:** Zero (no violet/purple/fuchsia anywhere)
- **Port coverage:** 35 port modules in `src/server/plugins/ports/`, 35 API routes, 42 plugin docs

#### What Remains for Full Branch Convergence

The plugin porting mission is done. Remaining divergence (343 files) is:
1. **UI pages** (38 app pages differ — content/styling divergence, not architecture)
2. **Root docs/meta** (README, CONTRIBUTING, LICENSE, GOVERNANCE, etc.)
3. **Config files** (package.json deps, tsconfig, vitest, playwright)
4. **Browser extension** (mindstore-everywhere — minor differences)
5. **Packages** (plugin-sdk, plugin-runtime, example-community-plugin)

None of these are plugin ports. The next convergence phase is UI page reconciliation and root-level doc merge.

### 2026-03-26: Deep Route Slimming — Batches C + D (Frain Convergence Mode)

#### Scope

Deep-slim all Batch C (Imports) and Batch D (Export/Sync) routes to match the gold standard set by kindle-importer and flashcard-maker: routes must be pure thin wrappers with zero inline DB calls, zero inline ensureInstalled, zero inline config management.

#### Changes Completed

**Batch C Imports (6 routes):**
- twitter-importer: 174L → 59L (66% reduction) — extracted ensureInstalled, getTwitterConfig, getTwitterStats, importArchive, importManual
- telegram-importer: 157L → 56L (64% reduction) — extracted ensureInstalled, getTelegramConfig, getTelegramStats, runImport
- pocket-importer: 167L → 52L (69% reduction) — extracted ensureInstalled, getPocketConfig, getPocketStats, runImport
- readwise-importer: 217L → 58L (73% reduction) — extracted ensureInstalled, getReadwiseConfig, getReadwiseStats, saveToken, runImport; migrated to shared getPluginConfig/savePluginConfig
- spotify-importer: 153L → 50L (67% reduction) — extracted ensureInstalled, getSpotifyConfig, getSpotifyStats, runImport
- anki-export: 180L → 131L (27% reduction) — extracted ensureInstalled, getDecks, getMemoryCount

**Batch D Exports/Syncs (3 routes):**
- markdown-blog-export: 198L → 122L (38% reduction) — extracted ensureInstalled, fetchMemories, getSourceStats
- notion-sync: 202L → 155L (23% reduction) — extracted ensureInstalled, getNotionConfig, saveNotionConfig, loadUserMemories
- obsidian-sync: 199L → 129L (35% reduction) — extracted ensureInstalled, getObsidianConfig, saveObsidianConfig, loadMemories, loadConnections

#### Key Pattern

All routes now follow the same thin-wrapper pattern:
1. Import only from their port module (zero db/drizzle/registry imports)
2. Call ensureInstalled() which delegates to shared ensurePluginInstalled()
3. Call port functions for all business logic, config management, stats
4. Only handle HTTP request/response marshalling

All 9 routes now use the shared `plugin-config.ts` utilities (ensurePluginInstalled, getPluginConfig, savePluginConfig) instead of inline DB boilerplate.

#### Quality

- TypeScript: Clean (zero errors)
- Tests: 76 tests across 9 files, all passing
- Route audit: 33/35 routes are now DB-free thin wrappers
- Only 2 routes remain with inline DB: image-to-memory, obsidian-importer (both from earlier batches, low priority)

### 2026-03-26: PWA Polish + Convergence Audit (Frain Convergence Mode)

#### Scope

Post-plugin-port quality pass: fix remaining color violations, add PWA assets, add developer convenience (barrel export), and audit full convergence state.

#### Changes Completed

- **PWA Icons**: Ported apple-touch-icon (180px), icon-192, icon-512 from frain/improve
- **Manifest fix**: Changed theme_color from violet (#7c3aed) to teal (#14b8a6) — was the last hardcoded color violation
- **Favicon fix**: Gradient changed from violet/fuchsia to teal/sky (matching frain/improve)
- **robots.ts**: Added SEO robots file (disallow /api/, allow rest)
- **Barrel export**: Added `src/server/plugins/ports/index.ts` — all 35 ports with namespaced exports to avoid collision (ensureInstalled, runImport, etc.)

#### Convergence Audit Findings

All 35/35 plugin ports: ✅ Complete
All 35/35 routes: ✅ DB-free thin wrappers
TypeScript: ✅ Zero errors
Tests: ✅ 44 files, 336 tests passing
Color violations: ✅ Zero (manifest + favicon were the last ones)
Build: ✅ Clean

#### Remaining Branch Divergence (304 files)

The divergence is NOT plugin-related. It breaks down as:

1. **Routes differ in implementation** (35 files) — frain routes are fatter (inline DB, AI config), codex routes are slimmer (delegated to ports). Codex is architecturally ahead.
2. **Schema divergence** — frain has tags system + notifications + apiKeys tables; codex has pluginJobSchedules + flashcardDecks + voiceRecordings + imageAnalyses. Reconciliation needs a migration plan.
3. **Root docs/meta** (~20 files) — codex has CONTRIBUTING, GOVERNANCE, LICENSE, SECURITY, DCO, etc. that frain doesn't.
4. **CI/GitHub config** (~10 files) — codex has workflows, issue templates, PR templates.
5. **Config** — package.json deps differ (codex has more test/build deps), tsconfig differs slightly.
6. **UI pages** — content/styling differences in ~5 app pages (not architecture).

#### Next Convergence Phase

The next high-value work is **schema reconciliation** — merging frain's tags/notifications with codex's plugin infrastructure tables. This requires a careful migration plan to avoid data loss on either branch.
