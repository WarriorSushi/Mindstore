import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createApiKey, listApiKeys, revokeApiKey } from "@/server/api-keys";
import { applyRateLimit, RATE_LIMITS } from "@/server/api-rate-limit";
import { parseJsonBody, requireUserId } from "@/server/api-validation";

export async function GET() {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    const keys = await listApiKeys(userId);
    return NextResponse.json({ keys });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const CreateKeySchema = z.object({
  name: z.string().trim().min(3).max(64).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  // API key creation is sensitive — rate-limit aggressively.
  const limited = applyRateLimit(req, "api-keys-create", RATE_LIMITS.write);
  if (limited) return limited;

  const body = await parseJsonBody(req, CreateKeySchema);
  if (body instanceof NextResponse) return body;

  try {
    const name = body.name || "MindStore Everywhere";
    const apiKey = await createApiKey(userId, name);
    return NextResponse.json(apiKey);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, "api-keys-revoke", RATE_LIMITS.write);
  if (limited) return limited;

  try {
    const id = new URL(req.url).searchParams.get("id");

    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Missing or invalid api key id." }, { status: 400 });
    }

    await revokeApiKey(userId, id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
