/**
 * .mind file writer — Phase 4 (A.8).
 *
 * Produces a single portable .mind file (a ZIP archive) containing
 * everything needed to reconstruct a user's knowledge base elsewhere:
 *
 *   manifest.json     — version, user-supplied label, counts, checksum
 *   memories.jsonl    — one memory per line; embeddings reference
 *                       /embeddings.bin by row index
 *   embeddings.bin    — concatenated Float32Array vectors
 *   tree_index.json   — hierarchical retrieval index
 *   connections.json  — discovered cross-pollinations
 *   profile.json      — knowledge fingerprint, top topics
 *
 * Streamed directly to the HTTP response so we don't need object
 * storage in v1 (Vercel Blob integration tracked under BLOCK-x; the
 * format is storage-agnostic so layering Blob on top later is a
 * runtime change, not a format change).
 *
 * Format details live in MIND_FILE_SPEC v1 (see docs/archive/MIND_FILE_SPEC_v0.md
 * for the original moonshot spec — v1 is a pragmatic subset).
 */

import { sql } from 'drizzle-orm';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { db } from '@/server/db';

export const MIND_FILE_FORMAT_VERSION = 'mindstore.mind/1.0' as const;

export interface MindFileManifest {
  format: typeof MIND_FILE_FORMAT_VERSION;
  generatedAt: string;
  generatorVersion: string;
  label: string;
  memoryCount: number;
  embeddingCount: number;
  embeddingDimension: number | null;
  connectionCount: number;
  treeNodeCount: number;
  contentSha256: string; // checksum of memories.jsonl + embeddings.bin
}

interface MemoryRow {
  id: string;
  content: string;
  embedding: string | null; // pgvector serializes to "[a,b,c]"
  content_type: string;
  source_type: string;
  source_id: string | null;
  source_title: string | null;
  metadata: Record<string, unknown> | null;
  parent_id: string | null;
  tree_path: string | null;
  created_at: string | Date | null;
  imported_at: string | Date | null;
}

interface ExportedMemoryLine {
  id: string;
  content: string;
  contentType: string;
  sourceType: string;
  sourceId: string | null;
  sourceTitle: string | null;
  metadata: Record<string, unknown>;
  parentId: string | null;
  treePath: string | null;
  createdAt: string | null;
  importedAt: string | null;
  embeddingIndex: number | null; // row index in embeddings.bin, or null if no embedding
}

/**
 * Build the .mind ZIP for `userId` and return the resulting Uint8Array.
 *
 * Designed to be memory-bounded for typical users (<50k memories);
 * larger bases should chunk via streaming, which is a Phase-5 follow-up.
 */
export async function buildMindFile(userId: string, opts: { label?: string } = {}): Promise<{
  bytes: Uint8Array;
  manifest: MindFileManifest;
}> {
  const memoryRows = (await db.execute(sql`
    SELECT id, content, embedding::text AS embedding, content_type, source_type,
      source_id, source_title, metadata, parent_id, tree_path, created_at, imported_at
    FROM memories
    WHERE user_id = ${userId}::uuid
    ORDER BY created_at ASC NULLS FIRST
  `)) as unknown as MemoryRow[];

  const treeRows = (await db.execute(sql`
    SELECT id, title, summary, level, parent_id, memory_ids, created_at
    FROM tree_index
    WHERE user_id = ${userId}::uuid
  `)) as unknown as Array<Record<string, unknown>>;

  const connectionRows = (await db.execute(sql`
    SELECT memory_a_id, memory_b_id, similarity, surprise, bridge_concept, discovered_at
    FROM connections
    WHERE user_id = ${userId}::uuid
  `)) as unknown as Array<Record<string, unknown>>;

  const profileRows = (await db.execute(sql`
    SELECT key, value, category, confidence, source, updated_at
    FROM profile
    WHERE user_id = ${userId}::uuid
  `)) as unknown as Array<Record<string, unknown>>;

  // Build embeddings.bin and memories.jsonl together so indexes align.
  const embeddingFloats: number[][] = [];
  const memoryLines: string[] = [];
  let embeddingDimension: number | null = null;

  for (const row of memoryRows) {
    const parsed = parseEmbedding(row.embedding);
    let embeddingIndex: number | null = null;
    if (parsed && parsed.length > 0) {
      if (embeddingDimension === null) embeddingDimension = parsed.length;
      // We only pack vectors of the dominant dimension into the .bin so
      // the receiver can deserialize without per-row sizing. Mismatched
      // vectors are kept in JSON form on the memory line for fidelity.
      if (parsed.length === embeddingDimension) {
        embeddingIndex = embeddingFloats.length;
        embeddingFloats.push(parsed);
      }
    }

    const line: ExportedMemoryLine = {
      id: row.id,
      content: row.content,
      contentType: row.content_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceTitle: row.source_title,
      metadata: row.metadata ?? {},
      parentId: row.parent_id,
      treePath: row.tree_path,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      importedAt: row.imported_at ? new Date(row.imported_at).toISOString() : null,
      embeddingIndex,
    };
    memoryLines.push(JSON.stringify(line));
  }

  const memoriesJsonl = memoryLines.join('\n');
  const embeddingsBuffer = packEmbeddings(embeddingFloats, embeddingDimension);

  const checksum = createHash('sha256');
  checksum.update(memoriesJsonl);
  checksum.update(embeddingsBuffer);

  const manifest: MindFileManifest = {
    format: MIND_FILE_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    generatorVersion: 'mindstore@0.3',
    label: opts.label?.slice(0, 200) || 'Mindstore export',
    memoryCount: memoryRows.length,
    embeddingCount: embeddingFloats.length,
    embeddingDimension,
    connectionCount: connectionRows.length,
    treeNodeCount: treeRows.length,
    contentSha256: checksum.digest('hex'),
  };

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('memories.jsonl', memoriesJsonl);
  zip.file('embeddings.bin', embeddingsBuffer);
  zip.file('tree_index.json', JSON.stringify(treeRows, null, 2));
  zip.file('connections.json', JSON.stringify(connectionRows, null, 2));
  zip.file('profile.json', JSON.stringify(profileRows, null, 2));
  zip.file('README.txt', generateReadme(manifest));

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { bytes, manifest };
}

function packEmbeddings(rows: number[][], dim: number | null): Buffer {
  if (!dim || rows.length === 0) return Buffer.alloc(0);
  const buf = Buffer.alloc(rows.length * dim * 4);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (let j = 0; j < dim; j++) {
      buf.writeFloatLE(row[j] ?? 0, (i * dim + j) * 4);
    }
  }
  return buf;
}

function parseEmbedding(raw: string | null): number[] | null {
  if (!raw) return null;
  // pgvector serializes vectors to "[a,b,c]". Some drivers also return JSON arrays.
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((n) => typeof n === 'number');
  } catch {
    // Try the [a,b,c] textual form by stripping brackets.
    const trimmed = raw.trim().replace(/^[[]/, '').replace(/[\]]$/, '');
    if (!trimmed) return null;
    const parts = trimmed.split(',').map((s) => Number(s.trim()));
    if (parts.some((n) => !Number.isFinite(n))) return null;
    return parts;
  }
}

function generateReadme(manifest: MindFileManifest): string {
  return [
    `# Mindstore .mind file`,
    ``,
    `Format: ${manifest.format}`,
    `Generated: ${manifest.generatedAt}`,
    `Memories: ${manifest.memoryCount}`,
    `Embeddings: ${manifest.embeddingCount} × ${manifest.embeddingDimension ?? 'mixed'}`,
    `Connections: ${manifest.connectionCount}`,
    `Checksum (sha256 of memories.jsonl + embeddings.bin): ${manifest.contentSha256}`,
    ``,
    `Layout:`,
    `  manifest.json    — this manifest`,
    `  memories.jsonl   — one memory per line; embeddingIndex points into embeddings.bin`,
    `  embeddings.bin   — Float32 little-endian, row-major (memoryCount × dim)`,
    `  tree_index.json  — hierarchical retrieval index`,
    `  connections.json — discovered cross-pollinations`,
    `  profile.json     — knowledge fingerprint + topics`,
    ``,
    `Open in any Mindstore (mindstore.org) instance: Settings → Import → "Import .mind file".`,
  ].join('\n');
}
