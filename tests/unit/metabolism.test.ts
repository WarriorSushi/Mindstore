/**
 * Knowledge Metabolism Score — pure scoring invariants.
 * The DB-touching paths (loadWeeklyAggregates, computeAndPersistScore,
 * getCurrentScore, getScoreHistory) are integration territory and live
 * in tests/api/ (Phase 1+ deliverable). Here we lock the math.
 */
import { describe, expect, it, vi } from 'vitest';

// Stub the DB module so the calc module's imports resolve without a live
// connection — the pure scoring function we test never reaches DB anyway.
vi.mock('@/server/db', () => ({ db: { execute: vi.fn() } }));

import { scoreFromAggregates, startOfWeekUtc } from '@/server/metabolism/calc';

describe('scoreFromAggregates', () => {
  const baseline = {
    thisWeekMemories: 0,
    lastWeekMemories: 0,
    trailingAverageMemories: 0,
    totalMemories: 0,
    totalConnections: 0,
    searches: 0,
    chats: 0,
  };

  it('returns score 0 with all-zero aggregates (no activity, no division by zero)', () => {
    const { score, components } = scoreFromAggregates(baseline);
    expect(score).toBe(0);
    expect(components).toEqual({
      intakeRate: 0,
      connectionDensity: 0,
      retrievalFrequency: 0,
      growthVelocity: 0,
    });
  });

  it('caps every component at 1 even with extreme inputs', () => {
    const { components } = scoreFromAggregates({
      thisWeekMemories: 9999,
      lastWeekMemories: 1,
      trailingAverageMemories: 0.0001,
      totalMemories: 10,
      totalConnections: 9999,
      searches: 9999,
      chats: 9999,
    });
    expect(components.intakeRate).toBe(1);
    expect(components.connectionDensity).toBe(1);
    expect(components.retrievalFrequency).toBe(1);
    expect(components.growthVelocity).toBe(1);
  });

  it('caps the overall score at 10', () => {
    const { score } = scoreFromAggregates({
      thisWeekMemories: 100,
      lastWeekMemories: 10,
      trailingAverageMemories: 50,
      totalMemories: 100,
      totalConnections: 100,
      searches: 50,
      chats: 50,
    });
    expect(score).toBeLessThanOrEqual(10);
  });

  it('rewards activity proportionally — typical-engaged-user scenario', () => {
    // 8 memories this week vs 6/week trailing average.
    // 1 connection per memory (density = 0.2 unscaled, scaled to 1.0)
    // 7 retrieval events (4 searches + 3 chats) — half the cap
    // Memories grew from 7 last week to 8 this week — slight growth.
    const { score, components } = scoreFromAggregates({
      thisWeekMemories: 8,
      lastWeekMemories: 7,
      trailingAverageMemories: 6,
      totalMemories: 50,
      totalConnections: 10,
      searches: 4,
      chats: 3,
    });
    expect(components.intakeRate).toBeCloseTo(1.0, 2); // 8/6 caps to 1
    expect(components.connectionDensity).toBeCloseTo(1.0, 2); // 10/50*5 caps to 1
    expect(components.retrievalFrequency).toBeCloseTo(0.5, 2); // 7/14
    expect(components.growthVelocity).toBeCloseTo(8 / 7 - 1, 2);
    expect(score).toBeGreaterThan(6);
    expect(score).toBeLessThan(8);
  });

  it('zero growth from a positive baseline scores 0 on growthVelocity, not 1', () => {
    const { components } = scoreFromAggregates({
      ...baseline,
      thisWeekMemories: 5,
      lastWeekMemories: 5,
    });
    expect(components.growthVelocity).toBe(0); // (5-5)/5 = 0
  });

  it('first-ever memories week scores 1 on growthVelocity (no last-week baseline)', () => {
    const { components } = scoreFromAggregates({
      ...baseline,
      thisWeekMemories: 3,
      lastWeekMemories: 0,
    });
    expect(components.growthVelocity).toBe(1);
  });

  it('declining activity does not produce negative growthVelocity', () => {
    const { components } = scoreFromAggregates({
      ...baseline,
      thisWeekMemories: 2,
      lastWeekMemories: 10,
    });
    expect(components.growthVelocity).toBe(0); // clamped at 0
  });

  it('weights match the documented 40/20/20/20 mix', () => {
    // All components at 1.0 should hit the score cap at 10.
    const { score } = scoreFromAggregates({
      ...baseline,
      thisWeekMemories: 100,
      lastWeekMemories: 1,
      trailingAverageMemories: 1,
      totalMemories: 1,
      totalConnections: 1, // density: 1/1*5 = 5, caps to 1
      searches: 14,
      chats: 0,
    });
    expect(score).toBeCloseTo(10, 1);
  });
});

describe('startOfWeekUtc', () => {
  it('snaps to Sunday 00:00 UTC for any time in the week', () => {
    // Wed 2026-05-06T14:30 UTC -> Sun 2026-05-03T00:00 UTC
    const at = new Date(Date.UTC(2026, 4, 6, 14, 30, 0));
    const start = startOfWeekUtc(at);
    expect(start.getUTCDay()).toBe(0);
    expect(start.toISOString()).toBe('2026-05-03T00:00:00.000Z');
  });

  it('is idempotent — passing a Sunday returns the same Sunday', () => {
    const sun = new Date(Date.UTC(2026, 4, 3, 0, 0, 0));
    expect(startOfWeekUtc(sun).toISOString()).toBe(sun.toISOString());
  });

  it('handles month boundaries correctly', () => {
    // 2026-06-02 is a Tue. Week-start should land in May.
    const tue = new Date(Date.UTC(2026, 5, 2, 12, 0, 0));
    const start = startOfWeekUtc(tue);
    expect(start.toISOString()).toBe('2026-05-31T00:00:00.000Z');
  });
});
