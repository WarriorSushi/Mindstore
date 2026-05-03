/**
 * Stats adapter — bridges the deprecated `/api/v1/stats` shape to the
 * canonical `/api/v1/knowledge-stats` payload.
 *
 * Phase 1 (ARCH-10): `/api/v1/stats` is deprecated with a 2026-08-01
 * sunset. Frontend callers should migrate to `/api/v1/knowledge-stats`
 * and use this adapter to project the legacy shape from the new payload.
 *
 * After 2026-08-01 the legacy fields on `/api/v1/knowledge-stats` may
 * also be removed. New code should consume the canonical fields directly
 * (`total`, `sources`, `topSources`, `monthlyGrowth`, etc.).
 */

export interface LegacyStatsResponse {
  totalMemories: number;
  totalSources: number;
  byType: Record<string, number>;
  topSources: Array<{
    id: string;
    type: string;
    title: string;
    itemCount: number;
  }>;
  recentMemories: Array<{
    id: string;
    content: string;
    sourceType: string;
    sourceTitle: string;
    createdAt: string | Date | null;
  }>;
  pinnedMemories: Array<{
    id: string;
    content: string;
    sourceType: string;
    sourceTitle: string;
    createdAt: string | Date | null;
  }>;
  pinnedCount: number;
  dailyActivity: Array<{ day: string; count: number }>;
}

interface KnowledgeStatsLegacyEnvelope extends Partial<LegacyStatsResponse> {
  /** Legacy-shape variant of `topSources` returned by `/api/v1/knowledge-stats`. */
  topSourcesLegacy?: LegacyStatsResponse["topSources"];
}

/**
 * Project the legacy `/api/v1/stats` shape from a `/api/v1/knowledge-stats`
 * response payload. Tolerates missing fields (returns sensible empties).
 *
 * @example
 * ```ts
 * const res = await fetch('/api/v1/knowledge-stats').then(r => r.json());
 * const legacy = toLegacyStats(res);
 * setStats(legacy);
 * ```
 */
export function toLegacyStats(payload: KnowledgeStatsLegacyEnvelope): LegacyStatsResponse {
  return {
    totalMemories: payload.totalMemories ?? 0,
    totalSources: payload.totalSources ?? 0,
    byType: payload.byType ?? { chatgpt: 0, text: 0, file: 0, url: 0 },
    topSources: payload.topSourcesLegacy ?? [],
    recentMemories: payload.recentMemories ?? [],
    pinnedMemories: payload.pinnedMemories ?? [],
    pinnedCount: payload.pinnedCount ?? 0,
    dailyActivity: payload.dailyActivity ?? [],
  };
}
