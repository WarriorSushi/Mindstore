import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from "@/server/api-rate-limit";
import { requireUserId } from "@/server/api-validation";
import {
  deleteVoiceRecording,
  ensureVoiceToMemoryInstalled,
  getVoiceProviderStatus,
  getVoiceRecordingStats,
  listVoiceRecordings,
  saveVoiceRecordingAsMemory,
  transcribeVoiceRecording,
  updateVoiceRecordingTitle,
} from "@/server/plugins/ports/voice-to-memory";

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureVoiceToMemoryInstalled();
    const action = req.nextUrl.searchParams.get("action") || "recordings";

    if (action === "recordings") {
      const limit = Number.parseInt(req.nextUrl.searchParams.get("limit") || "20", 10);
      const offset = Number.parseInt(req.nextUrl.searchParams.get("offset") || "0", 10);
      return NextResponse.json(await listVoiceRecordings(userId, { limit, offset }));
    }

    if (action === "stats") {
      return NextResponse.json(await getVoiceRecordingStats(userId));
    }

    if (action === "check") {
      return NextResponse.json(await getVoiceProviderStatus());
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    return handleVoiceError(error);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-voice-to-memory', RATE_LIMITS.ai);
  if (limited) return limited;

  try {
    await ensureVoiceToMemoryInstalled();
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data") || contentType.startsWith("audio/")) {
      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        const audioFile = formData.get("audio");
        if (!(audioFile instanceof File)) {
          return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
        }

        const languageValue = formData.get("language");
        const titleValue = formData.get("title");

        return NextResponse.json(await transcribeVoiceRecording({
          userId,
          audioBuffer: Buffer.from(await audioFile.arrayBuffer()),
          language: typeof languageValue === "string" && languageValue ? languageValue : undefined,
          title: typeof titleValue === "string" && titleValue ? titleValue : undefined,
          mimeType: audioFile.type || "audio/webm",
        }));
      }

      return NextResponse.json(await transcribeVoiceRecording({
        userId,
        audioBuffer: Buffer.from(await req.arrayBuffer()),
        language: req.nextUrl.searchParams.get("language") || undefined,
        mimeType: contentType,
      }));
    }

    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "save") {
      if (typeof body.recordingId !== "string") {
        return NextResponse.json({ error: "recordingId required" }, { status: 400 });
      }

      return NextResponse.json(await saveVoiceRecordingAsMemory(
        userId,
        body.recordingId,
        typeof body.title === "string" ? body.title : undefined,
      ));
    }

    if (action === "delete") {
      if (typeof body.recordingId !== "string") {
        return NextResponse.json({ error: "recordingId required" }, { status: 400 });
      }

      return NextResponse.json(await deleteVoiceRecording(userId, body.recordingId));
    }

    if (action === "update") {
      if (typeof body.recordingId !== "string" || typeof body.title !== "string") {
        return NextResponse.json({ error: "recordingId and title required" }, { status: 400 });
      }

      return NextResponse.json(await updateVoiceRecordingTitle(userId, body.recordingId, body.title));
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    return handleVoiceError(error);
  }
}

function handleVoiceError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (
    message.includes("required")
    || message.includes("not found")
    || message.includes("No transcription provider")
    || message.includes("Audio file too large")
    || message.includes("Empty audio file")
  ) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (message.includes("Already saved as memory:")) {
    const [, memoryId] = message.split(":");
    return NextResponse.json({
      error: "Already saved as memory",
      memoryId: memoryId || null,
    }, { status: 409 });
  }

  if (message.includes("No speech detected")) {
    return NextResponse.json({ error: message }, { status: 422 });
  }

  return NextResponse.json({ error: message }, { status: 500 });
}
