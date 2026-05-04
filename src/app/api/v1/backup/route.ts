import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { sql } from 'drizzle-orm';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { parseJsonBody, requireUserId } from '@/server/api-validation';

/**
 * POST /api/v1/backup — restore from backup JSON.
 *
 * SEC-8 closes here:
 *   - auth required (was missing entirely)
 *   - write rate limit
 *   - Zod schema bounds the payload
 *   - hard cap on memory count to prevent a single request from
 *     stuffing the DB
 */
const MemorySchema = z.object({
  id: z.string().uuid().optional(),
  content: z.string().min(1).max(200_000),
  source: z.string().max(100).optional(),
  sourceType: z.string().max(100).optional(),
  sourceId: z.string().max(500).nullish(),
  sourceTitle: z.string().max(500).nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
});

const MAX_MEMORIES_PER_RESTORE = 50_000;

const RestoreSchema = z.object({
  memories: z.array(MemorySchema).min(1).max(MAX_MEMORIES_PER_RESTORE),
});

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'backup-restore', RATE_LIMITS.write);
  if (limited) return limited;

  const body = await parseJsonBody(req, RestoreSchema);
  if (body instanceof NextResponse) return body;

  try {
    const { memories } = body;
    let imported = 0;

    for (const m of memories) {
      const memId = m.id || crypto.randomUUID();
      const ts = (m.timestamp ? new Date(m.timestamp) : new Date()).toISOString();
      const source = m.source || m.sourceType || 'text';
      const meta = JSON.stringify(m.metadata || {});

      await db.execute(sql`
        INSERT INTO memories (id, user_id, content, source_type, source_id, source_title, metadata, created_at, imported_at)
        VALUES (
          ${memId},
          ${userId}::uuid,
          ${m.content},
          ${source},
          ${m.sourceId || null},
          ${m.sourceTitle || null},
          ${meta}::jsonb,
          ${ts}::timestamptz,
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content
      `);
      imported++;
    }

    return NextResponse.json({ imported });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
