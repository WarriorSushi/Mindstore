/**
 * .mind file round-trip + rejection invariants. The writer queries the
 * DB directly and the merger inserts; here we mock @/server/db so tests
 * stay unit-scoped. The reader is pure and is exercised end-to-end via
 * the round-trip.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

vi.mock('@/server/db', () => ({ db: { execute: vi.fn() } }));

import { db } from '@/server/db';
import { buildMindFile, MIND_FILE_FORMAT_VERSION } from '@/server/mind-file/writer';
import { parseMindFile, MindFileError } from '@/server/mind-file/reader';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

function makeMemoryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    content: 'first memory',
    embedding: '[0.1,0.2,0.3]',
    content_type: 'text',
    source_type: 'manual',
    source_id: null,
    source_title: 'Note A',
    metadata: { tag: 'a' },
    parent_id: null,
    tree_path: null,
    created_at: new Date('2026-04-01T00:00:00Z'),
    imported_at: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  };
}

function mockDbForExport(memories: unknown[], tree: unknown[] = [], conns: unknown[] = [], profile: unknown[] = []) {
  vi.mocked(db.execute)
    .mockResolvedValueOnce(memories as never)
    .mockResolvedValueOnce(tree as never)
    .mockResolvedValueOnce(conns as never)
    .mockResolvedValueOnce(profile as never);
}

afterEach(() => {
  vi.mocked(db.execute).mockReset();
});

describe('buildMindFile + parseMindFile round-trip', () => {
  it('round-trips a memory with its embedding', async () => {
    mockDbForExport([
      makeMemoryRow({ id: '11111111-1111-1111-1111-111111111111', content: 'first', embedding: '[0.1,0.2,0.3]' }),
      makeMemoryRow({ id: '22222222-2222-2222-2222-222222222222', content: 'second', embedding: '[0.4,0.5,0.6]' }),
    ]);

    const { bytes, manifest } = await buildMindFile(TEST_USER_ID, { label: 'snapshot test' });

    expect(manifest.format).toBe(MIND_FILE_FORMAT_VERSION);
    expect(manifest.memoryCount).toBe(2);
    expect(manifest.embeddingCount).toBe(2);
    expect(manifest.embeddingDimension).toBe(3);
    expect(manifest.label).toBe('snapshot test');

    const parsed = await parseMindFile(bytes);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.manifest.contentSha256).toBe(manifest.contentSha256);
    expect(parsed.memories).toHaveLength(2);
    expect(parsed.memories[0].content).toBe('first');
    expect(parsed.memories[1].content).toBe('second');

    // Float32 round-trip introduces tiny precision drift; tolerate it.
    expect(parsed.memories[0].embedding).not.toBeNull();
    expect(parsed.memories[0].embedding!).toHaveLength(3);
    expect(parsed.memories[0].embedding![0]).toBeCloseTo(0.1, 5);
    expect(parsed.memories[0].embedding![1]).toBeCloseTo(0.2, 5);
    expect(parsed.memories[0].embedding![2]).toBeCloseTo(0.3, 5);
  });

  it('handles a memory with no embedding (null embeddingIndex)', async () => {
    mockDbForExport([
      makeMemoryRow({ embedding: null, content: 'no vector here' }),
    ]);

    const { bytes, manifest } = await buildMindFile(TEST_USER_ID);
    expect(manifest.memoryCount).toBe(1);
    expect(manifest.embeddingCount).toBe(0);
    expect(manifest.embeddingDimension).toBeNull();

    const parsed = await parseMindFile(bytes);
    expect(parsed.memories).toHaveLength(1);
    expect(parsed.memories[0].embedding).toBeNull();
  });

  it('skips embeddings of off-dimension rather than corrupting the bin', async () => {
    // First row sets dim=3; second is 4-dim and must fall back to no embedding.
    mockDbForExport([
      makeMemoryRow({ id: '11111111-1111-1111-1111-111111111111', embedding: '[0.1,0.2,0.3]' }),
      makeMemoryRow({ id: '22222222-2222-2222-2222-222222222222', embedding: '[0.4,0.5,0.6,0.7]' }),
    ]);

    const { bytes, manifest } = await buildMindFile(TEST_USER_ID);
    expect(manifest.embeddingCount).toBe(1);
    expect(manifest.embeddingDimension).toBe(3);

    const parsed = await parseMindFile(bytes);
    expect(parsed.memories[0].embedding).not.toBeNull();
    expect(parsed.memories[1].embedding).toBeNull();
  });

  it('produces an empty bin and no embedding dim for an empty knowledge base', async () => {
    mockDbForExport([]);
    const { bytes, manifest } = await buildMindFile(TEST_USER_ID);
    expect(manifest.memoryCount).toBe(0);
    expect(manifest.embeddingCount).toBe(0);

    const parsed = await parseMindFile(bytes);
    expect(parsed.memories).toEqual([]);
    expect(parsed.warnings).toEqual([]);
  });

  it('caps a long label to 200 chars', async () => {
    mockDbForExport([]);
    const longLabel = 'x'.repeat(500);
    const { manifest } = await buildMindFile(TEST_USER_ID, { label: longLabel });
    expect(manifest.label.length).toBe(200);
  });
});

describe('parseMindFile rejection invariants', () => {
  it('rejects bytes that are not a ZIP', async () => {
    const notAZip = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    await expect(parseMindFile(notAZip)).rejects.toBeInstanceOf(MindFileError);
  });

  it('rejects a ZIP missing manifest.json', async () => {
    const zip = new JSZip();
    zip.file('memories.jsonl', '');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    await expect(parseMindFile(bytes)).rejects.toThrow(/manifest.json missing/);
  });

  it('rejects a manifest with an unknown format prefix', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ format: 'someother/1.0' }));
    zip.file('memories.jsonl', '');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    await expect(parseMindFile(bytes)).rejects.toThrow(/Unknown .mind format/);
  });

  it('warns (not rejects) on checksum mismatch — file edited after export', async () => {
    mockDbForExport([makeMemoryRow({ content: 'genuine' })]);
    const { bytes } = await buildMindFile(TEST_USER_ID);

    // Tamper: replace memories.jsonl with edited content but keep the
    // original manifest's checksum value. parseMindFile should warn,
    // not reject — the user can still inspect the file.
    const zip = await JSZip.loadAsync(bytes);
    zip.file('memories.jsonl', JSON.stringify({
      id: 'tampered',
      content: 'tampered',
      contentType: 'text',
      sourceType: 'manual',
      sourceId: null,
      sourceTitle: null,
      metadata: {},
      parentId: null,
      treePath: null,
      createdAt: null,
      importedAt: null,
      embeddingIndex: null,
    }));
    const tampered = await zip.generateAsync({ type: 'uint8array' });

    const parsed = await parseMindFile(tampered);
    expect(parsed.warnings.some((w) => w.includes('checksum mismatch'))).toBe(true);
    expect(parsed.memories).toHaveLength(1);
    expect(parsed.memories[0].content).toBe('tampered');
  });

  it('skips malformed JSONL lines with a warning', async () => {
    const zip = new JSZip();
    const goodLine = JSON.stringify({
      id: 'a', content: 'good', contentType: 'text', sourceType: 'manual',
      sourceId: null, sourceTitle: null, metadata: {}, parentId: null,
      treePath: null, createdAt: null, importedAt: null, embeddingIndex: null,
    });
    zip.file('manifest.json', JSON.stringify({
      format: MIND_FILE_FORMAT_VERSION,
      generatedAt: '2026-04-01T00:00:00Z',
      generatorVersion: 'test',
      label: 'test',
      memoryCount: 1,
      embeddingCount: 0,
      embeddingDimension: null,
      connectionCount: 0,
      treeNodeCount: 0,
      contentSha256: '',
    }));
    zip.file('memories.jsonl', `${goodLine}\n{not json at all\n`);
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const parsed = await parseMindFile(bytes);
    expect(parsed.memories).toHaveLength(1);
    expect(parsed.memories[0].content).toBe('good');
    expect(parsed.warnings.some((w) => w.includes('malformed memory line'))).toBe(true);
  });
});
