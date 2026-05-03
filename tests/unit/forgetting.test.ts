/**
 * Forgetting Curve scorer — pure decay invariants.
 * The DB-backed paths (recomputeRiskForUser, getAtRiskMemories,
 * recordMemoryReview) move into tests/api/ when the Postgres test
 * container helper lands.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/db', () => ({ db: { execute: vi.fn() } }));

import { computeRisk } from '@/server/forgetting/scorer';

describe('computeRisk (Ebbinghaus)', () => {
  it('returns near-zero risk for a memory just touched', () => {
    const { riskScore, recommendationPriority } = computeRisk({ daysSinceTouch: 0 });
    expect(riskScore).toBeLessThan(0.01);
    expect(recommendationPriority).toBe(1);
  });

  it('returns near-1 risk for a long-untouched memory', () => {
    const { riskScore, recommendationPriority } = computeRisk({ daysSinceTouch: 365 });
    expect(riskScore).toBeGreaterThan(0.99);
    expect(recommendationPriority).toBe(5);
  });

  it('crosses the ~63% retention mark right around the stability constant (~14 days)', () => {
    const { riskScore } = computeRisk({ daysSinceTouch: 14 });
    // R(14) = e^(-1) ≈ 0.368, so risk ≈ 0.632
    expect(riskScore).toBeCloseTo(0.632, 2);
  });

  it('reviewed memories with high ease decay slower', () => {
    const baseline = computeRisk({ daysSinceTouch: 14, easeFactor: 2.5, repetitions: 0 });
    const practiced = computeRisk({ daysSinceTouch: 14, easeFactor: 2.5, repetitions: 3 });
    expect(practiced.riskScore).toBeLessThan(baseline.riskScore);
  });

  it('higher easeFactor decays slower at the same days-since-touch', () => {
    const easy = computeRisk({ daysSinceTouch: 14, easeFactor: 3.0 });
    const hard = computeRisk({ daysSinceTouch: 14, easeFactor: 1.3 });
    expect(easy.riskScore).toBeLessThan(hard.riskScore);
  });

  it('priority bands cover the full risk range monotonically', () => {
    let lastPriority = 0;
    for (const days of [1, 5, 12, 21, 60, 200]) {
      const { recommendationPriority } = computeRisk({ daysSinceTouch: days });
      expect(recommendationPriority).toBeGreaterThanOrEqual(lastPriority);
      lastPriority = recommendationPriority;
    }
  });

  it('clamps non-finite or negative inputs to safe defaults', () => {
    const out = computeRisk({ daysSinceTouch: -100 as number });
    expect(out.riskScore).toBeGreaterThanOrEqual(0);
    expect(out.riskScore).toBeLessThanOrEqual(1);
  });
});
