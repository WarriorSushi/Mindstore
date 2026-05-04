import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from "@/server/api-rate-limit";
import { requireUserId } from "@/server/api-validation";
import {
  deleteNewsletter,
  ensureNewsletterWriterInstalled,
  generateNewsletter,
  getNewsletter,
  listNewsletters,
  refineNewsletterSection,
  suggestNewsletters,
  updateNewsletter,
} from "@/server/plugins/ports/newsletter-writer";

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureNewsletterWriterInstalled();
    const action = req.nextUrl.searchParams.get("action") || "newsletters";

    if (action === "newsletters") {
      return NextResponse.json({ newsletters: await listNewsletters() });
    }

    if (action === "newsletter") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }
      const newsletter = await getNewsletter(id);
      if (!newsletter) {
        return NextResponse.json({ error: "Newsletter not found" }, { status: 404 });
      }
      return NextResponse.json({ newsletter });
    }

    if (action === "suggest") {
      const days = Number.parseInt(req.nextUrl.searchParams.get("days") || "7", 10);
      return NextResponse.json(await suggestNewsletters(userId, Number.isNaN(days) ? 7 : days));
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    return handleNewsletterError(error);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-newsletter-writer', RATE_LIMITS.ai);
  if (limited) return limited;

  try {
    await ensureNewsletterWriterInstalled();
    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "generate") {
      return NextResponse.json({
        newsletter: await generateNewsletter(userId, {
          title: typeof body.title === "string" ? body.title : undefined,
          subject: typeof body.subject === "string" ? body.subject : undefined,
          periodDays: typeof body.periodDays === "number" ? body.periodDays : undefined,
          tone: typeof body.tone === "string" ? body.tone : undefined,
          focusTopics: Array.isArray(body.focusTopics) ? body.focusTopics.map(String) : undefined,
          customPrompt: typeof body.customPrompt === "string" ? body.customPrompt : undefined,
        }),
      });
    }

    if (action === "update") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ error: "Missing newsletter id" }, { status: 400 });
      }
      return NextResponse.json({
        newsletter: await updateNewsletter({
          id: body.id,
          title: typeof body.title === "string" ? body.title : undefined,
          subject: typeof body.subject === "string" ? body.subject : undefined,
          sectionId: typeof body.sectionId === "string" ? body.sectionId : undefined,
          content: typeof body.content === "string" ? body.content : undefined,
          status: body.status === "draft" || body.status === "polishing" || body.status === "ready" ? body.status : undefined,
        }),
      });
    }

    if (action === "refine") {
      if (typeof body.id !== "string" || typeof body.sectionId !== "string" || typeof body.instruction !== "string") {
        return NextResponse.json({ error: "Missing id, sectionId, or instruction" }, { status: 400 });
      }
      return NextResponse.json({
        refined: await refineNewsletterSection({
          id: body.id,
          sectionId: body.sectionId,
          instruction: body.instruction,
        }),
        sectionId: body.sectionId,
      });
    }

    if (action === "delete") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }
      return NextResponse.json(await deleteNewsletter(body.id));
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    return handleNewsletterError(error);
  }
}

function handleNewsletterError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.includes("not found") || message.includes("required") || message.includes("No AI provider") ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

