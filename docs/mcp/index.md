# MCP

MindStore is an MCP (Model Context Protocol) server. Plug it into any MCP-aware AI client — Claude Desktop, Claude Code, Cursor, Codex, Cline, Continue — and your assistant gains seven tools for searching, contextualizing, threading, contradicting, and writing to your personal knowledge base.

## Why this matters

MCP is a vendor-neutral plug between AI clients and external context. Once a client supports MCP, it can use any MCP server without per-vendor integration. MindStore being an MCP server means your knowledge base isn't trapped in our UI — every AI tool you use can read it.

## The seven tools

| Tool | Purpose |
|---|---|
| `search_mind` | Semantic search across all your memories |
| `get_context` | Pull most-relevant memories on a topic, formatted as context |
| `get_profile` | Stats: memory count, top sources, date range |
| `get_timeline` | Trace a topic chronologically; supports date bounds |
| `get_contradictions` | Surface memories that disagree with each other |
| `get_threads` | Cluster memories by source for a coherent thread of thought |
| `learn_fact` | Let the AI client write a new memory ("remember that X") |

Plus any plugin-defined tools the user has installed — the surface is extensible per the plugin SDK.

## Setup

The fastest path: visit `/app/mcp-setup` in the running MindStore web app. That page mints an API key and shows pre-filled config snippets for the major clients with copy buttons.

For details on each client, see the [MCP Client Setup](./clients.md) guide.

## Auth

The MCP endpoint at `/api/mcp` requires a Bearer token (per-user API key from the `api_keys` table) when running in multi-user mode. In single-user mode, an unauthenticated request falls through to the default user — the right behavior for self-hosted deployments where the operator and the user are the same person.

CORS is locked down: `Access-Control-Allow-Origin` only echoes the request `Origin` if it matches the comma-separated `MCP_ALLOWED_ORIGINS` environment variable.

## For maintainers

If you're working on MindStore itself (not just integrating with it), these are the relevant files:

- `src/server/mcp/runtime.ts` — tool definitions, dispatcher, implementations
- `src/app/api/mcp/route.ts` — HTTP transport, auth gate, CORS
- `tests/unit/mcp-tools.test.ts` — tool surface invariants
- [demo-scripts.md](./demo-scripts.md) — shot-by-shot scripts for the launch demo videos
- [marketplace-listings.md](./marketplace-listings.md) — submission-ready copy for Anthropic, Cursor, OpenAI Apps SDK, and the third-party MCP indexes

## Next reading

- [MCP Client Setup](./clients.md) — per-client configuration walkthroughs
- [Demo video scripts](./demo-scripts.md) — when you're ready to record launch content
- [Marketplace listings](./marketplace-listings.md) — when you're ready to submit
- [MindStore Everywhere Quickstart](../getting-started/mindstore-everywhere.md) — the browser extension
