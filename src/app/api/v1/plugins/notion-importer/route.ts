import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import {
  buildNotionImportStats,
  ensureNotionImporterReady,
  importNotionPages,
  parseNotionExport,
  stripCommonRoot,
} from "@/server/plugins/ports/notion-importer";

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-notion-importer', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    await ensureNotionImporterReady();

    const formData = await req.formData();
    const file = formData.get("file");
    const action = typeof formData.get("action") === "string" ? String(formData.get("action")) : "import";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json({
        error: "Please upload a Notion export ZIP containing markdown and CSV files.",
      }, { status: 400 });
    }

    const zip = await JSZip.loadAsync(Buffer.from(await file.arrayBuffer()));
    const rawPaths = Object.keys(zip.files).filter((path) => !zip.files[path].dir && !path.startsWith("__MACOSX/") && !path.startsWith("."));
    const { stripped } = stripCommonRoot(rawPaths);
    const files = new Map<string, string>();

    for (let index = 0; index < rawPaths.length; index += 1) {
      const originalPath = rawPaths[index];
      const strippedPath = stripped[index];
      if (!strippedPath) continue;
      files.set(strippedPath, await zip.files[originalPath].async("text"));
    }

    const { pages, databases } = parseNotionExport(files);
    if (pages.length === 0 && databases.length === 0) {
      return NextResponse.json({
        error: "No Notion markdown pages or CSV databases were found in the ZIP.",
      }, { status: 400 });
    }

    if (action === "preview") {
      return NextResponse.json({
        success: true,
        stats: buildNotionImportStats(pages, databases),
      });
    }

    const result = await importNotionPages({ userId, pages });

    return NextResponse.json({
      success: true,
      ...result,
      databases: databases.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to import Notion export";
    const status = message.includes("plugin is disabled") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
