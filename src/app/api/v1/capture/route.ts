import { NextRequest, NextResponse } from "next/server";
import type { CapturePayload } from "@mindstore/plugin-sdk";
import { importDocuments } from "@/server/import-service";
import { normalizeCaptureBatch } from "@/server/capture";
import { getInstalledPluginMap } from "@/server/plugins/state";
import { applyDocumentHookTransforms } from "@/server/plugins/ingestion";
import { applyRateLimit, RATE_LIMITS } from "@/server/api-rate-limit";
import { requireUserId } from "@/server/api-validation";

const MAX_CAPTURES_PER_REQUEST = 100;

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, "capture", RATE_LIMITS.write);
  if (limited) return limited;

  try {
    const body = await req.json();
    const captures = extractCapturePayloads(body);
    if (captures.length > MAX_CAPTURES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Too many captures in one request (${captures.length}). Max ${MAX_CAPTURES_PER_REQUEST}.` },
        { status: 413 },
      );
    }
    const documents = normalizeCaptureBatch(captures);
    const installedPlugins = await getInstalledPluginMap();

    const transformed = await applyDocumentHookTransforms({
      hookName: "onCapture",
      installedPlugins,
      userId,
      documents,
      event: {
        surface: "api:v1:capture",
        captures,
      },
      metadata: {
        source: "browser-extension",
      },
    });

    const imported = await importDocuments({ userId, documents: transformed.documents });

    return NextResponse.json({
      imported,
      captures: transformed.documents.map((document) => ({
        title: document.title,
        sourceType: document.sourceType,
        captureMode: document.metadata?.["captureMode"] ?? null,
        sourceApp: document.metadata?.["sourceApp"] ?? null,
        url: typeof document.sourceId === "string" ? document.sourceId : null,
      })),
      hooksTriggered: transformed.hooksTriggered,
      transformsApplied: transformed.transformsApplied,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Capture failed";
    const status = message === "No capture content was provided" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function extractCapturePayloads(body: unknown): CapturePayload[] {
  if (Array.isArray(body)) {
    return body as CapturePayload[];
  }

  if (isRecord(body) && isRecord(body.capture)) {
    return [body.capture as CapturePayload];
  }

  if (isRecord(body) && Array.isArray(body.captures)) {
    return body.captures as CapturePayload[];
  }

  if (isRecord(body)) {
    return [body as CapturePayload];
  }

  throw new Error("Invalid capture payload");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
