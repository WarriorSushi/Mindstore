# Production deployment guide

This is the end-to-end checklist for taking MindStore from "running on my laptop" to "real customers paying real money." It covers both deployment paths in detail:

1. **Vercel + Neon (recommended for cloud SaaS)** — fastest path to a paid product
2. **Self-host with Docker Compose** — for users who want full data sovereignty

If you're just trying it out locally and not deploying anywhere, you don't need this — `npm install && npm run migrate && npm run dev` works.

---

## Path 1 — Vercel + Neon (cloud SaaS)

Total time: 60–90 minutes if you have all the accounts ready. Mostly waiting on DNS and Stripe verification.

### Step 1 — Database (Neon, ~5 min)

The cleanest setup is **Neon via Vercel Marketplace**:

1. In your Vercel project → Storage tab → **Add Integration** → **Neon Postgres**.
2. Pick a region close to your function region (default is fine for now).
3. Vercel auto-creates `DATABASE_URL` and adds it to your project env vars.
4. Open the Neon dashboard from the integration card and run **once**:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pgvector;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   ```
   (Or just run `npm run migrate` from your machine pointed at the Neon URL — the migration enables the extensions itself.)

Alternative providers that work the same way: **Supabase** (paste their pooled connection string), **Railway**, **Render**, or self-hosted Postgres 14+. All you need is pgvector support.

### Step 2 — Required env vars (~10 min)

Paste these into Vercel project settings → **Environment Variables**:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | (auto from Neon) | Connection string with `?sslmode=require` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` | **Critical**. API keys are encrypted at rest with this; rotating it breaks every stored key. |
| `AUTH_SECRET` | `openssl rand -hex 32` | NextAuth JWT signing |
| `NEXT_PUBLIC_URL` | `https://your-domain.com` | The public URL of your deployment |
| `ALLOW_SINGLE_USER_MODE` | `false` | Disables the single-user fallback so unauthenticated requests are rejected |

### Step 3 — Google OAuth (~10 min)

Multi-user signup needs this. (You can defer if you only want a personal deployment.)

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. Create credentials → OAuth client ID → Web application
3. Authorized redirect URIs: `https://your-domain.com/api/auth/callback/google`
4. Copy the client ID + secret into Vercel env vars:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
5. On the OAuth consent screen, add `https://your-domain.com` to authorized domains and any test users you want during development.

### Step 4 — Stripe (subscription billing) (~25 min)

Skip this if you're not selling subscriptions yet (every other feature works without it). When you're ready:

1. Sign up at [stripe.com](https://stripe.com), complete the verification flow.
2. **Create products + prices** in the Stripe dashboard:
   - Product: **MindStore Personal** → recurring monthly price → $12.00 USD → save the price ID (`price_...`)
   - Product: **MindStore Pro** → recurring monthly price → $29.00 USD → save the price ID
3. Set Vercel env vars:
   - `STRIPE_SECRET_KEY` (Live secret key from Stripe → Developers → API keys)
   - `STRIPE_PRICE_PERSONAL` (the Personal price ID)
   - `STRIPE_PRICE_PRO` (the Pro price ID)
4. **Configure the webhook**:
   - Stripe → Developers → Webhooks → **Add endpoint**
   - URL: `https://your-domain.com/api/v1/billing/webhook`
   - Events to send:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - After saving, copy the **Signing secret** → set as `STRIPE_WEBHOOK_SECRET` in Vercel.
5. **Enable the Customer Portal**: Stripe → Settings → Billing → Customer portal → activate. Make sure "Cancel subscriptions" and "Update payment methods" are toggled on. (Customers manage everything inside Stripe's UI; we don't build that.)
6. Test with [Stripe test mode](https://stripe.com/docs/testing) before flipping to live keys: use test card `4242 4242 4242 4242` on the `/pricing` page, confirm the webhook fires, confirm the user's `subscriptions` row updates.

### Step 5 — Bundled AI (Vercel AI Gateway) (~10 min)

Required if you want subscriptions to *include AI tokens* rather than only being a platform fee for BYO-key users.

1. In Vercel → AI Gateway tab → enable
2. Generate a gateway key (lives at the project level)
3. Set `MINDSTORE_AI_GATEWAY_KEY` env var to that key
4. Done. Subscribed users now use bundled tokens via the gateway; their per-user spend is visible in the Vercel AI Gateway dashboard.

The gateway speaks the OpenAI-compatible Chat Completions API and routes to whichever underlying model you pick. The default model in MindStore's bundled mode is `anthropic/claude-sonnet-4-5`. Power users can override per-call.

> If you skip this step, MindStore still works for paid customers — they just have to BYO key, which makes the subscription a flat platform fee rather than including AI. That's a perfectly valid business model (Cursor's cheapest tier does this).

### Step 6 — Domain + SSL (~10 min)

1. Vercel → Domains → add your domain
2. Add the CNAME / A records Vercel shows you to your DNS provider
3. Wait for propagation (usually <5 min)
4. SSL is automatic

### Step 7 — Deploy

```bash
git push origin main
```

Vercel auto-deploys. The first build also runs `npm run migrate` (if you've set the migrate script in your build command — by default Next.js builds skip it; you may need to add a Vercel `@vercel/postgres-migrate` job or run migrations once manually with `vercel env pull && npm run migrate`).

### Step 8 — Smoke test

Run through these in order. If any of them fails, the deployment isn't ready yet.

- [ ] `https://your-domain.com` loads the landing page
- [ ] `/pricing` loads with all three tiers visible
- [ ] `/login` shows Google OAuth (or single-user button if `ALLOW_SINGLE_USER_MODE=true`)
- [ ] After login, `/app` loads — the dashboard
- [ ] **Migrate**: `vercel env pull && npm run migrate` runs without error and reports "Migration complete"
- [ ] Import a small ChatGPT export — memories show up at `/app/explore`
- [ ] `/app/chat` returns a response (will use BYOK flow if no `MINDSTORE_AI_GATEWAY_KEY`, bundled flow if set)
- [ ] **Stripe** (if billing enabled): hit `/pricing` → click Subscribe on Personal → complete checkout in test mode → return to `/app/settings/billing` → see the subscription row populated
- [ ] **MCP**: hit `/app/mcp-setup` → mint a key → paste the Claude Desktop config → restart Claude → ask Claude "what do I know about [topic]" → get a real answer with citations
- [ ] **Webhook**: in Stripe → Developers → Webhooks → click your endpoint → confirm green check on recent deliveries

If all eight pass, you're live.

---

## Path 2 — Self-host with Docker Compose

Total time: 5 minutes.

```bash
git clone https://github.com/<your-org>/mindstore
cd mindstore

# Copy + edit the env file. At minimum set ENCRYPTION_KEY and AUTH_SECRET.
cp .env.example .env
nano .env

# Up
docker compose up -d

# Open
open http://localhost:3000
```

That's it. You have:
- Postgres with pgvector running in a container, data persisted in the `mindstore_pgdata` volume
- The Next.js app on port 3000
- Migrations run automatically on every container start (idempotent)
- Single-user mode by default (no login needed; flip `ALLOW_SINGLE_USER_MODE=false` + add Google OAuth env vars to enable multi-user)
- BYO AI keys (paste into Settings); no platform-side AI is configured by default

To upgrade later:
```bash
git pull && docker compose build && docker compose up -d
```

To back up the database:
```bash
docker compose exec postgres pg_dump -U mindstore mindstore > backup-$(date +%F).sql
```

To restore:
```bash
docker compose exec -T postgres psql -U mindstore mindstore < backup-2026-05-04.sql
```

---

## Path 3 — Self-host on bare metal (no Docker)

```bash
# Prerequisites: Node 24+, Postgres 14+ with pgvector
git clone https://github.com/<your-org>/mindstore
cd mindstore

# Set up Postgres (one time)
psql -U postgres -c "CREATE USER mindstore WITH PASSWORD 'changeme';"
psql -U postgres -c "CREATE DATABASE mindstore OWNER mindstore;"
psql -U postgres -d mindstore -c "CREATE EXTENSION IF NOT EXISTS pgvector;"
psql -U postgres -d mindstore -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# Configure
cp .env.example .env
nano .env

# Build + run
npm install
npm run migrate
npm run build
npm start
```

For a real production deployment on bare metal, also set up:
- Process manager: pm2 or systemd unit
- Reverse proxy: Caddy (auto-SSL) or nginx
- Backup cron: `pg_dump` to S3 / Backblaze on a schedule

---

## Pre-launch checklist (before charging real money)

Run through this before pointing customers at the deployment.

- [ ] `ENCRYPTION_KEY` set to a random 32-byte string (NOT the default that derives from `DATABASE_URL`)
- [ ] `AUTH_SECRET` set to a random 32-byte string
- [ ] `ALLOW_SINGLE_USER_MODE=false` (multi-user mode active; default fallback disabled)
- [ ] Google OAuth configured and tested with a real Google account
- [ ] Stripe in **live mode** (not test). Verify the API key starts with `sk_live_`, not `sk_test_`.
- [ ] Stripe webhook secret matches the live endpoint, not test
- [ ] Stripe Customer Portal activated and tested (cancel a test subscription, confirm it cancels)
- [ ] Privacy policy + terms of service pages exist (linked from the pricing page footer)
- [ ] Vercel AI Gateway monthly spend cap set as a safety net
- [ ] Database has automatic backups enabled (Neon does this by default; for self-host wire up `pg_dump`)
- [ ] You've personally subscribed your own account to test the full flow end-to-end
- [ ] You've personally cancelled your own account to verify cancellation works
- [ ] `STATUS.md` reflects production state
- [ ] `npm run typecheck && npm test && npm run build` all green from a clean clone

When all 13 are checked, take payments.

---

## Operational runbook

### "User says they paid but their tier didn't change"

Check Stripe → Webhooks → recent deliveries. If it's red:
- Click the failed event → see the error
- Most common: webhook secret rotated and `STRIPE_WEBHOOK_SECRET` env var didn't update
- Stripe will retry for 3 days; once you fix the secret, click "Resend" on the failed event

### "User says they're at their token cap and can't chat"

Check `/app/settings/billing` for the user → confirm their tier and usage. If genuinely at cap:
- Soft-fail message tells them to upgrade or BYO key
- You can manually grant a one-off bump by inserting a negative `usage_records` row (rare; usually let them upgrade)

### "Embeddings are slow on a large knowledge base"

Look at the Neon dashboard → CPU + connection count. If under load:
- Bump to a larger Neon plan (1-click)
- Add an HNSW index on the embeddings column (Phase 5 todo; not yet wired)

### "Stripe says my account is in 'collect more information' mode"

Stripe sometimes auto-flags new accounts on first transaction. Submit business verification documents in the Stripe dashboard. While in this state, payments work but payouts are held.

### "Vercel deploy is failing with 'pgvector extension does not exist'"

The migration tries to `CREATE EXTENSION IF NOT EXISTS vector` which requires superuser. Neon and Supabase grant this automatically; some self-hosted setups don't. Run the `CREATE EXTENSION` SQL once as a Postgres superuser, then redeploy.

---

## What's NOT in this guide

- **Marketing**: see `docs/mcp/marketplace-listings.md` for MCP directory submissions, and `docs/mcp/demo-scripts.md` for the launch demo videos.
- **Pricing logic specifics**: tiers + quotas live in `src/server/billing/tiers.ts`. Edit there if you want to change limits; the pricing page reads from the same source.
- **Compliance (GDPR / SOC 2 / etc.)**: out of scope for this guide. If you need it, talk to a compliance consultant — at minimum, MindStore today supports per-user data export (.mind file) and per-user data deletion (DELETE all the user's tables on account close), which covers the core GDPR right-to-export and right-to-erasure obligations.
- **High availability**: this guide deploys to a single region. For multi-region active-active you'd need to think about pgvector replication and gateway latency — out of scope for v1.
