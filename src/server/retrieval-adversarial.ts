/**
 * Adversarial Retrieval — Phase 2 (innovation A.3 in FEATURE_BACKLOG.md).
 *
 * Inverts the default "find what matches my query" behavior. For each
 * top-N memory in the regular retrieval result, we look up its known
 * contradictions in the `contradictions` table (populated by the
 * existing contradiction-finder plugin) and surface those instead.
 *
 * This is the "Devil's Advocate" mode — every query also shows you
 * what you were wrong about. Zero new LLM cost; reuses precomputed
 * contradictions.
 *
 * Foundation:
 *  - `contradictions` table: memory_a_id, memory_b_id, topic, description,
 *    detected_at. Populated by contradiction-finder background scans.
 *  - `retrieve()` from src/server/retrieval.ts: standard hybrid RRF.
 *
 * The result preserves the standard `RetrievalResult` shape but adds an
 * `opposingMemoryIds: string[]` field naming the memories that
 * contradict each surfaced result.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { retrieve, type RetrievalResult } from '@/server/retrieval';

export interface AdversarialResult extends RetrievalResult {
  opposingMemoryIds: string[];
  contradictionTopics: string[];
}

interface RetrievalOptions {
  userId: string;
  limit?: number;
  sourceTypes?: string[];
  dateFrom?: Date;
  dateTo?: Date;
}

interface ContradictionRow {
  memory_a_id: string;
  memory_b_id: string;
  topic: string | null;
  description: string | null;
}

/**
 * Run a normal retrieval, then enrich each result with the IDs of
 * memories that contradict it. Results that have no recorded
 * contradiction are dropped (the "adversarial" filter), so the caller
 * sees only memories where there's tension to consider.
 *
 * If `keepUncontradicted` is true, all retrieval results are kept and
 * `opposingMemoryIds` is empty for those without contradictions —
 * useful for the "show opposing views" toggle in chat where we still
 * want context but with annotation.
 */
export async function retrieveAdversarial(
  query: string,
  queryEmbedding: number[] | null,
  options: RetrievalOptions & { keepUncontradicted?: boolean } = {} as RetrievalOptions,
): Promise<AdversarialResult[]> {
  const { keepUncontradicted = false, limit = 10, ...rest } = options;
  const baseLimit = Math.max(limit * 3, 30); // overfetch so the contradiction filter has slack

  const baseResults = await retrieve(query, queryEmbedding, { ...rest, limit: baseLimit });
  if (baseResults.length === 0) return [];

  const memoryIds = baseResults.map((r) => r.memoryId);
  const contradictions = (await db.execute(sql`
    SELECT memory_a_id, memory_b_id, topic, description
    FROM contradictions
    WHERE user_id = ${rest.userId}::uuid
      AND (memory_a_id = ANY(${memoryIds}::uuid[]) OR memory_b_id = ANY(${memoryIds}::uuid[]))
  `)) as unknown as ContradictionRow[];

  // Build a per-memory map of opposing IDs and topics.
  const opposingByMemory = new Map<string, { opposing: Set<string>; topics: Set<string> }>();
  for (const row of contradictions) {
    for (const [self, other] of [
      [row.memory_a_id, row.memory_b_id],
      [row.memory_b_id, row.memory_a_id],
    ]) {
      let entry = opposingByMemory.get(self);
      if (!entry) {
        entry = { opposing: new Set<string>(), topics: new Set<string>() };
        opposingByMemory.set(self, entry);
      }
      entry.opposing.add(other);
      if (row.topic) entry.topics.add(row.topic);
    }
  }

  const enriched: AdversarialResult[] = [];
  for (const result of baseResults) {
    const entry = opposingByMemory.get(result.memoryId);
    const opposing = entry ? Array.from(entry.opposing) : [];
    const topics = entry ? Array.from(entry.topics) : [];
    if (!keepUncontradicted && opposing.length === 0) continue;
    enriched.push({
      ...result,
      opposingMemoryIds: opposing,
      contradictionTopics: topics,
    });
    if (enriched.length >= limit) break;
  }

  return enriched;
}
