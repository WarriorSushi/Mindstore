<div align="center">
  <a href="https://mindstore.org">
    <img src="public/logo.svg" height="80" alt="MindStore" />
  </a>
  <h3>Your knowledge, portable to any AI.</h3>
  <p>Import everything you've ever read, written, or saved. Search by meaning. Connect to any AI via MCP.</p>

  <br />

  <a href="https://mindstore.org"><strong>Website</strong></a> · <a href="https://mindstore.org/docs"><strong>Docs</strong></a> · <a href="https://github.com/WarriorSushi/mindstore/issues"><strong>Issues</strong></a> · <a href="#roadmap"><strong>Roadmap</strong></a> · <a href="https://discord.gg/altcorp"><strong>Discord</strong></a>

  <br />
  <br />

  [![License](https://img.shields.io/badge/license-FSL--1.1--MIT-14b8a6?style=flat)](LICENSE)
  [![Tests](https://img.shields.io/badge/tests-345%20passing-14b8a6?style=flat)](#)
  [![Plugins](https://img.shields.io/badge/plugins-35-38bdf8?style=flat)](#plugins)
  [![Routes](https://img.shields.io/badge/api%20routes-77-38bdf8?style=flat)](#)
  [![MCP](https://img.shields.io/badge/MCP-compatible-38bdf8?style=flat)](https://modelcontextprotocol.io)
  [![Deploy](https://img.shields.io/badge/deploy-Vercel-black?style=flat)](https://vercel.com/new/clone?repository-url=https://github.com/WarriorSushi/mindstore)

  <br />

  *Status: see [STATUS.md](STATUS.md) · Plan: see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) · Charter: see [CLAUDE_TAKEOVER.md](CLAUDE_TAKEOVER.md)*

  <br />
  <br />

  <img src="docs/assets/hero-preview.svg" alt="MindStore Preview" width="720" />
</div>

<br />

## Why MindStore

Every AI starts from zero. Your ChatGPT doesn't know what you told Claude. Your Copilot doesn't know your Kindle highlights. Your knowledge is scattered across 15 apps and none of them talk to each other.

MindStore imports everything into one searchable knowledge base — then connects it to **any AI** through [MCP](https://modelcontextprotocol.io), the open protocol.

**You bring the AI access.** MindStore stores, retrieves, and exposes your knowledge; you can use your own provider keys or local models.

<br />

## Features

<table>
<tr>
<td width="50%">

### 🔍 Semantic Search
BM25 + vector hybrid search with HyDE query expansion, reranking, and contextual compression. Find anything by meaning, not just keywords.

### 💬 Chat With Your Knowledge
Ask questions, get cited answers from YOUR data. Switch AI models per-message. Works with OpenAI, Gemini, OpenRouter, Ollama, or any OpenAI-compatible endpoint.

### 🧬 Knowledge Fingerprint
3D WebGL visualization of your mind's topology. See clusters, connections, blind spots — rendered as an interactive graph.

</td>
<td width="50%">

### ⚡ 35 Plugins
Flashcard engine (SM-2), contradiction finder, topic evolution timeline, sentiment analysis, mind maps, blog/newsletter generation, voice-to-memory, and more.

### 🌐 MCP Protocol
Three functions. Any AI gets your brain. Works with Claude, Cursor, Windsurf, Copilot — anything that speaks MCP.

### 📦 12+ Importers
ChatGPT exports, Kindle highlights, YouTube transcripts, Obsidian vaults, Notion, Reddit, PDFs, voice memos, images, URLs, and more.

</td>
</tr>
</table>

<br />

## Quick Start

### One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/WarriorSushi/mindstore)

### Self-host

```bash
git clone https://github.com/WarriorSushi/mindstore.git
cd mindstore
cp .env.example .env.local
npm install
npm run migrate
npm run dev
```

For a public multi-user deployment, configure Google OAuth, set `ALLOW_SINGLE_USER_MODE=false`, and verify `/api/health` reports `identityMode: "google-oauth"`.

### Requirements

- **Node.js** 20+
- **PostgreSQL** with [pgvector](https://github.com/pgvector/pgvector) extension
- **Supabase is optional** — any managed or self-hosted Postgres works
- **AI provider access** for semantic search, chat, and AI-heavy plugins

<br />

## Connect Your AI

Add MindStore as a tool in any MCP-compatible AI:

```json
{
  "mcpServers": {
    "mindstore": {
      "url": "https://your-instance.com/api/mcp"
    }
  }
}
```

Three functions are exposed:

| Function | Description |
|----------|-------------|
| `search_mind` | Semantic search across all your knowledge |
| `get_profile` | Your expertise areas, writing style, stats |
| `get_context` | Deep context on any topic from your knowledge |

Works with **Claude Desktop**, **Cursor**, **Windsurf**, **GitHub Copilot**, and any MCP client.

<br />

## Plugins

MindStore ships a broad plugin catalog across import, analysis, action, sync, and AI enhancement workflows. Plugin maturity still varies by feature and deployment mode.

| Category | Plugins |
|----------|---------|
| **Import** | ChatGPT, Kindle, YouTube Transcript, Notion, Obsidian, Reddit, PDF/EPUB, Twitter, Telegram, Pocket, Readwise, Browser Bookmarks |
| **Analysis** | Knowledge Fingerprint, Contradiction Finder, Topic Evolution, Sentiment Timeline, Knowledge Gaps, Writing Style |
| **Action** | Flashcard Engine, Mind Map, Smart Collections, Blog Draft, Newsletter Writer, Resume Builder |
| **AI** | Custom RAG, Domain Embeddings, Multi-Language, Conversation Prep, Learning Paths |
| **Export** | Anki Export, Markdown Blog, Notion Sync, Obsidian Sync |
| **Capture** | Voice-to-Memory, Image-to-Memory, Spotify History |

<br />

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                        Client                            │
│   Next.js 16 · React 19 · Tailwind · Plus Jakarta Sans  │
├──────────────────────────────────────────────────────────┤
│                      API Layer                           │
│           77 routes · NextAuth · MCP Server              │
├──────────────────────────────────────────────────────────┤
│                    Plugin System                         │
│       35 plugins · Shared AI Client · Job Queue          │
├──────────────────────────────────────────────────────────┤
│                      Data Layer                          │
│     PostgreSQL · pgvector · BM25 · Drizzle ORM           │
├──────────────────────────────────────────────────────────┤
│                    AI Providers                           │
│   OpenAI · Gemini · Ollama · OpenRouter · Custom API     │
└──────────────────────────────────────────────────────────┘
```

- **No AI costs for MindStore** — users bring their own keys
- **Embeddings** — multi-provider (Gemini, OpenAI, Ollama)
- **Search** — hybrid BM25 + cosine similarity with HyDE
- **Auth** — Google OAuth via NextAuth for multi-user installs, optional single-user fallback for private/self-hosted setups

<br />

## Roadmap

For the live, file-citable status of every roadmap item, see **[STATUS.md](STATUS.md)**. The headline:

### Shipped (in `main`, working in production)

- [x] **35 plugins** spanning import, analysis, action, sync, AI enhancement, and capture — every one is real code (zero stubs); maturity matrix in [docs/PLUGIN_MATURITY_MATRIX.md](docs/PLUGIN_MATURITY_MATRIX.md)
- [x] **MCP server** with 3 core tools (`search_mind`, `get_profile`, `get_context`) plus plugin extension — connect any MCP client
- [x] **13 importers** — ChatGPT, Kindle, YouTube, Obsidian, Notion, Reddit, Pocket, Twitter, Telegram, Spotify, Readwise, browser bookmarks, PDF/EPUB
- [x] **Hybrid semantic search** — BM25 + vector + tree fused with Reciprocal Rank Fusion
- [x] **Chat with cited answers** — multi-provider streaming, source memory citations
- [x] **Knowledge Fingerprint** — 3D WebGL knowledge topology via Reagraph
- [x] **Plugin store** with categories and one-click install
- [x] **Custom RAG** with HyDE, reranking, contextual compression — opt-in via the custom-rag plugin
- [x] **Voice and image capture** — voice-to-memory + image-to-memory plugins
- [x] **Browser extension** — Chrome MV3 capture-anywhere extension under `extensions/mindstore-everywhere/`
- [x] **Anki, Notion, Obsidian, and markdown blog export/sync**
- [x] Onboarding wizard, demo mode, PWA support

### In flight (Phase 0 + 1 — see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md))

- [ ] Truth pass on docs (this README, ARCHITECTURE.md, GOVERNANCE.md license fix)
- [ ] Per-user settings (multi-user mode prerequisite)
- [ ] Auth, rate limit, and validation parity across all 77 routes
- [ ] CI workflow with type-check + lint + test + build on every PR
- [ ] Vercel cron wiring for `plugin-jobs` and `indexing-jobs`
- [ ] Empty/loading/error states + accessibility polish on every page

### Next (Phases 2 & 3 — the "thinking about your thinking" + "introspection" layers)

- [ ] **Memory Consolidation Engine** — nightly scan, find connections + contradictions + themes, generate insight reports
- [ ] **Adversarial Retrieval ("Devil's Advocate")** — every query also surfaces what contradicts it
- [ ] **Cross-Pollination Engine** — automated discovery of surprising bridges across distant clusters
- [ ] **Mind Diff** — compare your knowledge state at two points in time
- [ ] **Knowledge Metabolism Score** — weekly intellectual fitness number with components
- [ ] **Forgetting Curve (whole base)** — Ebbinghaus + SM-2 across every memory, not just flashcards
- [ ] **Thought Threading** — detect ongoing threads of thinking across sources and time
- [ ] **Knowledge Genealogy** — trace any idea to its origins
- [ ] **Knowledge Diffusion** — track how an idea propagates across your sources
- [ ] **Memory Journals** — daily voice/text capture with auto-extraction and weekly synthesis

### Then (Phases 4 & 5 — portability, network, system)

- [ ] **`.mind` file format** — single-file portable knowledge with embeddings, indices, and optional encryption
- [ ] **Mind Marketplace** — publish/browse/fork shared knowledge bases with conflict-resolution merge
- [ ] **Memory Audit Trail** — provenance + APA/MLA/Chicago citation export
- [ ] **Knowledge Attack Surface** — automated security audit of your knowledge (exposed secrets, single points of failure, silos)
- [ ] **Knowledge Oracle** — multi-turn reasoning agent with adaptive RAG and admitted gaps
- [ ] **Mind Scheduler** — auto-built daily learning sessions
- [ ] **Mind Coaching** — AI mentor with weekly check-ins against your goals
- [ ] **Vercel Workflows backbone** — durable, retryable, observable async jobs
- [ ] **Team workspaces** — shared knowledge across teammates

Detail and dependency graph for each item is in **[FEATURE_BACKLOG.md](FEATURE_BACKLOG.md)**.

<br />

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Development
npm run dev          # Start dev server on the default Next.js port (3000)
npm run migrate      # Apply database migrations
npm run test         # Run unit tests
npm run build        # Production build
npm run typecheck    # Type checking
npm run lint:ci      # Stabilized CI lint slice
npm run lint:backlog # Wider repo lint backlog
```

All commits require [DCO sign-off](https://developercertificate.org/):
```bash
git commit -s -m "your message"
```

<br />

## License

MindStore is licensed under the [Functional Source License, Version 1.1, MIT Future License (FSL-1.1-MIT)](LICENSE).

**What this means:**

- ✅ **Free to self-host** — personal, company, education, any size
- ✅ **Free to modify** — change anything, build plugins, customize
- ✅ **Free to redistribute** — share copies with the license included
- ✅ **Source available** — read, audit, and learn from all code
- ✅ **Converts to MIT** — each version becomes fully MIT after 2 years
- ❌ **No competing service** — you can't offer MindStore as a hosted product that competes with us

<br />

<div align="center">
  <a href="https://mindstore.org">
    <img src="public/favicon.svg" height="24" alt="" />
  </a>
  <br />
  <sub>Built with conviction, not just code.</sub>
</div>
