import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { DEFAULT_USER_EMAIL, DEFAULT_USER_ID, DEFAULT_USER_NAME } from './identity';
import { getPostgresClientOptions } from './postgres-client';

const connectionString = process.env.DATABASE_URL || 'postgres://mindstore:password@localhost:5432/mindstore';

async function migrate() {
  const client = postgres(connectionString, getPostgresClientOptions(connectionString, {}));
  const db = drizzle(client);

  console.log('Running MindStore database migrations...');

  // Enable extensions
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  // Create enum
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE content_type AS ENUM ('text', 'image', 'audio', 'video', 'code', 'conversation', 'webpage', 'document');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `);

  // Users table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      name TEXT,
      image TEXT,
      settings JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Memories table — the core
  await db.execute(sql`
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
    )
  `);

  // Tree index (PageIndex-inspired)
  await db.execute(sql`
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
    )
  `);

  // Alter existing tables to remove dimension constraint (safe to run multiple times)
  await db.execute(sql`ALTER TABLE memories ALTER COLUMN embedding TYPE vector USING embedding::vector`);
  await db.execute(sql`ALTER TABLE tree_index ALTER COLUMN embedding TYPE vector USING embedding::vector`);

  // Profile
  await db.execute(sql`
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
    )
  `);

  // Facts
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS facts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) NOT NULL,
      fact TEXT NOT NULL,
      category TEXT,
      entities TEXT[],
      learned_at TIMESTAMPTZ DEFAULT NOW(),
      source TEXT DEFAULT 'conversation'
    )
  `);

  // Connections cache
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS connections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) NOT NULL,
      memory_a_id UUID REFERENCES memories(id),
      memory_b_id UUID REFERENCES memories(id),
      similarity REAL,
      surprise REAL,
      bridge_concept TEXT,
      discovered_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Contradictions cache
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contradictions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) NOT NULL,
      memory_a_id UUID REFERENCES memories(id),
      memory_b_id UUID REFERENCES memories(id),
      topic TEXT,
      description TEXT,
      detected_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Media
  await db.execute(sql`
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
    )
  `);

  // === PLUGIN SYSTEM ===
  
  // Plugin type/status enums
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE plugin_type AS ENUM ('extension', 'mcp', 'prompt');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE plugin_status AS ENUM ('installed', 'active', 'disabled', 'error');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `);

  // Plugins table
  await db.execute(sql`
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
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_plugins_slug ON plugins(slug)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_plugins_category ON plugins(category)`);

  // Plugin job schedules
  await db.execute(sql`
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
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_plugin_job_schedule_due ON plugin_job_schedules(enabled, next_run_at)`);

  // Flashcard decks
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS flashcard_decks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT NOT NULL,
      cards JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user ON flashcard_decks(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_flashcard_decks_updated ON flashcard_decks(updated_at)`);

  // Voice recordings
  await db.execute(sql`
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
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_voice_recordings_user ON voice_recordings(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_voice_recordings_created ON voice_recordings(created_at)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_voice_recordings_saved ON voice_recordings(saved_as_memory)`);

  // API Keys
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) NOT NULL,
      key TEXT UNIQUE NOT NULL,
      name TEXT,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Settings (server-side config storage)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Search history
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS search_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) NOT NULL,
      query TEXT NOT NULL,
      result_count INT DEFAULT 0,
      searched_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_search_history_user
    ON search_history (user_id, searched_at DESC)
  `);

  // Chat conversation history
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) NOT NULL,
      title TEXT NOT NULL DEFAULT 'New conversation',
      messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      model TEXT,
      memory_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_chat_convos_user
    ON chat_conversations (user_id, updated_at DESC)
  `);

  // Review queue
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS memory_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) NOT NULL,
      memory_id UUID REFERENCES memories(id) ON DELETE CASCADE NOT NULL,
      review_count INT DEFAULT 0,
      next_review_at TIMESTAMPTZ NOT NULL,
      last_reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, memory_id)
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_memory_reviews_due
    ON memory_reviews (user_id, next_review_at)
  `);

  // Tags
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT 'teal',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_user_name
    ON tags (user_id, name)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_tags_user
    ON tags (user_id)
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS memory_tags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      memory_id UUID REFERENCES memories(id) ON DELETE CASCADE NOT NULL,
      tag_id UUID REFERENCES tags(id) ON DELETE CASCADE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_tags_unique
    ON memory_tags (memory_id, tag_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_memory_tags_memory
    ON memory_tags (memory_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_memory_tags_tag
    ON memory_tags (tag_id)
  `);

  // Notifications
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE notification_type AS ENUM (
        'import_complete', 'analysis_ready', 'review_due', 'plugin_event',
        'system', 'export_ready', 'connection_found', 'milestone'
      );
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `);
  await db.execute(sql`
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
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at)`);

  // Image analyses
  await db.execute(sql`
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
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_image_analyses_user
    ON image_analyses (user_id, created_at DESC)
  `);

  // Indexing/backfill jobs
  await db.execute(sql`
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
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_indexing_jobs_user
    ON indexing_jobs (user_id, scheduled_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_indexing_jobs_status
    ON indexing_jobs (status, scheduled_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_indexing_jobs_user_type
    ON indexing_jobs (user_id, job_type, status)
  `);

  // Indexes for performance
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(user_id, source_type)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_memories_tree ON memories(user_id, tree_path)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(user_id, created_at)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tree_user ON tree_index(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_facts_user ON facts(user_id)`);

  // pgvector index for fast similarity search (IVFFlat)
  // Only create if there are enough rows (IVFFlat needs data)
  const memCount = await db.execute(sql`SELECT COUNT(*)::int as c FROM memories`) as any;
  const mc = (memCount.rows?.[0] as any)?.c || 0;
  if (mc > 100) {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories 
      USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    `);
  }

  // Full-text search index
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_memories_fts ON memories 
    USING gin(to_tsvector('english', content))
  `);

  // Trigram index for fuzzy search
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_memories_trgm ON memories 
    USING gin(content gin_trgm_ops)
  `);

  // OAuth accounts (NextAuth)
  await db.execute(sql`
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
    )
  `);

  // Sessions (NextAuth)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) NOT NULL,
      session_token TEXT UNIQUE NOT NULL,
      expires TIMESTAMPTZ NOT NULL
    )
  `);

  // Phase 3 (Forgetting Curve, A.4) — per-memory forgetting-risk scores.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS memory_forgetting_risk (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) NOT NULL,
      memory_id UUID REFERENCES memories(id) ON DELETE CASCADE NOT NULL,
      risk_score REAL NOT NULL,
      days_since_touch INTEGER NOT NULL,
      recommendation_priority INTEGER NOT NULL,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_forgetting_risk_unique ON memory_forgetting_risk(user_id, memory_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_forgetting_risk_user_score ON memory_forgetting_risk(user_id, risk_score DESC)`);

  // Phase 2 (Knowledge Fingerprint Snapshots, A.2) — periodic snapshots of
  // the user's knowledge topology so Mind Diff (A.5) can compare two points in time.
  await db.execute(sql`
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
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mind_snapshots_user ON mind_snapshots(user_id, taken_at DESC)`);

  // Phase 2 (Knowledge Metabolism Score, A.9) — weekly intellectual-fitness score
  await db.execute(sql`
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
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_metabolism_user_week ON metabolism_scores(user_id, week_start)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_metabolism_user ON metabolism_scores(user_id, week_start DESC)`);

  // Create default user
  await db.execute(sql`
    INSERT INTO users (id, email, name)
    VALUES (${DEFAULT_USER_ID}::uuid, ${DEFAULT_USER_EMAIL}, ${DEFAULT_USER_NAME})
    ON CONFLICT (email) DO NOTHING
  `);

  console.log('✅ Migration complete!');
  await client.end();
}

migrate().catch(console.error);
