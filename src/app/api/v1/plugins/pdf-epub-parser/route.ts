import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import {
  parseDocument,
  previewParsedDocument,
  smartChunkDocument,
  importParsedDocument,
  ensurePdfEpubParserReady,
} from "@/server/plugins/ports/pdf-epub-parser";

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-pdf-epub-parser', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    await ensurePdfEpubParserReady();

    const formData = await req.formData();
    const file = formData.get("file");
    const action = typeof formData.get("action") === "string" ? String(formData.get("action")) : "import";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name || "document";
    const ext = path.extname(fileName).toLowerCase();
    if (![".pdf", ".epub"].includes(ext)) {
      return NextResponse.json({
        error: `Unsupported file type: ${ext}. Upload a PDF or EPUB file.`,
      }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum size is 50MB." }, { status: 400 });
    }

    const document = await parseDocument(buffer, fileName, ext);
    if (document.sections.length === 0) {
      return NextResponse.json({
        error: "No readable text found in the document. It may be a scanned PDF (image-only).",
      }, { status: 400 });
    }

    if (action === "preview") {
      return NextResponse.json(previewParsedDocument(document, smartChunkDocument(document)));
    }

    return NextResponse.json(await importParsedDocument({ userId, document }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message.includes("Unsupported file type")
      || message.includes("File too large")
      || message.includes("No readable text")
        ? 400
        : message.includes("plugin is disabled")
          ? 403
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
