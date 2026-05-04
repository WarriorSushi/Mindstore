/**
 * Domain-Specific Embeddings Plugin — Route (thin wrapper)
 *
 * GET  ?action=config           — Domain profiles, provider availability
 * GET  ?action=stats            — Domain distribution of memories
 * GET  ?action=detect&text=     — Detect domain for given text
 * GET  ?action=models&domain=   — Available models for a domain
 * POST ?action=save-config      — Save domain model configuration
 * POST ?action=tag-domain       — Tag a memory with a domain
 * POST ?action=batch-detect     — Auto-detect domains for untagged memories
 *
 * Logic delegated to src/server/plugins/ports/domain-embeddings.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import {
  DOMAIN_PROFILES,
  detectDomain,
  ensureInstalled,
  getProviderAvailability,
  getPluginConfig,
  saveDomainConfig,
  getDomainStats,
  tagMemoryDomain,
  batchDetectDomains,
} from '@/server/plugins/ports/domain-embeddings';

// ─── GET ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureInstalled();

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'config';

    if (action === 'config') {
      const pluginConfig = await getPluginConfig();
      const { providers, currentProvider } = await getProviderAvailability();
      return NextResponse.json({
        domains: DOMAIN_PROFILES,
        config: pluginConfig,
        availableProviders: providers,
        currentProvider,
      });
    }

    if (action === 'stats') {
      return NextResponse.json(await getDomainStats(userId));
    }

    if (action === 'detect') {
      const text = searchParams.get('text');
      if (!text) return NextResponse.json({ error: 'Missing text parameter' }, { status: 400 });
      const results = detectDomain(text);
      return NextResponse.json({
        detectedDomains: results,
        primaryDomain: results.length > 0 && results[0].score > 0.05
          ? results[0]
          : { domain: 'general', score: 1, matches: [] },
      });
    }

    if (action === 'models') {
      const domainId = searchParams.get('domain') || 'general';
      const domain = DOMAIN_PROFILES.find(d => d.id === domainId);
      if (!domain) return NextResponse.json({ error: 'Unknown domain' }, { status: 404 });

      const { providers } = await getProviderAvailability();
      const models = domain.recommendedModels.map(m => ({
        ...m,
        available: (m.provider === 'openai' && providers.openai) ||
                   (m.provider === 'ollama' && providers.ollama) ||
                   m.provider === 'huggingface',
      }));
      return NextResponse.json({ domain: domain.id, models });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e: any) {
    console.error('[domain-embeddings GET]', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}

// ─── POST ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-domain-embeddings', RATE_LIMITS.ai);
  if (limited) return limited;

  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'save-config';
    await ensureInstalled();

    if (action === 'save-config') {
      const body = await req.json();
      await saveDomainConfig(body);
      return NextResponse.json({ saved: true });
    }

    if (action === 'tag-domain') {
      const body = await req.json();
      const { memoryId, domain } = body;
      if (!memoryId) return NextResponse.json({ error: 'Missing memoryId' }, { status: 400 });
      try {
        await tagMemoryDomain(userId, memoryId, domain);
      } catch (err: any) {
        if (err.message === 'Invalid domain') {
          return NextResponse.json({ error: 'Invalid domain' }, { status: 400 });
        }
        throw err;
      }
      return NextResponse.json({ tagged: true, memoryId, domain });
    }

    if (action === 'batch-detect') {
      const body = await req.json().catch(() => ({}));
      const result = await batchDetectDomains(userId, body.batchSize || 100);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e: any) {
    console.error('[domain-embeddings POST]', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
