/**
 * .mind file reader — Phase 4 (A.8).
 *
 * Parses a `.mind` ZIP back into the in-memory structures the import
 * pipeline can consume. Validates the format version and the content
 * checksum so a tampered file is detected early.
 */

import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { MIND_FILE_FORMAT_VERSION, type MindFileManifest } from './writer';

export interface ParsedMemory {
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
  embedding: number[] | null;
}

export interface ParsedMindFile {
  manifest: MindFileManifest;
  memories: ParsedMemory[];
  treeNodes: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
  profile: Array<Record<string, unknown>>;
  warnings: string[];
}

export class MindFileError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = 'MindFileError';
  }
}

export async function parseMindFile(bytes: Uint8Array): Promise<ParsedMindFile> {
  const zip = await JSZip.loadAsync(bytes).catch(() => {
    throw new MindFileError('File is not a valid .mind archive (not a ZIP)');
  });

  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) throw new MindFileError('manifest.json missing — not a .mind file');
  const manifest = JSON.parse(await manifestEntry.async('text')) as MindFileManifest;

  if (!manifest.format || !manifest.format.startsWith('mindstore.mind/')) {
    throw new MindFileError(`Unknown .mind format: ${manifest.format}`);
  }
  if (manifest.format !== MIND_FILE_FORMAT_VERSION) {
    // Forward-compat: warn but don't reject (we only know v1 today).
  }

  const memoriesEntry = zip.file('memories.jsonl');
  if (!memoriesEntry) throw new MindFileError('memories.jsonl missing');
  const memoriesText = await memoriesEntry.async('text');

  const embeddingsEntry = zip.file('embeddings.bin');
  const embeddingsBuffer = embeddingsEntry
    ? Buffer.from(await embeddingsEntry.async('uint8array'))
    : Buffer.alloc(0);

  const checksum = createHash('sha256');
  checksum.update(memoriesText);
  checksum.update(embeddingsBuffer);
  const computedChecksum = checksum.digest('hex');

  const warnings: string[] = [];
  if (manifest.contentSha256 && manifest.contentSha256 !== computedChecksum) {
    warnings.push(
      `Content checksum mismatch (expected ${manifest.contentSha256}, got ${computedChecksum}).` +
        ' The file may have been edited after export.',
    );
  }

  // Parse memories.jsonl line by line. Embeddings come from embeddings.bin
  // by index; missing or out-of-range indexes degrade to null embeddings.
  const memories: ParsedMemory[] = [];
  const lines = memoriesText.split('\n').filter((l) => l.trim().length > 0);
  const dim = manifest.embeddingDimension;

  for (const line of lines) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      warnings.push('Skipped a malformed memory line.');
      continue;
    }

    const embeddingIndex = parsed.embeddingIndex as number | null | undefined;
    let embedding: number[] | null = null;
    if (typeof embeddingIndex === 'number' && dim) {
      const offset = embeddingIndex * dim * 4;
      if (offset + dim * 4 <= embeddingsBuffer.length) {
        embedding = readEmbeddingAt(embeddingsBuffer, offset, dim);
      }
    }

    memories.push({
      id: String(parsed.id ?? ''),
      content: String(parsed.content ?? ''),
      contentType: String(parsed.contentType ?? 'text'),
      sourceType: String(parsed.sourceType ?? 'mind-file'),
      sourceId: (parsed.sourceId as string | null) ?? null,
      sourceTitle: (parsed.sourceTitle as string | null) ?? null,
      metadata: (parsed.metadata as Record<string, unknown>) ?? {},
      parentId: (parsed.parentId as string | null) ?? null,
      treePath: (parsed.treePath as string | null) ?? null,
      createdAt: (parsed.createdAt as string | null) ?? null,
      importedAt: (parsed.importedAt as string | null) ?? null,
      embedding,
    });
  }

  const tree = await readJsonOrEmpty(zip, 'tree_index.json');
  const connections = await readJsonOrEmpty(zip, 'connections.json');
  const profile = await readJsonOrEmpty(zip, 'profile.json');

  return {
    manifest,
    memories,
    treeNodes: Array.isArray(tree) ? (tree as Array<Record<string, unknown>>) : [],
    connections: Array.isArray(connections) ? (connections as Array<Record<string, unknown>>) : [],
    profile: Array.isArray(profile) ? (profile as Array<Record<string, unknown>>) : [],
    warnings,
  };
}

function readEmbeddingAt(buf: Buffer, offset: number, dim: number): number[] {
  const out: number[] = new Array(dim);
  for (let i = 0; i < dim; i++) {
    out[i] = buf.readFloatLE(offset + i * 4);
  }
  return out;
}

async function readJsonOrEmpty(zip: JSZip, name: string): Promise<unknown> {
  const entry = zip.file(name);
  if (!entry) return [];
  try {
    return JSON.parse(await entry.async('text'));
  } catch {
    return [];
  }
}
