import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from "@/server/api-rate-limit";
import { requireUserId } from "@/server/api-validation";
import {
  answerBriefingFollowUp,
  deleteBriefing,
  ensureConversationPrepInstalled,
  getBriefing,
  listBriefings,
  prepareBriefing,
} from "@/server/plugins/ports/conversation-prep";

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureConversationPrepInstalled();
    const action = req.nextUrl.searchParams.get("action") || "history";

    if (action === "history") {
      return NextResponse.json({ briefings: await listBriefings() });
    }

    if (action === "briefing") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }
      const briefing = await getBriefing(id);
      if (!briefing) {
        return NextResponse.json({ error: "Briefing not found" }, { status: 404 });
      }
      return NextResponse.json({ briefing });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    return handleConversationError(error);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-conversation-prep', RATE_LIMITS.ai);
  if (limited) return limited;

  try {
    await ensureConversationPrepInstalled();
    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "prepare") {
      return NextResponse.json({
        briefing: await prepareBriefing(userId, {
          subject: String(body.subject || ""),
          type: body.type === "person" || body.type === "topic" || body.type === "company" || body.type === "project" ? body.type : undefined,
          context: typeof body.context === "string" ? body.context : undefined,
        }),
      });
    }

    if (action === "follow-up") {
      if (typeof body.id !== "string" || typeof body.question !== "string") {
        return NextResponse.json({ error: "Missing briefing id or question" }, { status: 400 });
      }
      return NextResponse.json({
        answer: await answerBriefingFollowUp(userId, {
          id: body.id,
          question: body.question,
        }),
      });
    }

    if (action === "delete") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }
      return NextResponse.json(await deleteBriefing(body.id));
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    return handleConversationError(error);
  }
}

function handleConversationError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.includes("not found") || message.includes("required") || message.includes("No AI provider") ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

