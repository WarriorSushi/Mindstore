/**
 * Image-to-Memory Plugin — Route (thin wrapper)
 *
 * GET  ?action=images|stats|check
 * POST multipart (analyze) | JSON action=save|reanalyze|delete|update
 *
 * Logic delegated to src/server/plugins/ports/image-to-memory.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from "@/server/api-rate-limit";
import { requireUserId } from "@/server/api-validation";
import { generateEmbeddings } from "@/server/embeddings";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  buildAnalysisPrompt,
  generateTitleFromDescription,
  getVisionConfig,
  analyzeImage,
  ensureInstalled,
  listImages,
  getImageStats,
  storeAnalysis,
  saveImageAsMemory,
  reanalyzeImage,
  deleteImage,
  updateImageTitle,
  type ContextType,
} from "@/server/plugins/ports/image-to-memory";

// ─── GET Handler ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureInstalled();
    const action = req.nextUrl.searchParams.get("action") || "images";

    if (action === "images") {
      const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");
      const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0");
      return NextResponse.json(await listImages(userId, limit, offset));
    }

    if (action === "stats") {
      return NextResponse.json(await getImageStats(userId));
    }

    if (action === "check") {
      const config = await getVisionConfig();
      return NextResponse.json({ available: !!config, provider: config?.type || null, model: config?.model || null });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
}

// ─── POST Handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-image-to-memory', RATE_LIMITS.ai);
  if (limited) return limited;

  try {
    await ensureInstalled();
    const contentType = req.headers.get("content-type") || "";

    // ─── Analyze: multipart upload ─────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("image") as File | null;
      const contextType = ((formData.get("context") as string) || "general") as ContextType;
      const customPrompt = formData.get("prompt") as string | null;
      if (!file) return NextResponse.json({ error: "No image file provided" }, { status: 400 });
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return NextResponse.json({ error: `Unsupported image type: ${file.type}` }, { status: 400 });
      if (file.size > MAX_IMAGE_SIZE) return NextResponse.json({ error: "Image too large. Maximum 20MB." }, { status: 400 });

      const config = await getVisionConfig();
      if (!config) return NextResponse.json({ error: "No Vision AI provider available. Configure in Settings." }, { status: 400 });

      const base64Image = Buffer.from(await file.arrayBuffer()).toString("base64");
      const prompt = buildAnalysisPrompt(contextType, customPrompt || undefined);
      const result = await analyzeImage(config, base64Image, file.type, prompt);
      const title = generateTitleFromDescription(result.description);
      const wordCount = result.description.split(/\s+/).filter(Boolean).length;
      const format = file.type.split("/")[1] || "png";

      const id = await storeAnalysis({
        userId, title, description: result.description,
        thumbnailData: base64Image.length > 700000 ? null : `data:${file.type};base64,${base64Image}`,
        fileSize: file.size, format, tags: result.tags, contextType,
        provider: config.type, model: config.model, wordCount, customPrompt,
      });

      return NextResponse.json({ id, title, description: result.description, tags: result.tags, contextType, provider: config.type, model: config.model, wordCount, imageSize: file.size, imageFormat: format });
    }

    // ─── JSON actions ──────────────────────────────────────────
    const body = await req.json();
    const action = body.action;

    if (action === "save") {
      if (!body.imageId) return NextResponse.json({ error: "imageId required" }, { status: 400 });
      const result = await saveImageAsMemory({ userId, imageId: body.imageId, customTitle: body.customTitle, generateEmbeddings });
      if ("error" in result) return NextResponse.json({ error: result.error, ...(result.memoryId ? { memoryId: result.memoryId } : {}) }, { status: result.status });
      return NextResponse.json({ memoryId: result.memoryId, title: result.title, wordCount: result.wordCount, message: "Image analysis saved as memory" });
    }

    if (action === "reanalyze") {
      if (!body.imageId) return NextResponse.json({ error: "imageId required" }, { status: 400 });
      const result = await reanalyzeImage({ userId, imageId: body.imageId, context: body.context, prompt: body.prompt });
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json(result);
    }

    if (action === "delete") {
      if (!body.imageId) return NextResponse.json({ error: "imageId required" }, { status: 400 });
      await deleteImage(body.imageId, userId);
      return NextResponse.json({ deleted: true });
    }

    if (action === "update") {
      if (!body.imageId || !body.title) return NextResponse.json({ error: "imageId and title required" }, { status: 400 });
      await updateImageTitle(body.imageId, userId, body.title);
      return NextResponse.json({ updated: true, title: body.title });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
}
