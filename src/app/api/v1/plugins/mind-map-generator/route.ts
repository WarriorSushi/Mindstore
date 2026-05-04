import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import {
  ensureMindMapInstalled,
  generateMindMap,
} from "@/server/plugins/ports/mind-map-generator";

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureMindMapInstalled();
    const maxTopics = Math.min(Number.parseInt(req.nextUrl.searchParams.get("maxTopics") || "12", 10), 20);
    const maxDepth = Math.min(Number.parseInt(req.nextUrl.searchParams.get("maxDepth") || "3", 10), 4);

    return NextResponse.json(await generateMindMap(userId, { maxTopics, maxDepth }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
