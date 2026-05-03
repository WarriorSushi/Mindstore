import { NextResponse } from 'next/server';
import { dbHealthy } from '@/server/db';

/**
 * GET /api/health — minimal public health check.
 *
 * Returns only `{ status, timestamp }`. Provider configuration, database
 * diagnostics, and identity-mode booleans are NOT exposed here — they live
 * behind the authenticated `/api/v1/health` endpoint to avoid leaking
 * deployment topology to anonymous callers.
 */
export async function GET() {
  const dbOk = await dbHealthy();
  return NextResponse.json(
    {
      status: dbOk ? 'ok' : 'unhealthy',
      timestamp: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503 },
  );
}
