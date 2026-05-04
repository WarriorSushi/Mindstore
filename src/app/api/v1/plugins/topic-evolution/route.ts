import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import {
  analyzeTopicEvolution,
  ensureTopicEvolutionInstalled,
} from "@/server/plugins/ports/topic-evolution";

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureTopicEvolutionInstalled();
    const granularityParam = req.nextUrl.searchParams.get("granularity");
    const granularity = granularityParam === "week" || granularityParam === "quarter" ? granularityParam : "month";
    const maxTopics = Math.min(
      Number.parseInt(req.nextUrl.searchParams.get("maxTopics") || "10", 10) || 10,
      16,
    );

    return NextResponse.json(await analyzeTopicEvolution(userId, { granularity, maxTopics }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
