import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { db } from '@/server/db';
import {
  buildCitation,
  buildProvenance,
  type CitationStyle,
  type MemoryForCitation,
} from '@/server/attribution/citations';

const STYLES: CitationStyle[] = ['apa', 'mla', 'chicago'];

/**
 * GET /api/v1/memories/[id]/provenance
 * Phase 4 (B.9) — provenance chain + APA / MLA / Chicago citations
 * for a single memory.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'memory-provenance', RATE_LIMITS.standard);
  if (limited) return limited;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid memory id' }, { status: 400 });
  }

  try {
    const [row] = (await db.execute(sql`
      SELECT id, content, source_type, source_title, metadata, created_at
      FROM memories
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
    `)) as unknown as Array<{
      id: string;
      content: string;
      source_type: string;
      source_title: string | null;
      metadata: { attribution?: Record<string, unknown> } | null;
      created_at: Date | string | null;
    }>;

    if (!row) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    const memory: MemoryForCitation = {
      id: row.id,
      content: row.content,
      sourceType: row.source_type,
      sourceTitle: row.source_title,
      createdAt: row.created_at,
      attribution: (row.metadata?.attribution ?? {}) as MemoryForCitation['attribution'],
    };

    return NextResponse.json({
      memoryId: row.id,
      provenance: buildProvenance(memory),
      citations: Object.fromEntries(STYLES.map((style) => [style, buildCitation(memory, style)])),
    });
  } catch (e) {
    console.error('[memory-provenance]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load provenance' }, { status: 500 });
  }
}
