-- ┌────────────────────────────────────────────────────────────────────┐
-- │  STEP 2: MIGRATIONS FOR THIS PUSH ONLY                             │
-- │                                                                    │
-- │  Run this if your discover.sql output showed:                      │
-- │    * Most tables already exist (your DB has been migrated before)  │
-- │    * Only `subscriptions` and `usage_records` are MISSING          │
-- │    * `settings` table exists but doesn't have `user_id` column     │
-- │                                                                    │
-- │  If your DB is empty or missing many tables, use 3-full-schema.sql │
-- │  instead — it brings any DB to the right state in one pass.        │
-- │                                                                    │
-- │  Idempotent. Safe to re-run. Wrap in BEGIN/COMMIT if you want.     │
-- └────────────────────────────────────────────────────────────────────┘

BEGIN;

-- ─── 0. Make sure extensions are present (idempotent) ───────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ─── 1. Make sure the default user exists ───────────────────────────
-- The settings backfill below will fail with a FK error if this is
-- missing. The default user is the single-user-mode UUID; on multi-
-- user deployments it's just a placeholder that holds legacy global
-- settings rows during the transition.
INSERT INTO users (id, email, name)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'default@local',
  'Default User'
)
ON CONFLICT (id) DO NOTHING;


-- ─── 2. Per-user settings migration (ARCH-1) ────────────────────────
-- Add user_id column, backfill existing rows, swap the unique
-- constraint from global UNIQUE(key) to UNIQUE(user_id, key).

ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id UUID;

UPDATE settings
SET user_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE user_id IS NULL;

ALTER TABLE settings ALTER COLUMN user_id SET NOT NULL;

-- Drop the old global UNIQUE(key). The constraint name varies between
-- Postgres versions, so try both common variants. At most one exists;
-- the other no-ops.
DO $$ BEGIN
  ALTER TABLE settings DROP CONSTRAINT settings_key_key;
EXCEPTION WHEN undefined_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE settings DROP CONSTRAINT settings_key_unique;
EXCEPTION WHEN undefined_object THEN null; END $$;

-- Add the new per-user unique constraint
DO $$ BEGIN
  ALTER TABLE settings ADD CONSTRAINT settings_user_key_unique UNIQUE (user_id, key);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_settings_user ON settings (user_id);


-- ─── 3. Subscriptions table (Stripe-backed) ─────────────────────────
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


-- ─── 4. Usage records table (per-user token tracking) ───────────────
CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  kind TEXT NOT NULL,                      -- 'tokens-in' | 'tokens-out' | 'embedding-tokens' | 'requests'
  provider TEXT NOT NULL DEFAULT 'gateway',-- 'gateway' for bundled, 'byo:openai' / 'byo:gemini' / etc.
  amount BIGINT NOT NULL DEFAULT 0,
  cost_micros BIGINT NOT NULL DEFAULT 0,   -- integer cost in micro-USD ($1.234 = 1234000), avoids float drift
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE usage_records ADD CONSTRAINT usage_records_unique
    UNIQUE (user_id, month_key, kind, provider);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_usage_user_month
  ON usage_records (user_id, month_key);


COMMIT;


-- ─── 5. Verify everything landed correctly ──────────────────────────
-- Run this after the COMMIT. All three checks should return rows.

-- A. settings now has user_id
SELECT 'settings.user_id' AS check_name,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'settings' AND column_name = 'user_id'
       ) THEN 'OK' ELSE 'FAIL' END AS result;

-- B. subscriptions table exists with the right columns
SELECT 'subscriptions table' AS check_name,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_name = 'subscriptions'
       ) THEN 'OK' ELSE 'FAIL' END AS result;

-- C. usage_records table exists
SELECT 'usage_records table' AS check_name,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_name = 'usage_records'
       ) THEN 'OK' ELSE 'FAIL' END AS result;

-- All three should print 'OK'. If any print 'FAIL', the BEGIN block
-- rolled back — scroll up in the SQL Editor output to find the error.
