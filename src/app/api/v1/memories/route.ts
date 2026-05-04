import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { generateEmbeddings } from '@/server/embeddings';
import { sql } from 'drizzle-orm';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { parseJsonBody, requireUserId } from '@/server/api-validation';

/** Hard cap per SEC-12: never return more than 1000 memories in a single request. */
const MAX_LIMIT = 1000;

/**
 * GET /api/v1/memories?search=&source=&limit=50&offset=0
 * List memories with optional filtering.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const source = searchParams.get('source') || '';
    const rawLimit = parseInt(searchParams.get('limit') || '200', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT) : 200;
    const rawOffset = parseInt(searchParams.get('offset') || '0', 10);
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

    const sort = searchParams.get('sort') || 'newest';
    const pinnedOnly = searchParams.get('pinned') === 'true';

    const conditions = [sql`user_id = ${userId}::uuid`];
    if (source) conditions.push(sql`source_type = ${source}`);
    if (search) {
      conditions.push(sql`(content ILIKE ${'%' + search + '%'} OR source_title ILIKE ${'%' + search + '%'})`);
    }
    if (pinnedOnly) {
      conditions.push(sql`(metadata->>'pinned')::boolean = true`);
    }

    // Support tag filtering
    const tagId = searchParams.get('tagId');
    if (tagId) {
      conditions.push(sql`id IN (SELECT memory_id FROM memory_tags WHERE tag_id = ${tagId}::uuid)`);
    }

    const where = sql.join(conditions, sql` AND `);

    // Dynamic sort order — pinned items always float to top (unless filtering pinned-only)
    const pp = pinnedOnly ? '' : 'COALESCE((metadata->>\'pinned\')::boolean, false) DESC,';
    const orderClause =
      sort === 'oldest' ? sql.raw(`ORDER BY ${pp} created_at ASC`) :
      sort === 'alpha-asc' ? sql.raw(`ORDER BY ${pp} LOWER(COALESCE(source_title, '')) ASC, created_at DESC`) :
      sort === 'alpha-desc' ? sql.raw(`ORDER BY ${pp} LOWER(COALESCE(source_title, '')) DESC, created_at DESC`) :
      sort === 'longest' ? sql.raw(`ORDER BY ${pp} LENGTH(content) DESC, created_at DESC`) :
      sort === 'shortest' ? sql.raw(`ORDER BY ${pp} LENGTH(content) ASC, created_at DESC`) :
      sql.raw(`ORDER BY ${pp} created_at DESC`);

    const results = await db.execute(sql`
      SELECT id, content, source_type, source_id, source_title, metadata, created_at, imported_at
      FROM memories
      WHERE ${where}
      ${orderClause}
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countResult = await db.execute(sql`SELECT COUNT(*)::int as count FROM memories WHERE ${where}`);
    const total = (countResult as any)[0]?.count || 0;

    // Batch-fetch tags for all returned memories
    const memoryIds = (results as any[]).map(r => r.id);
    let tagsByMemory: Record<string, Array<{ id: string; name: string; color: string }>> = {};
    if (memoryIds.length > 0) {
      try {
        const tagRows = await db.execute(sql`
          SELECT mt.memory_id, t.id, t.name, t.color
          FROM memory_tags mt
          JOIN tags t ON t.id = mt.tag_id
          WHERE mt.memory_id = ANY(${memoryIds}::uuid[])
          ORDER BY t.name ASC
        `);
        for (const row of tagRows as any[]) {
          if (!tagsByMemory[row.memory_id]) tagsByMemory[row.memory_id] = [];
          tagsByMemory[row.memory_id].push({ id: row.id, name: row.name, color: row.color });
        }
      } catch {
        // Tags tables may not exist yet — skip gracefully
      }
    }

    return NextResponse.json({
      memories: (results as any[]).map(r => {
        const meta = r.metadata || {};
        return {
          id: r.id,
          content: r.content,
          source: r.source_type,
          sourceId: r.source_id,
          sourceTitle: r.source_title || '',
          timestamp: r.created_at,
          importedAt: r.imported_at,
          metadata: meta,
          pinned: meta.pinned === true,
          tags: tagsByMemory[r.id] || [],
        };
      }),
      total,
      limit,
      offset,
    });
  } catch (error: unknown) {
    console.error('[memories GET]', error);
    return NextResponse.json({ memories: [], total: 0, dbError: true });
  }
}

const PostSchema = z.object({
  content: z.string().min(1).max(200_000),
  sourceType: z.string().max(100).optional(),
  sourceId: z.string().max(500).nullish(),
  sourceTitle: z.string().max(500).nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/v1/memories — create a single memory
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'memories-create', RATE_LIMITS.write);
  if (limited) return limited;

  const body = await parseJsonBody(req, PostSchema);
  if (body instanceof NextResponse) return body;

  try {
    const { content, sourceType, sourceId, sourceTitle, metadata } = body;

    let embStr: string | null = null;
    try {
      const embeddings = await generateEmbeddings([content]);
      if (embeddings && embeddings.length > 0) {
        embStr = `[${embeddings[0].join(',')}]`;
      }
    } catch { /* skip */ }

    const id = crypto.randomUUID();
    const meta = JSON.stringify(metadata || {});

    if (embStr) {
      await db.execute(sql`
        INSERT INTO memories (id, user_id, content, embedding, source_type, source_id, source_title, metadata, created_at, imported_at)
        VALUES (${id}, ${userId}::uuid, ${content}, ${embStr}::vector, ${sourceType || 'text'}, ${sourceId || null}, ${sourceTitle || null}, ${meta}::jsonb, NOW(), NOW())
      `);
    } else {
      await db.execute(sql`
        INSERT INTO memories (id, user_id, content, source_type, source_id, source_title, metadata, created_at, imported_at)
        VALUES (${id}, ${userId}::uuid, ${content}, ${sourceType || 'text'}, ${sourceId || null}, ${sourceTitle || null}, ${meta}::jsonb, NOW(), NOW())
      `);
    }

    return NextResponse.json({ id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const PatchSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1).max(200_000).optional(),
  title: z.string().max(500).optional(),
  pinned: z.boolean().optional(),
}).refine(
  (v) => v.content !== undefined || v.title !== undefined || v.pinned !== undefined,
  { message: 'At least one of content, title, or pinned is required' },
);

/**
 * PATCH /api/v1/memories — update a memory's content, title, or pinned flag.
 * Re-generates embedding when content changes.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'memories-update', RATE_LIMITS.write);
  if (limited) return limited;

  const body = await parseJsonBody(req, PatchSchema);
  if (body instanceof NextResponse) return body;

  try {
    const { id, content, title, pinned } = body;

    const existing = await db.execute(
      sql`SELECT id, metadata FROM memories WHERE id = ${id}::uuid AND user_id = ${userId}::uuid`
    );
    if ((existing as any[]).length === 0) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    if (pinned !== undefined && !content && title === undefined) {
      const existingMeta = (existing as any[])[0]?.metadata || {};
      const updatedMeta = { ...existingMeta, pinned: !!pinned };
      if (!pinned) delete updatedMeta.pinned;
      const metaStr = JSON.stringify(updatedMeta);
      await db.execute(sql`
        UPDATE memories SET metadata = ${metaStr}::jsonb
        WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
      `);
      return NextResponse.json({ ok: true, pinned: !!pinned });
    }

    if (content) {
      let embStr: string | null = null;
      try {
        const embeddings = await generateEmbeddings([content]);
        if (embeddings && embeddings.length > 0) {
          embStr = `[${embeddings[0].join(',')}]`;
        }
      } catch { /* skip embedding — still update content */ }

      if (embStr && title !== undefined) {
        await db.execute(sql`
          UPDATE memories SET content = ${content}, embedding = ${embStr}::vector, source_title = ${title}
          WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
        `);
      } else if (embStr) {
        await db.execute(sql`
          UPDATE memories SET content = ${content}, embedding = ${embStr}::vector
          WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
        `);
      } else if (title !== undefined) {
        await db.execute(sql`
          UPDATE memories SET content = ${content}, source_title = ${title}
          WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
        `);
      } else {
        await db.execute(sql`
          UPDATE memories SET content = ${content}
          WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
        `);
      }
    } else if (title !== undefined) {
      await db.execute(sql`
        UPDATE memories SET source_title = ${title}
        WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
      `);
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[memories PATCH]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/memories — delete memories.
 *
 *   ?id=UUID         — single memory
 *   ?source_id=xxx   — bulk by source_id (e.g., demo data cleanup)
 *   no params        — full wipe of the user's knowledge base
 *
 * The full-wipe path also cascades into tree_index, connections,
 * contradictions, facts, and profile. Rate-limited to RATE_LIMITS.write
 * to prevent rapid-fire abuse on what is by far the most destructive
 * endpoint in the API surface.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'memories-delete', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    const { searchParams } = new URL(req.url);
    const singleId = searchParams.get('id');
    const sourceId = searchParams.get('source_id');

    if (singleId) {
      // Validate UUID shape so a malformed value doesn't reach the cast.
      if (!/^[0-9a-f-]{36}$/i.test(singleId)) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
      }
      await db.execute(sql`DELETE FROM memories WHERE id = ${singleId}::uuid AND user_id = ${userId}::uuid`);
      return NextResponse.json({ ok: true });
    }

    if (sourceId) {
      await db.execute(sql`DELETE FROM memories WHERE source_id = ${sourceId} AND user_id = ${userId}::uuid`);
      return NextResponse.json({ ok: true });
    }

    // Full wipe — cascades into related per-user state.
    await db.execute(sql`DELETE FROM memories WHERE user_id = ${userId}::uuid`);
    await db.execute(sql`DELETE FROM tree_index WHERE user_id = ${userId}::uuid`);
    await db.execute(sql`DELETE FROM connections WHERE user_id = ${userId}::uuid`);
    await db.execute(sql`DELETE FROM contradictions WHERE user_id = ${userId}::uuid`);
    await db.execute(sql`DELETE FROM facts WHERE user_id = ${userId}::uuid`);
    await db.execute(sql`DELETE FROM profile WHERE user_id = ${userId}::uuid`);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
