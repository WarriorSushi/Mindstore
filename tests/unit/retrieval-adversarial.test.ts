/**
 * Adversarial Retrieval — invariants of the contradiction-overlay logic.
 * The DB-touching `retrieve()` and `db.execute(contradictions)` calls are
 * mocked so we can pin the filter behavior without a live database.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { retrieveMock, dbExecuteMock } = vi.hoisted(() => ({
  retrieveMock: vi.fn(),
  dbExecuteMock: vi.fn(),
}));

vi.mock('@/server/retrieval', () => ({ retrieve: retrieveMock }));
vi.mock('@/server/db', () => ({ db: { execute: dbExecuteMock } }));

import { retrieveAdversarial } from '@/server/retrieval-adversarial';

const mem = (id: string) => ({
  memoryId: id,
  content: `body of ${id}`,
  sourceType: 'chatgpt',
  sourceTitle: `title-${id}`,
  score: 0.9,
  layers: { bm25: { rank: 1, score: 0.9 } },
  metadata: {},
  createdAt: new Date('2026-04-01T00:00:00Z'),
});

beforeEach(() => {
  retrieveMock.mockReset();
  dbExecuteMock.mockReset();
});

describe('retrieveAdversarial', () => {
  it('returns empty when nothing retrieves', async () => {
    retrieveMock.mockResolvedValue([]);
    const out = await retrieveAdversarial('test', null, { userId: 'u' });
    expect(out).toEqual([]);
    expect(dbExecuteMock).not.toHaveBeenCalled();
  });

  it('drops uncontradicted results by default', async () => {
    retrieveMock.mockResolvedValue([mem('m1'), mem('m2'), mem('m3')]);
    dbExecuteMock.mockResolvedValue([
      { memory_a_id: 'm1', memory_b_id: 'mX', topic: 'remote work', description: 'wat' },
    ]);
    const out = await retrieveAdversarial('q', null, { userId: 'u', limit: 10 });
    expect(out.length).toBe(1);
    expect(out[0].memoryId).toBe('m1');
    expect(out[0].opposingMemoryIds).toEqual(['mX']);
    expect(out[0].contradictionTopics).toEqual(['remote work']);
  });

  it('keeps uncontradicted results when keepUncontradicted is true', async () => {
    retrieveMock.mockResolvedValue([mem('m1'), mem('m2')]);
    dbExecuteMock.mockResolvedValue([
      { memory_a_id: 'm1', memory_b_id: 'mX', topic: 't', description: null },
    ]);
    const out = await retrieveAdversarial('q', null, { userId: 'u', limit: 10, keepUncontradicted: true });
    expect(out.length).toBe(2);
    expect(out[0].opposingMemoryIds).toEqual(['mX']);
    expect(out[1].opposingMemoryIds).toEqual([]);
  });

  it('handles symmetric contradictions (memory appears as either side of the pair)', async () => {
    retrieveMock.mockResolvedValue([mem('m1')]);
    dbExecuteMock.mockResolvedValue([
      { memory_a_id: 'm1', memory_b_id: 'mA', topic: 'a', description: null },
      { memory_a_id: 'mB', memory_b_id: 'm1', topic: 'b', description: null },
    ]);
    const out = await retrieveAdversarial('q', null, { userId: 'u' });
    expect(out[0].opposingMemoryIds.sort()).toEqual(['mA', 'mB']);
    expect(out[0].contradictionTopics.sort()).toEqual(['a', 'b']);
  });

  it('respects the `limit` parameter against the contradicted set', async () => {
    retrieveMock.mockResolvedValue(['m1', 'm2', 'm3', 'm4', 'm5'].map(mem));
    dbExecuteMock.mockResolvedValue([
      { memory_a_id: 'm1', memory_b_id: 'x', topic: null, description: null },
      { memory_a_id: 'm2', memory_b_id: 'y', topic: null, description: null },
      { memory_a_id: 'm3', memory_b_id: 'z', topic: null, description: null },
    ]);
    const out = await retrieveAdversarial('q', null, { userId: 'u', limit: 2 });
    expect(out.length).toBe(2);
  });
});
