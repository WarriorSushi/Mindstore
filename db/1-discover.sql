-- ┌────────────────────────────────────────────────────────────────────┐
-- │  STEP 1: DISCOVER WHAT'S CURRENTLY IN YOUR DATABASE                │
-- │                                                                    │
-- │  Run this FIRST in Supabase SQL Editor.                            │
-- │  It only reads — it doesn't change anything.                       │
-- │                                                                    │
-- │  Look at the output. It tells you what state your DB is in,        │
-- │  which determines whether you need step 2 or step 3 next.          │
-- └────────────────────────────────────────────────────────────────────┘

-- ─── 1. Required Postgres extensions ─────────────────────────────────
SELECT
  extname AS extension,
  CASE WHEN extname IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (
  SELECT 'pgcrypto'::text AS expected
  UNION SELECT 'vector'
  UNION SELECT 'pg_trgm'
) e
LEFT JOIN pg_extension ON extname = expected
ORDER BY expected;
-- Expected: 3 rows, all status='OK'.
-- If any are MISSING, run them first:
--   CREATE EXTENSION IF NOT EXISTS pgcrypto;
--   CREATE EXTENSION IF NOT EXISTS vector;
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ─── 2. Tables that should exist ─────────────────────────────────────
SELECT
  expected AS table_name,
  CASE WHEN table_name IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (
  VALUES
    ('users'), ('memories'), ('tree_index'), ('profile'),
    ('facts'), ('connections'), ('contradictions'), ('media'),
    ('plugins'), ('plugin_job_schedules'),
    ('flashcard_decks'), ('voice_recordings'),
    ('api_keys'), ('settings'),
    ('search_history'), ('chat_conversations'),
    ('memory_reviews'), ('tags'), ('memory_tags'),
    ('notifications'), ('image_analyses'), ('indexing_jobs'),
    ('accounts'), ('sessions'),
    ('knowledge_risks'), ('memory_forgetting_risk'),
    ('mind_snapshots'), ('metabolism_scores'),
    ('subscriptions'),    -- NEW in this push
    ('usage_records')     -- NEW in this push
) e (expected)
LEFT JOIN information_schema.tables
  ON table_schema = 'public' AND table_name = expected
ORDER BY expected;
-- Expected: 30 rows. Look for MISSING — those tell you which tables
-- need creating. Most importantly:
--   * subscriptions and usage_records are NEW in this push and almost
--     certainly MISSING.
--   * settings should exist (this push modifies it, doesn't create it).
--   * If users / memories are MISSING, you need step 3 (full-schema).
--   * If everything else exists and only the two NEW ones are missing,
--     you only need step 2 (migrate-this-push).


-- ─── 3. Does the settings table have user_id yet? (ARCH-1) ───────────
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'settings'
  AND column_name IN ('id', 'user_id', 'key', 'value', 'updated_at')
ORDER BY column_name;
-- Expected after this push lands:
--   id          uuid    NO
--   key         text    NO
--   updated_at  timestamp...
--   user_id     uuid    NO     ← THIS IS THE NEW COLUMN
--   value       text    NO
--
-- If user_id is missing from this list, the migration hasn't run yet.


-- ─── 4. How many rows in settings? (so you know if backfill matters) ─
SELECT COUNT(*) AS settings_row_count FROM settings;
-- If 0: clean slate, the backfill UPDATE in step 2 is a no-op.
-- If >0: those rows will be backfilled to DEFAULT_USER_ID
--        (00000000-0000-0000-0000-000000000001) — make sure that's
--        what you want before continuing.


-- ─── 5. Sanity check: is the default user already in users? ──────────
SELECT id, email, name FROM users
WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
-- Should return one row with email='default@local' or similar.
-- If empty: step 3 (full-schema) inserts it; step 2 alone won't.
-- The settings backfill needs this row to exist (FK constraint).


-- ─── 6. What's the current settings constraint situation? ────────────
SELECT
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'settings'
ORDER BY con.conname;
-- Pre-migration: you'll see settings_key_key (or settings_key_unique)
--                — the global UNIQUE(key).
-- Post-migration: that's gone, replaced by settings_user_key_unique
--                 — UNIQUE(user_id, key).
