import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { getScoreHistory } from '@/server/metabolism/calc';

/**
 * GET /api/v1/metabolism/history?weeks=12 — last N persisted weekly
 * Knowledge Metabolism Scores, most-recent first. Default and max
 * window per FEATURE_BACKLOG.md A.9; cap is 52 weeks (one year).
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'metabolism-history', RATE_LIMITS.standard);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const weeksParam = parseInt(searchParams.get('weeks') || '12', 10);
  const weeks = Number.isFinite(weeksParam) && weeksParam > 0 ? weeksParam : 12;

  try {
    const rows = await getScoreHistory(userId, weeks);
    return NextResponse.json({
      weeks: rows.map((row) => ({
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
      })),
    });
  } catch (error: unknown) {
    console.error('[metabolism-history]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load metabolism history' },
      { status: 500 },
    );
  }
}
