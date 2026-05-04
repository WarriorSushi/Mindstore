-- ┌────────────────────────────────────────────────────────────────────┐
-- │  STEP 3: COMPLETE MINDSTORE SCHEMA — IDEMPOTENT                    │
-- │                                                                    │
-- │  This is the FULL set of statements from src/server/migrate.ts,    │
-- │  hand-extracted into a single SQL file you can run in Supabase     │
-- │  SQL Editor or `psql`.                                             │
-- │                                                                    │
-- │  Use this file when:                                               │
-- │    * You're setting up a brand-new database                        │
-- │    * Your discover.sql output showed lots of MISSING tables        │
-- │    * You want to be 100% sure the schema matches what the code     │
-- │      expects, regardless of current state                          │
-- │                                                                    │
-- │  Every statement is IF NOT EXISTS / DO $$ EXCEPTION-guarded so     │
-- │  running this on a fully-migrated DB is a no-op. Running it on a   │
-- │  partially-migrated DB fills in the gaps. Running it on an empty   │
-- │  DB creates everything from scratch.                               │
-- │                                                                    │
-- │  Same source as `npm run migrate` — they produce the same end      │
-- │  state.                                                            │
-- └────────────────────────────────────────────────────────────────────┘

-- ─── Extensions ─────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ─── Enums ──────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE content_type AS ENUM ('text', 'image', 'audio', 'video', 'code', 'conversation', 'webpage', 'document');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE plugin_type AS ENUM ('extension', 'mcp', 'prompt');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE plugin_status AS ENUM ('installed', 'active', 'disabled', 'error');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'import_complete', 'analysis_ready', 'review_due', 'plugin_event',
    'system', 'export_ready', 'connection_found', 'milestone'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE knowledge_risk_type AS ENUM ('secret', 'spof', 'silo', 'gap', 'pii');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE knowledge_risk_severity AS ENUM ('critical', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ─── Core tables ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  name TEXT,
  image TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  content TEXT NOT NULL,
  embedding vector,
  content_type content_type DEFAULT 'text',
  source_type TEXT NOT NULL,
  source_id TEXT,
  source_title TEXT,
  metadata JSONB DEFAULT '{}',
  parent_id UUID,
  tree_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tree_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  level INT DEFAULT 0,
  parent_id UUID,
  memory_ids UUID[],
  embedding vector,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop dimension constraint on existing vector columns (in case they
-- were created with a fixed dim earlier — the project supports mixed
-- providers via runtime dim checks).
ALTER TABLE memories ALTER COLUMN embedding TYPE vector USING embedding::vector;
ALTER TABLE tree_index ALTER COLUMN embedding TYPE vector USING embedding::vector;

CREATE TABLE IF NOT EXISTS profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  confidence REAL DEFAULT 0.5,
  source TEXT DEFAULT 'manual',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key)
);

CREATE TABLE IF NOT EXISTS facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  fact TEXT NOT NULL,
  category TEXT,
  entities TEXT[],
  learned_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'conversation'
);

CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  memory_a_id UUID REFERENCES memories(id),
  memory_b_id UUID REFERENCES memories(id),
  similarity REAL,
  surprise REAL,
  bridge_concept TEXT,
  discovered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  memory_a_id UUID REFERENCES memories(id),
  memory_b_id UUID REFERENCES memories(id),
  topic TEXT,
  description TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  memory_id UUID REFERENCES memories(id),
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INT,
  metadata JSONB DEFAULT '{}',
  transcript TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ─── Plugin system ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT DEFAULT '1.0.0',
  type plugin_type NOT NULL DEFAULT 'extension',
  status plugin_status NOT NULL DEFAULT 'installed',
  icon TEXT,
  category TEXT,
  author TEXT DEFAULT 'MindStore',
  config JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_plugins_slug ON plugins(slug);
CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
CREATE INDEX IF NOT EXISTS idx_plugins_category ON plugins(category);

CREATE TABLE IF NOT EXISTS plugin_job_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  plugin_slug TEXT NOT NULL,
  job_id TEXT NOT NULL,
  enabled INT NOT NULL DEFAULT 1,
  interval_minutes INT NOT NULL DEFAULT 1440,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_summary TEXT,
  last_error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, plugin_slug, job_id)
);
CREATE INDEX IF NOT EXISTS idx_plugin_job_schedule_due ON plugin_job_schedules(enabled, next_run_at);


-- ─── Flashcards / voice / API keys ──────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcard_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL,
  cards JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user ON flashcard_decks(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_updated ON flashcard_decks(updated_at);

CREATE TABLE IF NOT EXISTS voice_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  title TEXT,
  transcript TEXT,
  duration_seconds REAL,
  audio_size INT,
  audio_format TEXT DEFAULT 'webm',
  language TEXT,
  provider TEXT,
  model TEXT,
  confidence REAL,
  word_count INT,
  saved_as_memory INT NOT NULL DEFAULT 0,
  memory_id UUID REFERENCES memories(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_user ON voice_recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_created ON voice_recordings(created_at);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_saved ON voice_recordings(saved_as_memory);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  key TEXT UNIQUE NOT NULL,
  name TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ─── Settings (per-user as of ARCH-1) ───────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id UUID;

UPDATE settings SET user_id = '00000000-0000-0000-0000-000000000001'::uuid
  WHERE user_id IS NULL;

ALTER TABLE settings ALTER COLUMN user_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE settings DROP CONSTRAINT settings_key_key;
EXCEPTION WHEN undefined_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE settings DROP CONSTRAINT settings_key_unique;
EXCEPTION WHEN undefined_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE settings ADD CONSTRAINT settings_user_key_unique UNIQUE (user_id, key);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_settings_user ON settings (user_id);


-- ─── Search history / chat / reviews / tags ─────────────────────────
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  query TEXT NOT NULL,
  result_count INT DEFAULT 0,
  searched_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history (user_id, searched_at DESC);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  title TEXT NOT NULL DEFAULT 'New conversation',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT,
  memory_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_convos_user ON chat_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS memory_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  memory_id UUID REFERENCES memories(id) ON DELETE CASCADE NOT NULL,
  review_count INT DEFAULT 0,
  next_review_at TIMESTAMPTZ NOT NULL,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, memory_id)
);
CREATE INDEX IF NOT EXISTS idx_memory_reviews_due ON memory_reviews (user_id, next_review_at);

CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT 'teal',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_user_name ON tags (user_id, name);
CREATE INDEX IF NOT EXISTS idx_tags_user ON tags (user_id);

CREATE TABLE IF NOT EXISTS memory_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES memories(id) ON DELETE CASCADE NOT NULL,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_tags_unique ON memory_tags (memory_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_memory_tags_memory ON memory_tags (memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_tags_tag ON memory_tags (tag_id);


-- ─── Notifications / images / indexing ──────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  icon TEXT,
  color TEXT DEFAULT 'teal',
  href TEXT,
  plugin_slug TEXT,
  metadata JSONB DEFAULT '{}',
  read INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

CREATE TABLE IF NOT EXISTS image_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  title TEXT,
  description TEXT,
  image_data TEXT,
  image_size INTEGER,
  image_format TEXT DEFAULT 'png',
  image_width INTEGER,
  image_height INTEGER,
  tags TEXT[] DEFAULT '{}',
  context_type TEXT DEFAULT 'general',
  provider TEXT,
  model TEXT,
  word_count INTEGER,
  saved_as_memory BOOLEAN DEFAULT false,
  memory_id UUID REFERENCES memories(id),
  custom_prompt TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_image_analyses_user ON image_analyses (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS indexing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  provider TEXT,
  requested_count INT NOT NULL DEFAULT 0,
  processed_count INT NOT NULL DEFAULT 0,
  remaining_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_indexing_jobs_user ON indexing_jobs (user_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_indexing_jobs_status ON indexing_jobs (status, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_indexing_jobs_user_type ON indexing_jobs (user_id, job_type, status);


-- ─── Memory indexes for performance ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(user_id, source_type);
CREATE INDEX IF NOT EXISTS idx_memories_tree ON memories(user_id, tree_path);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tree_user ON tree_index(user_id);
CREATE INDEX IF NOT EXISTS idx_facts_user ON facts(user_id);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_memories_fts ON memories
  USING gin(to_tsvector('english', content));

-- Trigram index for fuzzy search
CREATE INDEX IF NOT EXISTS idx_memories_trgm ON memories
  USING gin(content gin_trgm_ops);

-- Note: pgvector IVFFlat index is intentionally NOT created here.
-- It needs at least 100 rows of training data to be useful, and is
-- created conditionally by `npm run migrate` once you have memories.
-- To add it manually after you've imported some memories:
--   CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories
--     USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);


-- ─── NextAuth tables ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INT,
  token_type TEXT,
  scope TEXT,
  id_token TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  expires TIMESTAMPTZ NOT NULL
);


-- ─── Phase 4 (Knowledge Attack Surface) ─────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  risk_type knowledge_risk_type NOT NULL,
  severity knowledge_risk_severity NOT NULL,
  description TEXT NOT NULL,
  affected_memory_ids UUID[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed INTEGER NOT NULL DEFAULT 0,
  dismissed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_knowledge_risks_user ON knowledge_risks(user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_risks_user_dismissed ON knowledge_risks(user_id, dismissed, severity);


-- ─── Phase 3 (Forgetting Curve) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_forgetting_risk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  memory_id UUID REFERENCES memories(id) ON DELETE CASCADE NOT NULL,
  risk_score REAL NOT NULL,
  days_since_touch INTEGER NOT NULL,
  recommendation_priority INTEGER NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_forgetting_risk_unique ON memory_forgetting_risk(user_id, memory_id);
CREATE INDEX IF NOT EXISTS idx_forgetting_risk_user_score ON memory_forgetting_risk(user_id, risk_score DESC);


-- ─── Phase 2 (Knowledge Fingerprint Snapshots) ──────────────────────
CREATE TABLE IF NOT EXISTS mind_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  memory_count INTEGER NOT NULL DEFAULT 0,
  source_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  cluster_centroids JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  fingerprint_svg TEXT,
  trigger TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_mind_snapshots_user ON mind_snapshots(user_id, taken_at DESC);


-- ─── Phase 2 (Knowledge Metabolism Score) ───────────────────────────
CREATE TABLE IF NOT EXISTS metabolism_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  week_start TIMESTAMPTZ NOT NULL,
  score REAL NOT NULL,
  intake_rate REAL NOT NULL,
  connection_density REAL NOT NULL,
  retrieval_frequency REAL NOT NULL,
  growth_velocity REAL NOT NULL,
  memories_added INTEGER NOT NULL DEFAULT 0,
  searches_performed INTEGER NOT NULL DEFAULT 0,
  chats_performed INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_metabolism_user_week ON metabolism_scores(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_metabolism_user ON metabolism_scores(user_id, week_start DESC);


-- ─── Default user (single-user mode fallback) ───────────────────────
INSERT INTO users (id, email, name)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'default@local',
  'Default User'
)
ON CONFLICT (email) DO NOTHING;


-- ─── Subscriptions (Stripe-backed, NEW in this push) ────────────────
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
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions (stripe_subscription_id);


-- ─── Usage records (NEW in this push) ───────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_usage_user_month ON usage_records (user_id, month_key);


-- ─── Done ───────────────────────────────────────────────────────────
-- Run 1-discover.sql afterwards if you want to verify everything.
SELECT 'Schema applied. Verify with 1-discover.sql.' AS done;
