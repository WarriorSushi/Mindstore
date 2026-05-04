import { NextRequest, NextResponse } from "next/server";
import {
  addResumeSection,
  deleteResume,
  ensureResumeBuilderInstalled,
  generateResume,
  getResume,
  listResumes,
  refineResumeSection,
  reorderResumeSections,
  RESUME_TEMPLATES,
  updateResume,
} from "@/server/plugins/ports/resume-builder";
import { applyRateLimit, RATE_LIMITS } from "@/server/api-rate-limit";
import { requireUserId } from "@/server/api-validation";

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureResumeBuilderInstalled();
    const action = req.nextUrl.searchParams.get("action") || "list";

    if (action === "list") {
      return NextResponse.json({ resumes: await listResumes() });
    }

    if (action === "get") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }
      const resume = await getResume(id);
      if (!resume) {
        return NextResponse.json({ error: "Resume not found" }, { status: 404 });
      }
      return NextResponse.json({ resume });
    }

    if (action === "templates") {
      return NextResponse.json({ templates: RESUME_TEMPLATES });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    return handleResumeError(error);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-resume-builder', RATE_LIMITS.ai);
  if (limited) return limited;

  try {
    await ensureResumeBuilderInstalled();
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";
    const body = await req.json().catch(() => ({}));

    if (action === "generate") {
      return NextResponse.json({
        resume: await generateResume(userId, {
          targetRole: String(body.targetRole || ""),
          template: typeof body.template === "string" ? body.template : undefined,
          additionalContext: typeof body.additionalContext === "string" ? body.additionalContext : undefined,
        }),
      });
    }

    if (action === "update") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ error: "Missing resume id" }, { status: 400 });
      }
      return NextResponse.json({
        resume: await updateResume({
          id: body.id,
          sectionId: typeof body.sectionId === "string" ? body.sectionId : undefined,
          content: typeof body.content === "string" ? body.content : undefined,
          title: typeof body.title === "string" ? body.title : undefined,
          visible: typeof body.visible === "boolean" ? body.visible : undefined,
          resumeTitle: typeof body.resumeTitle === "string" ? body.resumeTitle : undefined,
          targetRole: typeof body.targetRole === "string" ? body.targetRole : undefined,
        }),
      });
    }

    if (action === "refine") {
      if (typeof body.id !== "string" || typeof body.sectionId !== "string") {
        return NextResponse.json({ error: "Missing id or sectionId" }, { status: 400 });
      }
      return NextResponse.json({
        section: {
          id: body.sectionId,
          content: await refineResumeSection({
            id: body.id,
            sectionId: body.sectionId,
            instruction: typeof body.instruction === "string" ? body.instruction : undefined,
          }),
        },
      });
    }

    if (action === "add-section") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ error: "Missing resume id" }, { status: 400 });
      }
      return NextResponse.json(await addResumeSection({
        id: body.id,
        title: typeof body.title === "string" ? body.title : undefined,
        type: typeof body.type === "string" ? body.type as never : undefined,
      }));
    }

    if (action === "reorder") {
      if (typeof body.id !== "string" || !Array.isArray(body.sectionIds)) {
        return NextResponse.json({ error: "Missing id or sectionIds" }, { status: 400 });
      }
      return NextResponse.json({
        resume: await reorderResumeSections({
          id: body.id,
          sectionIds: body.sectionIds.map(String),
        }),
      });
    }

    if (action === "delete") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }
      return NextResponse.json(await deleteResume(body.id));
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    return handleResumeError(error);
  }
}

function handleResumeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.includes("not found") || message.includes("Missing") || message.includes("No AI provider") || message.includes("Maximum") ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

