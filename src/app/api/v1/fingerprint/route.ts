import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { sql } from 'drizzle-orm';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';

/**
 * GET /api/v1/fingerprint — generate knowledge graph data
 *
 * Pulls a sample of memories + cross-similarity edges. Uses
 * TABLESAMPLE BERNOULLI for the sample (index-friendly, unlike
 * ORDER BY RANDOM() which forces a full table scan), then fills the
 * remainder with the most-recent memories so small bases still get a
 * useful graph.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'fingerprint', RATE_LIMITS.standard);
  if (limited) return limited;

  try {
    // Get sources (grouped)
    const sourcesResult = await db.execute(sql`
      SELECT source_type as type, source_title as title, source_id as id, COUNT(*)::int as item_count
      FROM memories WHERE user_id = ${userId}::uuid
      GROUP BY source_type, source_title, source_id
      ORDER BY item_count DESC
    `);
    const sources = sourcesResult as any[];

    // Sample 100 memories. TABLESAMPLE on a per-user filter still scans
    // because the sample is row-level not page-level for a filtered set,
    // so we sample first and then filter. For tiny bases (<100 memories
    // total) the sample may return fewer rows; fall back to most-recent.
    const sampledResult = await db.execute(sql`
      WITH sampled AS (
        SELECT id, content, source_type, source_id, source_title, embedding, user_id
        FROM memories TABLESAMPLE BERNOULLI(5)
        WHERE user_id = ${userId}::uuid
        LIMIT 100
      ),
      filler AS (
        SELECT id, content, source_type, source_id, source_title, embedding
        FROM memories
        WHERE user_id = ${userId}::uuid
          AND id NOT IN (SELECT id FROM sampled)
        ORDER BY created_at DESC
        LIMIT 100
      )
      SELECT id, content, source_type, source_id, source_title, embedding
      FROM sampled
      UNION ALL
      SELECT id, content, source_type, source_id, source_title, embedding
      FROM filler
      LIMIT 100
    `);
    const memories = sampledResult as any[];

    const nodes: Array<{ id: string; label: string; size: number; group: string }> = [];
    const edges: Array<{ id: string; source: string; target: string; weight: number }> = [];

    // Source nodes
    for (const source of sources) {
      nodes.push({
        id: `src-${source.id || source.title}`,
        label: source.title || 'Untitled',
        size: Math.max(10, source.item_count * 2),
        group: source.type,
      });
    }

    // Memory nodes
    for (const mem of memories) {
      nodes.push({
        id: `mem-${mem.id}`,
        label: mem.source_title || mem.content.slice(0, 30),
        size: 5,
        group: mem.source_type,
      });

      edges.push({
        id: `e-${mem.id}-src`,
        source: `mem-${mem.id}`,
        target: `src-${mem.source_id || mem.source_title}`,
        weight: 1,
      });
    }

    // Cross-edges for similar memories (via pgvector)
    const withEmb = memories.filter(m => m.embedding);
    if (withEmb.length >= 2) {
      const crossEdges = await db.execute(sql`
        SELECT a.id as a_id, b.id as b_id, 1 - (a.embedding <=> b.embedding) as similarity
        FROM memories a, memories b
        WHERE a.user_id = ${userId}::uuid AND b.user_id = ${userId}::uuid
          AND a.id < b.id
          AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
          AND 1 - (a.embedding <=> b.embedding) > 0.75
          AND a.id = ANY(${withEmb.map(m => m.id)}::uuid[])
          AND b.id = ANY(${withEmb.map(m => m.id)}::uuid[])
        ORDER BY similarity DESC
        LIMIT 200
      `);

      for (const r of crossEdges as any[]) {
        edges.push({
          id: `e-${r.a_id}-${r.b_id}`,
          source: `mem-${r.a_id}`,
          target: `mem-${r.b_id}`,
          weight: r.similarity,
        });
      }
    }

    // Clusters
    const clusterColors: Record<string, string> = {
      chatgpt: '#10b981', text: '#0ea5e9', file: '#f59e0b', url: '#3b82f6',
    };

    const clusters = sources.reduce((acc: any[], s: any) => {
      const existing = acc.find(c => c.name === s.type);
      if (existing) {
        existing.size += s.item_count;
      } else {
        acc.push({ name: s.type, size: s.item_count, color: clusterColors[s.type] || '#6b7280' });
      }
      return acc;
    }, []);

    return NextResponse.json({ nodes, edges, clusters });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
