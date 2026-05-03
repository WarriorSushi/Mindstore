import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/server/user";
import {
  ensureWritingStyleInstalled,
  getWritingStyleProfile,
  getWritingStyleResults,
  runWritingStyleAnalysis,
} from "@/server/plugins/ports/writing-analyzer";

export async function GET(req: NextRequest) {
  try {
    await ensureWritingStyleInstalled();
    const userId = await getUserId();
    const action = req.nextUrl.searchParams.get("action") || "results";

    if (action === "results") {
      return NextResponse.json(await getWritingStyleResults(userId));
    }

    if (action === "analyze") {
      return NextResponse.json(await runWritingStyleAnalysis(userId));
    }

    if (action === "profile") {
      return NextResponse.json(await getWritingStyleProfile(userId));
    }

    return NextResponse.json(
      { error: "Unknown action. Use: results, analyze, profile" },
      { status: 400 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
