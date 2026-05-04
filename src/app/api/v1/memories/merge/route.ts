import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { sql } from 'drizzle-orm';
import { generateEmbeddings } from '@/server/embeddings';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { parseJsonBody, requireUserId } from '@/server/api-validation';

const MergeSchema = z.object({
  primaryId: z.string().uuid(),
  secondaryId: z.string().uuid(),
  separator: z.string().max(200).optional(),
}).refine((v) => v.primaryId !== v.secondaryId, {
  message: 'Cannot merge a memory with itself',
});

/**
 * POST /api/v1/memories/merge — merge two memories into one.
 *
 * Combines content of two memories, keeps the first one's metadata,
 * re-embeds the merged content, and deletes the second memory.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'memories-merge', RATE_LIMITS.write);
  if (limited) return limited;

  const body = await parseJsonBody(req, MergeSchema);
  if (body instanceof NextResponse) return body;

  const { primaryId, secondaryId } = body;
  const separator = body.separator ?? '\n\n---\n\n';

  try {
    const [primaryRes, secondaryRes] = await Promise.all([
      db.execute(sql`
        SELECT id, content, source_type, source_title, metadata, created_at
        FROM memories WHERE id = ${primaryId}::uuid AND user_id = ${userId}::uuid
      `),
      db.execute(sql`
        SELECT id, content, source_type, source_title, metadata, created_at
        FROM memories WHERE id = ${secondaryId}::uuid AND user_id = ${userId}::uuid
      `),
    ]);

    const primary = (primaryRes as any[])[0];
    const secondary = (secondaryRes as any[])[0];

    if (!primary) return NextResponse.json({ error: 'Primary memory not found' }, { status: 404 });
    if (!secondary) return NextResponse.json({ error: 'Secondary memory not found' }, { status: 404 });

    const mergedContent = `${primary.content}${separator}${secondary.content}`;

    const primaryMeta = primary.metadata || {};
    const mergedMeta = {
      ...primaryMeta,
      merged: true,
      mergedFrom: secondaryId,
      mergedAt: new Date().toISOString(),
      originalSources: [
        { id: primaryId, title: primary.source_title, type: primary.source_type },
        { id: secondaryId, title: secondary.source_title, type: secondary.source_type },
      ],
    };

    let embStr: string | null = null;
    try {
      const embeddings = await generateEmbeddings([mergedContent]);
      if (embeddings && embeddings.length > 0) {
        embStr = `[${embeddings[0].join(',')}]`;
      }
    } catch { /* non-fatal */ }

    const metaStr = JSON.stringify(mergedMeta);
    if (embStr) {
      await db.execute(sql`
        UPDATE memories
        SET content = ${mergedContent}, embedding = ${embStr}::vector, metadata = ${metaStr}::jsonb
        WHERE id = ${primaryId}::uuid AND user_id = ${userId}::uuid
      `);
    } else {
      await db.execute(sql`
        UPDATE memories
        SET content = ${mergedContent}, metadata = ${metaStr}::jsonb
        WHERE id = ${primaryId}::uuid AND user_id = ${userId}::uuid
      `);
    }

    await db.execute(sql`
      DELETE FROM memories WHERE id = ${secondaryId}::uuid AND user_id = ${userId}::uuid
    `);

    try {
      await db.execute(sql`
        INSERT INTO memory_tags (memory_id, tag_id)
        SELECT ${primaryId}::uuid, tag_id FROM memory_tags WHERE memory_id = ${secondaryId}::uuid
        ON CONFLICT DO NOTHING
      `);
      await db.execute(sql`
        DELETE FROM memory_tags WHERE memory_id = ${secondaryId}::uuid
      `);
    } catch { /* tags tables may not exist */ }

    return NextResponse.json({
      ok: true,
      mergedId: primaryId,
      deletedId: secondaryId,
      contentLength: mergedContent.length,
      reembedded: !!embStr,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
