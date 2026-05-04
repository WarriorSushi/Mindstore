import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { importYouTubeTranscript, previewYouTubeTranscript } from "@/server/plugins/ports/youtube-importer";

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-youtube-transcript', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    const { url, action } = await req.json() as { url?: string; action?: "preview" | "import" };

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "No YouTube URL provided" }, { status: 400 });
    }

    if (action === "preview") {
      return NextResponse.json(await previewYouTubeTranscript(url));
    }

    return NextResponse.json(await importYouTubeTranscript({ userId, url }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message.includes("No YouTube URL")
      || message.includes("Invalid YouTube URL")
      || message.includes("No transcript")
      || message.includes("No transcripts")
      || message.includes("disabled for this video")
        ? 400
        : message.includes("plugin is disabled")
          ? 403
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
