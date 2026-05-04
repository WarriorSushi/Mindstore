/**
 * Custom RAG Strategies Plugin — Route (thin wrapper)
 *
 * GET  ?action=config      — Current strategy config + available strategies
 * GET  ?action=stats       — Retrieval stats
 * GET  ?action=benchmark   — Benchmark query across strategies
 * POST action=save-config  — Save strategy configuration
 * POST action=test-query   — Test a query with a specific strategy
 *
 * Logic delegated to src/server/plugins/ports/custom-rag.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { retrieve } from '@/server/retrieval';
import { generateEmbeddings, getEmbeddingConfig } from '@/server/embeddings';
import { getTextGenerationConfig, callTextPrompt } from '@/server/ai-client';
import {
  STRATEGY_INFO,
  getRAGConfig,
  saveRAGConfig,
  getRAGStats,
  hydeRetrieve,
  multiQueryRetrieve,
  rerankRetrieve,
  compressResults,
  maximalRetrieve,
  type RAGStrategy,
  type RAGConfig,
  type CallAI,
  type RetrieveFn,
  type EmbedFn,
} from '@/server/plugins/ports/custom-rag';

// ─── AI Provider Setup (shared ai-client) ───────────────────────

const callAI: CallAI = async (systemPrompt, userPrompt) => {
  const config = await getTextGenerationConfig();
  if (!config) throw new Error('No AI provider available for RAG strategies');
  const result = await callTextPrompt(config, userPrompt, systemPrompt, { temperature: 0.7, maxTokens: 1000 });
  return result || '';
};

const deps = {
  callAI,
  embed: generateEmbeddings as EmbedFn,
  retrieve: retrieve as unknown as RetrieveFn,
};

// ─── Route Handlers ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'config';

    if (action === 'config') {
      const config = await getRAGConfig();
      const embeddingConfig = await getEmbeddingConfig();
      const aiTextConfig = await getTextGenerationConfig();
      const hasAI = aiTextConfig !== null;
      return NextResponse.json({
        config, strategies: STRATEGY_INFO,
        embeddingProvider: embeddingConfig?.provider || null,
        embeddingModel: embeddingConfig?.model || null,
        hasAI, availableStrategies: hasAI ? Object.keys(STRATEGY_INFO) : ['default'],
      });
    }

    if (action === 'stats') {
      return NextResponse.json(await getRAGStats(userId));
    }

    if (action === 'benchmark') {
      const query = searchParams.get('q');
      if (!query) return NextResponse.json({ error: 'Missing ?q= parameter' }, { status: 400 });
      const embeddings = await generateEmbeddings([query]);
      const defaultStart = Date.now();
      const defaultResults = await retrieve(query, embeddings?.[0] || null, { userId, limit: 10 });
      const defaultLatency = Date.now() - defaultStart;
      let hydeData = null;
      try {
        const r = await hydeRetrieve(query, userId, 10, deps);
        hydeData = {
          results: r.results.slice(0, 5).map(r => ({ id: r.memoryId, title: r.sourceTitle, score: r.score, preview: r.content.slice(0, 120) })),
          hydeDocument: r.hydeDocument, latencyMs: r.latencyMs,
        };
      } catch {}
      return NextResponse.json({
        query,
        default: {
          results: defaultResults.slice(0, 5).map(r => ({ id: r.memoryId, title: r.sourceTitle, score: r.score, preview: r.content.slice(0, 120), layers: (r as any).layers })),
          latencyMs: defaultLatency,
        },
        hyde: hydeData,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[custom-rag] GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-custom-rag', RATE_LIMITS.ai);
  if (limited) return limited;

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'save-config') {
      const { strategy, enabledLayers, rrfK, treeBoost, rerankTopK, multiQueryCount, compressionMaxTokens } = body;
      const updates: Partial<RAGConfig> = {};
      if (strategy) updates.activeStrategy = strategy;
      if (enabledLayers) updates.enabledLayers = enabledLayers;
      if (typeof rrfK === 'number') updates.rrfK = rrfK;
      if (typeof treeBoost === 'number') updates.treeBoost = treeBoost;
      if (typeof rerankTopK === 'number') updates.rerankTopK = rerankTopK;
      if (typeof multiQueryCount === 'number') updates.multiQueryCount = multiQueryCount;
      if (typeof compressionMaxTokens === 'number') updates.compressionMaxTokens = compressionMaxTokens;
      const saved = await saveRAGConfig(updates);
      return NextResponse.json({ ok: true, config: saved });
    }

    if (action === 'test-query') {
      const { query, strategy } = body;
      if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 });
      const strat = (strategy || 'default') as RAGStrategy;
      const limit = 10;
      const startTime = Date.now();
      let results: any[] = [];
      let details: any = {};

      switch (strat) {
        case 'hyde': { const r = await hydeRetrieve(query, userId, limit, deps); results = r.results; details = { hydeDocument: r.hydeDocument, latencyMs: r.latencyMs }; break; }
        case 'multi-query': { const r = await multiQueryRetrieve(query, userId, limit, 3, deps); results = r.results; details = { expandedQueries: r.expandedQueries, latencyMs: r.latencyMs }; break; }
        case 'reranking': { const emb = await generateEmbeddings([query]); const r = await rerankRetrieve(query, emb?.[0] || null, userId, limit, 20, deps); results = r.results; details = { rerankedCount: r.rerankedCount, latencyMs: r.latencyMs }; break; }
        case 'contextual-compression': { const emb = await generateEmbeddings([query]); const initial = await retrieve(query, emb?.[0] || null, { userId, limit }); const r = await compressResults(query, initial as any, 200, deps); results = r.results; details = { compressedCount: r.compressedCount, latencyMs: r.latencyMs }; break; }
        case 'maximal': { const r = await maximalRetrieve(query, userId, limit, deps); results = r.results; details = r.details; break; }
        default: { const emb = await generateEmbeddings([query]); results = await retrieve(query, emb?.[0] || null, { userId, limit }) as any; details = { latencyMs: Date.now() - startTime }; }
      }

      return NextResponse.json({
        query, strategy: strat,
        results: results.map((r: any) => ({ id: r.memoryId, title: r.sourceTitle, sourceType: r.sourceType, score: r.score, preview: r.content.slice(0, 200), layers: r.layers, createdAt: r.createdAt })),
        totalResults: results.length, details, totalLatencyMs: Date.now() - startTime,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[custom-rag] POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
