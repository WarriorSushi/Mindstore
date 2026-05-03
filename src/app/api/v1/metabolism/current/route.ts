import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { getCurrentScore } from '@/server/metabolism/calc';

/**
 * GET /api/v1/metabolism/current — current week's Knowledge Metabolism Score.
 * Per FEATURE_BACKLOG.md A.9.
 *
 * Returns the latest persisted row, or computes one on demand if the
 * weekly cron hasn't fired yet for the current week.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'metabolism-current', RATE_LIMITS.standard);
  if (limited) return limited;

  try {
    const row = await getCurrentScore(userId);
    return NextResponse.json({
      weekStart: row.weekStart.toISOString(),
      score: Number(row.score.toFixed(2)),
      components: {
        intakeRate: Number(row.components.intakeRate.toFixed(3)),
        connectionDensity: Number(row.components.connectionDensity.toFixed(3)),
        retrievalFrequency: Number(row.components.retrievalFrequency.toFixed(3)),
        growthVelocity: Number(row.components.growthVelocity.toFixed(3)),
      },
      activity: {
        memoriesAdded: row.memoriesAdded,
        searchesPerformed: row.searchesPerformed,
        chatsPerformed: row.chatsPerformed,
      },
      computedAt: row.computedAt.toISOString(),
    });
  } catch (error: unknown) {
    console.error('[metabolism-current]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to compute metabolism score' },
      { status: 500 },
    );
  }
}
