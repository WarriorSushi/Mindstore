import { getUserId } from '@/server/user';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { sql } from 'drizzle-orm';

/** Build a 14-day array of { day: 'YYYY-MM-DD', count: number } filling in zeros for missing days */
function buildDailyActivity(rows: Array<{ day: string | Date; count: number }>): Array<{ day: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.day as string).toISOString().slice(0, 10);
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

/**
 * GET /api/v1/knowledge-stats
 * Comprehensive knowledge base analytics for the Stats page.
 *
 * As of Phase 1 (ARCH-10) this endpoint is a strict superset of the
 * deprecated `/api/v1/stats`: it carries all of the legacy fields
 * (`totalMemories`, `totalSources`, `byType`, `dailyActivity`,
 * `recentMemories`, `pinnedMemories`, `pinnedCount`, plus the
 * legacy-shape `topSourcesLegacy`) alongside the richer analytics
 * shape that the Stats page already consumed (`topSources` retains its
 * `{type,title,count}` shape). Callers should use
 * `@/lib/stats-adapter` for the legacy `/api/v1/stats` shape.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();

    // Run all queries in parallel for speed
    const [
      totalResult,
      sourceBreakdown,
      monthlyGrowth,
      wordStats,
      embeddingCoverage,
      dateRange,
      topSources,
      weeklyActivity,
      contentDepth,
      dailyActivity,
      recentMemories,
      pinnedMemories,
    ] = await Promise.all([
      // Total memory count
      db.execute(sql`SELECT COUNT(*)::int as count FROM memories WHERE user_id = ${userId}::uuid`),

      // Source type breakdown
      db.execute(sql`
        SELECT source_type as type, COUNT(*)::int as count
        FROM memories WHERE user_id = ${userId}::uuid
        GROUP BY source_type ORDER BY count DESC
      `),

      // Monthly growth — memories per month for up to 12 months
      db.execute(sql`
        SELECT
          to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
          COUNT(*)::int AS count
        FROM memories
        WHERE user_id = ${userId}::uuid
          AND created_at >= NOW() - INTERVAL '12 months'
        GROUP BY month
        ORDER BY month ASC
      `),

      // Word count statistics
      db.execute(sql`
        SELECT
          COALESCE(AVG(array_length(string_to_array(content, ' '), 1)), 0)::int AS avg_words,
          COALESCE(MIN(array_length(string_to_array(content, ' '), 1)), 0)::int AS min_words,
          COALESCE(MAX(array_length(string_to_array(content, ' '), 1)), 0)::int AS max_words,
          COALESCE(SUM(array_length(string_to_array(content, ' '), 1)), 0)::bigint AS total_words,
          COALESCE(AVG(LENGTH(content)), 0)::int AS avg_chars
        FROM memories WHERE user_id = ${userId}::uuid
      `),

      // Embedding coverage
      db.execute(sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END)::int AS with_embedding
        FROM memories WHERE user_id = ${userId}::uuid
      `),

      // Date range of knowledge
      db.execute(sql`
        SELECT
          MIN(created_at) AS earliest,
          MAX(created_at) AS latest
        FROM memories WHERE user_id = ${userId}::uuid
      `),

      // Top sources by item count (top 15)
      db.execute(sql`
        SELECT source_type as type, source_title as title, COUNT(*)::int as count
        FROM memories WHERE user_id = ${userId}::uuid
        GROUP BY source_type, source_title
        ORDER BY count DESC
        LIMIT 15
      `),

      // Weekly activity — last 8 weeks
      db.execute(sql`
        SELECT
          date_trunc('week', created_at)::date AS week,
          COUNT(*)::int AS count
        FROM memories
        WHERE user_id = ${userId}::uuid
          AND created_at >= NOW() - INTERVAL '8 weeks'
        GROUP BY week
        ORDER BY week ASC
      `),

      // Content depth distribution — bucketed by word count
      db.execute(sql`
        SELECT
          CASE
            WHEN array_length(string_to_array(content, ' '), 1) < 50 THEN 'brief'
            WHEN array_length(string_to_array(content, ' '), 1) < 200 THEN 'medium'
            WHEN array_length(string_to_array(content, ' '), 1) < 500 THEN 'detailed'
            WHEN array_length(string_to_array(content, ' '), 1) < 1000 THEN 'deep'
            ELSE 'extensive'
          END AS depth,
          COUNT(*)::int AS count
        FROM memories WHERE user_id = ${userId}::uuid
        GROUP BY depth
      `),

      // Legacy-shape fields (preserved for /api/v1/stats parity — ARCH-10).

      // Daily activity — last 14 days of import counts by day
      db.execute(sql`
        SELECT
          date_trunc('day', created_at)::date AS day,
          COUNT(*)::int AS count
        FROM memories
        WHERE user_id = ${userId}::uuid
          AND created_at >= NOW() - INTERVAL '14 days'
        GROUP BY day
        ORDER BY day ASC
      `),

      // Recent memories — last 5 added
      db.execute(sql`
        SELECT id, content, source_type, source_title, created_at
        FROM memories WHERE user_id = ${userId}::uuid
        ORDER BY created_at DESC
        LIMIT 5
      `),

      // Pinned memories
      db.execute(sql`
        SELECT id, content, source_type, source_title, created_at
        FROM memories WHERE user_id = ${userId}::uuid AND (metadata->>'pinned')::boolean = true
        ORDER BY created_at DESC
        LIMIT 10
      `),
    ]);

    const total = (totalResult as any)[0]?.count || 0;
    const ws = (wordStats as any)[0] || {};
    const ec = (embeddingCoverage as any)[0] || {};
    const dr = (dateRange as any)[0] || {};

    // Fill in monthly growth with zero months
    const monthlyMap = new Map<string, number>();
    for (const row of monthlyGrowth as any[]) {
      monthlyMap.set(row.month, row.count);
    }
    const filledMonths: Array<{ month: string; count: number; cumulative: number }> = [];
    const now = new Date();
    let cumulative = 0;
    // Estimate memories before our tracking window
    const trackedTotal = Array.from(monthlyMap.values()).reduce((s, c) => s + c, 0);
    cumulative = Math.max(0, total - trackedTotal);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const count = monthlyMap.get(key) || 0;
      cumulative += count;
      filledMonths.push({ month: key, count, cumulative });
    }

    // Content depth distribution
    const depthMap: Record<string, number> = { brief: 0, medium: 0, detailed: 0, deep: 0, extensive: 0 };
    for (const row of contentDepth as any[]) {
      depthMap[row.depth] = row.count;
    }

    // Source diversity score (0-100) — based on Shannon entropy normalized to max entropy
    const sourceTypes = (sourceBreakdown as any[]);
    let diversityScore = 0;
    if (sourceTypes.length > 1 && total > 0) {
      const maxEntropy = Math.log2(sourceTypes.length);
      let entropy = 0;
      for (const s of sourceTypes) {
        const p = s.count / total;
        if (p > 0) entropy -= p * Math.log2(p);
      }
      diversityScore = maxEntropy > 0 ? Math.round((entropy / maxEntropy) * 100) : 0;
    } else if (sourceTypes.length === 1) {
      diversityScore = 0;
    }

    // Legacy-shape projections — preserved for /api/v1/stats parity (ARCH-10).
    const byType: Record<string, number> = { chatgpt: 0, text: 0, file: 0, url: 0 };
    for (const row of sourceTypes) {
      byType[row.type] = row.count;
    }
    const legacyTopSources = (topSources as any[]).map((s: any) => ({
      id: s.title || `${s.type}:${s.title || ''}`,
      type: s.type,
      title: s.title || 'Untitled',
      itemCount: s.count,
    }));
    const legacyRecent = (recentMemories as any[]).map((r: any) => ({
      id: r.id,
      content: r.content?.slice(0, 120) || '',
      sourceType: r.source_type,
      sourceTitle: r.source_title || 'Untitled',
      createdAt: r.created_at,
    }));
    const legacyPinned = (pinnedMemories as any[]).map((r: any) => ({
      id: r.id,
      content: r.content?.slice(0, 120) || '',
      sourceType: r.source_type,
      sourceTitle: r.source_title || 'Untitled',
      createdAt: r.created_at,
    }));

    return NextResponse.json({
      // Canonical knowledge-stats shape
      total,
      sources: sourceTypes.map((s: any) => ({ type: s.type, count: s.count })),
      monthlyGrowth: filledMonths,
      words: {
        total: Number(ws.total_words) || 0,
        avg: ws.avg_words || 0,
        min: ws.min_words || 0,
        max: ws.max_words || 0,
        avgChars: ws.avg_chars || 0,
      },
      embeddings: {
        total: ec.total || 0,
        covered: ec.with_embedding || 0,
        percentage: ec.total > 0 ? Math.round((ec.with_embedding / ec.total) * 100) : 0,
      },
      dateRange: {
        earliest: dr.earliest,
        latest: dr.latest,
      },
      topSources: (topSources as any[]).map((s: any) => ({
        type: s.type,
        title: s.title || 'Untitled',
        count: s.count,
      })),
      weeklyActivity: (weeklyActivity as any[]).map((w: any) => ({
        week: w.week,
        count: w.count,
      })),
      contentDepth: depthMap,
      diversityScore,

      // Legacy /api/v1/stats fields (ARCH-10 — exposed so the deprecated
      // route can be retired without losing data on the dashboard).
      // The legacy `topSources` shape lives under `topSourcesLegacy` to
      // avoid colliding with the canonical knowledge-stats `topSources` key.
      totalMemories: total,
      totalSources: legacyTopSources.length,
      byType,
      topSourcesLegacy: legacyTopSources,
      recentMemories: legacyRecent,
      pinnedMemories: legacyPinned,
      pinnedCount: legacyPinned.length,
      dailyActivity: buildDailyActivity(dailyActivity as any[]),
    });
  } catch (error: unknown) {
    console.error('[knowledge-stats]', error);
    return NextResponse.json({
      total: 0,
      sources: [],
      monthlyGrowth: [],
      words: { total: 0, avg: 0, min: 0, max: 0, avgChars: 0 },
      embeddings: { total: 0, covered: 0, percentage: 0 },
      dateRange: { earliest: null, latest: null },
      topSources: [],
      weeklyActivity: [],
      contentDepth: { brief: 0, medium: 0, detailed: 0, deep: 0, extensive: 0 },
      diversityScore: 0,
      // Legacy fallback fields
      totalMemories: 0,
      totalSources: 0,
      byType: { chatgpt: 0, text: 0, file: 0, url: 0 },
      topSourcesLegacy: [],
      recentMemories: [],
      pinnedMemories: [],
      pinnedCount: 0,
      dailyActivity: buildDailyActivity([]),
      dbError: true,
    });
  }
}
