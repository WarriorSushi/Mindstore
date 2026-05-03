> **ARCHIVED — 2026-05-03 as v0.** Implementation has not begun. This document will be revived as the v1 design source when Phase 4 of `../../PRODUCTION_READINESS.md` starts; until then it is a vision doc, not a contract. The Phase-4 entry in `../../FEATURE_BACKLOG.md` (entry A.8) tracks the realistic v1 shape.

---

# `.mind` File Format — Complete Specification & Vision Document

## Context for Reader

This document describes a proposed new file format called `.mind` — a self-contained, portable, AI-native knowledge file. It is being designed as the core technology behind **MindStore**, a personal knowledge management platform (web app at mindstore.org) that lets users import all their digital knowledge (ChatGPT conversations, Kindle highlights, PDFs, bookmarks, notes, etc.), search it semantically, chat with it via AI, and analyze it.

**The key innovation:** Instead of storing user knowledge in a traditional server + database architecture, we want to create a single file format that IS the database, IS the search engine, IS the vector store, IS the knowledge graph, and can optionally BE its own server — all in one portable, encrypted, open-format file.

Think of it as: **SQLite gave us "database in a file." `.mind` gives us "entire AI-ready knowledge backend in a file."**

---

## 1. What Is a `.mind` File?

A `.mind` file is a single binary file (typically 10MB–2GB) that contains:

- All of a user's stored knowledge (text, metadata, sources)
- Pre-built search indices (full-text BM25 + inverted index)
- Pre-built vector embeddings + HNSW similarity search index
- A knowledge graph (connections between memories)
- A user profile / knowledge fingerprint
- An append-only changelog (journal) for sync, undo, and time-travel
- Configuration and encryption metadata
- Optionally: an embedded HTTP server binary for self-hosting

A user's entire "second brain" lives in this one file. They can store it on Google Drive, Dropbox, iCloud, a USB stick, S3, their desktop — anywhere. MindStore (or any compatible app) reads and writes this file directly.

---

## 2. Design Principles

1. **Self-contained**: Everything needed to query, search, and analyze the knowledge is inside the file. No external database, no server, no internet required for core operations.

2. **Portable**: One file. Copy it, email it, back it up. Works on any OS, any device.

3. **Memory-mappable & Seekable**: Each section has a fixed offset. Applications can read individual sections via byte-range requests without loading the entire file. This enables browsers to work with large `.mind` files over HTTP (Google Drive, S3, etc.) by fetching only the bytes they need.

4. **AI-native**: Embeddings, vector indices, and knowledge graphs are first-class citizens, not afterthoughts. Any AI agent can consume a `.mind` file and immediately understand and search the user's knowledge.

5. **Encryption by default**: The file supports AES-256-GCM encryption. Your mind, your keys. Even if someone gets the file, they can't read it without your passphrase/key.

6. **Append-friendly**: New data is added via an append-only journal. This enables efficient writes, sync between devices, and complete undo/time-travel history.

7. **Open standard**: The format specification is public (MIT licensed). Anyone can build tools that read/write `.mind` files. MindStore is the reference implementation but not the only one.

---

## 3. What a `.mind` File Must Be Able To Do

### 3.1 — Storage & Data Management

- **Store unlimited text memories** with rich metadata (source type, source title, timestamps, tags, custom fields)
- **Support multiple content types**: text, conversation (preserving turn structure), code (language-aware), webpage (with URL + extracted text), document (with chapter/section structure), highlights (with source book/article + location)
- **Compress content efficiently** using block-level compression (zstd or lz4) — individual memories can be decompressed independently
- **Handle binary attachments** (images, audio, PDFs) either inline (small files <1MB) or as external references with content hashes
- **Deduplicate content** — identical or near-identical memories are detected and stored once
- **Support hierarchical organization** — memories can have parent-child relationships (e.g., a book → chapters → highlights)
- **Tag and categorize** memories with user-defined and auto-generated labels
- **Track provenance** — every memory knows where it came from (ChatGPT export, Kindle, manual entry, URL import, etc.) and when

### 3.2 — Search Engine (Built-In)

The file contains its own search indices. No external search service needed.

- **Full-text keyword search (BM25)**
  - Inverted index stored in the file
  - Supports exact phrase matching, boolean queries (AND/OR/NOT)
  - TF-IDF scoring built in
  - Language-aware tokenization and stemming

- **Semantic / vector search**
  - Pre-computed embedding vectors stored per memory
  - HNSW (Hierarchical Navigable Small World) graph index for approximate nearest neighbor search
  - Supports cosine similarity, dot product, and euclidean distance
  - Multiple embedding models supported (store model name + dimensions in manifest)
  - Quantized vectors supported (int8, binary) for smaller file sizes

- **Fuzzy / trigram search**
  - Character n-gram index for typo-tolerant search
  - "Did you mean...?" suggestions

- **Hybrid search with Reciprocal Rank Fusion**
  - Combines keyword + semantic + graph results
  - Configurable weights per search mode
  - `score = Σ 1/(k + rank_i)` for each retrieval layer

- **Faceted search**
  - Filter by source type, date range, tags, content type
  - Combined with any search mode above

- **Search should work entirely in-memory or via memory-mapped file access** — no temporary files, no external processes

### 3.3 — Knowledge Graph

- **Automatic connection detection** between memories based on:
  - Embedding similarity (cosine > threshold)
  - Shared entities (people, places, concepts mentioned in multiple memories)
  - Shared tags and metadata
  - Temporal proximity (created around the same time)

- **Connection types**:
  - `similar` — semantically related content
  - `contradicts` — conflicting information (detected via AI or heuristics)
  - `follows` — sequential relationship (part of same conversation/document)
  - `references` — one memory explicitly cites another
  - `derived` — one was generated from another (e.g., flashcard from a highlight)
  - Custom user-defined connection types

- **Graph operations**:
  - Shortest path between any two memories
  - Cluster detection (find topic groups)
  - Bridge concepts (memories that connect otherwise unrelated clusters)
  - Orphan detection (isolated memories with no connections)
  - Subgraph extraction (get all memories related to a topic)

- **Graph is stored as a compressed adjacency list** with weighted edges

### 3.4 — Knowledge Profile / Fingerprint

- **Auto-generated user profile** based on stored knowledge:
  - Topic distribution (what % of knowledge is about each topic)
  - Expertise levels per topic (based on depth and breadth of content)
  - Interest timeline (when different topics were added)
  - Knowledge gaps (topics referenced but not deeply covered)
  - Writing style metrics (vocabulary size, complexity, tone)
  - Sentiment distribution over time

- **Profile is queryable** — an AI agent can ask "what does this person know about machine learning?" and get a structured answer without reading every memory

- **Profile updates incrementally** as memories are added/removed

### 3.5 — AI Agent Compatibility

This is critical. A `.mind` file should be the perfect data source for AI agents.

- **MCP (Model Context Protocol) compatible**
  - The file can expose itself as an MCP server (see section 3.8)
  - MCP tools: `search_mind`, `get_memory`, `add_memory`, `get_profile`, `get_connections`, `get_context`
  - Any MCP-compatible AI (Claude, Cursor, etc.) can read/write the user's `.mind` file

- **Structured context retrieval for RAG (Retrieval Augmented Generation)**
  - `get_context(query, max_tokens)` — returns the most relevant memories, formatted for an LLM context window
  - Automatic chunking and ranking to fit within token limits
  - Source citations included so the AI can reference where information came from
  - Supports multiple retrieval strategies: basic similarity, HyDE (Hypothetical Document Embeddings), parent-child chunking, reranking

- **Agent-writable**
  - AI agents can ADD memories to the file (e.g., "save this conversation to your mind")
  - AI agents can CREATE connections (e.g., "I noticed these two memories are related")
  - AI agents can UPDATE the profile (e.g., "based on our conversation, you're interested in X")
  - All agent writes are tagged with the agent's identity in the journal

- **Tool-use schemas**
  - The file contains JSON schemas for all available operations
  - Any AI with tool-use/function-calling can discover and use them
  - OpenAI function calling format, Anthropic tool use format, and generic JSON-RPC all supported

### 3.6 — Security & Encryption

- **File-level encryption**: Entire file (except header + manifest) encrypted with AES-256-GCM
  - Key derived from user passphrase via Argon2id (memory-hard, GPU-resistant)
  - Or key stored in OS keychain / hardware security module
  - Encrypted `.mind` files are indistinguishable from random data without the key

- **Section-level encryption**: Individual sections can have different access levels
  - "Public" profile section (shareable) + "Private" memories (encrypted)
  - Enables: share your knowledge fingerprint without exposing your data

- **Integrity verification**:
  - SHA-256 checksum of each section
  - Merkle tree hash of all memories — detect any tampering
  - File-level checksum in footer

- **Access control for agents**:
  - Permission tokens: "this agent can READ but not WRITE"
  - Scoped access: "this agent can only search memories tagged 'work'"
  - Audit log: every agent access is recorded in the journal
  - Revocable tokens: disable an agent's access without changing the file encryption

- **Zero-knowledge proof of knowledge** (advanced):
  - Prove "I have knowledge about X" without revealing the actual content
  - Useful for credentials, expertise verification

### 3.7 — Self-Hosting / Embedded Server

The most radical feature: **a `.mind` file can serve itself.**

- **Embedded HTTP server**:
  - The file contains a small WebAssembly or native binary (~500KB)
  - Run: `mindstore serve brain.mind --port 8888`
  - Starts a local REST API server that reads/writes the file
  - Endpoints: `/search`, `/memories`, `/graph`, `/profile`, `/chat`, `/mcp`
  - OpenAPI spec auto-generated from the file's capabilities

- **MCP server mode**:
  - `mindstore mcp brain.mind` — starts an MCP stdio server
  - Claude Desktop, Cursor, any MCP client can connect directly
  - Your `.mind` file becomes a live knowledge source for any AI

- **Static hosting**:
  - Upload `brain.mind` to any static file host (S3, GitHub Pages, Vercel)
  - The MindStore web app (client-side) can open it via HTTP range requests
  - No server process needed — the browser does all computation

- **Peer-to-peer sync** (future):
  - Two `.mind` files can sync via WebRTC
  - Journal-based CRDT merge — no central server
  - End-to-end encrypted during sync

### 3.8 — MCP Protocol Integration (Detailed)

The `.mind` file natively speaks MCP (Model Context Protocol), making it plug-and-play with the AI ecosystem.

**MCP Resources exposed:**
```
mind://memories          — list/search all memories
mind://memories/{id}     — get a specific memory
mind://profile           — knowledge fingerprint
mind://graph             — knowledge graph
mind://graph/clusters    — topic clusters
mind://graph/connections/{id} — connections for a memory
mind://sources           — all import sources
mind://stats             — usage statistics
```

**MCP Tools exposed:**
```
search_mind(query, mode, limit, filters)
  → Returns ranked results from keyword, semantic, or hybrid search

get_context(query, max_tokens, strategy)
  → Returns formatted context for RAG, optimized for LLM consumption

add_memory(content, source, metadata)
  → Adds a new memory to the file

connect_memories(id_a, id_b, type, weight)
  → Creates a connection in the knowledge graph

get_profile(topic?)
  → Returns knowledge profile, optionally filtered by topic

suggest_connections(id)
  → Returns potential connections for a memory

find_contradictions(topic?)
  → Scans for conflicting information

summarize_topic(topic, max_tokens)
  → Generates a summary of everything known about a topic

get_timeline(topic?, from?, to?)
  → Returns memories over time for a topic
```

**MCP Prompts exposed:**
```
brief_me(topic)
  → "Here's everything you know about {topic}, organized by relevance"

prep_meeting(person_or_topic)
  → "Here's a briefing for your meeting about {topic}"

find_gaps(domain)
  → "Here are the gaps in your knowledge about {domain}"

daily_digest()
  → "Here's what you added to your knowledge base recently"
```

### 3.9 — Sync & Collaboration

- **Multi-device sync via journal**:
  - Each device appends to the journal
  - Sync = exchange journal entries + merge
  - Conflict resolution: last-write-wins (configurable) or manual merge UI
  - Works over: file copy, cloud storage, WebRTC, or custom sync server

- **Selective sharing**:
  - Export a subset of memories as a new `.mind` file
  - Share your "public profile" without sharing memories
  - "Knowledge trading" — merge two people's `.mind` files (with consent)

- **Team `.mind` files**:
  - Shared knowledge base for a team/company
  - Role-based access (viewer, editor, admin)
  - Per-memory ownership tracking

### 3.10 — Time Travel & Versioning

- **The journal enables complete version history**:
  - "Show me my knowledge base as of January 15, 2026"
  - "What did I add last week?"
  - "Undo the last 5 changes"
  - "Diff my knowledge between two dates"

- **Snapshots**: Periodically, the file can compact the journal into a new base state (like git gc)

- **Branch-and-merge** (advanced): Create a "branch" of your mind file, experiment, merge back — like git for knowledge

### 3.11 — Import & Export

- **Import from anything**:
  - ChatGPT exports (JSON)
  - Kindle highlights (My Clippings.txt)
  - PDFs and EPUBs (with structural parsing)
  - Obsidian vaults (preserving wikilinks and graph)
  - Notion exports
  - Browser bookmarks (HTML)
  - YouTube transcripts
  - Reddit saved posts
  - Twitter/X bookmarks
  - Telegram messages
  - Readwise highlights
  - Pocket/Instapaper
  - Spotify listening history
  - Plain text, Markdown, JSON, CSV
  - URLs (fetch and extract)
  - Images (with AI description)
  - Audio (with transcription)
  - Other `.mind` files (merge)

- **Export to anything**:
  - JSON (full data dump)
  - Markdown files (Obsidian-compatible)
  - Anki flashcard decks (.apkg)
  - PDF reports
  - CSV/TSV
  - HTML (static browsable site)
  - Another `.mind` file (subset export)
  - Notion (via API)

### 3.12 — Analytics & Insights

Built-in analytics that work without any external service:

- **Knowledge metabolism**: How fast are you adding/reviewing knowledge?
- **Topic distribution**: Visual breakdown of what you know
- **Growth timeline**: Knowledge accumulation over time
- **Connection density**: How interconnected is your knowledge?
- **Stale knowledge detection**: Old memories that may be outdated
- **Contradiction count**: How many conflicting beliefs exist?
- **Sentiment arc**: Emotional tone of your knowledge over time
- **Reading/writing patterns**: When are you most active?
- **Source diversity**: Where does your knowledge come from?
- **Expertise scores**: How deep is your knowledge per topic?

---

## 4. Binary Format Structure

```
┌─────────────────────────────────────────────┐
│ MAGIC NUMBER (8 bytes): "MIND0001"          │  ← Identifies the file
├─────────────────────────────────────────────┤
│ FORMAT VERSION (4 bytes): uint32            │
├─────────────────────────────────────────────┤
│ FLAGS (4 bytes): bitfield                   │
│   bit 0: encrypted                          │
│   bit 1: compressed                         │
│   bit 2: has-vector-index                   │
│   bit 3: has-graph                          │
│   bit 4: has-journal                        │
│   bit 5: has-embedded-server                │
│   bits 6-31: reserved                       │
├─────────────────────────────────────────────┤
│ SECTION TABLE OFFSET (8 bytes): uint64      │  ← Points to section directory
├─────────────────────────────────────────────┤
│                                             │
│  SECTION: MANIFEST                          │  ← JSON metadata about the file
│  (offset + length in section table)         │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  SECTION: ENCRYPTION HEADER                 │  ← Salt, IV, key derivation params
│  (only if encrypted)                        │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  SECTION: CONTENT STORE                     │  ← All memories, block-compressed
│  [block0][block1][block2]...                │
│  Each block: [header][compressed_data]      │
│  Block size: ~64KB compressed               │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  SECTION: CONTENT INDEX                     │  ← Memory ID → block offset mapping
│  Sorted by ID for binary search             │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  SECTION: TEXT INDEX                         │  ← Inverted index for BM25 search
│  [vocabulary][postings_lists]               │
│  Compressed with variable-byte encoding     │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  SECTION: VECTOR STORE                      │  ← Raw embedding vectors
│  [vector0][vector1]...                      │
│  Optional: quantized (int8 or binary)       │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  SECTION: VECTOR INDEX                      │  ← HNSW graph for ANN search
│  [layers][nodes][edges]                     │
│  Memory-mappable for zero-copy search       │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  SECTION: GRAPH                             │  ← Knowledge graph adjacency list
│  [edge_count][edges...]                     │
│  Each: [id_a:16B][id_b:16B][type:1B]       │
│         [weight:4B][metadata_offset:4B]     │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  SECTION: PROFILE                           │  ← Knowledge fingerprint (JSON)
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  SECTION: JOURNAL                           │  ← Append-only change log
│  [entry0][entry1][entry2]...                │
│  Each: [timestamp:8B][op:1B][data...]       │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  SECTION: AGENT PERMISSIONS                 │  ← Access control tokens
│  [token0][token1]...                        │
│  Each: [agent_id][scope][permissions]       │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  SECTION: EMBEDDED SERVER (optional)        │  ← WASM binary for self-hosting
│  WebAssembly module (~500KB)                │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  SECTION TABLE (directory)                  │  ← Where each section lives
│  [section_type:2B][offset:8B][length:8B]    │
│  [checksum:32B][compression:1B]             │
│  Repeated for each section                  │
│                                             │
├─────────────────────────────────────────────┤
│ FILE CHECKSUM (32 bytes): SHA-256           │
│ MAGIC FOOTER (8 bytes): "MIND0001"          │  ← Validates file integrity
└─────────────────────────────────────────────┘
```

---

## 5. Operations & API

When a `.mind` file is "opened" (by an app, SDK, or its embedded server), it exposes these operations:

### Core Operations
```
mind.open(path_or_url, passphrase?) → MindFile
mind.close() → void
mind.save() → void
mind.export(format, options?) → File
mind.merge(other_mind_file) → MergeResult
mind.compact() → void  // Flush journal into base, rebuild indices
mind.verify() → IntegrityReport
```

### Memory Operations
```
mind.add(content, metadata?) → MemoryID
mind.get(id) → Memory
mind.update(id, changes) → Memory
mind.delete(id) → void
mind.list(filters?, pagination?) → Memory[]
mind.count(filters?) → number
mind.bulk_add(memories[]) → MemoryID[]
```

### Search Operations
```
mind.search(query, options?) → SearchResult[]
  options: {
    mode: 'keyword' | 'semantic' | 'hybrid' | 'fuzzy'
    limit: number
    offset: number
    filters: { source?, type?, tags?, dateRange?, ... }
    weights: { keyword: 0.3, semantic: 0.5, graph: 0.2 }
    rerank: boolean
    explain: boolean  // Include scoring breakdown
  }

mind.similar(memory_id, limit?) → SearchResult[]
mind.suggest(partial_query) → string[]  // Autocomplete
mind.get_context(query, max_tokens, strategy?) → RAGContext
```

### Graph Operations
```
mind.connect(id_a, id_b, type?, weight?) → Connection
mind.disconnect(id_a, id_b) → void
mind.connections(id, type?, depth?) → Connection[]
mind.shortest_path(id_a, id_b) → Memory[]
mind.clusters(min_size?) → Cluster[]
mind.bridges() → Memory[]  // Memories connecting different clusters
mind.orphans() → Memory[]  // Unconnected memories
mind.subgraph(topic_or_ids) → Graph
```

### Profile Operations
```
mind.profile() → KnowledgeProfile
mind.profile.topics() → TopicDistribution
mind.profile.expertise(topic) → ExpertiseLevel
mind.profile.gaps() → KnowledgeGap[]
mind.profile.timeline() → InterestTimeline
mind.profile.style() → WritingStyle
mind.profile.sentiment() → SentimentArc
```

### Journal Operations
```
mind.journal.entries(from?, to?) → JournalEntry[]
mind.journal.undo(count?) → void
mind.journal.redo(count?) → void
mind.journal.snapshot() → SnapshotID
mind.journal.restore(snapshot_id) → void
mind.journal.diff(from, to) → Diff
mind.journal.at(timestamp) → ReadOnlyMindFile  // Time travel
```

### Agent / Security Operations
```
mind.agents.grant(agent_id, permissions, scope?) → Token
mind.agents.revoke(agent_id) → void
mind.agents.list() → AgentPermission[]
mind.agents.audit(agent_id?) → AuditEntry[]
```

### Server Operations
```
mind.serve(port?, options?) → Server
  // Starts HTTP REST API + MCP server
  // All operations above available via HTTP
  
mind.mcp() → MCPServer
  // Starts MCP stdio server for AI tool integration
```

---

## 6. Implementation Languages & Targets

The core `.mind` engine should be implemented in a language that compiles to:

| Target | Use Case |
|--------|----------|
| **WebAssembly** | Browser-based (mindstore.org runs entirely client-side) |
| **Native (x86/ARM)** | CLI tool, desktop app, server deployment |
| **JavaScript/TypeScript** | Node.js SDK, Deno, Bun |
| **Python** | Data science, notebooks, AI pipelines |

**Recommended core language: Rust**
- Compiles to WASM (browser) and native (CLI/server)
- Memory-safe (important for a security-critical format)
- Excellent performance for search indices and vector operations
- Good FFI story for Python/Node bindings

---

## 7. Competitive Landscape

| Product | Storage | Search | Vectors | Graph | AI-Native | Portable | Encrypted | Self-Host |
|---------|---------|--------|---------|-------|-----------|----------|-----------|-----------|
| Notion | Cloud | Basic | ❌ | ❌ | Partial | ❌ | ❌ | ❌ |
| Obsidian | Local files | Plugin | Plugin | Links | Plugin | ✅ | Vault | ✅ |
| Mem | Cloud | AI | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Reflect | Cloud | AI | ✅ | Links | ✅ | ❌ | E2E | ❌ |
| Capacities | Cloud | Basic | ❌ | Objects | Partial | ❌ | ❌ | ❌ |
| **`.mind`** | **File** | **BM25+Vector+Graph** | **✅ HNSW** | **✅ Full** | **✅ MCP+RAG** | **✅** | **✅ AES-256** | **✅ Embedded** |

**No existing product combines all of these in a single portable file.**

---

## 8. Use Cases

### For Individuals
- "I want to search 5 years of ChatGPT conversations"
- "I want all my Kindle highlights + notes in one place, searchable"
- "I want to ask AI questions about MY knowledge, not the internet"
- "I want to see how my interests have evolved over time"
- "I want to own my data — not give it to another cloud service"

### For Developers
- "I want to give Claude/Cursor access to my personal knowledge base via MCP"
- "I want to build apps that read `.mind` files — custom UIs, analysis tools"
- "I want a portable vector database I can ship with my app"

### For Teams
- "Shared team knowledge base that any AI agent can query"
- "Onboarding: new hire gets the team `.mind` file and can ask it anything"
- "Meeting prep: AI reads the team `.mind` for context before any meeting"

### For AI Agents
- "I need persistent memory across conversations — store it in a `.mind` file"
- "I need to search a user's knowledge to answer their question"
- "I need to learn a user's preferences and expertise over time"

---

## 9. Patent-Worthy Innovations

1. **Self-serving file format**: A file that contains its own HTTP/MCP server as an embedded WebAssembly module
2. **Multi-index knowledge file**: Single file containing BM25 + HNSW + knowledge graph indices, all memory-mappable
3. **Journal-based CRDT sync for knowledge files**: Append-only journal enabling conflict-free multi-device sync without a central server
4. **Selective-encryption knowledge container**: Section-level encryption allowing partial sharing (public profile + private memories in same file)
5. **AI permission scoping in file format**: Per-agent access tokens with scope restrictions embedded in the file itself
6. **Byte-range queryable knowledge archive**: File structure designed for HTTP range request access, enabling cloud-hosted files to be queried without full download
7. **Embedded vector quantization with index co-location**: Storing quantized vectors alongside their HNSW index in a single seekable section for zero-copy search

---

## 10. Why This Matters

Every major AI company is building walled gardens for user data. OpenAI has your conversations. Google has your search history. Notion has your notes. None of them let you take your data and use it freely.

`.mind` inverts this: **your knowledge lives in a file YOU own.** Any app can read it. Any AI can query it. You decide who gets access and to what.

It's the **PDF of personal knowledge** — a universal, portable, open format that puts the user in control.

---

*Document version: 1.0 | Date: 2026-03-24 | Author: Frain (AltCorp / MindStore)*
