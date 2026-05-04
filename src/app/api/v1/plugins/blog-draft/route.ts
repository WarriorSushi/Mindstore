import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from "@/server/api-rate-limit";
import { requireUserId } from "@/server/api-validation";
import {
  deleteBlogDraft,
  ensureBlogDraftInstalled,
  exportBlogDraft,
  generateBlogDraft,
  getBlogDraft,
  listBlogDrafts,
  refineBlogDraft,
  saveBlogDraft,
  suggestBlogTopics,
} from "@/server/plugins/ports/blog-draft";

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureBlogDraftInstalled();
    const action = req.nextUrl.searchParams.get("action") || "drafts";

    if (action === "drafts") {
      return NextResponse.json({ drafts: await listBlogDrafts() });
    }

    if (action === "draft") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }
      const draft = await getBlogDraft(id);
      if (!draft) {
        return NextResponse.json({ error: "Draft not found" }, { status: 404 });
      }
      return NextResponse.json({ draft });
    }

    if (action === "topics") {
      return NextResponse.json({ topics: await suggestBlogTopics(userId) });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    return handleActionError(error);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-blog-draft', RATE_LIMITS.ai);
  if (limited) return limited;

  try {
    await ensureBlogDraftInstalled();
    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "generate") {
      return NextResponse.json({
        draft: await generateBlogDraft(userId, {
          topic: String(body.topic || ""),
          style: typeof body.style === "string" ? body.style : undefined,
          tone: typeof body.tone === "string" ? body.tone : undefined,
          targetLength: typeof body.targetLength === "number" ? body.targetLength : undefined,
        }),
      });
    }

    if (action === "save") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ error: "Missing draft id" }, { status: 400 });
      }
      return NextResponse.json({
        draft: await saveBlogDraft({
          id: body.id,
          content: typeof body.content === "string" ? body.content : undefined,
          title: typeof body.title === "string" ? body.title : undefined,
          status: body.status === "draft" || body.status === "refining" || body.status === "ready" ? body.status : undefined,
        }),
      });
    }

    if (action === "refine") {
      if (typeof body.id !== "string" || typeof body.instruction !== "string") {
        return NextResponse.json({ error: "Missing id or instruction" }, { status: 400 });
      }
      return NextResponse.json({
        refined: await refineBlogDraft({
          id: body.id,
          instruction: body.instruction,
          selection: typeof body.selection === "string" ? body.selection : undefined,
        }),
      });
    }

    if (action === "delete") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }
      return NextResponse.json(await deleteBlogDraft(body.id));
    }

    if (action === "export") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }
      return NextResponse.json(await exportBlogDraft(body.id, body.format === "html" ? "html" : "markdown"));
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    return handleActionError(error);
  }
}

function handleActionError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.includes("not found") || message.includes("required") || message.includes("No AI provider") ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

