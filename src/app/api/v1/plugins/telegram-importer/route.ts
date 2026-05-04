/**
 * Telegram Saved Messages Importer — Route (thin wrapper)
 *
 * GET   — Config info and import stats
 * POST  — Parse uploaded Telegram export JSON
 *
 * Logic delegated to src/server/plugins/ports/telegram-importer.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import {
  ensureInstalled,
  getTelegramConfig,
  getTelegramStats,
  runImport,
} from "@/server/plugins/ports/telegram-importer";

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureInstalled();
    const action = req.nextUrl.searchParams.get("action") || "config";

    if (action === "config") return NextResponse.json(getTelegramConfig());
    if (action === "stats") return NextResponse.json(await getTelegramStats(userId));
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

  const limited = applyRateLimit(req, 'plugin-telegram-importer', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    await ensureInstalled();
    const body = await req.json();

    if (body.action === "import") {
      if (!body.data) return NextResponse.json({ error: "No data provided" }, { status: 400 });
      return NextResponse.json(
        await runImport(userId, {
          data: body.data,
          chatFilter: body.chatFilter,
          minLength: body.minLength,
        }),
      );
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
