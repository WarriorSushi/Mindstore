# Codex Roadmap

This is the active implementation roadmap for the `codex/*` branch family.

## Product Truth

MindStore should be usable in three practical ways:

1. Self-hosted with PostgreSQL and no hosted AI provider
2. Self-hosted or hosted with API-key providers
3. Eventually, provider-account login for users who want to use their existing AI subscriptions instead of direct API billing

## Near-Term Agenda

### 1. Provider Access Foundation

- Make requirements and auth modes explicit in product surfaces and docs
- Introduce a provider-access abstraction instead of assuming API keys forever
- Prepare encrypted auth-profile storage for future subscription-style provider login

### 2. MCP Modernization

- Migrate `/api/mcp` toward the official MCP TypeScript SDK
- Keep MindStore's current tools working during the migration
- Register plugin-provided tools, resources, and prompts through the runtime rather than hardcoded lists

### 3. Plugin Runtime Deepening

- Make runtime/plugin surfaces first-class in MCP
- Reduce drift between plugin metadata and actual execution surfaces
- Keep built-ins and community plugin surfaces aligned

### 4. Jobs and Scheduling

- Move plugin jobs beyond manual execution
- Add scheduling and execution groundwork for recurring or queued runtime jobs
- Keep the design compatible with a future worker service

### 5. MindStore Everywhere

- Improve site adapters and capture quality
- Keep packaging and setup simple for non-technical users
- Evolve hosted auth ergonomics after the provider-auth foundation exists

## Integration Principle

Feature-heavy work from other branches should be integrated after the codex foundation is strong enough to absorb it cleanly.

## Branch Convergence

The active convergence strategy is:

1. preserve `frain` docs and planning artifacts that Irfan actively uses
2. use `codex` as the architectural destination branch
3. port `frain` feature plugins into the codex runtime shape one by one
4. start with `kindle-importer`, `flashcard-maker`, and `voice-to-memory`

See [BRANCH_CONVERGENCE.md](./BRANCH_CONVERGENCE.md) and [plugin porting guide](../build/plugin-porting-guide.md).
