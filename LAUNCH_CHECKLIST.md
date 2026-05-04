# MindStore launch checklist

Single source of truth for taking the current `main` branch to a paying production deployment. Work top to bottom — every step is independently verifiable.

> **For the deeper guide** with screenshots and operational runbook: [`docs/deploy/production.md`](./docs/deploy/production.md). This file is the terse owner-facing checklist.

---

## Before you start

You'll need accounts on:

- [ ] **Vercel** (deployment) — likely already have it
- [ ] **Supabase or Neon** (database) — pick one; you mentioned Supabase, that works perfectly
- [ ] **Google Cloud Console** (OAuth, only if multi-user) — [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
- [ ] **Stripe** (billing, only if charging) — [stripe.com](https://stripe.com)
- [ ] **Vercel AI Gateway** (only if bundling AI tokens into subscriptions) — already part of your Vercel project

Not everything is required. The minimum to deploy is Vercel + Supabase. Everything else is opt-in.

---

## Step 1 — Run the database migrations

This is the **one thing that will break your deployment if you skip it.** All previous push iterations worked because the schema matched the code. This commit changes the schema (per-user settings + new tables for billing). The new code expects the new schema.

### Option A — paste SQL into Supabase SQL Editor (fastest, what you asked about)

Open Supabase → SQL Editor → New query. Paste each of these blocks **in order** and click Run. They're idempotent — safe to run multiple times, safe even if some tables already exist.

**1. Required extensions** (only needed first time; Supabase usually has these on already)

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**2. Per-user settings migration (ARCH-1)** — this is the critical one for this deploy

```sql
-- Add user_id column to settings table
ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id UUID;

-- Backfill existing rows to the default user
UPDATE settings
SET user_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE user_id IS NULL;

-- Lock the column
ALTER TABLE settings ALTER COLUMN user_id SET NOT NULL;

-- Drop the old global UNIQUE(key) constraint (name varies by Postgres version,
-- so try both common variants — at most one will exist).
DO $$ BEGIN
  ALTER TABLE settings DROP CONSTRAINT settings_key_key;
EXCEPTION WHEN undefined_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE settings DROP CONSTRAINT settings_key_unique;
EXCEPTION WHEN undefined_object THEN null; END $$;

-- Add the new per-user UNIQUE constraint
DO $$ BEGIN
  ALTER TABLE settings ADD CONSTRAINT settings_user_key_unique UNIQUE (user_id, key);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Index for per-user lookups
CREATE INDEX IF NOT EXISTS idx_settings_user ON settings (user_id);
```

**3. Subscriptions table** (Stripe-backed, even if you're not charging yet)

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  tier TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON subscriptions (stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON subscriptions (stripe_subscription_id);
```

**4. Usage records table** (per-user token tracking, for bundled-AI mode)

```sql
CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gateway',
  amount BIGINT NOT NULL DEFAULT 0,
  cost_micros BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE usage_records ADD CONSTRAINT usage_records_unique
    UNIQUE (user_id, month_key, kind, provider);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_usage_user_month
  ON usage_records (user_id, month_key);
```

After running all four blocks, run this verification query — it should return rows for all three:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('settings', 'subscriptions', 'usage_records');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'settings' AND column_name = 'user_id';
-- Should return one row: user_id
```

- [ ] All four SQL blocks run cleanly in Supabase
- [ ] Verification query confirms `settings.user_id` exists and the two new tables exist

### Option B — run `npm run migrate` from your laptop (also fine, runs everything)

```bash
# 1. Pull production env vars locally
vercel env pull .env.production.local

# 2. Run migrations against production DB
DATABASE_URL=$(grep '^DATABASE_URL=' .env.production.local | cut -d= -f2- | tr -d '"') \
  npm run migrate

# Should end with: ✅ Migration complete!
```

This runs ALL the migrations in `src/server/migrate.ts` — the new ones from this commit plus all the prior ones (which are no-ops since they already ran). Idempotent.

### Option C — make Vercel run it on every deploy (recommended long-term)

One-line change to `package.json`:

```diff
- "build": "next build",
+ "build": "npm run migrate && next build",
```

After this, every `git push` runs migrations as part of the build. Idempotent + safe — if migrations fail, the build fails and the broken code never ships.

- [ ] Pick one of the three options. Option A is fine for *this* deploy. For long-term, do Option C eventually.

---

## Step 2 — Set environment variables in Vercel

Vercel project → Settings → Environment Variables.

### Required for any deployment

```
DATABASE_URL                  (already set, probably)
ENCRYPTION_KEY                openssl rand -hex 32     ← generate now if you haven't
AUTH_SECRET                   openssl rand -hex 32     ← generate now
NEXT_PUBLIC_URL               https://your-domain.com
```

> **Critical:** `ENCRYPTION_KEY` defaults to a hash of `DATABASE_URL` if unset. Rotating your DB password later would silently brick every encrypted API key. Set this once to a real random string and never change it. (BLOCK-3 in STATUS — closes when you set this.)

### Required for multi-user mode (recommended for any public deployment)

```
ALLOW_SINGLE_USER_MODE        false
GOOGLE_CLIENT_ID              (from Google Cloud Console)
GOOGLE_CLIENT_SECRET          (from Google Cloud Console)
```

Google OAuth setup:
1. [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. Create credentials → OAuth client ID → Web application
3. Authorized redirect URI: `https://your-domain.com/api/auth/callback/google`
4. Copy client ID + secret into Vercel

### Required only if charging subscriptions (Stripe)

```
STRIPE_SECRET_KEY             sk_live_...   (or sk_test_ for testing)
STRIPE_WEBHOOK_SECRET         whsec_...
STRIPE_PRICE_PERSONAL         price_...
STRIPE_PRICE_PRO              price_...
```

Stripe setup:
1. Create account at stripe.com, complete verification
2. Stripe Dashboard → Products → Create:
   - **MindStore Personal** → recurring monthly $12.00 → save price ID
   - **MindStore Pro** → recurring monthly $29.00 → save price ID
3. Stripe Dashboard → Developers → Webhooks → Add endpoint:
   - URL: `https://your-domain.com/api/v1/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the signing secret → set as `STRIPE_WEBHOOK_SECRET` in Vercel
4. Stripe Dashboard → Settings → Billing → Customer portal → activate. Toggle on "Cancel subscriptions" and "Update payment methods."
5. Test with `4242 4242 4242 4242` in test mode before flipping to live keys.

### Required only if bundling AI tokens into subscriptions

```
MINDSTORE_AI_GATEWAY_KEY      (from Vercel AI Gateway tab in your project)
```

If you skip this, MindStore still works for paid customers — they just have to BYO key. Subscription becomes a flat platform fee. Cursor's cheapest tier does this; valid model.

### Checklist

- [ ] ENCRYPTION_KEY set to random 32-byte string
- [ ] AUTH_SECRET set to random 32-byte string
- [ ] NEXT_PUBLIC_URL set to your domain
- [ ] ALLOW_SINGLE_USER_MODE=false (if multi-user)
- [ ] Google OAuth configured (if multi-user)
- [ ] Stripe configured (if charging) — all four env vars + webhook + Customer Portal
- [ ] Vercel AI Gateway configured (if bundling tokens)

---

## Step 3 — Deploy

```bash
git push origin main
```

Vercel auto-deploys. Watch the deployment logs in the Vercel dashboard.

- [ ] Build succeeds (you can verify locally first with `npm run build`)
- [ ] Deployment shows "Ready" in Vercel dashboard

---

## Step 4 — Smoke test the deployed site

Run through these in order. Stop and fix at the first one that fails before continuing.

- [ ] `https://your-domain.com` loads — landing page renders
- [ ] `/pricing` loads — three tiers visible, comparison table populated
- [ ] `/login` loads — Google OAuth button visible (if configured) OR single-user fallback (if not)
- [ ] After login, `/app` loads — the dashboard
- [ ] Settings → paste a Gemini API key (free tier from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)) → confirm it saves
- [ ] Import a small ChatGPT export at `/app/import` → memories appear at `/app/explore`
- [ ] `/app/chat` → ask a question → response streams back (uses BYOK if no gateway key, bundled if `MINDSTORE_AI_GATEWAY_KEY` set)
- [ ] `/app/mcp-setup` → mint a key → paste the Claude Desktop config → restart Claude → ask "what do I know about [topic]" → real answer with citations

If you set up Stripe:

- [ ] `/pricing` → Subscribe on Personal → Stripe Checkout opens
- [ ] Use test card `4242 4242 4242 4242`, any future expiry, any CVV
- [ ] Returns to `/app/settings/billing` showing the new tier
- [ ] Stripe Dashboard → Webhooks → recent deliveries shows green ✓

---

## Step 5 — Pre-paid-launch checklist (only when ready to charge real money)

These don't matter while you're testing or in beta. They matter when you accept your first dollar.

- [ ] Stripe in **live mode** (key starts with `sk_live_`, not `sk_test_`)
- [ ] Stripe webhook secret matches the **live** endpoint
- [ ] Privacy policy page exists at `/privacy` (link in footer of `/pricing`)
- [ ] Terms of service page exists at `/terms` (link in footer)
- [ ] Vercel AI Gateway monthly spend cap set as a safety net (so a hostile user can't run up a $5,000 bill)
- [ ] Database has automatic backups enabled (Supabase has this on by default — verify in their dashboard)
- [ ] You've personally subscribed your own account through the live flow to verify
- [ ] You've personally cancelled to verify the cancel flow works
- [ ] Demo videos recorded ([`docs/mcp/demo-scripts.md`](./docs/mcp/demo-scripts.md))
- [ ] Submitted to MCP marketplaces ([`docs/mcp/marketplace-listings.md`](./docs/mcp/marketplace-listings.md))

---

## Common things that go wrong (and how to fix)

### "User says they paid but their tier didn't change"
Check Stripe → Webhooks → recent deliveries. Red = webhook failed. Most common cause: webhook secret in Vercel is from test mode, but you switched to live mode. Stripe retries for 3 days; fix the secret then click "Resend" on the failed event.

### "Embeddings are broken / search returns nothing"
The embedding provider's key isn't set. User needs to paste one in Settings, OR you set `GEMINI_API_KEY` (free tier) at the platform level. After setting, embeddings backfill via the indexing job — older imports get embeddings within a few minutes.

### "Bundled AI says quota exceeded for a Pro user"
Look at `/app/settings/billing` for the user — the cap is monthly. They've genuinely used 6M tokens this month. Either upgrade them manually (UPDATE the `subscriptions.tier` row) or have them switch to BYO key in Settings.

### "Vercel deploy is failing with `pgvector extension does not exist`"
Skipped Step 1 — run the migration SQL. Or run `vercel env pull && npm run migrate` once.

### "Pricing page says 'Subscribe' but the click goes nowhere"
You're either not logged in OR Stripe isn't configured. Check `STRIPE_SECRET_KEY` and the three Stripe env vars are set. The route returns 503 with a clear message if any are missing.

### "I rotated my database password and now nothing works"
You probably didn't set `ENCRYPTION_KEY` separately, so it derives from `DATABASE_URL`. Every encrypted setting (API keys especially) is now unreadable. Restore the old DB password until you migrate. Going forward: set a real `ENCRYPTION_KEY` and never change it.

---

## What I (Claude) cannot do for you

This list is the literal handoff. Don't ship paid until all of these are done — the *code* is ready, these are owner-only.

| | What | Why I can't do it |
|---|---|---|
| 1 | Run the SQL in Supabase | I don't have your Supabase credentials |
| 2 | Set Vercel env vars | I don't have your Vercel access token |
| 3 | Create Stripe products + webhook | I don't have your Stripe account |
| 4 | Configure Google OAuth | I don't have access to your Google Cloud Console |
| 5 | Set DNS records for the domain | I don't have your DNS provider's API access |
| 6 | Generate `ENCRYPTION_KEY` / `AUTH_SECRET` | These are random — `openssl rand -hex 32` from your terminal, twice |
| 7 | Write privacy policy + terms | Need legal review for a paid product |
| 8 | Record demo videos | I can't film — scripts are in `docs/mcp/demo-scripts.md` |
| 9 | Submit to marketplaces | I can't impersonate you — copy is in `docs/mcp/marketplace-listings.md` |

Once you've done 1, 2, and 3, the deployment can take payments. Items 4–9 are quality-of-life and launch polish.

---

## Quick reference

- Production guide (long-form): [`docs/deploy/production.md`](./docs/deploy/production.md)
- MCP setup page (in-app): `https://your-domain.com/app/mcp-setup`
- Pricing page (public): `https://your-domain.com/pricing`
- Billing dashboard (per-user): `https://your-domain.com/app/settings/billing`
- Demo video scripts: [`docs/mcp/demo-scripts.md`](./docs/mcp/demo-scripts.md)
- Marketplace listings copy: [`docs/mcp/marketplace-listings.md`](./docs/mcp/marketplace-listings.md)
- STATUS (live ground truth): [`STATUS.md`](./STATUS.md)
