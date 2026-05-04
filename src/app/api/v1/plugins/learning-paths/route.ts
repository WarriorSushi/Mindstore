import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from "@/server/api-rate-limit";
import { requireUserId } from "@/server/api-validation";
import {
  addLearningPathNote,
  deleteLearningPath,
  ensureLearningPathsInstalled,
  generateLearningPath,
  getLearningPath,
  listLearningPaths,
  suggestLearningTopics,
  updateLearningPathProgress,
} from "@/server/plugins/ports/learning-paths";

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureLearningPathsInstalled();
    const action = req.nextUrl.searchParams.get("action") || "list";

    if (action === "list") {
      return NextResponse.json({ paths: await listLearningPaths() });
    }

    if (action === "get") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }
      const path = await getLearningPath(id);
      if (!path) {
        return NextResponse.json({ error: "Path not found" }, { status: 404 });
      }
      return NextResponse.json({ path });
    }

    if (action === "suggestions") {
      return NextResponse.json({ suggestions: await suggestLearningTopics(userId) });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    return handleLearningError(error);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-learning-paths', RATE_LIMITS.ai);
  if (limited) return limited;

  try {
    await ensureLearningPathsInstalled();
    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "generate") {
      return NextResponse.json({
        path: await generateLearningPath(userId, {
          topic: String(body.topic || ""),
          context: typeof body.context === "string" ? body.context : undefined,
        }),
      });
    }

    if (action === "update-progress") {
      if (typeof body.pathId !== "string" || typeof body.nodeId !== "string") {
        return NextResponse.json({ error: "Missing pathId or nodeId" }, { status: 400 });
      }
      return NextResponse.json({
        path: await updateLearningPathProgress({
          pathId: body.pathId,
          nodeId: body.nodeId,
          completed: body.completed !== false,
        }),
      });
    }

    if (action === "add-note") {
      if (typeof body.pathId !== "string" || typeof body.nodeId !== "string") {
        return NextResponse.json({ error: "Missing pathId or nodeId" }, { status: 400 });
      }
      return NextResponse.json({
        path: await addLearningPathNote({
          pathId: body.pathId,
          nodeId: body.nodeId,
          note: typeof body.note === "string" ? body.note : "",
        }),
      });
    }

    if (action === "delete") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }
      return NextResponse.json(await deleteLearningPath(body.id));
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    return handleLearningError(error);
  }
}

function handleLearningError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.includes("not found") || message.includes("Missing") || message.includes("No AI provider") ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

