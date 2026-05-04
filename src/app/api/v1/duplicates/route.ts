import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { sql } from 'drizzle-orm';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { parseJsonBody, requireUserId } from '@/server/api-validation';

/**
 * GET /api/v1/duplicates?threshold=0.92&limit=20
 *
 * Find near-duplicate memories using pgvector cosine similarity.
 * Returns pairs of memories with similarity scores above the threshold.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'duplicates-find', RATE_LIMITS.standard);
  if (limited) return limited;

  try {
    const { searchParams } = new URL(req.url);
    const rawThreshold = parseFloat(searchParams.get('threshold') || '0.92');
    const threshold = Number.isFinite(rawThreshold) ? Math.min(Math.max(rawThreshold, 0.5), 0.999) : 0.92;
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;

    const maxDistance = 1 - threshold;

    const pairs = await db.execute(sql`
      SELECT
        a.id AS id_a,
        a.content AS content_a,
        a.source_type AS source_type_a,
        a.source_title AS source_title_a,
        a.source_id AS source_id_a,
        a.created_at AS created_at_a,
        a.metadata AS metadata_a,
        CHAR_LENGTH(a.content) AS length_a,
        b.id AS id_b,
        b.content AS content_b,
        b.source_type AS source_type_b,
        b.source_title AS source_title_b,
        b.source_id AS source_id_b,
        b.created_at AS created_at_b,
        b.metadata AS metadata_b,
        CHAR_LENGTH(b.content) AS length_b,
        1 - (a.embedding <=> b.embedding) AS similarity
      FROM memories a
      INNER JOIN memories b ON a.id < b.id
      WHERE a.user_id = ${userId}::uuid
        AND b.user_id = ${userId}::uuid
        AND a.embedding IS NOT NULL
        AND b.embedding IS NOT NULL
        AND (a.embedding <=> b.embedding) < ${maxDistance}
      ORDER BY (a.embedding <=> b.embedding) ASC
      LIMIT ${limit}
    `) as any[];

    const duplicates = pairs.map((row: any) => ({
      similarity: Math.round(row.similarity * 100),
      memoryA: {
        id: row.id_a,
        content: row.content_a,
        sourceType: row.source_type_a,
        sourceTitle: row.source_title_a || 'Untitled',
        sourceId: row.source_id_a,
        createdAt: row.created_at_a,
        metadata: row.metadata_a || {},
        contentLength: parseInt(row.length_a),
      },
      memoryB: {
        id: row.id_b,
        content: row.content_b,
        sourceType: row.source_type_b,
        sourceTitle: row.source_title_b || 'Untitled',
        sourceId: row.source_id_b,
        createdAt: row.created_at_b,
        metadata: row.metadata_b || {},
        contentLength: parseInt(row.length_b),
      },
    }));

    return NextResponse.json({
      duplicates,
      count: duplicates.length,
      threshold,
    });
  } catch (error: any) {
    console.error('[duplicates]', error);
    return NextResponse.json({ duplicates: [], count: 0, error: error.message }, { status: 500 });
  }
}

const MergeSchema = z.object({
  action: z.enum(['keep_a', 'keep_b', 'merge', 'delete_both']),
  idA: z.string().uuid(),
  idB: z.string().uuid(),
  mergedContent: z.string().min(1).max(200_000).optional(),
});

/**
 * POST /api/v1/duplicates — merge two duplicate memories.
 *
 * Body: { action: 'keep_a' | 'keep_b' | 'merge' | 'delete_both',
 *         idA: uuid, idB: uuid, mergedContent?: string }
 *
 * Rate-limited as a write because every action either deletes or
 * updates rows. SEC-9 closes here.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'duplicates-merge', RATE_LIMITS.write);
  if (limited) return limited;

  const body = await parseJsonBody(req, MergeSchema);
  if (body instanceof NextResponse) return body;

  const { action, idA, idB, mergedContent } = body;

  try {
    const [memA] = await db.execute(sql`
      SELECT id, content FROM memories WHERE id = ${idA}::uuid AND user_id = ${userId}::uuid
    `) as any[];
    const [memB] = await db.execute(sql`
      SELECT id, content FROM memories WHERE id = ${idB}::uuid AND user_id = ${userId}::uuid
    `) as any[];

    if (!memA || !memB) {
      return NextResponse.json({ error: 'One or both memories not found' }, { status: 404 });
    }

    let result = { kept: 0, deleted: 0, merged: false };

    switch (action) {
      case 'keep_a':
        await db.execute(sql`DELETE FROM memories WHERE id = ${idB}::uuid AND user_id = ${userId}::uuid`);
        result = { kept: 1, deleted: 1, merged: false };
        break;

      case 'keep_b':
        await db.execute(sql`DELETE FROM memories WHERE id = ${idA}::uuid AND user_id = ${userId}::uuid`);
        result = { kept: 1, deleted: 1, merged: false };
        break;

      case 'merge': {
        if (!mergedContent?.trim()) {
          return NextResponse.json({ error: 'mergedContent required for merge action' }, { status: 400 });
        }
        await db.execute(sql`
          UPDATE memories
          SET content = ${mergedContent.trim()},
              embedding = NULL,
              updated_at = NOW()
          WHERE id = ${idA}::uuid AND user_id = ${userId}::uuid
        `);
        await db.execute(sql`DELETE FROM memories WHERE id = ${idB}::uuid AND user_id = ${userId}::uuid`);
        result = { kept: 1, deleted: 1, merged: true };
        break;
      }

      case 'delete_both':
        await db.execute(sql`DELETE FROM memories WHERE id IN (${idA}::uuid, ${idB}::uuid) AND user_id = ${userId}::uuid`);
        result = { kept: 0, deleted: 2, merged: false };
        break;
    }

    return NextResponse.json({ ok: true, action, ...result });
  } catch (error: any) {
    console.error('[duplicates:merge]', error);
    return NextResponse.json({ error: error.message || 'Merge failed' }, { status: 500 });
  }
}
