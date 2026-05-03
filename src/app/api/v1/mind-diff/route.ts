import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { computeMindDiff } from '@/server/mind-diff/compare';

/**
 * GET /api/v1/mind-diff?from=<snapshotId>&to=<snapshotId>
 * Phase 2 (A.5) — structured delta between two mind_snapshots.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'mind-diff', RATE_LIMITS.standard);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json({ error: 'Missing ?from= and ?to= snapshot ids' }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(from) || !/^[0-9a-f-]{36}$/i.test(to)) {
    return NextResponse.json({ error: 'Invalid snapshot id' }, { status: 400 });
  }

  try {
    const diff = await computeMindDiff(userId, from, to);
    if (!diff) {
      return NextResponse.json({ error: 'Snapshot not found or identical pair' }, { status: 404 });
    }

    return NextResponse.json({
      ...diff,
      fromTakenAt: diff.fromTakenAt.toISOString(),
      toTakenAt: diff.toTakenAt.toISOString(),
    });
  } catch (e) {
    console.error('[mind-diff]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to compute mind diff' }, { status: 500 });
  }
}
