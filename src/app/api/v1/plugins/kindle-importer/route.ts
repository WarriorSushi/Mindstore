import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import {
  ensureKindleImporterInstalled,
  getKindleImporterConfig,
  importKindleClippings,
  previewKindleImport,
} from "@/server/plugins/ports/kindle-importer";

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-kindle-importer', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    await ensureKindleImporterInstalled();
    const { shouldDedup } = await getKindleImporterConfig();

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    const action = typeof formData.get("action") === "string" ? String(formData.get("action")) : "";

    if (action === "preview") {
      return NextResponse.json(previewKindleImport(text, { dedup: shouldDedup }));
    }

    return NextResponse.json(await importKindleClippings({
      userId,
      text,
      dedup: shouldDedup,
    }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("disabled")
      ? 403
      : message.includes("No file provided") || message.includes("doesn't look like") || message.includes("No highlights")
        ? 400
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
