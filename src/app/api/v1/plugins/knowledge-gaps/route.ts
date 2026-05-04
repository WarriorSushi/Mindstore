import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import {
  analyzeKnowledgeGaps,
  ensureKnowledgeGapsInstalled,
} from "@/server/plugins/ports/knowledge-gaps";

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureKnowledgeGapsInstalled();
    const actionParam = req.nextUrl.searchParams.get("action");
    const action = actionParam === "suggest" ? "suggest" : "analyze";
    const maxTopics = Math.min(
      Number.parseInt(req.nextUrl.searchParams.get("maxTopics") || "12", 10) || 12,
      20,
    );

    return NextResponse.json(await analyzeKnowledgeGaps(userId, { action, maxTopics }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
