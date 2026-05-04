import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { dismissRisk } from '@/server/risks/scanner';

/**
 * POST /api/v1/risks/[id]/dismiss — mark a risk dismissed (the next
 * scan won't surface it again unless the underlying issue persists).
 * Phase 4 (B.2).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'risks-dismiss', RATE_LIMITS.write);
  if (limited) return limited;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid risk id' }, { status: 400 });
  }

  try {
    const ok = await dismissRisk(userId, id);
    if (!ok) {
      return NextResponse.json({ error: 'Risk not found or already dismissed' }, { status: 404 });
    }
    return NextResponse.json({ dismissed: true });
  } catch (e) {
    console.error('[risks-dismiss]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to dismiss' }, { status: 500 });
  }
}
