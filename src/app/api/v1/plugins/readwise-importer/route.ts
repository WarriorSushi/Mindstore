/**
 * Readwise Highlights Importer — Route (thin wrapper)
 *
 * GET   — Config info and import stats
 * POST  — Import highlights via Readwise API, or save API token
 *
 * Logic delegated to src/server/plugins/ports/readwise-importer.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import {
  ensureInstalled,
  getReadwiseConfig,
  getReadwiseStats,
  saveToken,
  runImport,
} from "@/server/plugins/ports/readwise-importer";

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureInstalled();
    const action = req.nextUrl.searchParams.get("action") || "config";

    if (action === "config") return NextResponse.json(await getReadwiseConfig());
    if (action === "stats") return NextResponse.json(await getReadwiseStats(userId));
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-readwise-importer', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    await ensureInstalled();
    const body = await req.json();

    if (body.action === "save-token") {
      if (!body.token) return NextResponse.json({ error: "Token required" }, { status: 400 });
      return NextResponse.json(await saveToken(body.token));
    }

    if (body.action === "import") {
      return NextResponse.json(
        await runImport(userId, { token: body.token, categories: body.categories }),
      );
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("Invalid") || message.includes("token") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
