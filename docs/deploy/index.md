# Deploy

How to take MindStore from your laptop to a real deployment, in as much or as little detail as you want.

## Pick your path

| Path | Time | Right for |
|---|---|---|
| **[Production guide](./production.md)** | 60–90 min | Cloud SaaS on Vercel + Neon, with Stripe billing and bundled AI |
| **Docker Compose** (in repo root) | 5 min | Self-host a single-user or small-team instance |
| **Bare metal** (in production guide) | 15 min | You already run Postgres + a node process manager |

For just trying it out locally without deploying anywhere: `npm install && npm run migrate && npm run dev`. You don't need any of these guides.

## Older docs

These predate the production guide and are now mostly historical. The production guide subsumes them, but if you only want a quick checklist:

- [Deployment Modes](./deployment-modes.md) — single-user vs multi-user vs hosted
- [Deployment Checklist](./checklist.md) — terse checklist of pre-launch items

## What deployment docs should answer

- Which env vars are required ([production.md §2](./production.md#step-2--required-env-vars-10-min) covers this exhaustively)
- Which services are optional (Stripe, Vercel AI Gateway, Google OAuth — all optional unless you want the corresponding feature)
- How to migrate and verify the database (one command: `npm run migrate`; the migration is idempotent)
- How to troubleshoot provider and auth issues ([production.md operational runbook](./production.md#operational-runbook))

## Recommended reading

- [**Production guide** (start here)](./production.md)
- [Deployment Modes](./deployment-modes.md)
- [Deployment Checklist](./checklist.md)
- [Public Deployment Auth Guide](../auth/public-deployments.md)
- [MCP marketplace listings](../mcp/marketplace-listings.md) — once the deployment is live, this is how you submit it to Claude/Cursor/etc.
