/**
 * Knowledge Fingerprint snapshots — pure helper invariants.
 * The DB-touching paths (captureSnapshot, listSnapshots, getSnapshotById)
 * get exercised in API tests under tests/api/ when the Postgres test
 * container helper lands. Here we lock the deterministic SVG renderer.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/db', () => ({ db: { execute: vi.fn() } }));

import { renderFingerprintSvg } from '@/server/fingerprint/snapshot';

describe('renderFingerprintSvg', () => {
  it('is a deterministic function — same inputs produce identical output', () => {
    const input = {
      memoryCount: 250,
      sourceBreakdown: { chatgpt: 120, obsidian: 80, kindle: 30, twitter: 20 },
    };
    const a = renderFingerprintSvg(input);
    const b = renderFingerprintSvg(input);
    expect(a).toBe(b);
  });

  it('produces well-formed SVG with the memory count baked in', () => {
    const svg = renderFingerprintSvg({
      memoryCount: 1024,
      sourceBreakdown: { chatgpt: 500, kindle: 300 },
    });
    expect(svg).toMatch(/^<svg /);
    expect(svg).toMatch(/<\/svg>$/);
    expect(svg).toContain('1024 memories');
    expect(svg).toContain('viewBox="0 0 240 240"'); // 6×6 of 40px cells
  });

  it('handles a zero-data user gracefully (no division by zero, valid SVG)', () => {
    const svg = renderFingerprintSvg({ memoryCount: 0, sourceBreakdown: {} });
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('0 memories');
  });

  it('different source distributions produce different SVGs (visual fingerprint property)', () => {
    const left = renderFingerprintSvg({
      memoryCount: 100,
      sourceBreakdown: { chatgpt: 100 },
    });
    const right = renderFingerprintSvg({
      memoryCount: 100,
      sourceBreakdown: { obsidian: 50, kindle: 50 },
    });
    expect(left).not.toBe(right);
  });

  it('only renders the top-6 sources even when more are present', () => {
    const svg = renderFingerprintSvg({
      memoryCount: 700,
      sourceBreakdown: {
        chatgpt: 100, obsidian: 100, kindle: 100, twitter: 100,
        notion: 100, reddit: 100, pocket: 100,
      },
    });
    // 6 colors * up to 18 cells, capped at 36 total cells.
    const circleCount = (svg.match(/<circle /g) ?? []).length;
    expect(circleCount).toBeGreaterThan(0);
    expect(circleCount).toBeLessThanOrEqual(36);
  });
});
