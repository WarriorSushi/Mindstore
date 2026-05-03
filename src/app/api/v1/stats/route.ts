import { getUserId } from '@/server/user';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { sql } from 'drizzle-orm';

/**
 * Phase 1 (ARCH-10): this endpoint is **deprecated**. New callers should
 * hit `/api/v1/knowledge-stats` and project the legacy shape with
 * `@/lib/stats-adapter#toLegacyStats`. This route stays alive (responds
 * with the same payload it has always returned) until **2026-08-01**.
 *
 * Every response carries:
 *   - `Deprecation: true`
 *   - `Sunset: <RFC 8594 date>`
 *   - `Link: </api/v1/knowledge-stats>; rel="successor-version"`
 * so caches and clients can pick up the migration automatically.
 *
 * The deprecation also surfaces as a `console.warn` (per request) so any
 * remaining caller is visible in logs.
 */
const STATS_SUNSET_DATE = '2026-08-01';

/** Build a 14-day array of { day: 'YYYY-MM-DD', count: number } filling in zeros for missing days */
function buildDailyActivity(rows: Array<{ day: string; count: number }>): Array<{ day: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    // Normalize date string to YYYY-MM-DD
    const d = new Date(r.day).toISOString().slice(0, 10);
    map.set(d, r.count);
  }
  const result: Array<{ day: string; count: number }> = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ day: key, count: map.get(key) || 0 });
  }
  return result;
}

function deprecationHeaders(): HeadersInit {
  return {
    'Deprecation': 'true',
    'Sunset': new Date(`${STATS_SUNSET_DATE}T00:00:00Z`).toUTCString(),
    'Link': '</api/v1/knowledge-stats>; rel="successor-version"',
  };
}

export async function GET(req: NextRequest) {
  console.warn('[deprecated] /api/v1/stats called; migrate to /api/v1/knowledge-stats (sunset 2026-08-01)');
  try {
    const userId = await getUserId();

    const memoriesCount = await db.execute(sql`SELECT COUNT(*)::int as count FROM memories WHERE user_id = ${userId}::uuid`);
    const sourcesBreakdown = await db.execute(sql`
      SELECT source_type as type, COUNT(*)::int as count 
      FROM memories WHERE user_id = ${userId}::uuid 
      GROUP BY source_type ORDER BY count DESC
    `);
    const topSources = await db.execute(sql`
      SELECT source_type as type, source_title as title, source_id as id, COUNT(*)::int as item_count
      FROM memories WHERE user_id = ${userId}::uuid
      GROUP BY source_type, source_title, source_id
      ORDER BY item_count DESC
      LIMIT 10
    `);

    // Recent memories — last 5 added
    const recentMemories = await db.execute(sql`
      SELECT id, content, source_type, source_title, created_at
      FROM memories WHERE user_id = ${userId}::uuid
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // Pinned memories
    const pinnedMemories = await db.execute(sql`
      SELECT id, content, source_type, source_title, created_at
      FROM memories WHERE user_id = ${userId}::uuid AND (metadata->>'pinned')::boolean = true
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // Daily activity — last 14 days of import counts by day
    const dailyActivity = await db.execute(sql`
      SELECT
        date_trunc('day', created_at)::date AS day,
        COUNT(*)::int AS count
      FROM memories
      WHERE user_id = ${userId}::uuid
        AND created_at >= NOW() - INTERVAL '14 days'
      GROUP BY day
      ORDER BY day ASC
    `);

    const totalMemories = (memoriesCount as any)[0]?.count || 0;
    const byType: Record<string, number> = { chatgpt: 0, text: 0, file: 0, url: 0 };
    for (const row of sourcesBreakdown as any[]) {
      byType[row.type] = row.count;
    }

    const totalSources = (topSources as any[]).length;

    return NextResponse.json({
      totalMemories,
      totalSources,
      byType,
      topSources: (topSources as any[]).map(r => ({
        id: r.id || r.title,
        type: r.type,
        title: r.title || 'Untitled',
        itemCount: r.item_count,
      })),
      recentMemories: (recentMemories as any[]).map(r => ({
        id: r.id,
        content: r.content?.slice(0, 120) || '',
        sourceType: r.source_type,
        sourceTitle: r.source_title || 'Untitled',
        createdAt: r.created_at,
      })),
      pinnedMemories: (pinnedMemories as any[]).map(r => ({
        id: r.id,
        content: r.content?.slice(0, 120) || '',
        sourceType: r.source_type,
        sourceTitle: r.source_title || 'Untitled',
        createdAt: r.created_at,
      })),
      pinnedCount: (pinnedMemories as any[]).length,
      dailyActivity: buildDailyActivity(dailyActivity as any[]),
    }, { headers: deprecationHeaders() });
  } catch (error: unknown) {
    console.error('[stats]', error);
    // Return empty stats when DB is unavailable — don't crash the frontend
    return NextResponse.json({
      totalMemories: 0,
      totalSources: 0,
      byType: { chatgpt: 0, text: 0, file: 0, url: 0 },
      topSources: [],
      dbError: true,
    }, { headers: deprecationHeaders() });
  }
}
