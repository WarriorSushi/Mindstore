import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { captureSnapshot, listSnapshots } from '@/server/fingerprint/snapshot';

/**
 * GET  /api/v1/fingerprint/snapshots — list past snapshots (most-recent first).
 * POST /api/v1/fingerprint/snapshots — manually trigger a new snapshot.
 *
 * Phase 2 A.2 — paired with /api/v1/fingerprint/snapshots/[id]/svg for badge export.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'fingerprint-snapshots', RATE_LIMITS.standard);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '12', 10);

  try {
    const snapshots = await listSnapshots(userId, Number.isFinite(limit) && limit > 0 ? limit : 12);
    return NextResponse.json({
      snapshots: snapshots.map((s) => ({
        id: s.id,
        takenAt: s.takenAt.toISOString(),
        memoryCount: s.memoryCount,
        sourceBreakdown: s.sourceBreakdown,
        topTopics: s.topTopics,
      })),
    });
  } catch (e) {
    console.error('[fingerprint-snapshots GET]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to list snapshots' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'fingerprint-snapshot-create', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    const result = await captureSnapshot(userId, 'manual');
    return NextResponse.json(
      { id: result.id, takenAt: result.takenAt.toISOString() },
      { status: 201 },
    );
  } catch (e) {
    console.error('[fingerprint-snapshots POST]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to capture snapshot' }, { status: 500 });
  }
}
