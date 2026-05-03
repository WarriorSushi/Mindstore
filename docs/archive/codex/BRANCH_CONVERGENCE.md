# Branch Convergence

This document explains how `origin/codex/local-dev` and `origin/frain/improve` should converge without losing work or creating a broken hybrid.

## The Short Version

- `codex` is the architectural base
- `frain` is the feature reservoir
- convergence means **same product direction and feature set**
- it does **not** require destructive branch overwrites

## Why Codex Is The Base

The codex branch currently owns the stronger foundation:

- plugin SDK and runtime
- scheduled plugin job groundwork
- official MCP SDK transport usage
- browser extension packaging/setup flow
- docs system
- tests and CI
- contributor/open-source scaffolding
- provider-access model

## Why Frain Still Matters

The frain branch currently owns much of the feature breadth:

- many plugin APIs
- many dedicated app pages
- richer end-user workflows across analysis, creation, sync, and AI enhancement
- active product-level polish work

## What “Same Point” Should Mean

The two branches being at the same point should mean:

- the same important docs are preserved
- the same major user-facing capabilities exist
- the same direction of plugin architecture is understood
- future work lands into one converging shape rather than two diverging ones

It should **not** mean:

- blindly force-pushing one branch over the other
- one giant merge commit with thousands of unresolved architectural conflicts

## Current Decision

Use `codex/local-dev` as the destination branch for convergence.

Port `frain` features into the codex architecture in slices.

## Porting Order

### Slice 1: Preserve docs and product context

- keep `IMPROVEMENTS.md`
- keep `MIND_FILE_SPEC.md`
- keep product notes that Irfan actively uses

### Slice 2: Example plugin ports

- `kindle-importer` (completed on codex as the importer reference port)
- `flashcard-maker` (completed on codex as the first reference port)
- `voice-to-memory` (completed on codex with shared AI/transcription plumbing)

These are the reference ports that teach the pattern for the rest.

### Slice 3: High-value page and route ports

- writing style
- newsletter
- resume
- learning paths
- custom RAG
- image-to-memory

### Slice 4: Sync/import expansions

- Twitter
- Telegram
- Pocket
- Spotify
- Readwise
- Notion sync
- Obsidian sync

### Slice 5: Navigation and UX reconciliation

- grouped sidebar
- command palette additions
- quick capture and memory drawer surfaces

## What Can Be Reused Immediately

- parser logic
- prompt logic
- export formatting
- page layouts
- source-type visual mapping ideas
- plugin-specific schemas and table ideas

## What Needs Adaptation

- plugin registration
- settings persistence
- MCP exposure
- scheduled/background execution
- route contracts
- install/enable/disable behavior
- docs and testing expectations

## Immediate Working Agreement

1. New foundational work lands on `codex`.
2. New feature ports should target the codex runtime shape.
3. Avoid broad rewrites of shared files without a specific convergence goal.
4. Use the plugin porting guide for feature migration.

## Success Condition

Convergence is succeeding when:

- major `frain` capabilities appear on the codex branch
- docs and runtime quality from codex remain intact
- new work starts targeting one architecture instead of two

## Latest Reference Port

`flashcard-maker` is now the first end-to-end example of the convergence pattern:

- feature UI retained
- route logic extracted into `src/server/plugins/ports/flashcard-maker.ts`
- codex-side schema and tests added
- plugin surfaced in navigation and docs

Use it as the template for the next ports.

`voice-to-memory` is now the second end-to-end example:

- shared AI/transcription client
- media-oriented validation and persistence
- preserved workflow page
- thin API route over reusable server logic

Use it as the template for audio or file-based AI plugins.

`kindle-importer` is now the importer reference example:

- parsing and dedup live in `src/server/plugins/ports/kindle-importer.ts`
- route logic is thin
- preview and import contracts are preserved
- import storage flows through codex import primitives

Use it as the template for file-based importer ports.
