# Product Completion Plan

This is the trunk-level completion plan for turning MindStore from a promising platform into a trustworthy product.

## Definition of done

MindStore is only complete enough to call functional when a new user can:

- deploy it without guessing
- sign in and get their own isolated workspace
- import real data without silent indexing degradation
- search and chat over imported data reliably
- connect an MCP client successfully
- use the highest-value plugins without hidden setup traps
- recover from provider or database failures without corrupting data or getting stuck

## Current truth

The project is strong on breadth and architecture, but the biggest remaining risk areas are:

- auth and identity correctness on public deployments
- import/indexing durability for large or provider-less imports
- chat and retrieval reliability under real production constraints
- plugin quality classification versus plugin count
- end-to-end test coverage for the top workflows

## Execution phases

### Phase 0: Product truth

- keep setup docs, env docs, and deployment docs accurate
- remove product claims that outpace the code
- maintain first-run and production checklists as product features, not side docs

### Phase 1: Identity and auth hardening

- public deployments must require authentication
- all data access must remain scoped to authenticated `user_id`
- single-user fallback must stay private-install only
- auth failure modes must degrade clearly, not cryptically

### Phase 2: Durable ingestion and indexing

- imports must never silently stay half-indexed
- large imports should queue embedding backfill instead of skipping it forever
- indexing status should be visible to users and operators
- rebuild and backfill flows should be retryable and scriptable

### Phase 3: Core workflow reliability

- import -> search -> chat -> MCP must work on a fresh deployment
- chat should continue converging on shared AI/provider infrastructure
- route responses and error contracts should become predictable across the app

### Phase 4: Plugin hardening

- classify plugins as production, beta, or experimental
- harden the top-value plugin in each category first
- keep the plugin runtime, settings, jobs, docs, and routes aligned

### Phase 5: Activation and UX

- reduce first-run friction
- improve empty states, provider-missing states, and recovery states
- simplify extension and MCP setup for normal users

### Phase 6: Quality and observability

- keep expanding `lint:ci` in controlled slices
- grow e2e from smoke tests into real workflow journeys
- surface health for database, indexing, jobs, and providers

### Phase 7: Community ecosystem

- make plugin authoring discoverable and safe
- document plugin lifecycle, compatibility, testing, and trust model
- provide templates and examples instead of expecting contributors to reverse-engineer internals

## Active execution order

1. Fix live auth and deployment blockers immediately.
2. Make import/indexing durable.
3. Expand workflow-level e2e coverage.
4. Continue controlled lint and route hardening.
5. Harden plugin quality and classify readiness honestly.

## Current active slice

The active trunk slice after this document lands is:

- fix the live auth proxy regression
- then implement import/indexing durability so embedding backfill becomes explicit and recoverable
