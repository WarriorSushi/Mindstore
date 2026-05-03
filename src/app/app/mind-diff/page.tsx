'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { GitBranch, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { usePageTitle } from '@/lib/use-page-title';
import { PageTransition, Stagger } from '@/components/PageTransition';
import { EmptyFeatureState } from '@/components/EmptyFeatureState';

interface SnapshotSummary {
  id: string;
  takenAt: string;
  memoryCount: number;
}

interface MindDiffResponse {
  fromId: string;
  toId: string;
  fromTakenAt: string;
  toTakenAt: string;
  daysSpan: number;
  memoriesBefore: number;
  memoriesAfter: number;
  memoryDelta: number;
  memoryPct: number;
  sources: {
    new: Array<{ source: string; before: number; after: number; delta: number; pct: number }>;
    abandoned: Array<{ source: string; before: number; after: number; delta: number; pct: number }>;
    deepened: Array<{ source: string; before: number; after: number; delta: number; pct: number }>;
    shrunk: Array<{ source: string; before: number; after: number; delta: number; pct: number }>;
    stable: Array<{ source: string; before: number; after: number; delta: number; pct: number }>;
  };
  topics: {
    new: Array<{ topic: string; before: number; after: number }>;
    abandoned: Array<{ topic: string; before: number; after: number }>;
    rising: Array<{ topic: string; before: number; after: number }>;
    falling: Array<{ topic: string; before: number; after: number }>;
  };
  contradictionsAdded: number;
  narrative: string;
}

export default function MindDiffPage() {
  usePageTitle('Mind Diff');

  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null>(null);
  const [fromId, setFromId] = useState<string>('');
  const [toId, setToId] = useState<string>('');
  const [diff, setDiff] = useState<MindDiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [diffing, setDiffing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/fingerprint/snapshots?limit=24');
        if (!res.ok) throw new Error(`Failed to load snapshots (${res.status})`);
        const data = (await res.json()) as { snapshots: SnapshotSummary[] };
        setSnapshots(data.snapshots ?? []);
        // Default selection: oldest in left, newest in right.
        if ((data.snapshots ?? []).length >= 2) {
          const sorted = [...data.snapshots].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
          setFromId(sorted[0].id);
          setToId(sorted[sorted.length - 1].id);
        }
      } catch (e) {
        toast.error('Could not load snapshots', { description: e instanceof Error ? e.message : 'Unknown' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const runDiff = async () => {
    if (!fromId || !toId) return;
    setDiffing(true);
    setDiff(null);
    try {
      const res = await fetch(`/api/v1/mind-diff?from=${fromId}&to=${toId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      setDiff((await res.json()) as MindDiffResponse);
    } catch (e) {
      toast.error('Could not compute diff', { description: e instanceof Error ? e.message : 'Unknown' });
    } finally {
      setDiffing(false);
    }
  };

  const sortedSnapshots = useMemo(() => {
    if (!snapshots) return [];
    return [...snapshots].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  }, [snapshots]);

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Stagger>
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">Mind Diff</h1>
            <p className="text-[13px] text-zinc-500 mt-1">
              Compare your knowledge state at two points in time. New topics, abandoned ones, and what deepened.
            </p>
          </div>
        </Stagger>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
          </div>
        )}

        {!loading && snapshots && snapshots.length < 2 && (
          <EmptyFeatureState
            icon={GitBranch}
            title="You need two snapshots to compare"
            description={`You currently have ${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'}. Take one now and another in a week, then come back to see what shifted.`}
            ctaText="Open Fingerprint →"
            ctaHref="/app/fingerprint"
          />
        )}

        {!loading && sortedSnapshots.length >= 2 && (
          <>
            <Stagger>
              <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="flex-1 bg-transparent text-[13px] text-zinc-200 border border-white/[0.06] rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500/30"
                  aria-label="From snapshot"
                >
                  {sortedSnapshots.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#0a0a0b]">
                      {new Date(s.takenAt).toLocaleString()} ({s.memoryCount} memories)
                    </option>
                  ))}
                </select>
                <ArrowRight className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="flex-1 bg-transparent text-[13px] text-zinc-200 border border-white/[0.06] rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500/30"
                  aria-label="To snapshot"
                >
                  {sortedSnapshots.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#0a0a0b]">
                      {new Date(s.takenAt).toLocaleString()} ({s.memoryCount} memories)
                    </option>
                  ))}
                </select>
                <button
                  onClick={runDiff}
                  disabled={diffing || !fromId || !toId || fromId === toId}
                  className="px-4 py-2 rounded-lg border border-teal-500/30 bg-teal-500/[0.08] text-teal-300 text-[12px] hover:bg-teal-500/[0.12] transition-all active:scale-[0.97] disabled:opacity-40"
                >
                  {diffing ? 'Computing…' : 'Compare'}
                </button>
              </div>
            </Stagger>

            {diff && (
              <Stagger>
                {/* Narrative */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <p className="text-[12px] uppercase tracking-wide text-zinc-500 mb-2">Summary</p>
                  <p className="text-[14px] text-zinc-200 leading-relaxed">{diff.narrative}</p>
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <Stat label="Memories before" value={diff.memoriesBefore} />
                    <Stat label="Memories after" value={diff.memoriesAfter} />
                    <Stat label="Δ" value={(diff.memoryDelta >= 0 ? '+' : '') + diff.memoryDelta} />
                  </div>
                </div>

                {/* Sources */}
                <DiffBucket title="New sources" items={diff.sources.new} fmt={(s) => `${s.source} (+${s.delta})`} />
                <DiffBucket title="Deepened sources" items={diff.sources.deepened} fmt={(s) => `${s.source}: ${s.before} → ${s.after} (+${Math.round(s.pct)}%)`} />
                <DiffBucket title="Shrunk sources" items={diff.sources.shrunk} fmt={(s) => `${s.source}: ${s.before} → ${s.after} (${Math.round(s.pct)}%)`} />
                <DiffBucket title="Abandoned sources" items={diff.sources.abandoned} fmt={(s) => `${s.source} (lost ${Math.abs(s.delta)})`} />

                {/* Topics */}
                <DiffBucket title="Rising topics" items={diff.topics.rising} fmt={(t) => `"${t.topic}": ${t.before} → ${t.after}`} />
                <DiffBucket title="Falling topics" items={diff.topics.falling} fmt={(t) => `"${t.topic}": ${t.before} → ${t.after}`} />
                <DiffBucket title="New topics" items={diff.topics.new} fmt={(t) => `"${t.topic}" (${t.after})`} />
                <DiffBucket title="Abandoned topics" items={diff.topics.abandoned} fmt={(t) => `"${t.topic}" (was ${t.before})`} />

                {diff.contradictionsAdded > 0 && (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4 text-[13px] text-amber-200">
                    {diff.contradictionsAdded} contradiction{diff.contradictionsAdded === 1 ? '' : 's'} surfaced between these snapshots.{' '}
                    <Link href="/app/insights" className="underline">View in insights</Link>.
                  </div>
                )}
              </Stagger>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-[20px] font-semibold text-zinc-200">{value}</div>
      <div className="text-[11px] text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}

function DiffBucket<T>({ title, items, fmt }: { title: string; items: T[]; fmt: (item: T) => string }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <h3 className="text-[12px] uppercase tracking-wide text-zinc-500 mb-3">{title}</h3>
      <ul className="space-y-1.5">
        {items.slice(0, 8).map((item, i) => (
          <li key={i} className="text-[13px] text-zinc-300">{fmt(item)}</li>
        ))}
      </ul>
      {items.length > 8 && (
        <p className="text-[11px] text-zinc-600 mt-3">… and {items.length - 8} more</p>
      )}
    </div>
  );
}
