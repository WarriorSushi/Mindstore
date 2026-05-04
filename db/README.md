# `db/` — hand-runnable SQL

Three files. Run them in order. Or skip straight to the one you need based on the decision tree below.

> **Honest note:** I (the agent who wrote these) haven't seen your Supabase. I built these from `src/server/migrate.ts` — the canonical schema source. If your DB has been hand-modified outside that script, these files won't know about those changes. The discover script (file 1) is your safety net: it tells you what's actually there before you change anything.

## Decision tree

```
                        ┌─────────────────────────┐
                        │  Open Supabase →        │
                        │  SQL Editor → New query │
                        └────────────┬────────────┘
                                     ▼
                        ┌─────────────────────────┐
                        │ Run db/1-discover.sql   │
                        │ (read-only, safe)       │
                        └────────────┬────────────┘
                                     ▼
            ┌────────────────────────┴─────────────────────────┐
            │                                                  │
        Most tables                                  Few or no tables exist
        already exist,                               (fresh DB or never migrated)
        only NEW ones missing                                  │
            │                                                  │
            ▼                                                  ▼
 ┌───────────────────────┐                       ┌─────────────────────────┐
 │ Run                   │                       │ Run                     │
 │ db/2-migrate-this-    │                       │ db/3-full-schema.sql    │
 │ push.sql              │                       │ (idempotent, builds     │
 │ (just the new bits)   │                       │  everything from scratch│
 └───────────┬───────────┘                       │  or fills in gaps)      │
             │                                   └────────────┬────────────┘
             └─────────────────┬─────────────────────────────┘
                               ▼
                  ┌─────────────────────────┐
                  │ Re-run                  │
                  │ db/1-discover.sql       │
                  │ to confirm everything   │
                  │ landed                  │
                  └─────────────────────────┘
```

## The three files

### `1-discover.sql` (read-only)
Six queries that tell you the current state of your DB:
- Are the three required Postgres extensions enabled?
- Which of the 30 tables MindStore expects actually exist?
- Does the `settings` table have the new `user_id` column yet?
- How many rows in `settings` will be backfilled?
- Does the default user exist?
- What unique constraints are on `settings` right now?

Run this **first**, every time. It changes nothing. The output tells you which of the next two files to run.

### `2-migrate-this-push.sql` (just this push's deltas)
For when most of the schema is already in place and you just need the changes from the recent commits:
- `settings.user_id` column + per-user UNIQUE constraint (ARCH-1)
- `subscriptions` table (Stripe-backed)
- `usage_records` table (per-user token tracking)

Wrapped in `BEGIN/COMMIT` so any failure rolls back atomically. Includes verification queries at the bottom that print `OK` / `FAIL` for each piece.

Use this if your discover output showed: most tables present, only `subscriptions` and `usage_records` missing, and `settings.user_id` missing.

### `3-full-schema.sql` (everything, idempotent)
Hand-extracted from `src/server/migrate.ts` — every `CREATE TABLE IF NOT EXISTS`, every enum, every index, every constraint, every backfill. Same end state as running `npm run migrate`, just in one SQL file you can paste into Supabase.

Use this if:
- Fresh database, nothing exists yet
- Your discover output showed many missing tables
- You want belt-and-suspenders certainty that everything matches the code

Safe to run on a fully-migrated DB (everything no-ops). Safe to run on a partially-migrated DB (fills gaps). Safe to run on an empty DB (creates everything).

## Alternative: just run `npm run migrate`

If you'd rather not paste SQL into a UI, the same statements run automatically when you do:

```bash
# Pull production env vars to your laptop
vercel env pull .env.production.local

# Run migrate against production DB
npm run migrate
```

This is functionally identical to running `db/3-full-schema.sql`. Pick whichever workflow you prefer.

## What `npm run migrate` does that these SQL files don't

One thing: the JS migration script conditionally creates the pgvector IVFFlat index, but only if the `memories` table has more than 100 rows (IVFFlat needs training data to be useful). The SQL files leave this index out — you can add it manually later once you've imported memories:

```sql
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

For sub-1000-row knowledge bases, the FTS + trigram indexes (which the SQL files DO create) cover most queries. Add the IVFFlat one once you're past 100 memories.

## When you'd ever want to run these files instead of `npm run migrate`

- **You don't have local node access** — running SQL directly in Supabase works without your laptop being involved.
- **You want to review before applying** — pasting into Supabase SQL Editor lets you read each statement before clicking Run.
- **You've made hand modifications to the production schema** that aren't in `migrate.ts` — these files let you apply only the bits you choose.
- **CI/CD setup hasn't shipped yet** — until you change the build script to `npm run migrate && next build`, you'll need to manually run migrations on every deploy that changes the schema. Pasting these SQL files is the manual path.
