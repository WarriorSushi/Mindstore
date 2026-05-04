import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import {
  AIClientError,
  type AIMessage,
  getStreamingTextGenerationConfig,
  streamTextGeneration,
} from '@/server/ai-client';
import { recordUsage } from '@/server/billing/usage';

interface ChatRequestBody {
  messages?: Array<Partial<AIMessage>>;
  model?: string;
}

/**
 * POST /api/v1/chat — streaming chat proxy
 *
 * Uses the shared AI client so chat and plugins resolve providers/models the same way.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'chat', RATE_LIMITS.ai);
  if (limited) return limited;

  try {
    const { messages, model } = await req.json() as ChatRequestBody;
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 });
    }
    if (messages.length > 100) {
      return NextResponse.json({ error: 'Too many messages (max 100)' }, { status: 400 });
    }

    const normalizedMessages: AIMessage[] = [];
    for (const message of messages) {
      if (!message.role || !message.content || typeof message.content !== 'string') {
        return NextResponse.json({ error: 'Each message needs role and string content' }, { status: 400 });
      }
      if (!['system', 'user', 'assistant'].includes(message.role)) {
        return NextResponse.json({ error: `Unsupported role: ${message.role}` }, { status: 400 });
      }
      if (message.content.length > 100_000) {
        return NextResponse.json({ error: 'Message content too long (max 100K chars)' }, { status: 400 });
      }

      normalizedMessages.push({
        role: message.role as AIMessage['role'],
        content: message.content,
      });
    }

    const config = await getStreamingTextGenerationConfig(model, userId);
    if (!config) {
      return NextResponse.json(
        { error: 'No AI provider configured. Add an API key in Settings, or upgrade to a paid tier for bundled AI.' },
        { status: 400 },
      );
    }

    // Best-effort usage tracking for bundled-AI mode. We estimate input
    // tokens at request time (~4 chars/token) and increment a per-month
    // counter; the precise gateway-reported token count would need a
    // streaming wrapper that we'll add in a follow-up. For quota
    // enforcement, this estimate is well within tolerance.
    if (config.providerLabel === 'bundled' && config.bundledUserId) {
      const inputChars = normalizedMessages.reduce((sum, m) => sum + m.content.length, 0);
      const estTokensIn = Math.max(1, Math.round(inputChars / 4));
      await recordUsage({
        userId: config.bundledUserId,
        kind: 'tokens-in',
        provider: 'gateway',
        amount: estTokensIn,
      });
      await recordUsage({
        userId: config.bundledUserId,
        kind: 'requests',
        provider: 'gateway',
        amount: 1,
      });
    }

    return await streamTextGeneration(config, {
      messages: normalizedMessages,
      temperature: 0.7,
    });
  } catch (error: unknown) {
    if (error instanceof AIClientError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
