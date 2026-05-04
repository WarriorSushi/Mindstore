import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { sql } from 'drizzle-orm';
import { getEmbeddingConfig } from '@/server/embeddings';
import { encrypt, decrypt } from '@/server/encryption';
import {
  PROVIDER_AUTH_ROADMAP,
  PROVIDER_CATALOG,
  RUNTIME_REQUIREMENTS,
} from '@/server/runtime-requirements';
import { getIdentityMode, isGoogleAuthConfigured, isSingleUserModeEnabled } from '@/server/identity';
import { getDatabaseConnectionDiagnostics } from '@/server/postgres-client';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { parseJsonBody, requireUserId } from '@/server/api-validation';

// Note: the `settings` table is currently global (no user_id column) — see
// STATUS.md ARCH-1. Phase 0 only gates the auth boundary; the per-user
// scoping migration is scheduled for Phase 1. Until then ALL authenticated
// users share the same settings rows.

interface SettingRow {
  key: string;
  value: string;
}

/**
 * GET /api/v1/settings — get current settings
 */
export async function GET() {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  try {
    const settings = await db.execute(
      sql`SELECT key, value FROM settings WHERE key IN (
        'openai_api_key', 'gemini_api_key', 'ollama_url',
        'openrouter_api_key', 'custom_api_key', 'custom_api_url', 'custom_api_model',
        'embedding_provider', 'chat_provider', 'chat_model'
      )`
    );

    const config: Record<string, string> = {};
    for (const row of settings as unknown as SettingRow[]) {
      config[row.key] = decryptSettingValue(row.key, row.value);
    }

    const embConfig = await getEmbeddingConfig();

    return NextResponse.json({
      hasApiKey: !!(
        config.openai_api_key || config.gemini_api_key || config.ollama_url ||
        config.openrouter_api_key || (config.custom_api_key && config.custom_api_url) ||
        process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.OLLAMA_URL || process.env.OPENROUTER_API_KEY
      ),
      apiKeyPreview: config.openai_api_key ? `sk-...${config.openai_api_key.slice(-4)}` : null,
      source: config.openai_api_key ? 'database' : (process.env.OPENAI_API_KEY ? 'environment' : null),
      providers: {
        openai: {
          configured: !!(config.openai_api_key || process.env.OPENAI_API_KEY),
          preview: config.openai_api_key ? `sk-...${config.openai_api_key.slice(-4)}` : (process.env.OPENAI_API_KEY ? 'env' : null),
        },
        gemini: {
          configured: !!(config.gemini_api_key || process.env.GEMINI_API_KEY),
          preview: config.gemini_api_key ? `...${config.gemini_api_key.slice(-4)}` : (process.env.GEMINI_API_KEY ? 'env' : null),
        },
        ollama: {
          configured: !!(config.ollama_url || process.env.OLLAMA_URL),
          url: config.ollama_url || process.env.OLLAMA_URL || null,
        },
        openrouter: {
          configured: !!(config.openrouter_api_key || process.env.OPENROUTER_API_KEY),
          preview: config.openrouter_api_key ? `sk-...${config.openrouter_api_key.slice(-4)}` : (process.env.OPENROUTER_API_KEY ? 'env' : null),
        },
        custom: {
          configured: !!(config.custom_api_key && config.custom_api_url),
          url: config.custom_api_url || null,
          model: config.custom_api_model || null,
        },
      },
      embeddingProvider: embConfig?.provider || null,
      chatProvider: config.chat_provider || null,
      chatModel: config.chat_model || null,
      runtimeRequirements: RUNTIME_REQUIREMENTS,
      providerCatalog: PROVIDER_CATALOG,
      providerAuthRoadmap: PROVIDER_AUTH_ROADMAP,
      authStatus: {
        googleConfigured: isGoogleAuthConfigured(),
        singleUserMode: isSingleUserModeEnabled(),
        identityMode: getIdentityMode(),
      },
      databaseConnection: getDatabaseConnectionDiagnostics(process.env.DATABASE_URL),
    });
  } catch (error: unknown) {
    console.error('[settings GET]', error);
    return NextResponse.json({
      hasApiKey: !!(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.OLLAMA_URL || process.env.OPENROUTER_API_KEY),
      apiKeyPreview: null,
      source: null,
      providers: {
        openai: { configured: !!process.env.OPENAI_API_KEY, preview: process.env.OPENAI_API_KEY ? 'env' : null },
        gemini: { configured: !!process.env.GEMINI_API_KEY, preview: process.env.GEMINI_API_KEY ? 'env' : null },
        ollama: { configured: !!process.env.OLLAMA_URL, url: process.env.OLLAMA_URL || null },
        openrouter: { configured: !!process.env.OPENROUTER_API_KEY, preview: process.env.OPENROUTER_API_KEY ? 'env' : null },
        custom: { configured: false, url: null, model: null },
      },
      embeddingProvider: null,
      chatProvider: null,
      runtimeRequirements: RUNTIME_REQUIREMENTS,
      providerCatalog: PROVIDER_CATALOG,
      providerAuthRoadmap: PROVIDER_AUTH_ROADMAP,
      authStatus: {
        googleConfigured: isGoogleAuthConfigured(),
        singleUserMode: isSingleUserModeEnabled(),
        identityMode: getIdentityMode(),
      },
      databaseConnection: getDatabaseConnectionDiagnostics(process.env.DATABASE_URL),
      dbError: true,
    });
  }
}

const SettingsPostSchema = z.object({
  action: z.enum(['remove']).optional(),
  apiKey: z.string().max(500).optional(),
  geminiKey: z.string().max(500).optional(),
  ollamaUrl: z.string().max(500).optional(),
  openrouterKey: z.string().max(500).optional(),
  customApiKey: z.string().max(500).optional(),
  customApiUrl: z.string().max(500).optional(),
  customApiModel: z.string().max(200).optional(),
  embeddingProvider: z.string().max(50).optional(),
  chatProvider: z.string().max(50).optional(),
  chatModel: z.string().max(200).optional(),
});

const VALIDATION_TIMEOUT_MS = 5000;

/**
 * Fetch with abort-controller timeout. Returns null if the call timed
 * out or threw; the caller distinguishes that from a real `Response`
 * with `.ok = false`. SEC-13 closes here.
 */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), VALIDATION_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /api/v1/settings — store settings.
 *
 * Each provider key validation now uses a 5s timeout. If the upstream
 * is slow or unreachable, we save the key anyway and surface a
 * `validationSkipped: ['openai', ...]` field so the UI can warn the user.
 * Without this, a stalled validation request blocks the route until
 * Vercel's 300s function timeout fires.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const limited = applyRateLimit(req, 'settings', RATE_LIMITS.write);
  if (limited) return limited;

  const body = await parseJsonBody(req, SettingsPostSchema);
  if (body instanceof NextResponse) return body;

  const validationSkipped: string[] = [];

  try {
    if (body.action === 'remove') {
      await db.execute(sql`DELETE FROM settings WHERE key IN (
        'openai_api_key', 'gemini_api_key', 'ollama_url',
        'openrouter_api_key', 'custom_api_key', 'custom_api_url', 'custom_api_model',
        'embedding_provider'
      )`);
      return NextResponse.json({ ok: true, message: 'All keys removed' });
    }

    if (body.apiKey) {
      const key = body.apiKey.trim();
      const testRes = await fetchWithTimeout('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (testRes === null) {
        validationSkipped.push('openai');
      } else if (!testRes.ok) {
        return NextResponse.json({ error: 'Invalid OpenAI API key' }, { status: 400 });
      }
      await upsertSetting('openai_api_key', key);
    }

    if (body.geminiKey) {
      const key = body.geminiKey.trim();
      const testRes = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      );
      if (testRes === null) {
        validationSkipped.push('gemini');
      } else if (!testRes.ok) {
        return NextResponse.json({ error: 'Invalid Gemini API key' }, { status: 400 });
      }
      await upsertSetting('gemini_api_key', key);
    }

    if (body.ollamaUrl) {
      await upsertSetting('ollama_url', body.ollamaUrl.trim());
    }

    if (body.openrouterKey) {
      const key = body.openrouterKey.trim();
      const testRes = await fetchWithTimeout('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (testRes === null) {
        validationSkipped.push('openrouter');
      } else if (!testRes.ok) {
        return NextResponse.json({ error: 'Invalid OpenRouter API key' }, { status: 400 });
      }
      await upsertSetting('openrouter_api_key', key);
    }

    if (body.customApiKey !== undefined || body.customApiUrl !== undefined || body.customApiModel !== undefined) {
      if (body.customApiKey) await upsertSetting('custom_api_key', body.customApiKey.trim());
      if (body.customApiUrl) await upsertSetting('custom_api_url', body.customApiUrl.trim());
      if (body.customApiModel) await upsertSetting('custom_api_model', body.customApiModel.trim());
    }

    if (body.embeddingProvider) {
      await upsertSetting('embedding_provider', body.embeddingProvider);
    }

    if (body.chatProvider) {
      if (body.chatProvider === 'auto') {
        await db.execute(sql`DELETE FROM settings WHERE key = 'chat_provider'`);
      } else {
        await upsertSetting('chat_provider', body.chatProvider);
      }
    }

    if (body.chatModel !== undefined) {
      if (!body.chatModel || body.chatModel === 'default') {
        await db.execute(sql`DELETE FROM settings WHERE key = 'chat_model'`);
      } else {
        await upsertSetting('chat_model', body.chatModel);
      }
    }

    if (body.apiKey || body.geminiKey || body.ollamaUrl || body.openrouterKey || body.customApiKey) {
      triggerAutoReindex().catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      message: validationSkipped.length
        ? `Settings saved (validation skipped for ${validationSkipped.join(', ')} — upstream unreachable)`
        : 'Settings saved',
      validationSkipped: validationSkipped.length ? validationSkipped : undefined,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Trigger background reindex of memories without embeddings.
 * Called after an API key is saved — non-blocking, best-effort.
 */
async function triggerAutoReindex() {
  try {
    const { getUserId } = await import('@/server/user');
    const userId = await getUserId();

    const countRes = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM memories
      WHERE user_id = ${userId}::uuid AND embedding IS NULL
    `);
    const unembedded = (countRes as any[])[0]?.count || 0;
    if (unembedded === 0) return;

    const { generateEmbeddings } = await import('@/server/embeddings');
    const { buildTreeIndex } = await import('@/server/retrieval');

    const BATCH = 50;
    let processed = 0;
    for (let i = 0; i < Math.min(unembedded, 200); i += BATCH) {
      const mems = await db.execute(sql`
        SELECT id, content FROM memories
        WHERE user_id = ${userId}::uuid AND embedding IS NULL
        ORDER BY created_at DESC LIMIT ${BATCH}
      `) as any[];

      if (mems.length === 0) break;

      const embeddings = await generateEmbeddings(mems.map(m => m.content));
      if (!embeddings) break;

      for (let j = 0; j < mems.length; j++) {
        const embStr = `[${embeddings[j].join(',')}]`;
        await db.execute(sql`
          UPDATE memories SET embedding = ${embStr}::vector WHERE id = ${mems[j].id}::uuid
        `);
        processed++;
      }
    }

    if (processed > 0) {
      try { await buildTreeIndex(userId); } catch { /* non-fatal */ }
      console.log(`[auto-reindex] Embedded ${processed}/${unembedded} memories`);
    }
  } catch (e) {
    console.error('[auto-reindex] failed:', e);
  }
}

/** Keys that contain sensitive values and should be encrypted at rest */
const SENSITIVE_KEYS = new Set([
  'openai_api_key', 'gemini_api_key', 'openrouter_api_key',
  'custom_api_key',
]);

async function upsertSetting(key: string, value: string) {
  const storedValue = SENSITIVE_KEYS.has(key) ? encrypt(value) : value;
  await db.execute(sql`
    INSERT INTO settings (key, value, updated_at) VALUES (${key}, ${storedValue}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${storedValue}, updated_at = NOW()
  `);
}

function decryptSettingValue(key: string, value: string): string {
  if (SENSITIVE_KEYS.has(key)) return decrypt(value);
  return value;
}
