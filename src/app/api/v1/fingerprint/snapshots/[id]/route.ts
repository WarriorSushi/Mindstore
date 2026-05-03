import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { getSnapshotById } from '@/server/fingerprint/snapshot';

/**
 * GET /api/v1/fingerprint/snapshots/[id] — full detail for one snapshot,
 * or `?format=svg` to download the badge directly. Phase 2 A.2.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'fingerprint-snapshot-detail', RATE_LIMITS.standard);
  if (limited) return limited;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid snapshot id' }, { status: 400 });
  }

  try {
    const snap = await getSnapshotById(userId, id);
    if (!snap) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    if (searchParams.get('format') === 'svg' && snap.fingerprintSvg) {
      return new NextResponse(snap.fingerprintSvg, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Content-Disposition': `inline; filename="mindstore-fingerprint-${id}.svg"`,
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    return NextResponse.json({
      id: snap.id,
      takenAt: snap.takenAt.toISOString(),
      memoryCount: snap.memoryCount,
      sourceBreakdown: snap.sourceBreakdown,
      clusterCentroids: snap.clusterCentroids,
      topTopics: snap.topTopics,
      fingerprintSvg: snap.fingerprintSvg,
      trigger: snap.trigger,
    });
  } catch (e) {
    console.error('[fingerprint-snapshot-detail]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load snapshot' }, { status: 500 });
  }
}
