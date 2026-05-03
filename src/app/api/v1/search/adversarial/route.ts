import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { generateEmbeddings } from '@/server/embeddings';
import { processQuery } from '@/server/query-processor';
import { retrieveAdversarial } from '@/server/retrieval-adversarial';

/**
 * GET /api/v1/search/adversarial?q=...
 * Phase 2 (A.3) — inverts standard retrieval: surface only memories that
 * contradict the user's other memories on the same topic. Results
 * include `opposingMemoryIds` and `contradictionTopics` for the UI to
 * render "challenge" badges.
 *
 * Pass `keepUncontradicted=1` to get the full list with opposingMemoryIds
 * empty for non-contradicted results — useful for chat context building.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'search-adversarial', RATE_LIMITS.standard);
  if (limited) return limited;

  const startTime = performance.now();

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10) || 10, 30);
    const sourceType = searchParams.get('source');
    const keepUncontradicted = searchParams.get('keepUncontradicted') === '1';
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    if (!query) return NextResponse.json({ error: 'Missing query parameter ?q=' }, { status: 400 });
    if (query.length > 2000) return NextResponse.json({ error: 'Query too long (max 2000 chars)' }, { status: 400 });

    const processed = processQuery(query);

    let embedding: number[] | null = null;
    try {
      const embeddings = await generateEmbeddings([processed.expanded || query], { mode: 'query' });
      if (embeddings && embeddings.length > 0) embedding = embeddings[0];
    } catch {
      // Fall back to BM25-only retrieval (still works without embeddings).
    }

    const results = await retrieveAdversarial(processed.expanded || query, embedding, {
      userId,
      limit,
      sourceTypes: sourceType ? [sourceType] : undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      keepUncontradicted,
    });

    const durationMs = Math.round(performance.now() - startTime);

    return NextResponse.json({
      query,
      mode: 'adversarial',
      results,
      totalResults: results.length,
      durationMs,
      withContradictions: results.filter((r) => r.opposingMemoryIds.length > 0).length,
    });
  } catch (error: unknown) {
    console.error('[search-adversarial]', error);
    const durationMs = Math.round(performance.now() - startTime);
    return NextResponse.json({
      query: '', results: [], totalResults: 0, durationMs, mode: 'adversarial', error: true,
    });
  }
}
