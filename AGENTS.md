# Agent Context for MindStore

This file is the entry-point for any AI agent (Claude Code, Codex, Gemini CLI, custom MCP clients, etc.) working in this repository. It supplements `CLAUDE.md` with concrete repo-specific facts that are easy to miss.

## Stack at a glance

| Layer | Tech | Notes |
|---|---|---|
| Framework | Next.js **16.2.0** (App Router) | Some conventions differ from Next.js 15. Read `node_modules/next/dist/docs/` only if you hit something surprising; otherwise default App Router patterns work. |
| Runtime | Node.js 24 LTS (default on Vercel today) | Do not assume Node 18. |
| UI | React **19.2.4**, Tailwind v4, shadcn-style components | Custom design system in `.impeccable.md`. No violet/purple/fuchsia. |
| DB | PostgreSQL with **pgvector**, **pg_trgm**, **pgcrypto** | Schema in `src/server/schema.ts`, migrations in `src/server/migrate.ts`. |
| ORM | Drizzle (`drizzle-orm` + `drizzle-kit`) | Tagged-template `sql` with explicit casts (e.g., `${userId}::uuid`). |
| Validation | Zod v4 | Adopt for every new route. |
| Auth | NextAuth v5 beta | Google OAuth + single-user fallback. JWT session strategy. |
| AI client | Multi-provider in `src/server/ai-client.ts` | OpenAI, Gemini, Ollama, OpenRouter, custom OpenAI-compat. SSE streaming. |
| Embeddings | Multi-provider in `src/server/embeddings.ts` | Gemini default (768d), OpenAI (1536d), Ollama (768d). |
| Retrieval | RRF over BM25 + vector + tree in `src/server/retrieval.ts` | k=60 standard, tree weighted 1.2×. |
| MCP | `@modelcontextprotocol/sdk` v1.27 | HTTP transport at `/api/mcp`, runtime in `src/server/mcp/runtime.ts`. |
| Plugins | Workspace packages: `@mindstore/plugin-sdk`, `@mindstore/plugin-runtime`, `@mindstore/example-community-plugin` | 35 plugin manifests in `src/server/plugins/registry.ts`, ports under `src/server/plugins/ports/`. |
| Browser extension | Chrome MV3 in `extensions/mindstore-everywhere/` | Capture-anywhere + popup query. |
| Tests | Vitest 3 (unit) + Playwright (E2E) | Run with `npm test` and `npm run test:e2e`. |
| Lint | ESLint 9 with `eslint-config-next` | Curated `lint:ci` slice; full repo via `lint:backlog`. |
| Deploy | Vercel | Production at `mindstore.org`. |

## Repo map

```
mindstore/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── api/                  # 77 route handlers
│   │   │   ├── auth/             # NextAuth handlers
│   │   │   ├── health/           # Public health check
│   │   │   ├── mcp/              # MCP HTTP transport
│   │   │   └── v1/               # Versioned application API
│   │   ├── app/                  # Authenticated app pages (dashboard, plugins...)
│   │   ├── docs/                 # Markdown docs UI (consumes /docs/*.md)
│   │   ├── login/                # Sign-in page
│   │   ├── layout.tsx            # Root shell + theme provider
│   │   ├── globals.css           # Tailwind base + design tokens
│   │   └── page.tsx              # Landing page
│   ├── components/               # Shared UI
│   ├── lib/                      # Pure utilities (no DB/network)
│   ├── proxy.ts                  # Edge-style request proxy + security headers
│   └── server/                   # All server-side logic
│       ├── ai-client.ts          # Multi-provider chat + transcription
│       ├── embeddings.ts         # Multi-provider embedding generation
│       ├── retrieval.ts          # RRF fusion engine
│       ├── schema.ts             # Drizzle schema (30+ tables)
│       ├── migrate.ts            # SQL migrations runner
│       ├── auth.ts               # NextAuth setup
│       ├── identity.ts           # DEFAULT_USER constants + identity-mode helpers
│       ├── encryption.ts         # AES-256-GCM for stored secrets
│       ├── plugin-jobs.ts        # Plugin job scheduling + execution
│       ├── indexing-jobs.ts      # Embedding backfill queue
│       ├── plugins/              # Plugin runtime, registry, ports
│       └── mcp/                  # MCP server runtime
├── packages/
│   ├── plugin-sdk/               # Public plugin SDK (definePlugin, types)
│   ├── plugin-runtime/           # Plugin runtime engine
│   └── example-community-plugin/ # Reference plugin
├── extensions/
│   └── mindstore-everywhere/     # Chrome MV3 capture extension
├── tests/
│   ├── unit/                     # Vitest unit tests (per port + per module)
│   ├── e2e/                      # Playwright E2E
│   └── stubs/                    # Test stubs (e.g., server-only)
├── docs/                         # User-facing docs (consumed at /docs)
│   ├── adr/                      # Architecture decision records
│   ├── archive/                  # Stale planning artifacts (post-takeover)
│   ├── build/                    # How to build plugins / contributors
│   ├── deploy/                   # Deployment modes + checklists
│   ├── examples/                 # Worked examples
│   ├── getting-started/          # Quickstart, first-run
│   ├── import-guides/            # Per-source import guides
│   ├── mcp/                      # MCP client integration docs
│   ├── plugins/                  # One markdown per plugin
│   └── releases/                 # Release notes
├── public/                       # Static assets
├── CLAUDE_TAKEOVER.md            # Working contract for the takeover
├── STATUS.md                     # Live ground-truth dashboard
├── PRODUCTION_READINESS.md       # Phased plan
├── FEATURE_BACKLOG.md            # Innovation queue
├── README.md                     # Public face
├── ARCHITECTURE.md               # System shape
├── .impeccable.md                # Design system
├── mindstore.config.ts           # Plugin config root
├── next.config.ts
├── package.json
├── tsconfig.json / tsconfig.build.json
├── vitest.config.ts
├── playwright.config.ts
└── vercel.json
```

## Conventions you'll be wrong about if you don't read first

1. **Drizzle SQL casts.** Always `${userId}::uuid` — bare strings won't bind. Same for `::vector`, `::jsonb`.
2. **Embedding dimension guard.** Mixed-provider embeddings coexist via `vector_dims(m.embedding) = ${embDim}` predicates. Don't strip them.
3. **AI provider routing.** `getStreamingTextGenerationConfig()` and `callTextPrompt()` are the canonical entry points. Don't hand-roll fetches against OpenAI/Gemini directly.
4. **Plugin ports vs routes.** Business logic lives in `src/server/plugins/ports/<slug>.ts`. The route handler is a thin shell that calls the port. New plugin work → write the port first.
5. **`getUserId()` from `@/server/user`** is the auth gate. It returns the default user UUID in single-user mode and the JWT-bound user in OAuth mode.
6. **`applyRateLimit(req, key, RATE_LIMITS.write)`** for any state-mutating route.
7. **The `settings` table is currently global** (no `user_id` column). This is being changed in Phase 1. New code that reads/writes settings should pass `userId` through even if it's currently ignored — that prepares for the migration.
8. **Three plugin slug mismatches** exist between registry and file (`youtube-importer` ↔ `youtube-transcript.ts`, `reddit-importer` ↔ `reddit-saved.ts`, `writing-analyzer` ↔ `writing-style.ts`). Phase 0 fixes these via file rename + alias map.

## Run commands

```bash
npm install                # first run
npm run migrate            # apply DB migrations
npm run dev                # local dev (port 3000)
npm test                   # unit tests
npm run test:e2e           # Playwright E2E
npm run typecheck          # TS via tsconfig.build.json
npm run lint:ci            # curated lint slice
npm run lint:backlog       # full repo lint
npm run build              # production build
npm run jobs:run-due       # one-shot: run due plugin jobs
npm run jobs:run-indexing  # one-shot: run pending indexing jobs
```

## Where work goes

| You're working on... | Touch these |
|---|---|
| New plugin | `src/server/plugins/registry.ts` (manifest), `src/server/plugins/ports/<slug>.ts` (logic), `src/app/api/v1/plugins/<slug>/route.ts` (endpoint), `src/app/app/<area>/page.tsx` (UI), `tests/unit/<slug>.test.ts` (tests), `docs/plugins/<slug>.md` (docs). |
| New API route | `src/app/api/v1/<path>/route.ts`, schema in `src/server/api-schemas/<path>.ts`, tests in `tests/api/<path>.test.ts` (Phase 1+). |
| New page | `src/app/app/<area>/page.tsx` + `loading.tsx` + `error.tsx`. Add an entry in the generated nav (Phase 1+). |
| New schema table | `src/server/schema.ts` (Drizzle), `src/server/migrate.ts` (raw SQL), then a migration test. |
| New innovation | First read `FEATURE_BACKLOG.md` to find the entry; the schema/server/api/ui shape is already sketched. |

## Failure modes to avoid

- Don't write a route without auth + rate-limit + validation — it won't pass review.
- Don't claim a feature is done until `STATUS.md` reflects it and the `Definition of Done` checklist (in `CLAUDE_TAKEOVER.md`) is met.
- Don't silently change a marketing claim (badge count, roadmap checkbox) — that's a `STATUS.md` update first, README second.
- Don't mock-data your way out of an empty state — design the empty state.

## When you're stuck

The owner reads `STATUS.md` first. If something blocks you, add a row to `STATUS.md` §8 (Open blockers) and surface it in the next chat reply. Don't guess at decisions only the owner can make (legal, billing, infrastructure choice).
