# MindStore Architecture v2 — Server-First

## Why Server-Side
- Cross-device access (phone, laptop, tablet — same mind)
- PostgreSQL + pgvector = industrial-strength vector search with SQL power
- Multi-modal storage (images, audio, video metadata)
- Community can build plugins, importers, retrieval methods
- OAuth for AI providers — users bring their own keys
- Proper API for any client (web, mobile, CLI, MCP)

## Stack
- **Runtime:** Node.js + TypeScript
- **Framework:** Next.js 16 (App Router) — serves both UI and API
- **Database:** PostgreSQL + pgvector extension
- **Search:** Triple-layer retrieval:
  1. BM25 full-text (pg_trgm + tsvector)
  2. Vector similarity (pgvector, cosine distance)
  3. Hierarchical tree index (PageIndex-inspired reasoning paths)
  4. Reciprocal Rank Fusion to combine all three
- **Embeddings:** Gemini `text-embedding-004` (default — free tier, 768d), with OpenAI `text-embedding-3-small` (1536d) and Ollama `nomic-embed-text` (768d) as alternatives. Selection lives in `src/server/embeddings.ts` and is per-user via the `embedding_provider` setting (post-Phase 1; today: global).
- **Storage:** PostgreSQL for all structured data, including the `media` table with `file_path TEXT` pointers. Object storage (Vercel Blob) is **not yet wired**; image-to-memory and voice-to-memory currently store base64 in DB. Vercel Blob integration ships in Phase 4 alongside the `.mind` portable file format.
- **Auth:** NextAuth v5 with Google OAuth (multi-user) and a single-user fallback via the `00000000-0000-0000-0000-000000000000` default user. Session strategy is JWT.
- **MCP:** HTTP transport at `/api/mcp` via `@modelcontextprotocol/sdk`'s `WebStandardStreamableHTTPServerTransport`. Stdio is not exposed in the deployed app (use the bundled extension or a local proxy).

## Database Schema

### memories
- id UUID PK
- user_id UUID FK
- content TEXT
- embedding vector(1536)
- content_type ENUM('text', 'image', 'audio', 'video', 'code', 'conversation')
- source_type TEXT (obsidian, notion, chatgpt, claude, text, url, image, audio)
- source_id TEXT
- source_title TEXT
- metadata JSONB
- parent_id UUID (for hierarchical indexing)
- tree_path TEXT (materialized path for tree traversal)
- created_at TIMESTAMPTZ
- imported_at TIMESTAMPTZ
- tsvector tsvector (auto-generated for BM25)

### tree_index (PageIndex-inspired hierarchical TOC)
- id UUID PK
- user_id UUID FK
- title TEXT
- summary TEXT
- level INT (0=root, 1=section, 2=subsection, etc.)
- parent_id UUID
- memory_ids UUID[] (which memories belong to this node)
- embedding vector(1536) (embedding of the summary)

### profile
- id UUID PK
- user_id UUID FK
- key TEXT
- value TEXT
- category TEXT
- confidence REAL
- source TEXT
- updated_at TIMESTAMPTZ
- UNIQUE(user_id, key)

### facts
- id UUID PK
- user_id UUID FK
- fact TEXT
- category TEXT
- entities TEXT[] (extracted named entities)
- learned_at TIMESTAMPTZ

### connections (cross-pollination cache)
- id UUID PK
- user_id UUID FK
- memory_a_id UUID FK
- memory_b_id UUID FK
- similarity REAL
- surprise REAL
- bridge_concept TEXT
- discovered_at TIMESTAMPTZ

### contradictions (cached)
- id UUID PK
- user_id UUID FK
- memory_a_id UUID FK
- memory_b_id UUID FK
- topic TEXT
- description TEXT
- detected_at TIMESTAMPTZ

### media
- id UUID PK
- user_id UUID FK
- memory_id UUID FK
- file_type TEXT
- file_path TEXT
- file_size BIGINT
- metadata JSONB (EXIF, dimensions, duration, etc.)
- transcript TEXT (for audio/video)
- created_at TIMESTAMPTZ

## Retrieval Pipeline (our innovation)

### Triple-Layer Fusion Retrieval
1. **BM25 Layer:** PostgreSQL full-text search with tsvector + ts_rank_cd
2. **Vector Layer:** pgvector cosine similarity on embeddings
3. **Tree Layer:** Navigate hierarchical index (PageIndex-inspired) — find the right "section" first, then drill into memories
4. **Fusion:** Reciprocal Rank Fusion (RRF) combines all three scores:
   `score = Σ 1/(k + rank_i)` for each layer

### Why hybrid retrieval

- BM25 alone misses semantic meaning.
- Vector alone misses exact keywords and structure.
- RRF fusion gets the best of both — handles "find exact phrase" and "find conceptually similar" in one pass.
- The tree layer today is a lightweight grouping (`source_type → source_title`, with averaged-embedding centroids per group). It contributes structural signal but is **not** a full PageIndex-style LLM-summarized hierarchy yet — that upgrade is a Phase-2 deliverable. The current layer is honest about its scope; the comment in `retrieval.ts` is being reworked to match.

## Community Extension Points
- **Importers:** npm packages that implement ImporterInterface
- **Retrievers:** plug in new retrieval methods
- **Analyzers:** custom insight engines (like our cross-pollination, forgetting curve)
- **MCP Tools:** community can add new MCP tools
- **UI Widgets:** dashboard cards via plugin system

## Multi-Modal Support
- **Images:** stored in media table, embeddings via CLIP or caption-then-embed
- **Audio:** transcribe via Whisper, store transcript + audio file
- **Video:** extract keyframes + audio transcript
- **Code:** language-aware chunking, AST-based
- **Conversations:** preserve turn structure, not just flat text
