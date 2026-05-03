import { NextRequest, NextResponse } from 'next/server';
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
import { requireUserId } from '@/server/api-validation';

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

/**
 * POST /api/v1/settings — store settings
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const limited = applyRateLimit(req, 'settings', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    const body = await req.json();

    // Remove all keys
    if (body.action === 'remove') {
      await db.execute(sql`DELETE FROM settings WHERE key IN (
        'openai_api_key', 'gemini_api_key', 'ollama_url',
        'openrouter_api_key', 'custom_api_key', 'custom_api_url', 'custom_api_model',
        'embedding_provider'
      )`);
      return NextResponse.json({ ok: true, message: 'All keys removed' });
    }

    // Save OpenAI key
    if (body.apiKey) {
      const key = body.apiKey.trim();
      const testRes = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!testRes.ok) {
        return NextResponse.json({ error: 'Invalid OpenAI API key' }, { status: 400 });
      }
      await upsertSetting('openai_api_key', key);
    }

    // Save Gemini key
    if (body.geminiKey) {
      const key = body.geminiKey.trim();
      const testRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
      );
      if (!testRes.ok) {
        return NextResponse.json({ error: 'Invalid Gemini API key' }, { status: 400 });
      }
      await upsertSetting('gemini_api_key', key);
    }

    // Save Ollama URL
    if (body.ollamaUrl) {
      await upsertSetting('ollama_url', body.ollamaUrl.trim());
    }

    // Save OpenRouter key
    if (body.openrouterKey) {
      const key = body.openrouterKey.trim();
      // Test with OpenRouter models endpoint
      const testRes = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!testRes.ok) {
        return NextResponse.json({ error: 'Invalid OpenRouter API key' }, { status: 400 });
      }
      await upsertSetting('openrouter_api_key', key);
    }

    // Save Custom API (any OpenAI-compatible endpoint)
    if (body.customApiKey !== undefined || body.customApiUrl !== undefined || body.customApiModel !== undefined) {
      if (body.customApiKey) await upsertSetting('custom_api_key', body.customApiKey.trim());
      if (body.customApiUrl) await upsertSetting('custom_api_url', body.customApiUrl.trim());
      if (body.customApiModel) await upsertSetting('custom_api_model', body.customApiModel.trim());
    }

    // Save preferred embedding provider
    if (body.embeddingProvider) {
      await upsertSetting('embedding_provider', body.embeddingProvider);
    }

    // Save preferred chat provider
    if (body.chatProvider) {
      if (body.chatProvider === 'auto') {
        await db.execute(sql`DELETE FROM settings WHERE key = 'chat_provider'`);
      } else {
        await upsertSetting('chat_provider', body.chatProvider);
      }
    }

    // Save preferred chat model
    if (body.chatModel !== undefined) {
      if (!body.chatModel || body.chatModel === 'default') {
        await db.execute(sql`DELETE FROM settings WHERE key = 'chat_model'`);
      } else {
        await upsertSetting('chat_model', body.chatModel);
      }
    }

    // Auto-reindex: if an API key was just saved, embed any memories that don't have embeddings yet
    // This runs in the background — response returns immediately
    if (body.apiKey || body.geminiKey || body.ollamaUrl || body.openrouterKey || body.customApiKey) {
      triggerAutoReindex().catch(() => {}); // fire-and-forget
    }

    return NextResponse.json({ ok: true, message: 'Settings saved' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Trigger background reindex of memories without embeddings.
 * Called after an API key is saved — non-blocking, best-effort.
 * Uses waitUntil if available (Vercel edge) or fire-and-forget.
 */
async function triggerAutoReindex() {
  try {
    const { getUserId } = await import('@/server/user');
    const userId = await getUserId();
    
    // Check if there are memories without embeddings
    const countRes = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM memories
      WHERE user_id = ${userId}::uuid AND embedding IS NULL
    `);
    const unembedded = (countRes as any[])[0]?.count || 0;
    if (unembedded === 0) return;

    const { generateEmbeddings } = await import('@/server/embeddings');
    const { buildTreeIndex } = await import('@/server/retrieval');

    // Process in batches of 50
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

    // Rebuild tree index if we processed anything
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
  // Encrypt sensitive values (API keys)
  const storedValue = SENSITIVE_KEYS.has(key) ? encrypt(value) : value;
  await db.execute(sql`
    INSERT INTO settings (key, value, updated_at) VALUES (${key}, ${storedValue}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${storedValue}, updated_at = NOW()
  `);
}

/** Read a setting value, decrypting if needed */
function decryptSettingValue(key: string, value: string): string {
  if (SENSITIVE_KEYS.has(key)) return decrypt(value);
  return value;
}
