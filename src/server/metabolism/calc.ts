/**
 * Knowledge Metabolism Score — Phase 2 (innovation A.9 in FEATURE_BACKLOG.md).
 *
 * A weekly intellectual-fitness score (0-10) plus four components:
 *   - intakeRate          — memories added this week vs trailing 8-week average
 *   - connectionDensity   — connections discovered per memory
 *   - retrievalFrequency  — searches + chats per day this week
 *   - growthVelocity      — week-over-week change in memory count
 *
 * Score = 4·intake + 2·density + 2·retrieval + 2·velocity
 *       (40% intake, 20% density, 20% retrieval, 20% velocity), capped at 10.
 *
 * Each component is in [0, 1]; the sum is in [0, 10]. Inputs are clamped
 * defensively so a runaway week doesn't pin the score.
 *
 * The calc is deterministic given a fixed week_start and DB state — see
 * tests/unit/metabolism.test.ts for the invariant suite.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/server/db';

export interface MetabolismComponents {
  intakeRate: number;
  connectionDensity: number;
  retrievalFrequency: number;
  growthVelocity: number;
}

export interface MetabolismScoreRow {
  weekStart: Date;
  score: number;
  components: MetabolismComponents;
  memoriesAdded: number;
  searchesPerformed: number;
  chatsPerformed: number;
  computedAt: Date;
}

const COMPONENT_WEIGHTS = {
  intake: 4,
  density: 2,
  retrieval: 2,
  velocity: 2,
} as const;

/** Clamp `value` into [0, 1]. */
function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * The Sunday 00:00 UTC of the week that contains `at`.
 * Used as the canonical week_start key.
 */
export function startOfWeekUtc(at: Date): Date {
  const result = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const dow = result.getUTCDay(); // 0 = Sunday
  result.setUTCDate(result.getUTCDate() - dow);
  return result;
}

interface WeeklyAggregates {
  thisWeekMemories: number;
  lastWeekMemories: number;
  trailingAverageMemories: number;
  totalMemories: number;
  totalConnections: number;
  searches: number;
  chats: number;
}

/**
 * Pure scoring function — no DB calls. Given the raw aggregates,
 * computes the components and the overall score. Exported separately
 * so the test suite can pin invariants without a live database.
 */
export function scoreFromAggregates(aggregates: WeeklyAggregates): {
  components: MetabolismComponents;
  score: number;
} {
  const {
    thisWeekMemories,
    lastWeekMemories,
    trailingAverageMemories,
    totalMemories,
    totalConnections,
    searches,
    chats,
  } = aggregates;

  // intakeRate: this-week / trailing-average. We cap at 1.0 (100%) so a
  // single huge import doesn't peg the score. A 0 trailing average means
  // the user has been silent — any positive activity gives a healthy score.
  const intakeRate = trailingAverageMemories > 0
    ? clamp01(thisWeekMemories / trailingAverageMemories)
    : (thisWeekMemories > 0 ? 1 : 0);

  // connectionDensity: connections / memories. Real users hit ~0.1-0.3.
  // We scale by 5 so the typical range maps to 0.5-1.5, then clamp.
  const connectionDensity = totalMemories > 0
    ? clamp01((totalConnections / totalMemories) * 5)
    : 0;

  // retrievalFrequency: (searches + chats) per day this week, normalized
  // so 14 events/week (twice a day) is a perfect score.
  const totalRetrievals = searches + chats;
  const retrievalFrequency = clamp01(totalRetrievals / 14);

  // growthVelocity: relative week-over-week change. Capped at +100% so a
  // single big import week doesn't dominate; negative deltas score 0.
  const growthVelocity = lastWeekMemories > 0
    ? clamp01((thisWeekMemories - lastWeekMemories) / lastWeekMemories)
    : (thisWeekMemories > 0 ? 1 : 0);

  const components: MetabolismComponents = {
    intakeRate,
    connectionDensity,
    retrievalFrequency,
    growthVelocity,
  };

  const score = Math.min(
    10,
    components.intakeRate * COMPONENT_WEIGHTS.intake +
      components.connectionDensity * COMPONENT_WEIGHTS.density +
      components.retrievalFrequency * COMPONENT_WEIGHTS.retrieval +
      components.growthVelocity * COMPONENT_WEIGHTS.velocity,
  );

  return { components, score };
}

/**
 * Pull the weekly aggregates for `userId` covering the week containing
 * `at`. Returns the raw counts, not yet scored.
 */
export async function loadWeeklyAggregates(
  userId: string,
  at: Date = new Date(),
): Promise<WeeklyAggregates & { weekStart: Date }> {
  const weekStart = startOfWeekUtc(at);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const trailingStart = new Date(weekStart.getTime() - 8 * 7 * 86400000); // 8-week trailing window

  const [thisWeekRow] = (await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM memories
    WHERE user_id = ${userId}::uuid
      AND created_at >= ${weekStart} AND created_at < ${weekEnd}
  `)) as Array<{ count: number }>;

  const [lastWeekRow] = (await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM memories
    WHERE user_id = ${userId}::uuid
      AND created_at >= ${lastWeekStart} AND created_at < ${weekStart}
  `)) as Array<{ count: number }>;

  const [trailingRow] = (await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM memories
    WHERE user_id = ${userId}::uuid
      AND created_at >= ${trailingStart} AND created_at < ${weekStart}
  `)) as Array<{ count: number }>;

  const [totalRow] = (await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM memories
    WHERE user_id = ${userId}::uuid
  `)) as Array<{ count: number }>;

  const [connectionRow] = (await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM connections
    WHERE user_id = ${userId}::uuid
  `)) as Array<{ count: number }>;

  const [searchRow] = (await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM search_history
    WHERE user_id = ${userId}::uuid
      AND searched_at >= ${weekStart} AND searched_at < ${weekEnd}
  `)) as Array<{ count: number }>;

  const [chatRow] = (await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM chat_conversations
    WHERE user_id = ${userId}::uuid
      AND updated_at >= ${weekStart} AND updated_at < ${weekEnd}
  `)) as Array<{ count: number }>;

  const trailingMemories = trailingRow?.count ?? 0;
  const trailingAverage = trailingMemories / 8;

  return {
    weekStart,
    thisWeekMemories: thisWeekRow?.count ?? 0,
    lastWeekMemories: lastWeekRow?.count ?? 0,
    trailingAverageMemories: trailingAverage,
    totalMemories: totalRow?.count ?? 0,
    totalConnections: connectionRow?.count ?? 0,
    searches: searchRow?.count ?? 0,
    chats: chatRow?.count ?? 0,
  };
}

/**
 * Compute and persist the metabolism score for `userId` for the week
 * containing `at`. UPSERTs on (user_id, week_start) so reruns are safe.
 */
export async function computeAndPersistScore(
  userId: string,
  at: Date = new Date(),
): Promise<MetabolismScoreRow> {
  const aggregates = await loadWeeklyAggregates(userId, at);
  const { components, score } = scoreFromAggregates(aggregates);

  await db.execute(sql`
    INSERT INTO metabolism_scores (
      user_id, week_start, score,
      intake_rate, connection_density, retrieval_frequency, growth_velocity,
      memories_added, searches_performed, chats_performed,
      computed_at
    ) VALUES (
      ${userId}::uuid, ${aggregates.weekStart}, ${score},
      ${components.intakeRate}, ${components.connectionDensity},
      ${components.retrievalFrequency}, ${components.growthVelocity},
      ${aggregates.thisWeekMemories}, ${aggregates.searches}, ${aggregates.chats},
      NOW()
    )
    ON CONFLICT (user_id, week_start) DO UPDATE SET
      score = EXCLUDED.score,
      intake_rate = EXCLUDED.intake_rate,
      connection_density = EXCLUDED.connection_density,
      retrieval_frequency = EXCLUDED.retrieval_frequency,
      growth_velocity = EXCLUDED.growth_velocity,
      memories_added = EXCLUDED.memories_added,
      searches_performed = EXCLUDED.searches_performed,
      chats_performed = EXCLUDED.chats_performed,
      computed_at = NOW()
  `);

  return {
    weekStart: aggregates.weekStart,
    score,
    components,
    memoriesAdded: aggregates.thisWeekMemories,
    searchesPerformed: aggregates.searches,
    chatsPerformed: aggregates.chats,
    computedAt: new Date(),
  };
}

/**
 * Latest persisted score for the user. Triggers a recompute if no row
 * exists for the current week.
 */
export async function getCurrentScore(userId: string): Promise<MetabolismScoreRow> {
  const weekStart = startOfWeekUtc(new Date());

  const [row] = (await db.execute(sql`
    SELECT week_start, score, intake_rate, connection_density,
      retrieval_frequency, growth_velocity, memories_added,
      searches_performed, chats_performed, computed_at
    FROM metabolism_scores
    WHERE user_id = ${userId}::uuid AND week_start = ${weekStart}
  `)) as Array<{
    week_start: string | Date;
    score: number;
    intake_rate: number;
    connection_density: number;
    retrieval_frequency: number;
    growth_velocity: number;
    memories_added: number;
    searches_performed: number;
    chats_performed: number;
    computed_at: string | Date;
  }>;

  if (!row) {
    return await computeAndPersistScore(userId);
  }

  return {
    weekStart: new Date(row.week_start),
    score: row.score,
    components: {
      intakeRate: row.intake_rate,
      connectionDensity: row.connection_density,
      retrievalFrequency: row.retrieval_frequency,
      growthVelocity: row.growth_velocity,
    },
    memoriesAdded: row.memories_added,
    searchesPerformed: row.searches_performed,
    chatsPerformed: row.chats_performed,
    computedAt: new Date(row.computed_at),
  };
}

/**
 * History — last `weeks` rows (default 12), most-recent first.
 */
export async function getScoreHistory(
  userId: string,
  weeks: number = 12,
): Promise<MetabolismScoreRow[]> {
  const limit = Math.min(Math.max(weeks, 1), 52);

  const rows = (await db.execute(sql`
    SELECT week_start, score, intake_rate, connection_density,
      retrieval_frequency, growth_velocity, memories_added,
      searches_performed, chats_performed, computed_at
    FROM metabolism_scores
    WHERE user_id = ${userId}::uuid
    ORDER BY week_start DESC
    LIMIT ${limit}
  `)) as Array<{
    week_start: string | Date;
    score: number;
    intake_rate: number;
    connection_density: number;
    retrieval_frequency: number;
    growth_velocity: number;
    memories_added: number;
    searches_performed: number;
    chats_performed: number;
    computed_at: string | Date;
  }>;

  return rows.map((row) => ({
    weekStart: new Date(row.week_start),
    score: row.score,
    components: {
      intakeRate: row.intake_rate,
      connectionDensity: row.connection_density,
      retrievalFrequency: row.retrieval_frequency,
      growthVelocity: row.growth_velocity,
    },
    memoriesAdded: row.memories_added,
    searchesPerformed: row.searches_performed,
    chatsPerformed: row.chats_performed,
    computedAt: new Date(row.computed_at),
  }));
}
