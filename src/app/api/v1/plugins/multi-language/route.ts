/**
 * Multi-Language Support Plugin — Route (thin wrapper)
 *
 * GET  ?action=stats|check|detect|translate|search
 * POST ?action=tag|batch-tag|translate|save-config
 *
 * Logic delegated to src/server/plugins/ports/multi-language.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { getTextGenerationConfig, callTextPrompt } from '@/server/ai-client';
import {
  LANGUAGES,
  detectLanguage,
  aiDetectLanguage,
  translate,
  getLanguageStats,
  tagMemoryLanguage,
  batchTagLanguages,
  crossLanguageSearch,
  translateMemory,
  saveLanguageConfig,
  type CallAI,
} from '@/server/plugins/ports/multi-language';

// ─── AI Provider ─────────────────────────────────────────────

async function makeCallAI(): Promise<CallAI | null> {
  const config = await getTextGenerationConfig();
  if (!config) return null;
  return async (prompt, systemPrompt) => {
    const result = await callTextPrompt(config, prompt, systemPrompt, { temperature: 0.1, maxTokens: 2000 });
    return result || '';
  };
}

// ─── GET Handler ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'stats';

    if (action === 'stats') {
      return NextResponse.json(await getLanguageStats(userId));
    }

    if (action === 'check') {
      const ai = await getTextGenerationConfig();
      return NextResponse.json({
        aiAvailable: !!ai, provider: ai?.providerLabel || null,
        supportedLanguages: Object.keys(LANGUAGES).length,
        features: { detection: !!ai, translation: !!ai, crossLanguageSearch: !!ai, heuristicDetection: true },
      });
    }

    if (action === 'detect') {
      const text = searchParams.get('text');
      if (!text) return NextResponse.json({ error: 'Missing text parameter' }, { status: 400 });
      const callAI = await makeCallAI();
      const { language, method } = await detectLanguage(text, callAI);
      return NextResponse.json({ language, method });
    }

    if (action === 'translate') {
      const text = searchParams.get('text'), from = searchParams.get('from') || 'auto', to = searchParams.get('to') || 'en';
      if (!text) return NextResponse.json({ error: 'Missing text parameter' }, { status: 400 });
      const callAI = await makeCallAI();
      if (!callAI) return NextResponse.json({ error: 'No AI provider configured' }, { status: 400 });
      let fromLang = from;
      if (from === 'auto') {
        try { fromLang = (await aiDetectLanguage(text, callAI)).code; } catch { fromLang = 'unknown'; }
      }
      if (fromLang === to) return NextResponse.json({ translation: text, from: fromLang, to, note: 'Same language' });
      const translation = await translate(text, fromLang, to, callAI);
      return NextResponse.json({ translation, from: fromLang, to });
    }

    if (action === 'search') {
      const query = searchParams.get('q'), limit = parseInt(searchParams.get('limit') || '10');
      if (!query) return NextResponse.json({ error: 'Missing query parameter ?q=' }, { status: 400 });
      const callAI = await makeCallAI();
      if (!callAI) return NextResponse.json({ error: 'No AI provider for cross-language search' }, { status: 400 });
      return NextResponse.json(await crossLanguageSearch(query, userId, limit, callAI));
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    console.error('[multi-language GET]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal error' }, { status: 500 });
  }
}

// ─── POST Handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-multi-language', RATE_LIMITS.ai);
  if (limited) return limited;

  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'tag';
    const callAI = await makeCallAI();

    if (action === 'tag') {
      const { memoryId } = await req.json();
      if (!memoryId) return NextResponse.json({ error: 'Missing memoryId' }, { status: 400 });
      const result = await tagMemoryLanguage(memoryId, userId, callAI);
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json(result);
    }

    if (action === 'batch-tag') {
      const body = await req.json().catch(() => ({}));
      const batchSize = body.batchSize || 50;
      return NextResponse.json(await batchTagLanguages(userId, batchSize, callAI));
    }

    if (action === 'translate') {
      const { memoryId, targetLang = 'en' } = await req.json();
      if (!memoryId) return NextResponse.json({ error: 'Missing memoryId' }, { status: 400 });
      if (!callAI) return NextResponse.json({ error: 'No AI provider configured' }, { status: 400 });
      const result = await translateMemory(memoryId, userId, targetLang, callAI);
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json(result);
    }

    if (action === 'save-config') {
      const { autoDetect = true, preferredLanguage = 'en', crossLanguageSearch: cls = true } = await req.json();
      const saved = await saveLanguageConfig(userId, { autoDetect, preferredLanguage, crossLanguageSearch: cls });
      return NextResponse.json({ saved: true, config: saved });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    console.error('[multi-language POST]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal error' }, { status: 500 });
  }
}
