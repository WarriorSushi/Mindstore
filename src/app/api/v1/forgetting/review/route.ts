import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { parseJsonBody, requireUserId } from '@/server/api-validation';
import { recordMemoryReview } from '@/server/forgetting/scorer';

const ReviewSchema = z.object({
  memoryId: z.string().uuid(),
});

/**
 * POST /api/v1/forgetting/review
 * Records that the user reviewed a memory (advances SM-2 state +
 * drops forgetting risk to 0). Phase 3 (A.4).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'forgetting-review', RATE_LIMITS.write);
  if (limited) return limited;

  const body = await parseJsonBody(req, ReviewSchema);
  if (body instanceof NextResponse) return body;

  try {
    await recordMemoryReview(userId, body.memoryId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[forgetting-review]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to record review' }, { status: 500 });
  }
}
