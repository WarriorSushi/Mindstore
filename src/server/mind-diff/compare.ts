/**
 * Mind Diff — Phase 2 (innovation A.5).
 *
 * Compares two `mind_snapshots` rows and produces a structured delta:
 *   - Memory-count change.
 *   - New / abandoned / deepened / shrunk source clusters.
 *   - New / abandoned topics.
 *   - Top topic shifts (which topics moved up or down the rankings).
 *   - A short narrative ("In this 6 weeks, your knowledge grew 18%
 *     and your obsidian cluster doubled while ChatGPT cooled off")
 *     synthesized from the deltas.
 *
 * Pure DB read; the narrative is generated from the deltas with simple
 * heuristics, not an LLM call. A later iteration can swap in an LLM
 * for a richer narrative — the function is the seam.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { getSnapshotById, type SnapshotDetail } from '@/server/fingerprint/snapshot';

export interface SourceDelta {
  source: string;
  before: number;
  after: number;
  delta: number;
  pct: number; // signed percentage change; null when before === 0 → 100% if after > 0
}

export interface TopicDelta {
  topic: string;
  before: number;
  after: number;
  rankBefore: number | null;
  rankAfter: number | null;
}

export interface MindDiff {
  fromId: string;
  toId: string;
  fromTakenAt: Date;
  toTakenAt: Date;
  daysSpan: number;
  memoriesBefore: number;
  memoriesAfter: number;
  memoryDelta: number;
  memoryPct: number;
  sources: {
    new: SourceDelta[];
    abandoned: SourceDelta[];
    deepened: SourceDelta[]; // grew by >=50%
    shrunk: SourceDelta[];   // shrunk by >=50%
    stable: SourceDelta[];
  };
  topics: {
    new: TopicDelta[];
    abandoned: TopicDelta[];
    rising: TopicDelta[]; // moved up >= 2 positions or +3 count
    falling: TopicDelta[];
  };
  contradictionsAdded: number;
  narrative: string;
}

/**
 * Compute a Mind Diff from two snapshot IDs. Snapshots must belong to
 * the same `userId`; the function rejects mixed pairs.
 */
export async function computeMindDiff(
  userId: string,
  fromId: string,
  toId: string,
): Promise<MindDiff | null> {
  const [from, to] = await Promise.all([
    getSnapshotById(userId, fromId),
    getSnapshotById(userId, toId),
  ]);

  if (!from || !to) return null;
  if (from.id === to.id) return null;

  // The "from" must be earlier in time than "to"; otherwise swap so the
  // narrative flows forward.
  const [a, b] = from.takenAt.getTime() <= to.takenAt.getTime()
    ? [from, to]
    : [to, from];

  const sources = diffSources(a.sourceBreakdown, b.sourceBreakdown);
  const topics = diffTopics(a.topTopics, b.topTopics);
  const memoryDelta = b.memoryCount - a.memoryCount;
  const memoryPct = a.memoryCount > 0 ? (memoryDelta / a.memoryCount) * 100 : (b.memoryCount > 0 ? 100 : 0);

  const daysSpan = Math.max(0, Math.round((b.takenAt.getTime() - a.takenAt.getTime()) / 86400000));

  // Contradictions discovered between the two snapshots' timestamps.
  const [contradictionsRow] = (await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM contradictions
    WHERE user_id = ${userId}::uuid
      AND detected_at >= ${a.takenAt}
      AND detected_at < ${b.takenAt}
  `)) as Array<{ count: number }>;

  const narrative = synthesizeNarrative({
    daysSpan,
    memoryDelta,
    memoryPct,
    sources,
    topics,
    contradictionsAdded: contradictionsRow?.count ?? 0,
  });

  return {
    fromId: a.id,
    toId: b.id,
    fromTakenAt: a.takenAt,
    toTakenAt: b.takenAt,
    daysSpan,
    memoriesBefore: a.memoryCount,
    memoriesAfter: b.memoryCount,
    memoryDelta,
    memoryPct,
    sources,
    topics,
    contradictionsAdded: contradictionsRow?.count ?? 0,
    narrative,
  };
}

export function diffSources(
  before: Record<string, number>,
  after: Record<string, number>,
): MindDiff['sources'] {
  const sources = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  const out: MindDiff['sources'] = {
    new: [], abandoned: [], deepened: [], shrunk: [], stable: [],
  };

  for (const source of sources) {
    const b = before[source] ?? 0;
    const a = after[source] ?? 0;
    const delta = a - b;
    const pct = b > 0 ? (delta / b) * 100 : (a > 0 ? 100 : 0);
    const entry: SourceDelta = { source, before: b, after: a, delta, pct };

    if (b === 0 && a > 0) out.new.push(entry);
    else if (a === 0 && b > 0) out.abandoned.push(entry);
    else if (b > 0 && pct >= 50) out.deepened.push(entry);
    else if (b > 0 && pct <= -50) out.shrunk.push(entry);
    else out.stable.push(entry);
  }

  // Sort the "interesting" buckets by absolute delta so the UI shows the biggest movers first.
  for (const key of ['new', 'abandoned', 'deepened', 'shrunk'] as const) {
    out[key].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  }
  return out;
}

export function diffTopics(
  before: Array<{ topic: string; count: number }>,
  after: Array<{ topic: string; count: number }>,
): MindDiff['topics'] {
  const beforeMap = new Map(before.map((t, i) => [t.topic, { count: t.count, rank: i + 1 }]));
  const afterMap = new Map(after.map((t, i) => [t.topic, { count: t.count, rank: i + 1 }]));

  const out: MindDiff['topics'] = { new: [], abandoned: [], rising: [], falling: [] };
  const all = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);

  for (const topic of all) {
    const b = beforeMap.get(topic);
    const a = afterMap.get(topic);
    const entry: TopicDelta = {
      topic,
      before: b?.count ?? 0,
      after: a?.count ?? 0,
      rankBefore: b?.rank ?? null,
      rankAfter: a?.rank ?? null,
    };

    if (!b && a) {
      out.new.push(entry);
      continue;
    }
    if (b && !a) {
      out.abandoned.push(entry);
      continue;
    }
    if (b && a) {
      const rankDelta = (b.rank ?? 0) - (a.rank ?? 0); // positive = moved up
      const countDelta = a.count - b.count;
      if (rankDelta >= 2 || countDelta >= 3) out.rising.push(entry);
      else if (rankDelta <= -2 || countDelta <= -3) out.falling.push(entry);
    }
  }

  // Sort topics by rank shift / count delta.
  out.rising.sort((x, y) => (y.after - y.before) - (x.after - x.before));
  out.falling.sort((x, y) => (x.after - x.before) - (y.after - y.before));
  return out;
}

export function synthesizeNarrative(input: {
  daysSpan: number;
  memoryDelta: number;
  memoryPct: number;
  sources: MindDiff['sources'];
  topics: MindDiff['topics'];
  contradictionsAdded: number;
}): string {
  const parts: string[] = [];
  const span = input.daysSpan === 0 ? 'today' :
    input.daysSpan === 1 ? 'in the last day' :
    input.daysSpan < 14 ? `in the last ${input.daysSpan} days` :
    input.daysSpan < 60 ? `over ${Math.round(input.daysSpan / 7)} weeks` :
    `over ${Math.round(input.daysSpan / 30)} months`;

  if (input.memoryDelta > 0) {
    parts.push(`You added ${input.memoryDelta} memories (${formatPct(input.memoryPct)}) ${span}.`);
  } else if (input.memoryDelta < 0) {
    parts.push(`You pruned ${Math.abs(input.memoryDelta)} memories ${span}.`);
  } else {
    parts.push(`Memory count was steady ${span}.`);
  }

  if (input.sources.new.length > 0) {
    const names = input.sources.new.slice(0, 3).map((s) => s.source).join(', ');
    parts.push(`New sources: ${names}.`);
  }
  if (input.sources.deepened.length > 0) {
    const top = input.sources.deepened[0];
    parts.push(`${capitalize(top.source)} deepened by ${formatPct(top.pct)} (${top.before} → ${top.after}).`);
  }
  if (input.sources.abandoned.length > 0) {
    const names = input.sources.abandoned.slice(0, 2).map((s) => s.source).join(', ');
    parts.push(`Abandoned: ${names}.`);
  }
  if (input.topics.rising.length > 0) {
    const top = input.topics.rising[0];
    parts.push(`Rising topic: "${top.topic}".`);
  }
  if (input.topics.new.length > 0 && input.topics.new.length !== input.sources.new.length) {
    parts.push(`${input.topics.new.length} new topic${input.topics.new.length === 1 ? '' : 's'} appeared.`);
  }
  if (input.contradictionsAdded > 0) {
    parts.push(`${input.contradictionsAdded} contradiction${input.contradictionsAdded === 1 ? '' : 's'} surfaced in this window.`);
  }

  return parts.join(' ');
}

function formatPct(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${Math.round(pct)}%`;
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
