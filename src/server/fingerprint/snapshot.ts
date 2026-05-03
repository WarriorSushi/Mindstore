/**
 * Knowledge Fingerprint snapshots — Phase 2 (innovation A.2).
 *
 * Captures the same shape of data the live `/app/fingerprint` page
 * derives — memory count, per-source breakdown, cluster centroids,
 * and the top-N topics by frequency — and writes it to mind_snapshots.
 *
 * Designed to be cheap (zero LLM calls; pure DB aggregations + SVG
 * rendering) so it can run as a weekly cron without budget impact.
 *
 * Mind Diff (A.5) reads two snapshots and produces a delta report.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/server/db';

export interface SnapshotSummary {
  id: string;
  takenAt: Date;
  memoryCount: number;
  sourceBreakdown: Record<string, number>;
  topTopics: Array<{ topic: string; count: number }>;
}

export interface SnapshotDetail extends SnapshotSummary {
  clusterCentroids: Array<{ source: string; size: number; avg_word_count: number }>;
  fingerprintSvg: string | null;
  trigger: 'manual' | 'cron';
}

interface SnapshotRow {
  id: string;
  taken_at: string | Date;
  memory_count: number;
  source_breakdown: Record<string, number>;
  cluster_centroids: Array<{ source: string; size: number; avg_word_count: number }>;
  top_topics: Array<{ topic: string; count: number }>;
  fingerprint_svg: string | null;
  trigger: string;
}

/**
 * Render a deterministic hex-cell SVG badge from the snapshot data.
 *
 * The badge is a 6×6 grid of hex tiles; tile color and size encode the
 * top-6 source types (after normalization). Same inputs → same SVG —
 * the property the unit test pins.
 */
export function renderFingerprintSvg(input: {
  memoryCount: number;
  sourceBreakdown: Record<string, number>;
}): string {
  const { sourceBreakdown, memoryCount } = input;
  const entries = Object.entries(sourceBreakdown).sort(([, a], [, b]) => b - a).slice(0, 6);
  const totalForTop = entries.reduce((acc, [, n]) => acc + n, 0) || 1;
  const palette = ['#14b8a6', '#22d3ee', '#38bdf8', '#a78bfa', '#f472b6', '#fb923c'];
  const cellSize = 40;
  const cols = 6;
  const rows = 6;
  const w = cols * cellSize;
  const h = rows * cellSize;

  const cells: string[] = [];
  let placed = 0;
  for (let i = 0; i < entries.length; i++) {
    const [, count] = entries[i];
    const share = Math.max(1, Math.round((count / totalForTop) * 18)); // up to 18 cells per source
    for (let j = 0; j < share && placed < cols * rows; j++) {
      const c = placed % cols;
      const r = Math.floor(placed / cols);
      const cx = c * cellSize + cellSize / 2;
      const cy = r * cellSize + cellSize / 2;
      cells.push(
        `<circle cx="${cx}" cy="${cy}" r="${cellSize / 2 - 4}" fill="${palette[i % palette.length]}" opacity="0.9"/>`
      );
      placed++;
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    `<rect width="100%" height="100%" fill="#0a0a0b"/>`,
    cells.join(''),
    `<text x="${w - 6}" y="${h - 6}" text-anchor="end" font-family="ui-sans-serif,system-ui,-apple-system" font-size="10" fill="#52525b">${memoryCount} memories</text>`,
    `</svg>`,
  ].join('');
}

/** Source-type aggregation: source -> count for the user. */
async function loadSourceBreakdown(userId: string): Promise<Record<string, number>> {
  const rows = (await db.execute(sql`
    SELECT source_type AS source, COUNT(*)::int AS count
    FROM memories
    WHERE user_id = ${userId}::uuid
    GROUP BY source_type
    ORDER BY count DESC
  `)) as Array<{ source: string; count: number }>;
  const out: Record<string, number> = {};
  for (const row of rows) out[row.source] = row.count;
  return out;
}

/** Per-source cluster summary (size + average words/memory). */
async function loadClusterCentroids(userId: string) {
  const rows = (await db.execute(sql`
    SELECT
      source_type AS source,
      COUNT(*)::int AS size,
      COALESCE(ROUND(AVG(array_length(regexp_split_to_array(trim(content), E'\\s+'), 1))), 0)::int AS avg_word_count
    FROM memories
    WHERE user_id = ${userId}::uuid AND char_length(trim(content)) > 0
    GROUP BY source_type
    ORDER BY size DESC
    LIMIT 12
  `)) as Array<{ source: string; size: number; avg_word_count: number }>;
  return rows;
}

/** Top topics — currently approximated by source_title frequency. */
async function loadTopTopics(userId: string) {
  const rows = (await db.execute(sql`
    SELECT source_title AS topic, COUNT(*)::int AS count
    FROM memories
    WHERE user_id = ${userId}::uuid AND source_title IS NOT NULL AND source_title <> ''
    GROUP BY source_title
    ORDER BY count DESC, source_title ASC
    LIMIT 10
  `)) as Array<{ topic: string; count: number }>;
  return rows.map((r) => ({ topic: r.topic ?? 'Untitled', count: r.count }));
}

async function loadMemoryCount(userId: string): Promise<number> {
  const [row] = (await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM memories WHERE user_id = ${userId}::uuid
  `)) as Array<{ count: number }>;
  return row?.count ?? 0;
}

export interface CapturedSnapshot {
  id: string;
  takenAt: Date;
}

/**
 * Capture a new snapshot for the user. UPSERTs nothing — we keep every
 * snapshot so Mind Diff has a real time series to compare against.
 */
export async function captureSnapshot(
  userId: string,
  trigger: 'manual' | 'cron' = 'manual',
): Promise<CapturedSnapshot> {
  const [memoryCount, sourceBreakdown, clusterCentroids, topTopics] = await Promise.all([
    loadMemoryCount(userId),
    loadSourceBreakdown(userId),
    loadClusterCentroids(userId),
    loadTopTopics(userId),
  ]);

  const fingerprintSvg = renderFingerprintSvg({ memoryCount, sourceBreakdown });

  const [row] = (await db.execute(sql`
    INSERT INTO mind_snapshots (
      user_id, memory_count, source_breakdown, cluster_centroids, top_topics, fingerprint_svg, trigger
    ) VALUES (
      ${userId}::uuid, ${memoryCount},
      ${JSON.stringify(sourceBreakdown)}::jsonb,
      ${JSON.stringify(clusterCentroids)}::jsonb,
      ${JSON.stringify(topTopics)}::jsonb,
      ${fingerprintSvg}, ${trigger}
    )
    RETURNING id, taken_at
  `)) as Array<{ id: string; taken_at: string | Date }>;

  return { id: row.id, takenAt: new Date(row.taken_at) };
}

export async function listSnapshots(userId: string, limit = 12): Promise<SnapshotSummary[]> {
  const cap = Math.min(Math.max(limit, 1), 52);
  const rows = (await db.execute(sql`
    SELECT id, taken_at, memory_count, source_breakdown, top_topics
    FROM mind_snapshots
    WHERE user_id = ${userId}::uuid
    ORDER BY taken_at DESC
    LIMIT ${cap}
  `)) as Array<Pick<SnapshotRow, 'id' | 'taken_at' | 'memory_count' | 'source_breakdown' | 'top_topics'>>;

  return rows.map((row) => ({
    id: row.id,
    takenAt: new Date(row.taken_at),
    memoryCount: row.memory_count,
    sourceBreakdown: row.source_breakdown,
    topTopics: row.top_topics,
  }));
}

export async function getSnapshotById(userId: string, id: string): Promise<SnapshotDetail | null> {
  const [row] = (await db.execute(sql`
    SELECT id, taken_at, memory_count, source_breakdown, cluster_centroids,
      top_topics, fingerprint_svg, trigger
    FROM mind_snapshots
    WHERE user_id = ${userId}::uuid AND id = ${id}::uuid
  `)) as unknown as SnapshotRow[];

  if (!row) return null;
  return {
    id: row.id,
    takenAt: new Date(row.taken_at),
    memoryCount: row.memory_count,
    sourceBreakdown: row.source_breakdown,
    clusterCentroids: row.cluster_centroids,
    topTopics: row.top_topics,
    fingerprintSvg: row.fingerprint_svg,
    trigger: (row.trigger === 'cron' ? 'cron' : 'manual'),
  };
}
