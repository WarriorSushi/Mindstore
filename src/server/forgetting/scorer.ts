/**
 * Forgetting Curve scorer — Phase 3 (innovation A.4).
 *
 * Applies the Ebbinghaus retention curve `R(t) = e^(-t/S)` to every
 * memory the user owns, not just the ones promoted to flashcards.
 * The user's `memory_reviews` table (already present from the
 * flashcard plugin) holds SM-2 state for any memory they've explicitly
 * reviewed; for the rest, we use `created_at` (or `imported_at`) as
 * the last-touch baseline.
 *
 * `riskScore = 1 - R(t)` so 1 means "about to forget", 0 means "fresh".
 *
 * `recommendationPriority` is a 1..5 bucket (5 = drop everything,
 * review now) so the /app/forgetting UI can show a clear hierarchy
 * without exposing the raw decimal.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/server/db';

/**
 * Stability constant (in days). Tunes how aggressive the decay is.
 * S=14 means at 14 days the user has retained ~37% of an unrehearsed
 * memory — matches the Wikipedia version of the Ebbinghaus curve.
 * Reviewed memories get a stability boost from their SM-2 ease factor.
 */
const STABILITY_DAYS = 14;

/**
 * Compute risk for a single memory given days-since-touch and a
 * stability multiplier from prior reviews.
 *
 * `easeFactor`:  the SM-2 ease factor, defaulting to 2.5 if there's
 * no prior review. Higher values mean the memory sticks longer per
 * unit of practice, so the effective stability scales with it.
 *
 * `repetitions`: how many times the user has actively reviewed the
 * memory. Each repetition multiplies stability by 1.5, mimicking the
 * SM-2 spaced-repetition stability boost.
 */
export function computeRisk(input: {
  daysSinceTouch: number;
  easeFactor?: number;
  repetitions?: number;
}): { riskScore: number; recommendationPriority: number } {
  const t = Math.max(0, input.daysSinceTouch);
  const ease = Math.max(1.3, input.easeFactor ?? 2.5);
  const reps = Math.max(0, input.repetitions ?? 0);
  const stability = STABILITY_DAYS * (ease / 2.5) * Math.pow(1.5, reps);

  const retention = Math.exp(-t / stability);
  const riskScore = clamp01(1 - retention);

  let recommendationPriority: number;
  if (riskScore >= 0.85) recommendationPriority = 5;
  else if (riskScore >= 0.65) recommendationPriority = 4;
  else if (riskScore >= 0.45) recommendationPriority = 3;
  else if (riskScore >= 0.25) recommendationPriority = 2;
  else recommendationPriority = 1;

  return { riskScore, recommendationPriority };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Recompute and persist forgetting-risk rows for the user. Bulk
 * UPSERT so this is idempotent and cheap to schedule weekly.
 *
 * Returns counts so the cron can report meaningful summaries.
 */
export async function recomputeRiskForUser(userId: string): Promise<{
  scored: number;
  highRisk: number; // priority >= 4
}> {
  // Pull every memory's last-touch + SM-2 state in one query. The LEFT
  // JOIN against memory_reviews picks up flashcard SM-2 state where
  // present; otherwise we fall back to the memory's own created_at.
  const rows = (await db.execute(sql`
    SELECT
      m.id AS memory_id,
      EXTRACT(EPOCH FROM (NOW() - GREATEST(
        COALESCE(mr.last_reviewed_at, m.created_at, m.imported_at, NOW()),
        m.imported_at
      ))) / 86400.0 AS days_since_touch,
      mr.review_count AS repetitions
    FROM memories m
    LEFT JOIN memory_reviews mr ON mr.memory_id = m.id AND mr.user_id = m.user_id
    WHERE m.user_id = ${userId}::uuid
  `)) as unknown as Array<{
    memory_id: string;
    days_since_touch: number;
    repetitions: number | null;
  }>;

  let highRisk = 0;
  if (rows.length === 0) {
    return { scored: 0, highRisk: 0 };
  }

  // Batch the upserts — 200 per insert keeps the parameter count safe.
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = batch.map((r) => {
      const { riskScore, recommendationPriority } = computeRisk({
        daysSinceTouch: Number(r.days_since_touch ?? 0),
        repetitions: Number(r.repetitions ?? 0),
      });
      if (recommendationPriority >= 4) highRisk += 1;
      return {
        memoryId: r.memory_id,
        days: Math.max(0, Math.round(Number(r.days_since_touch ?? 0))),
        riskScore,
        priority: recommendationPriority,
      };
    });

    // Multi-row INSERT with array unnesting.
    const memoryIds = values.map((v) => v.memoryId);
    const days = values.map((v) => v.days);
    const scores = values.map((v) => v.riskScore);
    const priorities = values.map((v) => v.priority);

    await db.execute(sql`
      INSERT INTO memory_forgetting_risk (user_id, memory_id, risk_score, days_since_touch, recommendation_priority, computed_at)
      SELECT ${userId}::uuid, m_id::uuid, score, days, priority, NOW()
      FROM UNNEST(
        ${memoryIds}::uuid[],
        ${scores}::real[],
        ${days}::int[],
        ${priorities}::int[]
      ) AS t(m_id, score, days, priority)
      ON CONFLICT (user_id, memory_id) DO UPDATE SET
        risk_score = EXCLUDED.risk_score,
        days_since_touch = EXCLUDED.days_since_touch,
        recommendation_priority = EXCLUDED.recommendation_priority,
        computed_at = NOW()
    `);
  }

  return { scored: rows.length, highRisk };
}

export interface AtRiskMemory {
  memoryId: string;
  riskScore: number;
  recommendationPriority: number;
  daysSinceTouch: number;
  content: string;
  sourceType: string;
  sourceTitle: string | null;
}

/**
 * Pull the top-N at-risk memories for the user. UI surfaces these in a
 * spaced-repetition flow that mirrors the flashcard review experience.
 *
 * Lazy-recomputes if the user has no rows yet — first-page load on a
 * fresh account "just works".
 */
export async function getAtRiskMemories(
  userId: string,
  limit = 20,
): Promise<AtRiskMemory[]> {
  const cap = Math.min(Math.max(limit, 1), 100);

  let rows = (await db.execute(sql`
    SELECT
      r.memory_id,
      r.risk_score,
      r.recommendation_priority,
      r.days_since_touch,
      m.content,
      m.source_type,
      m.source_title
    FROM memory_forgetting_risk r
    JOIN memories m ON m.id = r.memory_id
    WHERE r.user_id = ${userId}::uuid
    ORDER BY r.recommendation_priority DESC, r.risk_score DESC
    LIMIT ${cap}
  `)) as unknown as Array<{
    memory_id: string;
    risk_score: number;
    recommendation_priority: number;
    days_since_touch: number;
    content: string;
    source_type: string;
    source_title: string | null;
  }>;

  if (rows.length === 0) {
    await recomputeRiskForUser(userId);
    rows = (await db.execute(sql`
      SELECT
        r.memory_id,
        r.risk_score,
        r.recommendation_priority,
        r.days_since_touch,
        m.content,
        m.source_type,
        m.source_title
      FROM memory_forgetting_risk r
      JOIN memories m ON m.id = r.memory_id
      WHERE r.user_id = ${userId}::uuid
      ORDER BY r.recommendation_priority DESC, r.risk_score DESC
      LIMIT ${cap}
    `)) as unknown as Array<{
      memory_id: string;
      risk_score: number;
      recommendation_priority: number;
      days_since_touch: number;
      content: string;
      source_type: string;
      source_title: string | null;
    }>;
  }

  return rows.map((r) => ({
    memoryId: r.memory_id,
    riskScore: r.risk_score,
    recommendationPriority: r.recommendation_priority,
    daysSinceTouch: r.days_since_touch,
    content: r.content,
    sourceType: r.source_type,
    sourceTitle: r.source_title,
  }));
}

/**
 * Record that the user reviewed a memory — drops the risk score and
 * advances the SM-2 state in `memory_reviews` to mirror the flashcard
 * loop.
 */
export async function recordMemoryReview(userId: string, memoryId: string): Promise<void> {
  // Upsert into memory_reviews to bump review_count + nextReviewAt.
  await db.execute(sql`
    INSERT INTO memory_reviews (user_id, memory_id, review_count, next_review_at, last_reviewed_at, created_at)
    VALUES (
      ${userId}::uuid, ${memoryId}::uuid, 1,
      NOW() + INTERVAL '3 days', NOW(), NOW()
    )
    ON CONFLICT (user_id, memory_id) DO UPDATE SET
      review_count = memory_reviews.review_count + 1,
      next_review_at = NOW() + (INTERVAL '3 days' * (memory_reviews.review_count + 1)),
      last_reviewed_at = NOW()
  `);

  // Drop risk to ~0 — the next scheduled recompute will refresh.
  await db.execute(sql`
    UPDATE memory_forgetting_risk
    SET risk_score = 0, days_since_touch = 0, recommendation_priority = 1, computed_at = NOW()
    WHERE user_id = ${userId}::uuid AND memory_id = ${memoryId}::uuid
  `);
}
