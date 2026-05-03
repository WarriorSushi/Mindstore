/**
 * Mind Diff — pure delta invariants. computeMindDiff() reads from the
 * DB and is integration territory; here we lock the diffSources,
 * diffTopics, and synthesizeNarrative behaviors.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/db', () => ({ db: { execute: vi.fn() } }));
vi.mock('@/server/fingerprint/snapshot', () => ({ getSnapshotById: vi.fn() }));

import { diffSources, diffTopics, synthesizeNarrative } from '@/server/mind-diff/compare';

describe('diffSources', () => {
  it('flags brand-new sources as new', () => {
    const out = diffSources({ chatgpt: 50 }, { chatgpt: 50, kindle: 12 });
    expect(out.new.map((s) => s.source)).toEqual(['kindle']);
    expect(out.abandoned).toEqual([]);
  });

  it('flags vanished sources as abandoned', () => {
    const out = diffSources({ chatgpt: 50, twitter: 8 }, { chatgpt: 50 });
    expect(out.abandoned.map((s) => s.source)).toEqual(['twitter']);
  });

  it('classifies +50% growth as deepened', () => {
    const out = diffSources({ obsidian: 10 }, { obsidian: 16 });
    expect(out.deepened.map((s) => s.source)).toEqual(['obsidian']);
  });

  it('classifies -50% loss as shrunk', () => {
    const out = diffSources({ kindle: 20 }, { kindle: 9 });
    expect(out.shrunk.map((s) => s.source)).toEqual(['kindle']);
  });

  it('keeps modest changes in stable bucket', () => {
    const out = diffSources({ chatgpt: 100 }, { chatgpt: 110 });
    expect(out.stable.map((s) => s.source)).toEqual(['chatgpt']);
  });
});

describe('diffTopics', () => {
  it('detects new and abandoned topics', () => {
    const before = [{ topic: 'A', count: 3 }, { topic: 'B', count: 2 }];
    const after = [{ topic: 'A', count: 3 }, { topic: 'C', count: 4 }];
    const out = diffTopics(before, after);
    expect(out.new.map((t) => t.topic)).toEqual(['C']);
    expect(out.abandoned.map((t) => t.topic)).toEqual(['B']);
  });

  it('detects rising topics by rank shift', () => {
    const before = [
      { topic: 'A', count: 5 }, { topic: 'B', count: 4 }, { topic: 'C', count: 1 },
    ];
    const after = [
      { topic: 'C', count: 6 }, { topic: 'A', count: 5 }, { topic: 'B', count: 4 },
    ];
    const out = diffTopics(before, after);
    expect(out.rising.map((t) => t.topic)).toContain('C');
  });

  it('detects falling topics by rank shift', () => {
    const before = [
      { topic: 'A', count: 5 }, { topic: 'B', count: 4 }, { topic: 'C', count: 3 },
    ];
    const after = [
      { topic: 'B', count: 4 }, { topic: 'C', count: 3 }, { topic: 'A', count: 1 },
    ];
    const out = diffTopics(before, after);
    expect(out.falling.map((t) => t.topic)).toContain('A');
  });
});

describe('synthesizeNarrative', () => {
  const emptyBuckets = {
    sources: { new: [], abandoned: [], deepened: [], shrunk: [], stable: [] },
    topics: { new: [], abandoned: [], rising: [], falling: [] },
    contradictionsAdded: 0,
  };

  it('describes a stable week with no movement', () => {
    const text = synthesizeNarrative({
      daysSpan: 7,
      memoryDelta: 0,
      memoryPct: 0,
      ...emptyBuckets,
    });
    expect(text).toMatch(/steady/i);
  });

  it('mentions deepened sources by name', () => {
    const text = synthesizeNarrative({
      daysSpan: 30,
      memoryDelta: 20,
      memoryPct: 25,
      ...emptyBuckets,
      sources: {
        new: [], abandoned: [], shrunk: [], stable: [],
        deepened: [{ source: 'obsidian', before: 10, after: 25, delta: 15, pct: 150 }],
      },
    });
    expect(text).toMatch(/Obsidian deepened/i);
    expect(text).toMatch(/\+150%/);
  });

  it('mentions contradiction count when non-zero', () => {
    const text = synthesizeNarrative({
      daysSpan: 14,
      memoryDelta: 5,
      memoryPct: 5,
      ...emptyBuckets,
      contradictionsAdded: 3,
    });
    expect(text).toMatch(/3 contradictions/);
  });
});
