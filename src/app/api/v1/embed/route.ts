import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateEmbeddings, getEmbeddingConfig } from '@/server/embeddings';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { parseJsonBody, requireUserId } from '@/server/api-validation';

const EmbedSchema = z.object({
  texts: z.array(z.string().max(8000, 'each text must be <= 8000 chars')).min(1).max(50),
});

/**
 * POST /api/v1/embed — generate embeddings server-side
 * Uses whatever provider is configured (OpenAI, Gemini, or Ollama)
 * Body: { texts: string[] (1..50, each <= 8000 chars) }
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const limited = applyRateLimit(req, 'embed', RATE_LIMITS.standard);
  if (limited) return limited;

  const parsed = await parseJsonBody(req, EmbedSchema);
  if (parsed instanceof NextResponse) return parsed;

  try {
    const config = await getEmbeddingConfig();
    if (!config) {
      return NextResponse.json({ error: 'No embedding provider configured. Add an API key in Settings.' }, { status: 400 });
    }

    const embeddings = await generateEmbeddings(parsed.texts);
    return NextResponse.json({ embeddings, provider: config.provider });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
