# MindStore — MCP marketplace listing copy

Submission-ready copy + metadata for every directory MindStore should be listed in. Each section is structured to match the directory's submission form so you can copy-paste.

These are the **directories that exist or are launching as of this writing**. Submit in this order — Anthropic and Cursor are the highest-traffic right now; OpenAI's directory will matter most once it launches.

> **What I can't do for you:** the actual submissions. Each directory has its own form / GitHub PR / email submission flow. Use this doc as the source of truth for the copy, then go submit.

---

## 1. Anthropic — Claude MCP Directory (`claude.ai/mcp`)

**Submission flow:** Anthropic accepts MCP servers via PR to the [`modelcontextprotocol/servers`](https://github.com/modelcontextprotocol/servers) repo. Add a section to the `README.md` table under "Community servers" and ensure your server is publicly discoverable.

### Listing fields

| Field | Value |
|---|---|
| Name | **MindStore** |
| Slug | `mindstore` |
| Category | Personal Knowledge / Memory |
| Logo | 512×512 PNG (use `/public/icon-512.png` or have one designed; transparent background, MindStore brain mark) |
| Homepage URL | `https://mindstore.org` |
| Documentation URL | `https://mindstore.org/docs/mcp` |
| Source code | `https://github.com/<your-org>/mindstore` |
| License | FSL-1.1-MIT (open source after 2-year delay; show as "Open source" in directory) |
| Transport | HTTP (Streamable) |
| Auth | Bearer token (per-user API key, generated at `mindstore.org/app/mcp-setup`) |
| Server status | Public (hosted), with self-host option |

### Short description (≤140 chars)

> Your second brain, in every AI tool you use. Search, contradict, and write to your personal knowledge base from Claude.

### Long description (≤2000 chars)

> MindStore is your personal knowledge base — your ChatGPT chats, Kindle highlights, Obsidian notes, YouTube transcripts, browser bookmarks, podcast clips, all in one place — exposed to Claude as a set of MCP tools.
>
> **Seven tools your assistant gets:**
>
> - `search_mind` — semantic search across everything you've ever saved
> - `get_context` — pull the most relevant memories on a topic
> - `get_profile` — knowledge-base statistics (size, sources, top topics)
> - `get_timeline` — trace how your thinking on a topic has changed over time
> - `get_contradictions` — surface contradictions in your own notes (the "Devil's Advocate" tool)
> - `get_threads` — find coherent threads of thought across multiple memories
> - `learn_fact` — let the AI write to your brain when you say "remember that X"
>
> Beyond MCP, MindStore is a full second-brain platform: 35 import plugins (ChatGPT, Kindle, Obsidian, Notion, Pocket, Readwise, YouTube, Twitter, Reddit, and more), automatic embeddings, hybrid retrieval (BM25 + vector + tree fusion), and unique features like the Knowledge Fingerprint, Mind Diff, and Forgetting Curve over your whole base.
>
> **Cloud or self-host.** Use `mindstore.org` as a hosted service, or clone the repo and run it on your own server. Either way, your data exports as a single portable `.mind` file you can move between deployments.
>
> **Free tier:** 7-day full-feature trial. Personal: $X/month. Self-host: free.

### Capabilities to declare

```json
{
  "tools": ["search_mind", "get_profile", "get_context", "get_timeline", "get_contradictions", "get_threads", "learn_fact"],
  "resources": ["mindstore://profile", "mindstore://recent"],
  "prompts": []
}
```

(Plus any plugin-defined tools the user has installed — the directory listing should note that the tool surface is extensible.)

### Example user prompts (for the directory)

- *"What do I know about [topic from my notes]?"*
- *"Show me the timeline of my thinking on [topic] in the last 6 months."*
- *"What contradictions exist in my own notes about [topic]?"*
- *"Remember this idea: [the user has just said something worth saving]."*

### Screenshots

Submit 3–5 screenshots, in this order of priority:

1. Claude Desktop after MCP is configured, with `mindstore` listed under MCP servers and a tool-use sidebar showing `get_timeline` being called
2. The `/app/mcp-setup` page mid-flow (with placeholder key, not a real one)
3. The MindStore main dashboard showing imported sources
4. `/app/forgetting` or `/app/security` to demonstrate the unique features
5. A side-by-side: Claude's response without MCP (generic) vs with MCP (cited)

---

## 2. OpenAI — ChatGPT Apps SDK (when GA)

**Status as of writing (2026-05-04):** Apps SDK in beta. Apps run inside ChatGPT itself; this is the "user's ChatGPT Plus subscription pays for the AI" path I recommended in the strategy doc. Submit when GA.

**Submission flow:** [chat.openai.com/apps/develop](https://chat.openai.com/apps/develop) (or whatever the current URL is at GA).

### Listing fields

| Field | Value |
|---|---|
| App name | **MindStore — Your Second Brain** |
| Category | Productivity / Personal |
| Short description | Pour your ChatGPT chats, Kindle highlights, notes, and bookmarks into your own searchable second brain. ChatGPT can search, thread, and contradict your knowledge. |
| Icon | 512×512, square |
| Privacy policy URL | `mindstore.org/privacy` |
| Terms URL | `mindstore.org/terms` |
| Required OAuth scopes | (none — uses your MindStore API key, not ChatGPT account) |

### Long description (≤4000 chars)

> Most note apps file your stuff. MindStore *thinks* about it.
>
> Bring all your knowledge — ChatGPT exports, Kindle highlights, Obsidian notebooks, Notion exports, Pocket articles, YouTube transcripts, browser bookmarks, voice memos, podcast clips — into a single searchable home. ChatGPT can then:
>
> - **Search your knowledge** with natural-language queries that span everything you've ever saved
> - **Pull context** for whatever you're working on, with citations
> - **Trace your thinking over time** — when did you first encounter an idea, how have your views shifted?
> - **Find contradictions** — the things you've written that disagree with each other, ranked by topic
> - **Find threads** — clusters of related memories from the same source so the AI can follow a line of reasoning, not just one chunk
> - **Save new memories** when you say "remember that" — ChatGPT writes back to your brain
>
> Connect once, then every ChatGPT conversation has access to the things only *you* have read. No more retyping context. No more "I read something about this once but I can't find it."
>
> **Other features inside MindStore (web app):** 35 import plugins, automatic embeddings, hybrid search (BM25 + vector), the Knowledge Fingerprint (a snapshot of your knowledge graph), Mind Diff (compare two snapshots), Forgetting Curve (it tells you when you're about to forget something important), and the portable `.mind` file format so you can take your brain with you.
>
> **Open source and self-hostable** — clone the repo and run it on your own server with full data sovereignty, or use our hosted service.

### Onboarding flow inside ChatGPT

1. User installs MindStore app from the directory
2. ChatGPT prompts: "Connect your MindStore account?" → user clicks
3. Pop-up redirects to `mindstore.org/app/mcp-setup`
4. User mints a key (or pastes one), confirms
5. Key flows back to ChatGPT via OAuth-ish handshake (per OpenAI's app SDK)
6. From now on, "@mindstore search for X" works in any ChatGPT conversation

### Conversation starters (4-prompt set ChatGPT shows)

- 🔍 *"What do I know about [topic]?"*
- ⏱ *"Show me the timeline of my notes on [topic]."*
- ⚖️ *"Are there contradictions in my notes about [topic]?"*
- 💾 *"Remember this for me: [statement]"*

---

## 3. Cursor — MCP Marketplace

**Submission flow:** [Cursor Directory](https://cursor.directory) submission via the form on the site, or PR to the `cursor.directory` repo (whichever Cursor's docs currently point at).

### Listing fields

| Field | Value |
|---|---|
| Name | MindStore |
| Slug | `mindstore` |
| Category | Knowledge & Search |
| Tags | `memory`, `notes`, `search`, `personal-knowledge`, `second-brain`, `kindle`, `obsidian`, `notion`, `chatgpt-export`, `rag` |
| Author | (your team / handle) |
| GitHub | (repo URL) |
| Setup URL | `https://mindstore.org/app/mcp-setup?client=cursor` |
| Pricing | Free tier + paid (link to pricing page) |

### Tagline (≤80 chars)

> Your past notes, in your editor. Cursor calls MindStore for personal context.

### Description (≤500 chars)

> MindStore brings your personal knowledge base into Cursor. Your past Kindle highlights, ChatGPT chats, Obsidian notes, and saved articles become tools your AI assistant can call. While you code, Cursor can search what you've already learned about a problem, pull context with citations, find contradictions, and even save new decisions back to your notes with `learn_fact`. Self-host or use the cloud version.

### Why it matters for developers (Cursor-specific framing)

> Coding decisions live in old notes, half-remembered Slack threads, and "I read about this last year" moments. MindStore makes those moments queryable from inside Cursor. The `get_context` tool turns "I think there was a reason we picked X over Y" into a citation. The `learn_fact` tool means future-you doesn't relearn what present-you just figured out.

### Quick install for Cursor

(Embed this in the listing page if Cursor's directory supports it)

```json
{
  "mcpServers": {
    "mindstore": {
      "url": "https://mindstore.org/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MINDSTORE_API_KEY"
      }
    }
  }
}
```

> Get your `YOUR_MINDSTORE_API_KEY` at [mindstore.org/app/mcp-setup](https://mindstore.org/app/mcp-setup).

---

## 4. mcpservers.org / smithery.ai / glama.ai (third-party MCP indexes)

**Status:** several community-run MCP server indexes exist. Submit to all of them — they're cheap to maintain and each has its own SEO surface.

### Universal listing (paste into each)

```yaml
name: MindStore
slug: mindstore
description: |
  Your personal second brain, exposed to AI clients via MCP. Search,
  context, timeline, contradictions, threads, and write-back to your
  knowledge base — across Kindle, ChatGPT, Obsidian, Notion, YouTube,
  bookmarks, and 30+ other sources.
homepage: https://mindstore.org
repository: https://github.com/<your-org>/mindstore
license: FSL-1.1-MIT
transport: streamable-http
endpoint: https://mindstore.org/api/mcp
auth: bearer
auth_acquisition_url: https://mindstore.org/app/mcp-setup
self_hostable: true
self_host_docker: false  # set true once a Dockerfile lands
self_host_command: "git clone <repo> && npm install && npm run migrate && npm run dev"
tools:
  - name: search_mind
    description: Semantic search across the user's knowledge base
  - name: get_context
    description: Pull most-relevant memories formatted as context
  - name: get_profile
    description: Stats about the user's knowledge base
  - name: get_timeline
    description: See how the user's thinking on a topic has evolved
  - name: get_contradictions
    description: Surface contradictions in the user's own knowledge
  - name: get_threads
    description: Find coherent threads of memories on a topic
  - name: learn_fact
    description: Write new memories from the AI conversation
maintainer: <your name / handle>
contact: <support email>
```

---

## 5. README.md — MCP section (for the GitHub repo itself)

The MCP marketplace presence starts with the repo. Add or update the README's "MCP" section with this:

````markdown
## MCP server

MindStore is an MCP (Model Context Protocol) server. Plug it into Claude Desktop, Claude Code, Cursor, Codex, Cline, Continue, or any other MCP-aware client and your AI assistant gains 7 tools to query and write to your personal knowledge base.

**Setup:** [mindstore.org/app/mcp-setup](https://mindstore.org/app/mcp-setup) — pick your client, copy the snippet, restart.

**Tools exposed:**

| Tool | What it does |
|---|---|
| `search_mind` | Semantic search across all your memories |
| `get_context` | Pull relevant memories formatted as context for a topic |
| `get_profile` | Knowledge-base stats |
| `get_timeline` | Trace a topic chronologically |
| `get_contradictions` | Surface contradictions in your own notes |
| `get_threads` | Find coherent threads of related memories |
| `learn_fact` | Let the AI write new memories ("remember this") |

Plus any plugin-defined tools the user has installed — the surface is extensible.

**Self-host:** the MCP endpoint runs at `/api/mcp` on any MindStore deployment. Bearer auth from a per-user API key (mint at `/app/connect` → "API keys").
````

---

## 6. Hacker News / Show HN post

When you launch this, post a Show HN. The headline matters more than the post body. Here are 3 ranked options:

1. **Show HN: MindStore — your second brain, plugged into Claude/ChatGPT/Cursor via MCP**
2. **Show HN: We added "find contradictions in your own notes" to the MCP standard**
3. **Show HN: An MCP server that lets Claude write to your knowledge base, not just read it**

Body template (300–400 words):

> Hey HN — we built MindStore, a personal second-brain platform. The new bit (and why I'm posting): we expose it as an MCP server, so Claude Desktop, Claude Code, Cursor, Codex, and others can search and write to it directly.
>
> Most "second brain" tools file your stuff. We expose the *thinking* as tools your AI client can call — beyond just search. Some of the unique ones:
>
> - `get_contradictions(query)` — surfaces memories that disagree with each other on a topic. Powered by an offline contradiction-finder that scans your knowledge weekly.
> - `get_timeline(topic)` — chronological retrieval, so the AI sees how your thinking on a subject changed over years.
> - `learn_fact(content)` — write tool. The AI saves something to your knowledge base when you say "remember that."
>
> Under the hood: pgvector + pg_trgm + a custom RRF retrieval fusing BM25, vector, and a tree index. 35 import plugins (ChatGPT, Kindle, Obsidian, Notion, YouTube, Pocket, Readwise, etc.). Open source under FSL-1.1-MIT (becomes MIT after 2 years). Self-hostable; cloud version at mindstore.org.
>
> Things I expect HN to ask, so I'll preempt:
>
> - **Privacy:** API keys stored encrypted at rest with AES-256-GCM, MCP endpoint requires Bearer auth, never trains a model on your data.
> - **Data portability:** every base exports as a single `.mind` file (ZIP with manifest + memories.jsonl + embeddings.bin + checksum). Move it between deployments anytime.
> - **AI cost:** subscription bundles tokens through Vercel AI Gateway. Power users can BYO key for pure data-platform pricing.
> - **Why not Notion / Obsidian / Mem:** those are filing systems with light AI on top. We're an *AI-tool surface* on top of your knowledge — the MCP integration is the whole point, not an afterthought.
>
> Repo: <link>
> Demo: <video link>
> Cloud: mindstore.org

---

## Submission tracker

Use this checklist to track submissions:

- [ ] Anthropic MCP Directory PR (`modelcontextprotocol/servers`)
- [ ] Cursor Directory submission
- [ ] OpenAI Apps SDK submission (when GA)
- [ ] mcpservers.org
- [ ] smithery.ai
- [ ] glama.ai
- [ ] Github README updated
- [ ] HN Show HN post
- [ ] Twitter/X thread
- [ ] Cursor's developer Discord — pin the install snippet in the relevant channel
- [ ] Hacker News submission (separate from Show HN if you want a soft launch first)

Aim to submit to Anthropic, Cursor, and the three indexes within the same week. The HN post should be at least 1–2 weeks later, after you've ironed out any onboarding bugs the early MCP traffic surfaces.

## Things I don't have access to write but you'll need

These require account access I don't have. Treat as your TODO before launch:

- **Logo / icon assets** — every directory wants a 512×512 PNG. Get one made (Fiverr or similar) if you don't have one.
- **Privacy policy + terms of service** — generic templates exist; for a paid service you'll want a real lawyer to glance at them.
- **Demo videos** — see `docs/mcp/demo-scripts.md` for shot-by-shot scripts you can record yourself.
- **Pricing page copy** — the strategy doc earlier in this conversation has the numbers; needs landing-page-ready copy treatment.
