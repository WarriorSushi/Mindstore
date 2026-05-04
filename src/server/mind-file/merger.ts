/**
 * .mind file merger — Phase 4 (A.8).
 *
 * Imports a parsed `ParsedMindFile` into the current user's knowledge
 * base. Deduplicates by content hash so re-importing the same file
 * doesn't double up.
 *
 * `dryRun: true` returns the planned plan without writing — used by the
 * conflict-resolver UI to show "would import 412 new, 18 duplicates"
 * before the user commits.
 */

import { sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import type { ParsedMindFile, ParsedMemory } from './reader';

export interface MergeReport {
  imported: number;
  skippedDuplicates: number;
  failed: number;
  warnings: string[];
}

const CONTENT_HASH_KEY = '__mindfile_hash__';

function contentHash(memory: ParsedMemory): string {
  const h = createHash('sha256');
  h.update(memory.sourceType);
  h.update('|');
  h.update(memory.content);
  return h.digest('hex');
}

/**
 * Merge memories from a parsed .mind file into `userId`'s base.
 * Idempotent — re-importing the same file twice yields zero new
 * memories on the second run.
 */
export async function mergeMindFile(
  userId: string,
  file: ParsedMindFile,
  opts: { dryRun?: boolean } = {},
): Promise<MergeReport> {
  const report: MergeReport = {
    imported: 0,
    skippedDuplicates: 0,
    failed: 0,
    warnings: [...file.warnings],
  };
  if (file.memories.length === 0) return report;

  // Build the set of existing content hashes for quick dedup. We could
  // join on a generated column for huge bases; in v1 a single SELECT
  // suffices for typical user sizes.
  //
  // Note: `__mindfile_hash__` is hardcoded rather than templated via
  // ${CONTENT_HASH_KEY}, because Drizzle's sql tag treats ${} inside a
  // single-quoted string as the literal text `$N` (no parameter binding
  // happens inside string literals). Keeping this in lockstep with the
  // CONTENT_HASH_KEY constant above is enforced by the unit test that
  // checks the inserted metadata.
  const existing = (await db.execute(sql`
    SELECT metadata->>'__mindfile_hash__' AS hash
    FROM memories
    WHERE user_id = ${userId}::uuid
      AND metadata ? '__mindfile_hash__'
  `)) as unknown as Array<{ hash: string }>;
  const existingHashes = new Set(existing.map((r) => r.hash).filter(Boolean));

  for (const memory of file.memories) {
    const hash = contentHash(memory);
    if (existingHashes.has(hash)) {
      report.skippedDuplicates += 1;
      continue;
    }

    if (opts.dryRun) {
      report.imported += 1;
      existingHashes.add(hash); // dedup within the file too
      continue;
    }

    try {
      const id = randomUUID();
      const metadata: Record<string, unknown> = {
        ...memory.metadata,
        [CONTENT_HASH_KEY]: hash,
        importedFromMind: {
          format: file.manifest.format,
          generatedAt: file.manifest.generatedAt,
          label: file.manifest.label,
        },
      };
      const embeddingLiteral = memory.embedding && memory.embedding.length > 0
        ? `[${memory.embedding.join(',')}]`
        : null;

      if (embeddingLiteral) {
        await db.execute(sql`
          INSERT INTO memories (
            id, user_id, content, embedding, content_type, source_type,
            source_id, source_title, metadata, parent_id, tree_path,
            created_at, imported_at
          ) VALUES (
            ${id}::uuid, ${userId}::uuid, ${memory.content},
            ${embeddingLiteral}::vector,
            ${memory.contentType}::content_type,
            ${memory.sourceType},
            ${memory.sourceId}, ${memory.sourceTitle},
            ${JSON.stringify(metadata)}::jsonb,
            ${memory.parentId}, ${memory.treePath},
            ${memory.createdAt}, NOW()
          )
        `);
      } else {
        await db.execute(sql`
          INSERT INTO memories (
            id, user_id, content, content_type, source_type,
            source_id, source_title, metadata, parent_id, tree_path,
            created_at, imported_at
          ) VALUES (
            ${id}::uuid, ${userId}::uuid, ${memory.content},
            ${memory.contentType}::content_type,
            ${memory.sourceType},
            ${memory.sourceId}, ${memory.sourceTitle},
            ${JSON.stringify(metadata)}::jsonb,
            ${memory.parentId}, ${memory.treePath},
            ${memory.createdAt}, NOW()
          )
        `);
      }

      report.imported += 1;
      existingHashes.add(hash);
    } catch (e) {
      report.failed += 1;
      report.warnings.push(`Failed to insert memory ${memory.id}: ${(e as Error).message}`);
    }
  }

  return report;
}
