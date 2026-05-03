import { NextRequest, NextResponse } from "next/server";
import { runDuePluginJobs } from "@/server/plugin-jobs";
import { getApiKeyFromHeaders, resolveApiKeyUserId } from "@/server/api-keys";
import { errors } from "@/server/api-errors";

/**
 * POST /api/v1/plugin-jobs/run-due — run any plugin jobs whose `nextRunAt`
 * is due. This is a privileged endpoint: it runs background work on behalf
 * of users, so it must not be callable by anonymous traffic.
 *
 * Three credentials satisfy the gate, in priority order:
 *   1. `Authorization: Bearer <INTERNAL_JOB_TOKEN>` env var (operator/cron)
 *   2. A valid user-issued API key (from the `api_keys` table)
 *   3. Vercel cron header `x-vercel-cron` (Vercel signs cron requests at
 *      the edge before they reach this function — we trust the header)
 */
export async function POST(req: NextRequest) {
  const authorized = await isAuthorized(req);
  if (!authorized) {
    return errors.unauthorized();
  }

  try {
    const body = await req.json().catch(() => ({}));
    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? Math.max(1, Math.min(body.limit, 50))
        : 10;

    const results = await runDuePluginJobs({ limit });

    return NextResponse.json({
      ok: true,
      processed: results.length,
      results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to run scheduled plugin jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  if (req.headers.get("x-vercel-cron")) return true;

  const presented = getApiKeyFromHeaders(req.headers);
  if (!presented) return false;

  const internalToken = process.env.INTERNAL_JOB_TOKEN;
  if (internalToken && presented === internalToken) return true;

  const apiKeyUserId = await resolveApiKeyUserId(presented);
  return Boolean(apiKeyUserId);
}
