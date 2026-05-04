import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { sql } from 'drizzle-orm';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { parseJsonBody, requireUserId } from '@/server/api-validation';

interface SettingRow {
  key: string;
  value: string;
}

/**
 * GET /api/v1/onboarding — get onboarding wizard state
 *
 * Returns:
 *  - completed: whether the wizard was finished or skipped
 *  - currentStep: last completed step index (0-4)
 *  - userName: stored name, if any
 *  - hasAiProvider: whether an AI provider is configured
 *  - hasMemories: whether user has imported data
 *  - memoryCount: number of memories
 */
export async function GET() {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await db.execute(
      sql`SELECT key, value FROM settings WHERE key IN (
        'onboarding_completed',
        'onboarding_step',
        'user_name',
        'ai_provider_choice',
        'openai_api_key', 'gemini_api_key', 'ollama_url',
        'openrouter_api_key', 'custom_api_key'
      )`
    ) as unknown as SettingRow[];

    const config: Record<string, string> = {};
    for (const row of rows) {
      config[row.key] = row.value;
    }

    const hasAiProvider = !!(
      config.openai_api_key || config.gemini_api_key || config.ollama_url ||
      config.openrouter_api_key || config.custom_api_key ||
      process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY ||
      process.env.OLLAMA_URL || process.env.OPENROUTER_API_KEY
    );

    // Count memories
    let memoryCount = 0;
    try {
      const countRes = await db.execute(
        sql`SELECT COUNT(*)::int as count FROM memories`
      );
      memoryCount = (countRes as unknown as { count: number }[])[0]?.count || 0;
    } catch {
      // Table may not exist yet
    }

    return NextResponse.json({
      completed: config.onboarding_completed === 'true',
      currentStep: parseInt(config.onboarding_step || '0', 10),
      userName: config.user_name || null,
      aiProviderChoice: config.ai_provider_choice || null,
      hasAiProvider,
      hasMemories: memoryCount > 0,
      memoryCount,
    });
  } catch (error: unknown) {
    console.error('[onboarding GET]', error);
    return NextResponse.json({
      completed: false,
      currentStep: 0,
      userName: null,
      aiProviderChoice: null,
      hasAiProvider: false,
      hasMemories: false,
      memoryCount: 0,
    });
  }
}

const OnboardingPostSchema = z.object({
  step: z.number().int().min(0).max(20).optional(),
  completed: z.boolean().optional(),
  userName: z.string().max(200).optional(),
  aiProviderChoice: z.enum(['openai', 'gemini', 'ollama', 'openrouter', 'custom', 'none']).optional(),
});

/**
 * POST /api/v1/onboarding — update onboarding state
 *
 * Body shape validated by OnboardingPostSchema.
 *
 * Note: settings is currently a global table (ARCH-1). Auth is required
 * here per the project's hard rule (no mutation without auth) but the
 * actual per-user scoping lands when ARCH-1 is resolved.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const limited = applyRateLimit(req, 'onboarding', RATE_LIMITS.write);
  if (limited) return limited;

  const body = await parseJsonBody(req, OnboardingPostSchema);
  if (body instanceof NextResponse) return body;

  try {
    if (body.step !== undefined) {
      await upsertSetting('onboarding_step', String(body.step));
    }

    if (body.completed !== undefined) {
      await upsertSetting('onboarding_completed', String(body.completed));
    }

    if (body.userName !== undefined) {
      await upsertSetting('user_name', body.userName.trim());
    }

    if (body.aiProviderChoice !== undefined) {
      await upsertSetting('ai_provider_choice', body.aiProviderChoice);
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function upsertSetting(key: string, value: string) {
  await db.execute(sql`
    INSERT INTO settings (key, value, updated_at) VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
  `);
}
