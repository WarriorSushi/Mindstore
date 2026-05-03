'use client';

import { useEffect, useState } from 'react';
import { Brain, Loader2, RotateCw, Check } from 'lucide-react';
import { toast } from 'sonner';
import { usePageTitle } from '@/lib/use-page-title';
import { PageTransition, Stagger } from '@/components/PageTransition';
import { EmptyFeatureState } from '@/components/EmptyFeatureState';

interface AtRiskMemory {
  memoryId: string;
  riskScore: number;
  priority: number;
  daysSinceTouch: number;
  content: string;
  sourceType: string;
  sourceTitle: string | null;
}

const PRIORITY_LABEL: Record<number, string> = {
  5: 'Forgetting now',
  4: 'High risk',
  3: 'Medium risk',
  2: 'Low risk',
  1: 'Fresh',
};

const PRIORITY_TONE: Record<number, string> = {
  5: 'text-rose-300 bg-rose-500/[0.08] border-rose-500/20',
  4: 'text-amber-300 bg-amber-500/[0.08] border-amber-500/20',
  3: 'text-sky-300 bg-sky-500/[0.08] border-sky-500/20',
  2: 'text-zinc-300 bg-white/[0.04] border-white/[0.08]',
  1: 'text-emerald-300 bg-emerald-500/[0.08] border-emerald-500/20',
};

export default function ForgettingPage() {
  usePageTitle('Forgetting Curve');

  const [memories, setMemories] = useState<AtRiskMemory[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setError(null);
    try {
      const res = await fetch('/api/v1/forgetting/at-risk?limit=20');
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setMemories(data.memories ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load forgetting list';
      setError(msg);
      toast.error('Could not load forgetting list', { description: msg });
    }
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const reviewMemory = async (memoryId: string) => {
    try {
      const res = await fetch('/api/v1/forgetting/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memoryId }),
      });
      if (!res.ok) throw new Error(`Failed to record review (${res.status})`);
      setReviewedIds((prev) => {
        const next = new Set(prev);
        next.add(memoryId);
        return next;
      });
      toast.success('Marked reviewed', { description: 'Risk dropped; the next scan will refresh.' });
    } catch (e) {
      toast.error('Could not record review', { description: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Stagger>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight">Forgetting Curve</h1>
              <p className="text-[13px] text-zinc-500 mt-1">
                Your second brain decays unless you use it. These are the memories slipping away.
              </p>
            </div>
            <button
              onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }}
              className="h-9 w-9 rounded-xl border border-white/[0.06] bg-white/[0.02]
                flex items-center justify-center hover:bg-white/[0.04] transition-all
                active:scale-[0.95] shrink-0"
              title="Recompute"
              aria-label="Recompute forgetting list"
            >
              <RotateCw className={`w-4 h-4 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
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
          </div>
        )}

        {!loading && !error && memories?.length === 0 && (
          <EmptyFeatureState
            icon={Brain}
            title="Nothing forgotten yet"
            description="Your memories all look fresh. Come back here after a few weeks of activity — the Ebbinghaus curve will surface what's slipping."
            ctaText="Browse memories →"
            ctaHref="/app/explore"
          />
        )}

        {!loading && !error && memories && memories.length > 0 && (
          <Stagger>
            {memories.map((m) => {
              const reviewed = reviewedIds.has(m.memoryId);
              return (
                <article
                  key={m.memoryId}
                  className={`rounded-2xl border p-5 transition-all ${
                    reviewed
                      ? 'border-white/[0.04] bg-white/[0.01] opacity-60'
                      : 'border-white/[0.06] bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide ${
                            PRIORITY_TONE[m.priority]
                          }`}
                        >
                          {PRIORITY_LABEL[m.priority]}
                        </span>
                        <span className="text-[11px] text-zinc-600">
                          {m.daysSinceTouch}d untouched · {Math.round(m.riskScore * 100)}% risk
                        </span>
                      </div>
                      <p className="text-[13px] text-zinc-300 leading-relaxed line-clamp-3">{m.content}</p>
                      <p className="text-[11px] text-zinc-600 mt-2">
                        {m.sourceTitle ?? 'Untitled'} · {m.sourceType}
                      </p>
                    </div>
                    <button
                      onClick={() => reviewMemory(m.memoryId)}
                      disabled={reviewed}
                      className="h-9 w-9 rounded-xl border border-white/[0.06] bg-white/[0.02]
                        flex items-center justify-center hover:bg-white/[0.04] transition-all
                        active:scale-[0.95] shrink-0 disabled:opacity-30"
                      title="Mark reviewed"
                      aria-label="Mark this memory reviewed"
                    >
                      <Check className="w-4 h-4 text-zinc-400" />
                    </button>
                  </div>
                </article>
              );
            })}
          </Stagger>
        )}
      </div>
    </PageTransition>
  );
}
