import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { getAtRiskMemories } from '@/server/forgetting/scorer';

/**
 * GET /api/v1/forgetting/at-risk?limit=20
 * Phase 3 (A.4) — top-N at-risk memories ordered by Ebbinghaus retention.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'forgetting-at-risk', RATE_LIMITS.standard);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  try {
    const memories = await getAtRiskMemories(userId, Number.isFinite(limit) && limit > 0 ? limit : 20);
    return NextResponse.json({
      memories: memories.map((m) => ({
        memoryId: m.memoryId,
        riskScore: Number(m.riskScore.toFixed(3)),
        priority: m.recommendationPriority,
        daysSinceTouch: Math.round(m.daysSinceTouch),
        content: m.content,
        sourceType: m.sourceType,
        sourceTitle: m.sourceTitle,
      })),
    });
  } catch (e) {
    console.error('[forgetting-at-risk]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load at-risk memories' }, { status: 500 });
  }
}
