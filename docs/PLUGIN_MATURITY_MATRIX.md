# Plugin Maturity Matrix

**Source of truth:** `STATUS.md` §4. This file is a longer narrative companion that surfaces the same data with implementation notes per plugin. When the two disagree, `STATUS.md` wins; update both.

**Maturity scale:**

- **PRODUCTION** — full implementation, test coverage ≥ 8 cases, zero known correctness gaps.
- **WORKS** — full implementation, lighter test coverage (2–3 cases), works in production but needs more edge-case tests before we'd label it bulletproof.
- **PARTIAL / STUB / BROKEN** — none currently. Audited 2026-05-03; all 35 plugins land at PRODUCTION or WORKS.

---

## Quick stats (2026-05-03)

| Bucket | Count |
|---|---|
| **PRODUCTION** | 23 |
| **WORKS** | 12 |
| **PARTIAL** | 0 |
| **STUB** | 0 |
| **BROKEN** | 0 |
| Total | **35** |

Total port-file lines of code: ~14,091. The largest single port is `writing-style.ts` at 848 LOC.

---

## Import (12 plugins)

These all integrate through `/app/import/page.tsx`. Each parses an external format and writes `memories` rows.

| Slug | Port file | LOC | Tests | Maturity | Implementation notes |
|---|---|---|---|---|---|
| `kindle-importer` | `kindle-importer.ts` | 402 | 3 | WORKS | Parses Kindle "My Clippings.txt", deduplicates by location marker, groups by book. |
| `pdf-epub-parser` | `pdf-epub-parser.ts` | 407 | 3 | WORKS | Chapter detection via heading heuristics; section-aware chunking. EPUB via `epub2`, PDF via `pdf-parse`. |
| `youtube-importer` | `youtube-transcript.ts` *(rename pending — see ARCH-12)* | 415 | 3 | WORKS | Video-ID extraction from common URL formats; transcript via `youtube-transcript`; chunked by minute. |
| `browser-bookmarks` | `browser-bookmarks.ts` | 264 | 3 | WORKS | HTML bookmark tree (Chrome/Firefox/Safari export). Optional full-text fetch behind a setting. |
| `obsidian-importer` | `obsidian-importer.ts` | 571 | 24 | PRODUCTION | Highest test count in the project. Reads ZIP'd vault; YAML frontmatter; wikilink graph; tag extraction. |
| `notion-importer` | `notion-importer.ts` | 318 | 3 | WORKS | ZIP parsing; CSV database support; property extraction. |
| `reddit-importer` | `reddit-saved.ts` *(rename pending — see ARCH-12)* | 419 | 3 | WORKS | CSV/JSON Reddit export; differentiates posts vs comments. |
| `twitter-importer` | `twitter-importer.ts` | 328 | 16 | PRODUCTION | Twitter archive (`bookmarks.js`, `tweets.js`). |
| `telegram-importer` | `telegram-importer.ts` | 341 | 6 | PRODUCTION | Telegram JSON export; message grouping by author + thread. |
| `pocket-importer` | `pocket-importer.ts` | 259 | 17 | PRODUCTION | Pocket HTML + Instapaper CSV. |
| `readwise-importer` | `readwise-importer.ts` | 338 | 14 | PRODUCTION | Readwise API; pagination; highlight grouping; dedup keys. |
| `spotify-importer` | `spotify-importer.ts` | 343 | 14 | PRODUCTION | Streaming history JSON; music-taste profile. |

**WORKS → PRODUCTION upgrade backlog (Phase 1):** add malformed-file, dedup-validation, location-parsing tests for `kindle-importer`; section + Unicode tests for `pdf-epub-parser`; URL-format and metadata-fallback tests for `youtube-importer`; folder-hierarchy and invalid-URL tests for `browser-bookmarks`; CSV edge cases for `reddit-importer` and `notion-importer`.

---

## Analysis (6 plugins)

Higher-level reasoning over the user's memories. Most run as background or on-demand jobs.

| Slug | Port file | LOC | Tests | Maturity | Implementation notes |
|---|---|---|---|---|---|
| `mind-map-generator` | `mind-map-generator.ts` | 275 | varies | PRODUCTION | Topic network from memories; reagraph rendering. |
| `knowledge-gaps` | `knowledge-gaps.ts` | 431 | 3 | WORKS | Gap identification + recommendations from sparse-cluster detection. |
| `contradiction-finder` | `contradiction-finder.ts` | 441 | 2 | WORKS | 17 contradiction signal pairs (e.g., always↔never, love↔hate); LLM verification in batches of 5. **No UI page by design** — runs as a background scan and writes the `contradictions` table consumed by `/app/insights`. |
| `topic-evolution` | `topic-evolution.ts` | 460 | 2 | WORKS | Timeline of topic peaks/troughs over weeks/months. Foundation for innovation A.5 (Mind Diff). |
| `writing-analyzer` | `writing-style.ts` *(rename pending — see ARCH-12)* | 848 | varies | PRODUCTION | The largest port file. Hedging-pattern detection, confidence/assertiveness scoring, vocabulary richness, tone classification. |
| `sentiment-timeline` | `sentiment-timeline.ts` | 637 | 3 | WORKS | Emotional-arc tracking across memories over time. |

---

## Action (6 plugins)

Generate user-visible artifacts (cards, drafts, paths) from the user's memories.

| Slug | Port file | LOC | Tests | Maturity | Implementation notes |
|---|---|---|---|---|---|
| `blog-draft` | `blog-draft.ts` | 404 | varies | PRODUCTION | LLM-driven blog generation grounded in selected memories. |
| `flashcard-maker` | `flashcard-maker.ts` | 538 | 3 | PRODUCTION | Real SM-2 spaced repetition (`easeFactor`, `interval`, `repetitions`, `nextReview`). Foundation for innovation A.4 (Forgetting Curve). |
| `newsletter-writer` | `newsletter-writer.ts` | 441 | varies | PRODUCTION | Weekly digest curation. |
| `resume-builder` | `resume-builder.ts` | 450 | varies | PRODUCTION | Templates + AI generation + iterative refine. |
| `conversation-prep` | `conversation-prep.ts` | 293 | varies | PRODUCTION | Meeting briefings from memories tagged to a counterparty. |
| `learning-paths` | `learning-paths.ts` | 381 | varies | PRODUCTION | Personalized learning sequences. Foundation for innovation B.4 (Mind Scheduler). |

---

## Export / Sync (4 plugins)

| Slug | Port file | LOC | Tests | Maturity | Implementation notes |
|---|---|---|---|---|---|
| `obsidian-sync` | `obsidian-sync.ts` | 384 | 17 | PRODUCTION | Two-way sync; markdown + frontmatter + backlinks. |
| `notion-sync` | `notion-sync.ts` | 424 | varies | PRODUCTION | Push to Notion database; structured properties. |
| `anki-export` | `anki-export.ts` | 334 | 16 | PRODUCTION | APKG deck export with SM-2 metadata preserved. |
| `markdown-blog-export` | `markdown-blog-export.ts` | 274 | 15 | PRODUCTION | Hugo / Jekyll / Astro–compatible markdown bundles. |

---

## Capture (2 plugins)

User-input capture beyond text.

| Slug | Port file | LOC | Tests | Maturity | Implementation notes |
|---|---|---|---|---|---|
| `voice-to-memory` | `voice-to-memory.ts` | 380 | 3 | PRODUCTION | Whisper / Gemini transcription; saves audio + transcript. Foundation for innovation B.7 (Memory Journals). |
| `image-to-memory` | `image-to-memory.ts` | 446 | varies | PRODUCTION | Vision-AI description; tag extraction; titles. Multipart upload, 20MB limit. |

⚠️ Today both store payloads as base64 in DB — `media` table exists but no Blob upload pipeline. Phase 4 wires Vercel Blob; tracked as ARCH-6 in STATUS.md.

---

## AI enhancement (5 plugins)

Cross-cutting capabilities used by other plugins and the core retrieval/chat surfaces.

| Slug | Port file | LOC | Tests | Maturity | Implementation notes |
|---|---|---|---|---|---|
| `multi-language` | `multi-language.ts` | 422 | 19 | PRODUCTION | Cross-language semantic search; 19 tests (highest among AI plugins). |
| `custom-rag` | `custom-rag.ts` | 507 | varies | PRODUCTION | HyDE, reranking, contextual compression, parent-child chunking, maximal marginal relevance. The "advanced retrieval" knobs live here, not in the core search route. |
| `domain-embeddings` | `domain-embeddings.ts` | 475 | 14 | PRODUCTION | Specialized embedding selection per domain (medical, legal, code, financial). |
| `community-hello` | `packages/example-community-plugin/src/index.ts` | — | — | PRODUCTION | Reference external plugin; demonstrates the `definePlugin` SDK contract for community contributors. |

---

## Slug mismatches (ARCH-12, Phase 1)

Three plugins have a registry slug that doesn't match the port file or the API route. They work today but are a maintenance hazard. Phase 1 fixes them via file rename + alias map (preserving the existing API URLs).

| Registry slug | Current port file | Current API route | After Phase 1 |
|---|---|---|---|
| `youtube-importer` | `youtube-transcript.ts` | `/api/v1/plugins/youtube-transcript/` | File renamed to `youtube-importer.ts`; route URL preserved; alias `youtube-transcript` registered. |
| `reddit-importer` | `reddit-saved.ts` | `/api/v1/plugins/reddit-saved/` | File renamed to `reddit-importer.ts`; route URL preserved; alias `reddit-saved` registered. |
| `writing-analyzer` | `writing-style.ts` | `/api/v1/plugins/writing-style/` | File renamed to `writing-analyzer.ts`; route URL preserved; alias `writing-style` registered. |

---

## How a plugin gets to PRODUCTION

1. Manifest in `src/server/plugins/registry.ts` with all required fields per the SDK.
2. Port file in `src/server/plugins/ports/<slug>.ts` — real logic, no TODOs in the happy path.
3. API route(s) under `src/app/api/v1/plugins/<slug>/` (or under another path for shared utilities) wired to the port.
4. UI page under `src/app/app/<area>/page.tsx` with empty / loading / error states. Not required for background-only plugins like `contradiction-finder`.
5. ≥ 8 unit tests in `tests/unit/<slug>.test.ts` covering the parse path, the happy path, and at least 4 edge cases.
6. A doc page at `docs/plugins/<slug>.md` with usage and any settings.
7. Row in this matrix flipped to PRODUCTION + STATUS.md §4 row updated.

---

## Adding a new plugin

See `AGENTS.md` "Where work goes" and `FEATURE_BACKLOG.md` for the recipe. A scaffolding template (`docs/build/plugin-porting-guide.md`) covers the pattern.
