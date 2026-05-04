/**
 * Obsidian Importer Plugin — Route (thin wrapper)
 *
 * POST multipart: file + optional action=preview
 *
 * Logic delegated to src/server/plugins/ports/obsidian-importer.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import {
  analyzeVault,
  buildObsidianPreview,
  ensureObsidianImporterReady,
  extractNotesFromZip,
  importVault,
} from "@/server/plugins/ports/obsidian-importer";

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-obsidian-importer', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    await ensureObsidianImporterReady();

    const formData = await req.formData();
    const file = formData.get("file");
    const action = typeof formData.get("action") === "string" ? String(formData.get("action")) : "import";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No vault file uploaded" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json({
        error: "Please upload a ZIP of your Obsidian vault. Right-click your vault folder and compress it first.",
      }, { status: 400 });
    }

    let notes;
    try {
      notes = await extractNotesFromZip(file);
    } catch {
      return NextResponse.json({
        error: "Failed to parse ZIP file. Make sure it's a valid ZIP containing .md files.",
      }, { status: 400 });
    }

    if (notes.length === 0) {
      return NextResponse.json({
        error: "No markdown notes found in the ZIP. Make sure you zipped your vault folder containing .md files.",
      }, { status: 404 });
    }

    const vault = analyzeVault(notes);

    if (action === "preview") {
      return NextResponse.json(buildObsidianPreview(vault));
    }

    const result = await importVault(userId, vault);
    return NextResponse.json({ imported: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("plugin is disabled") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
