# ADR 0003: Per-User Settings Table (resolves ARCH-1)

## Status

Proposed — gated on owner decision recorded as **BLOCK-5** in `STATUS.md`.

## Context

The `settings` table in `src/server/schema.ts` is a global key-value store:

```ts
export const settings = pgTable('settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').unique().notNull(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

It holds API keys (`openai_api_key`, `gemini_api_key`, `openrouter_api_key`, `custom_api_key`), provider URLs (`ollama_url`, `custom_api_url`), provider preferences (`embedding_provider`, `chat_provider`, `chat_model`), and the custom-provider model name.

Today this is fine: MindStore runs in single-user mode by default, so there's exactly one user and one set of provider keys.

The README, the marketing copy, and the existing `auth.ts` (NextAuth v5 with Google OAuth) all promise multi-user mode. In multi-user mode this design is **broken**:

- Every authenticated user reads/writes the same `settings` rows.
- One user's API key is everyone's API key.
- One user changing their preferred chat provider changes it for everyone.
- A user revoking their key revokes it for everyone.

The Phase 0 audit (`STATUS.md` §2 ARCH-1) flagged this as **P0 (blocks multi-user)**. Fixing it is the largest single change in Phase 1.

## Considered Options

### Option A — Add `user_id` to `settings` (chosen)

Migrate to:

```ts
export const settings = pgTable('settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  uniqueIndex('idx_settings_user_key').on(table.userId, table.key),
  index('idx_settings_user').on(table.userId),
]);
```

Backfill rule: every existing row gets `user_id = '00000000-0000-0000-0000-000000000000'` (the default-user UUID from `src/server/identity.ts`). Single-user mode keeps reading/writing under that ID; nothing changes for it.

Multi-user mode reads/writes under the authenticated `getUserId()`, so each user gets their own provider config.

Pros:

- Minimal schema change. One new column, one index swap, one backfill.
- Single-user-mode behavior unchanged.
- Follows the existing pattern used by every other user-data table.
- Plays well with the future Mind Marketplace and `.mind` portable file work, both of which already expect per-user data isolation.

Cons:

- All call sites that read/write settings need updating to take `userId`. About 20 places (most ports, `ai-client.ts`, `embeddings.ts`, the settings route).
- A small risk that an unaudited call site reads without `userId` and silently returns nothing. Mitigation: TypeScript signature change forces the audit at compile time.

### Option B — Separate `user_settings` table, keep `settings` for system config

Two tables:

- `settings` (global) — system-level config like feature flags, system-wide AI defaults.
- `user_settings(user_id, key, value)` — per-user provider keys, preferences.

Pros:

- Clean conceptual split.
- Allows owner-level system config that no end-user can change.

Cons:

- Two surfaces to maintain. Two query paths. The "where do I put this setting?" question becomes a recurring decision.
- Today there are no real "system" settings — every key in the table is per-user-shaped. The split is hypothetical.

### Option C — Encrypt and store keys in the `users.settings` JSONB column

`users` already has `settings: jsonb('settings').default({})`. Repurpose it for provider config.

Pros:

- No schema migration.
- Per-user by definition.

Cons:

- JSONB is awkward for partial updates (need to read-modify-write, with race conditions on concurrent saves).
- Loses the `updated_at` per-key. Can't easily index a single key's value.
- Encryption gets messier when the value is one field of a JSON object instead of a row.
- The current `users.settings` is already used by the app for non-secret UI prefs (theme, layout). Mixing secrets with prefs is confusing.

## Decision

**Option A.** Add `user_id` to `settings`, backfill with the default-user UUID, change every call site.

## Migration plan

This is a schema migration with downtime-zero requirements. The plan:

1. **Migration A1 (additive, deployed first):**
   - Add `user_id UUID REFERENCES users(id)` to `settings` as nullable.
   - Backfill all existing rows with `DEFAULT_USER_ID`.
   - Add `idx_settings_user_key UNIQUE(user_id, key)` and `idx_settings_user(user_id)`.
   - Keep the existing `UNIQUE(key)` index temporarily.

2. **Code change A2 (deployed after A1):**
   - Update reads to scope by `user_id` (with a fallback that scans across users for any row whose `user_id IS NULL` — that path emits a `logger.warn` once per minute so we know if any rows escape backfill).
   - Update writes to always set `user_id` from `getUserId()`.
   - Settings GET always returns the caller's settings.

3. **Migration A3 (deployed after A2 has been live a week):**
   - `ALTER COLUMN user_id SET NOT NULL`.
   - Drop the legacy global `UNIQUE(key)` index.

This keeps the system live throughout. If any step misbehaves, the previous step is the rollback target.

## Test plan

- Unit test: two users save different `gemini_api_key` values; reads return the caller's value, not the other user's.
- Integration test: existing single-user-mode behavior unchanged after migration A1; same again after migration A3.
- Migration test: run A1 against a Postgres seeded with 100 settings rows; assert all get `user_id = DEFAULT_USER_ID`; assert no row breaks the new `UNIQUE(user_id, key)` constraint.

## Owner inputs needed

- BLOCK-5 in `STATUS.md`: confirm multi-user is the long-term direction. If the answer is "single-user only forever", we still apply this migration (so the schema is honest) but keep `ALLOW_SINGLE_USER_MODE=true` as the default and skip the OAuth wiring.
- BLOCK-3 (`ENCRYPTION_KEY` env var) should be set before migration A2 ships, since per-user encryption rotation is now a real possibility. This is also the moment to decide whether each user encrypts under a per-user key (derivable from their session) or under the global `ENCRYPTION_KEY`. We default to the global key for v1; per-user keys can layer on top later.

## Consequences

- All Phase-2+ features that read settings are designed to take `userId` from the start. No retro-fitting.
- The `Phase 1 (ARCH-1)` PR is the largest of Phase 1 — gated on owner BLOCK-5 sign-off — and lands as a sequence of three commits matching the migration steps above.
- Existing API surface (`/api/v1/settings`) is unchanged externally. Only the underlying storage and the `getUserId()` flow change.
- Provider key sharing across users is **not** a feature we add later — if the owner ever wants "team accounts", that's a separate `team_settings` design, not a regression of this one.

## Related

- ARCH-1, ARCH-2, BLOCK-3, BLOCK-5 in `STATUS.md`.
- `src/server/auth.ts`, `src/server/identity.ts`, `src/server/encryption.ts`, `src/app/api/v1/settings/route.ts`.
- ADR 0002 (provider access roadmap) is the conceptual frame.
- `PRODUCTION_READINESS.md` Workstream 1.1.
