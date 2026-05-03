import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { sql } from 'drizzle-orm';
import { getIdentityMode, isSingleUserModeEnabled } from '@/server/identity';
import { getDatabaseConnectionDiagnostics } from '@/server/postgres-client';
import { requireUserId } from '@/server/api-validation';

/**
 * GET /api/v1/health
 *
 * Authenticated system health dashboard — DB stats, embedding coverage,
 * storage breakdown, connection status, and performance metrics. Public
 * `/api/health` returns a minimal status only; this endpoint exposes the
 * full diagnostics surface and therefore requires auth.
 */
export async function GET() {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;
  try {
    const dbDiagnostics = getDatabaseConnectionDiagnostics(process.env.DATABASE_URL);

    // Run all checks in parallel
    const [
      memoryCounts,
      embeddingCoverage,
      sourceBreakdown,
      storageEstimate,
      recentActivity,
      dbHealth,
      pluginCount,
      connectionCount,
    ] = await Promise.allSettled([
      // Total memories
      db.execute(sql`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings,
          COUNT(CASE WHEN (metadata->>'pinned')::boolean = true THEN 1 END) as pinned,
          MIN(created_at) as oldest,
          MAX(created_at) as newest
        FROM memories WHERE user_id = ${userId}::uuid
      `),

      // Embedding dimension coverage
      db.execute(sql`
        SELECT 
          vector_dims(embedding) as dims,
          COUNT(*) as count
        FROM memories 
        WHERE user_id = ${userId}::uuid AND embedding IS NOT NULL
        GROUP BY vector_dims(embedding)
        ORDER BY count DESC
      `),

      // Source type breakdown with sizes
      db.execute(sql`
        SELECT 
          source_type,
          COUNT(*) as count,
          SUM(LENGTH(content)) as total_chars,
          AVG(LENGTH(content))::int as avg_chars
        FROM memories 
        WHERE user_id = ${userId}::uuid
        GROUP BY source_type
        ORDER BY count DESC
      `),

      // Estimated storage
      db.execute(sql`
        SELECT 
          SUM(LENGTH(content)) as content_bytes,
          pg_table_size('memories') as table_bytes,
          pg_indexes_size('memories') as index_bytes,
          pg_total_relation_size('memories') as total_bytes
        FROM memories WHERE user_id = ${userId}::uuid
      `),

      // Recent activity (memories added per day, last 7 days)
      db.execute(sql`
        SELECT 
          DATE(created_at) as day,
          COUNT(*) as count
        FROM memories 
        WHERE user_id = ${userId}::uuid
          AND created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY day DESC
      `),

      // DB health check (connection test + version)
      db.execute(sql`SELECT version() as version, NOW() as server_time`),

      // Plugin count
      db.execute(sql`
        SELECT COUNT(*) as total, COUNT(CASE WHEN status = 'active' THEN 1 END) as enabled
        FROM plugins
      `).catch(() => [{ total: 0, enabled: 0 }]),

      // Connections count
      db.execute(sql`
        SELECT COUNT(*) as count FROM connections WHERE user_id = ${userId}::uuid
      `).catch(() => [{ count: 0 }]),
    ]);

    // Process results
    const memStats = memoryCounts.status === 'fulfilled' ? (memoryCounts.value as any[])[0] : null;
    const embDims = embeddingCoverage.status === 'fulfilled' ? (embeddingCoverage.value as any[]) : [];
    const sources = sourceBreakdown.status === 'fulfilled' ? (sourceBreakdown.value as any[]) : [];
    const storage = storageEstimate.status === 'fulfilled' ? (storageEstimate.value as any[])[0] : null;
    const activity = recentActivity.status === 'fulfilled' ? (recentActivity.value as any[]) : [];
    const dbInfo = dbHealth.status === 'fulfilled' ? (dbHealth.value as any[])[0] : null;
    const plugins = pluginCount.status === 'fulfilled' ? (pluginCount.value as any[])[0] : { total: 0, enabled: 0 };
    const connections = connectionCount.status === 'fulfilled' ? (connectionCount.value as any[])[0] : { count: 0 };

    const total = parseInt(memStats?.total || '0');
    const withEmbeddings = parseInt(memStats?.with_embeddings || '0');
    const embeddingPercent = total > 0 ? Math.round((withEmbeddings / total) * 100) : 0;

    // Format storage
    function formatBytes(bytes: number): string {
      if (!bytes || bytes === 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      
      memories: {
        total,
        withEmbeddings,
        withoutEmbeddings: total - withEmbeddings,
        embeddingPercent,
        pinned: parseInt(memStats?.pinned || '0'),
        oldest: memStats?.oldest,
        newest: memStats?.newest,
      },

      embeddings: {
        dimensions: embDims.map((d: any) => ({
          dims: parseInt(d.dims),
          count: parseInt(d.count),
        })),
        coverage: `${embeddingPercent}%`,
      },

      sources: sources.map((s: any) => ({
        type: s.source_type,
        count: parseInt(s.count),
        totalChars: parseInt(s.total_chars || '0'),
        avgChars: parseInt(s.avg_chars || '0'),
        size: formatBytes(parseInt(s.total_chars || '0')),
      })),

      storage: {
        contentSize: formatBytes(parseInt(storage?.content_bytes || '0')),
        tableSize: formatBytes(parseInt(storage?.table_bytes || '0')),
        indexSize: formatBytes(parseInt(storage?.index_bytes || '0')),
        totalSize: formatBytes(parseInt(storage?.total_bytes || '0')),
        raw: {
          contentBytes: parseInt(storage?.content_bytes || '0'),
          tableBytes: parseInt(storage?.table_bytes || '0'),
          indexBytes: parseInt(storage?.index_bytes || '0'),
          totalBytes: parseInt(storage?.total_bytes || '0'),
        },
      },

      activity: activity.map((a: any) => ({
        day: a.day,
        count: parseInt(a.count),
      })),

      plugins: {
        total: parseInt(plugins?.total || '0'),
        enabled: parseInt(plugins?.enabled || '0'),
      },

      auth: {
        identityMode: getIdentityMode(),
        singleUserMode: isSingleUserModeEnabled(),
      },

      connections: parseInt(connections?.count || '0'),

      database: {
        version: dbInfo?.version?.split(' ').slice(0, 2).join(' ') || 'Unknown',
        serverTime: dbInfo?.server_time,
        healthy: dbHealth.status === 'fulfilled',
        connection: dbDiagnostics,
      },
    });
  } catch (error: unknown) {
    console.error('[health]', error);
    return NextResponse.json({ status: 'error', error: String(error) }, { status: 500 });
  }
}
