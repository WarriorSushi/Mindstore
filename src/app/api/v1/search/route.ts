import { getUserId } from '@/server/user';
import { NextRequest, NextResponse } from 'next/server';
import { retrieve } from '@/server/retrieval';
import { generateEmbeddings } from '@/server/embeddings';
import { processQuery } from '@/server/query-processor';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';

/**
 * GET /api/v1/search?q=query&limit=10&source=chatgpt&dateFrom=...&dateTo=...
 * Triple-layer fusion search
 *
 * Enhanced: now returns timing info and supports date range filtering.
 * Fully backward compatible — new fields are additive.
 */
export async function GET(req: NextRequest) {
  const limited = applyRateLimit(req, 'search', RATE_LIMITS.standard);
  if (limited) return limited;

  const startTime = performance.now();

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '10');
    const sourceType = searchParams.get('source');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const userId = await getUserId();

    if (!query) return NextResponse.json({ error: 'Missing query parameter ?q=' }, { status: 400 });
    if (query.length > 2000) return NextResponse.json({ error: 'Query too long (max 2000 chars)' }, { status: 400 });

    // Process query for better retrieval (abbreviation expansion, stop word removal)
    const processed = processQuery(query);

    // Get embedding for the expanded query using available provider.
    // Search-side embedding — Gemini needs RETRIEVAL_QUERY tagging.
    let embedding: number[] | null = null;
    try {
      const embeddings = await generateEmbeddings([processed.expanded || query], { mode: 'query' });
      if (embeddings && embeddings.length > 0) {
        embedding = embeddings[0];
      }
    } catch { /* fallback to BM25 only */ }

    const results = await retrieve(processed.expanded || query, embedding, {
      userId,
      limit,
      sourceTypes: sourceType ? [sourceType] : undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });

    const durationMs = Math.round(performance.now() - startTime);

    return NextResponse.json({
      query,
      results,
      totalResults: results.length,
      durationMs,
      layers: {
        bm25: results.filter(r => r.layers.bm25).length,
        vector: results.filter(r => r.layers.vector).length,
        tree: results.filter(r => r.layers.tree).length,
      },
    });
  } catch (error: unknown) {
    console.error('[search]', error);
    const durationMs = Math.round(performance.now() - startTime);
    return NextResponse.json({ query: '', results: [], totalResults: 0, durationMs, layers: { bm25: 0, vector: 0, tree: 0 }, dbError: true });
  }
}
