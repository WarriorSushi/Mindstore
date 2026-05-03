'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, Loader2, RefreshCw, TrendingUp, Zap, Network as NetworkIcon, Target } from 'lucide-react';
import { toast } from 'sonner';
import { usePageTitle } from '@/lib/use-page-title';
import { PageTransition, Stagger } from '@/components/PageTransition';
import { EmptyFeatureState } from '@/components/EmptyFeatureState';

/**
 * Knowledge Metabolism — Phase 2 (FEATURE_BACKLOG.md A.9).
 * Shows a 0-10 weekly intellectual-fitness score with four components,
 * a 12-week sparkline of past scores, and tips per component.
 */

interface MetabolismResponse {
  weekStart: string;
  score: number;
  components: {
    intakeRate: number;
    connectionDensity: number;
    retrievalFrequency: number;
    growthVelocity: number;
  };
  activity: {
    memoriesAdded: number;
    searchesPerformed: number;
    chatsPerformed: number;
  };
  computedAt: string;
}

interface HistoryResponse {
  weeks: Array<{
    weekStart: string;
    score: number;
  }>;
}

const COMPONENT_LABELS: Array<{
  key: keyof MetabolismResponse['components'];
  label: string;
  icon: typeof Zap;
  weight: number;
  tip: string;
}> = [
  { key: 'intakeRate',         label: 'Intake rate',         icon: Zap,          weight: 40, tip: 'How much new knowledge you absorbed this week, vs your typical pace.' },
  { key: 'connectionDensity',  label: 'Connection density',  icon: NetworkIcon,  weight: 20, tip: 'How densely your memories are linked. Cross-pollination jobs find these for you.' },
  { key: 'retrievalFrequency', label: 'Retrieval frequency', icon: Target,       weight: 20, tip: 'How often you actually used your knowledge — chats and searches per day.' },
  { key: 'growthVelocity',     label: 'Growth velocity',     icon: TrendingUp,   weight: 20, tip: 'Week-over-week change. Sustained growth keeps your second brain alive.' },
];

function formatScore(score: number): string {
  return score.toFixed(1);
}

function scoreColor(score: number): string {
  if (score >= 7) return 'text-emerald-300';
  if (score >= 4) return 'text-amber-300';
  return 'text-zinc-400';
}

function Sparkline({ values }: { values: number[] }) {
  // Inline SVG sparkline for the last 12 weeks. Newest on the right.
  if (values.length < 2) return null;
  const max = Math.max(10, ...values);
  const min = 0;
  const w = 240;
  const h = 56;
  const stepX = values.length > 1 ? w / (values.length - 1) : w;
  const points = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(h - ((v - min) / (max - min)) * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="12-week metabolism trend" role="img">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export default function MetabolismPage() {
  usePageTitle('Knowledge Metabolism');

  const [current, setCurrent] = useState<MetabolismResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [curRes, histRes] = await Promise.all([
        fetch('/api/v1/metabolism/current'),
        fetch('/api/v1/metabolism/history?weeks=12'),
      ]);
      if (!curRes.ok) throw new Error(`Failed to load current score (${curRes.status})`);
      if (!histRes.ok) throw new Error(`Failed to load history (${histRes.status})`);
      setCurrent((await curRes.json()) as MetabolismResponse);
      setHistory((await histRes.json()) as HistoryResponse);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load metabolism data';
      setError(msg);
      toast.error('Could not load metabolism', { description: msg });
    }
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const sparklineValues = useMemo(() => {
    if (!history) return [];
    // History is most-recent first; reverse for left-to-right time order.
    return [...history.weeks].reverse().map((w) => w.score);
  }, [history]);

  const memoriesEmpty = current?.activity.memoriesAdded === 0
    && current?.activity.searchesPerformed === 0
    && current?.activity.chatsPerformed === 0;

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Stagger>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight">Knowledge Metabolism</h1>
              <p className="text-[13px] text-zinc-500 mt-1">
                Your weekly intellectual fitness — intake, connections, retrieval, and growth.
              </p>
            </div>
            <button
              onClick={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              disabled={refreshing}
              className="h-9 w-9 rounded-xl border border-white/[0.06] bg-white/[0.02]
                flex items-center justify-center hover:bg-white/[0.04] transition-all
                active:scale-[0.95] shrink-0 disabled:opacity-40"
              title="Recompute"
              aria-label="Recompute metabolism score"
            >
              <RefreshCw className={`w-4 h-4 text-zinc-400 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </Stagger>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-6">
            <p className="text-[13px] text-rose-200">{error}</p>
            <button
              onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }}
              className="mt-3 text-[12px] text-teal-300 hover:text-teal-200 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && current && memoriesEmpty && (
          <EmptyFeatureState
            icon={Activity}
            title="Your metabolism wakes up when you do"
            description="The score measures real activity — imports, connections, searches, chats. Bring in some knowledge or ask the chat anything to get the first reading."
            ctaText="Import some knowledge →"
            ctaHref="/app/import"
            secondaryText="or open chat"
            secondaryHref="/app/chat"
          />
        )}

        {!loading && !error && current && !memoriesEmpty && (
          <Stagger>
            {/* Score card */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 flex items-center gap-6">
              <div className="flex flex-col items-center min-w-[110px]">
                <div className={`text-[44px] font-semibold leading-none ${scoreColor(current.score)}`}>
                  {formatScore(current.score)}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-zinc-500 mt-1">/ 10</div>
              </div>
              <div className="flex-1">
                <p className="text-[12px] text-zinc-400 mb-2">Trend (12 weeks)</p>
                <div className="text-teal-300">
                  {sparklineValues.length >= 2 ? (
                    <Sparkline values={sparklineValues} />
                  ) : (
                    <p className="text-[12px] text-zinc-500">A trend appears after two weeks of activity.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Components */}
            <div className="grid sm:grid-cols-2 gap-3">
              {COMPONENT_LABELS.map(({ key, label, icon: Icon, weight, tip }) => {
                const value = current.components[key];
                const pct = Math.round(value * 100);
                return (
                  <div key={key} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                        <h3 className="text-[13px] font-medium text-zinc-200">{label}</h3>
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-zinc-600">{weight}%</span>
                    </div>
                    <div>
                      <div className="h-1.5 w-full rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className="h-full bg-teal-400/70 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                          aria-hidden="true"
                        />
                      </div>
                      <p className="text-[12px] text-zinc-500 mt-2">
                        <span className="text-zinc-300">{pct}%</span> · {tip}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Activity summary */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[12px] uppercase tracking-wide text-zinc-500 mb-3">This week</h3>
              <div className="grid grid-cols-3 gap-4">
                <ActivityStat label="Memories added" value={current.activity.memoriesAdded} />
                <ActivityStat label="Searches" value={current.activity.searchesPerformed} />
                <ActivityStat label="Chats" value={current.activity.chatsPerformed} />
              </div>
              <p className="text-[11px] text-zinc-600 mt-4">
                Score recomputed {new Date(current.computedAt).toLocaleString()}.
                Want to lift the number? Try{' '}
                <Link href="/app/import" className="text-teal-300 hover:text-teal-200">
                  importing fresh material
                </Link>{' '}
                or{' '}
                <Link href="/app/insights" className="text-teal-300 hover:text-teal-200">
                  exploring the connections panel
                </Link>
                .
              </p>
            </div>
          </Stagger>
        )}
      </div>
    </PageTransition>
  );
}

function ActivityStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[20px] font-semibold text-zinc-200">{value}</div>
      <div className="text-[11px] text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}
