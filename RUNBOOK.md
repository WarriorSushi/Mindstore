# MindStore Runbook

**Audience:** anyone (human or agent) operating the production deployment of MindStore at `mindstore.org`.
**Companion docs:** `STATUS.md` for live state, `PRODUCTION.md` for first-time setup, `CLAUDE_TAKEOVER.md` for the working contract.
**Update cadence:** every time we hit a real incident, the response goes in here.

If you're reading this in the middle of an incident: jump to **§9 Incident triage**.

---

## 1. Architecture in 60 seconds

| Layer | Where it runs | What can break it |
|---|---|---|
| Web app | Vercel (Next.js 16, Fluid Compute) | Vercel outage, cold starts on rare-route Functions, build failure |
| Database | External Postgres (Supabase by default) with `pgvector`, `pg_trgm`, `pgcrypto` | Connection limit exceeded, missing extension after restore, vector dimension drift |
| AI providers | Caller-configured (Gemini / OpenAI / OpenRouter / Ollama / custom) per user | Provider outage, key revoked, quota exhausted |
| MCP endpoint | Same Vercel deployment, route `/api/mcp` | Same as web app + per-request `server.connect` overhead |
| Background jobs | `vercel.json` cron → `/api/v1/plugin-jobs/run-due` and `/api/v1/reindex/tick` | Cron not wired (see BLOCK-4 in STATUS), token mismatch, job timeout |
| Browser extension | Chrome (MV3, side-loaded) | Manifest changes, host permissions revoked |

Everything else is client-side TypeScript and can be redeployed.

---

## 2. Day-1 environment variables

Set these in `Vercel Project → Settings → Environment Variables`:

### Required

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:5432/db?sslmode=require`. SSL required (the codebase enforces it via `getPostgresClientOptions`). |
| `AUTH_SECRET` | 32-byte random string. Generate with `openssl rand -hex 32`. |
| `ENCRYPTION_KEY` | **Set this explicitly.** If unset, the encryption layer falls back to a hash of `DATABASE_URL` — rotating the DB password then breaks every encrypted setting. ARCH-2. |

### Recommended

| Variable | Notes |
|---|---|
| `GEMINI_API_KEY` | Free at `aistudio.google.com/apikey`. The "out-of-the-box working" key for new users. |
| `OPENAI_API_KEY` | Optional alternative. |
| `OPENROUTER_API_KEY` | Optional. |
| `OLLAMA_URL` | If self-hosting models. |
| `INTERNAL_JOB_TOKEN` | Required for `/api/v1/plugin-jobs/run-due` if not relying on the Vercel cron header. Generate a 32-byte random string. |
| `MCP_ALLOWED_ORIGINS` | Comma-separated list. Empty/unset means MCP responses omit `Access-Control-Allow-Origin`. |

### Multi-user mode

Adds:

| Variable | Notes |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth app at `console.cloud.google.com/apis/credentials`. |
| `ALLOW_SINGLE_USER_MODE=false` | Forces auth on every request. |
| `NEXT_PUBLIC_URL` | e.g. `https://mindstore.org`. |

Multi-user is gated on **BLOCK-5** in `STATUS.md` until ARCH-1 (per-user `settings` table) ships.

---

## 3. Deploy

Standard Vercel push-to-Git flow:

1. Merge to `main` (auto-deploys to production) or to a `claude/**` / `feat/**` branch (auto-creates a preview).
2. Vercel CI runs the `.github/workflows/ci.yml` workflow on every PR (lint:ci → typecheck → test → build → playwright). PRs don't merge unless CI is green.
3. After production deploy: visit `https://mindstore.org/api/health` — must return `{ status: "ok", timestamp: ... }`.
4. Visit `https://mindstore.org/api/v1/health` with a Bearer API key — must return full diagnostics (DB connected, providers, identity mode).

If `/api/health` returns `unhealthy`: skip ahead to §9.

---

## 4. Rollback

Vercel keeps every deployment. To roll back:

1. `Vercel Dashboard → Deployments → click the previous green deploy → Promote to Production`.
2. If the issue is data-related (bad migration, corrupt embeddings): rollback **does not undo migrations**. See §6.

For PR-time rollbacks (a bad commit on `main` not yet promoted): create a `claude/revert-<sha>` branch with a `git revert <sha>`, merge that PR.

---

## 5. Database migration

Migrations live in `src/server/migrate.ts` (raw SQL, idempotent). Schema definition lives in `src/server/schema.ts` (Drizzle).

### Run a migration

Locally:
```bash
DATABASE_URL=postgres://... npm run migrate
```

In production: SSH/Supabase SQL editor; or run a one-off Vercel function call from the CLI.

### Add a new migration

1. Edit `src/server/schema.ts` (Drizzle definition).
2. Add the corresponding `CREATE TABLE` / `ALTER TABLE` block to `src/server/migrate.ts`. Wrap it in a `DO $$ ... EXCEPTION WHEN duplicate_*` guard so re-runs are safe.
3. Add a unit test in `tests/unit/<feature>-schema.test.ts` if the migration encodes invariants (constraints, defaults).
4. Test against a fresh DB: `dropdb mindstore_test; createdb mindstore_test; DATABASE_URL=... npm run migrate`.

### Rolling back a migration

We don't have automatic rollback. The recovery path:

1. Grab the most recent backup (Supabase keeps them automatically; verify the schedule).
2. Restore the relevant tables.
3. If you need to re-replay subsequent app activity, the `chat_conversations`, `memories`, and `search_history` tables hold most of the user-visible delta.

Plan the migration so it's additive (new column, new table) — never `DROP COLUMN` without an owner-approved drain plan.

---

## 6. Backups

| Layer | Backup mechanism | Verified frequency |
|---|---|---|
| Postgres | Supabase native (or `pg_dump` cron if self-hosted) | Verify weekly. |
| Vercel Blob (Phase 4+) | Versioned by default; lifecycle policy in Vercel | TBD when wired. |
| User-uploaded `.mind` files (Phase 4+) | Per-file versioning | TBD. |
| Code | Git origin (GitHub) | Always. |

If you discover backups aren't running: that's an incident. Open a `BLOCK-` row in STATUS.md.

---

## 7. AI-provider switch

If a provider is down or expensive, switch the default for new users:

1. `Vercel → Environment Variables`. Add or remove `GEMINI_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `OLLAMA_URL`.
2. Per-user keys in the `settings` table override env-var defaults — this is by design. Users with their own keys are unaffected.
3. After change: hit `/api/v1/health` (with Bearer auth) and check `providers.*.configured`.

The provider preference order (when multiple keys exist) is in `src/server/ai-client.ts:resolveTextGenerationConfigFromSettings`. Today's order: explicit `chat_provider` setting → Gemini → OpenAI → OpenRouter → custom → Ollama. Same logic in `src/server/embeddings.ts` for embeddings.

---

## 8. Plugin disable

Any plugin can be disabled without a deploy:

1. Authenticate as the affected user.
2. `POST /api/v1/plugins` with `{ "action": "disable", "slug": "<plugin-slug>" }`.
3. The plugin's UI tab and background jobs stop running. Existing data is untouched.

To re-enable: same call with `action: "enable"`.

For a system-wide disable (revoke a buggy plugin from all users): set the `plugins.status` column to `'disabled'` in the DB for that slug. The runtime won't load it.

---

## 9. Incident triage

### Production is down (`/api/health` returns 503 or fails to load)

1. Check Vercel deployment status. Roll back to the previous green deploy if a recent push correlates.
2. If `database.connected: false`: check Supabase status. Verify connection pool not exhausted (`postgres-client.ts` uses `max: 10`). Bump if needed.
3. If `database.configured: false`: `DATABASE_URL` is missing or unparseable. Restore env var.
4. If MCP is failing but the rest works: check `/api/mcp` Bearer auth — most MCP clients silently retry on 401, which can look like a hang.

### Embedding writes failing

1. `/api/v1/health` should report which provider is configured.
2. Check provider status pages.
3. Embedding-dim mismatch (user changed provider mid-stream): fix is the "re-embed all" job (ARCH-9, Phase 1).
4. Quota exhausted: rotate to a different provider key per §7.

### Chat returning errors only on long messages

1. Default function timeout is 300s on Vercel; chat streams should complete within that.
2. If using Gemini and the response stops mid-stream: Gemini sometimes drops chunks. The streaming code in `ai-client.ts:streamGeminiText` handles malformed chunks; check logs for `Skip malformed chunks`.
3. If timeouts: lower `max_tokens` on the model setting.

### Cron not running

1. Verify `vercel.json` has the `crons:` block (BLOCK-4).
2. Check Vercel Dashboard → Cron Jobs.
3. Manually trigger the endpoint: `curl -X POST -H "Authorization: Bearer $INTERNAL_JOB_TOKEN" https://mindstore.org/api/v1/plugin-jobs/run-due`. If that works but cron doesn't, the cron header isn't matching.

### Memory or job queue backed up

1. `SELECT status, COUNT(*) FROM indexing_jobs GROUP BY 1` to inspect the queue.
2. Manually run `npm run jobs:run-indexing` from a one-off Vercel function or from a dev machine pointing at production DB.
3. If a single job is stuck (`status='running'` for hours): set its row to `status='failed'` to unblock the queue, then investigate the underlying error in `last_error`.

### Encrypted settings not decrypting

Almost always means `ENCRYPTION_KEY` rotated or `DATABASE_URL` rotated when no `ENCRYPTION_KEY` was set (ARCH-2). Recovery:

1. Identify the previous key (last value of `ENCRYPTION_KEY` or last `DATABASE_URL`).
2. Run a one-off script that reads each `settings.value` starting with `enc:v1:`, decrypts with the OLD key, re-encrypts with the NEW key. Pseudo-code:

```ts
import { decryptWithKey, encryptWithKey } from "@/server/encryption";
for (const row of await db.execute(sql`SELECT key, value FROM settings`)) {
  if (!row.value.startsWith("enc:v1:")) continue;
  const plain = decryptWithKey(row.value, OLD_KEY);
  const next = encryptWithKey(plain, NEW_KEY);
  await db.execute(sql`UPDATE settings SET value = ${next} WHERE key = ${row.key}`);
}
```

The reusable helpers don't exist yet — that's a Phase 1 deliverable for ARCH-2.

---

## 10. Useful one-liners

```bash
# How many memories does a given user have?
psql "$DATABASE_URL" -c "SELECT user_id, COUNT(*) FROM memories GROUP BY 1 ORDER BY 2 DESC LIMIT 10;"

# Which routes are slowest? (after observability lands)
curl -H "Authorization: Bearer $ADMIN_API_KEY" https://mindstore.org/api/v1/admin/metrics

# Force re-embed of a user's memories
curl -X POST -H "Authorization: Bearer $USER_API_KEY" \
  https://mindstore.org/api/v1/reindex \
  -d '{ "scope": "all" }'

# Audit npm vulnerabilities (run weekly)
npm audit
```

---

## 11. Escalation

For anything not covered here: surface it as a `BLOCK-` row in `STATUS.md` §8 with the specific question for the owner. Do not improvise destructive actions.

For security issues: see `SECURITY.md` for responsible disclosure.
