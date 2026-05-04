import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { listRisks, scanUserKnowledge } from '@/server/risks/scanner';

/**
 * GET  /api/v1/risks       — current open risks ordered by severity.
 * POST /api/v1/risks/scan  — manually trigger a fresh scan.
 *
 * Phase 4 (B.2). Zero LLM cost — pattern-matching only.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'risks-list', RATE_LIMITS.standard);
  if (limited) return limited;

  try {
    let risks = await listRisks(userId);
    if (risks.length === 0) {
      // Lazy first scan for a fresh user.
      await scanUserKnowledge(userId);
      risks = await listRisks(userId);
    }
    return NextResponse.json({
      risks: risks.map((r) => ({
        id: r.id,
        riskType: r.riskType,
        severity: r.severity,
        description: r.description,
        affectedMemoryIds: r.affectedMemoryIds,
        metadata: r.metadata,
        detectedAt: r.detectedAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error('[risks-list]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load risks' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'risks-scan', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    const risks = await scanUserKnowledge(userId);
    return NextResponse.json({ scanned: true, riskCount: risks.length });
  } catch (e) {
    console.error('[risks-scan]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to scan' }, { status: 500 });
  }
}
