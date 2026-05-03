import { sql } from "drizzle-orm";
import { definePlugin } from "@mindstore/plugin-sdk";
import { db } from "@/server/db";
import { PLUGIN_MANIFESTS } from "./registry";

const WRITING_STYLE_WIDGET_ID = "writing-style-overview";

const BUILTIN_OVERRIDES = {
  "writing-analyzer": definePlugin({
    source: "builtin",
    manifest: PLUGIN_MANIFESTS["writing-analyzer"],
    dashboard: {
      widgets: [
        {
          id: WRITING_STYLE_WIDGET_ID,
          async load({ userId }) {
            const [statsRow] = (await db.execute(sql`
              SELECT
                COUNT(*)::int AS total_memories,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS recent_memories,
                COALESCE(
                  ROUND(
                    AVG(array_length(regexp_split_to_array(trim(content), E'\\s+'), 1))
                  ),
                  0
                )::int AS avg_words
              FROM memories
              WHERE user_id = ${userId}::uuid
                AND char_length(trim(content)) > 0
            `)) as Array<{
              total_memories: number;
              recent_memories: number;
              avg_words: number;
            }>;

            const [sourceRow] = (await db.execute(sql`
              SELECT source_type, COUNT(*)::int AS count
              FROM memories
              WHERE user_id = ${userId}::uuid
                AND char_length(trim(content)) > 0
              GROUP BY source_type
              ORDER BY count DESC, source_type ASC
              LIMIT 1
            `)) as Array<{ source_type: string; count: number }>;

            const totalMemories = statsRow?.total_memories ?? 0;
            if (!totalMemories) {
              return {
                summary: "Import or write a few memories to generate your first writing profile.",
                metrics: [
                  { label: "Written memories", value: "0" },
                  { label: "Avg words", value: "0" },
                ],
              };
            }

            const topSourceLabel = sourceRow?.source_type
              ? formatSourceType(sourceRow.source_type)
              : "Mixed sources";

            return {
              summary: `${totalMemories} memories analyzed with ${statsRow?.recent_memories ?? 0} added in the last 30 days.`,
              metrics: [
                { label: "Written memories", value: totalMemories.toLocaleString(), tone: "info" },
                { label: "Avg words", value: String(statsRow?.avg_words ?? 0), tone: "positive" },
                { label: "Top source", value: topSourceLabel },
              ],
              items: sourceRow
                ? [{ label: "Most common source", value: `${topSourceLabel} (${sourceRow.count})` }]
                : [],
              updatedAt: new Date().toISOString(),
            };
          },
        },
      ],
    },
  }),
} as const;

export const builtInPlugins = Object.entries(PLUGIN_MANIFESTS).map(([slug, manifest]) => {
  const override = BUILTIN_OVERRIDES[slug as keyof typeof BUILTIN_OVERRIDES];
  if (override) {
    return override;
  }

  return definePlugin({
    source: "builtin",
    manifest,
  });
});

function formatSourceType(sourceType: string): string {
  return sourceType
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
