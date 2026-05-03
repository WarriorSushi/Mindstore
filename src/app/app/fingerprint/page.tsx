'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Brain, RefreshCw, Loader2, Lightbulb, Network, Link2, Layers } from 'lucide-react';
import { usePageTitle } from "@/lib/use-page-title";
import { useWebGL } from "@/lib/use-webgl";
import { PageTransition } from "@/components/PageTransition";
import { EmptyFeatureState } from "@/components/EmptyFeatureState";
import { toast } from "sonner";

// Dynamic import reagraph (WebGL, can't SSR)
const GraphCanvas = dynamic(
  () => import('reagraph').then(mod => mod.GraphCanvas),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
    </div>
  )}
);

export default function FingerprintPage() {
  usePageTitle("Knowledge Fingerprint");
  const [data, setData] = useState<{ nodes: any[]; edges: any[]; clusters: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const webgl = useWebGL();
  const [viewMode, setViewMode] = useState<'graph' | 'breakdown'>('breakdown');

  // When WebGL becomes available, opt the user into the 3D view by default.
  // (Stays in breakdown mode on devices that can't render the GraphCanvas.)
  useEffect(() => {
    if (webgl === true) setViewMode('graph');
  }, [webgl]);

  useEffect(() => { loadFingerprint(); }, []);

  async function loadFingerprint() {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/fingerprint');
      if (!res.ok) throw new Error(`Failed to load fingerprint (${res.status})`);
      setData(await res.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate fingerprint';
      console.error('Failed to generate fingerprint:', e);
      toast.error('Could not generate fingerprint', { description: msg });
    } finally {
      setLoading(false);
    }
  }

  const graphNodes = useMemo(() =>
    data?.nodes.map(n => ({
      id: n.id,
      label: n.label,
      fill: clusterColor(n.group),
      size: n.size,
    })) || [],
  [data]);

  const graphEdges = useMemo(() =>
    data?.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      size: e.weight * 2,
    })) || [],
  [data]);

  return (
    <PageTransition>
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em]">Knowledge Fingerprint</h1>
          <p className="text-[13px] text-zinc-500 mt-0.5">The shape of your thinking, visualized</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          {/* View toggle */}
          <div className="flex rounded-xl bg-white/[0.04] border border-white/[0.06] p-0.5">
            <button
              onClick={() => setViewMode('graph')}
              disabled={webgl === false}
              title={webgl === false ? 'WebGL is not available on this device' : 'Show 3D graph'}
              aria-label={webgl === false ? 'Graph view (WebGL not available)' : 'Graph view'}
              className={`px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                viewMode === 'graph'
                  ? 'bg-teal-500/15 text-teal-300 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Graph
            </button>
            <button
              onClick={() => setViewMode('breakdown')}
              className={`px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-all ${
                viewMode === 'breakdown'
                  ? 'bg-teal-500/15 text-teal-300 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Breakdown
            </button>
          </div>
          {/* Snapshot */}
          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/v1/fingerprint/snapshots', { method: 'POST' });
                if (!res.ok) throw new Error(`Snapshot failed (${res.status})`);
                toast.success('Snapshot captured', { description: 'Compare it later in Mind Diff.' });
              } catch (e) {
                toast.error('Snapshot failed', { description: e instanceof Error ? e.message : 'Unknown error' });
              }
            }}
            className="hidden sm:flex h-8 px-3 items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] transition-all active:scale-[0.95] text-[12px] text-zinc-400"
            title="Capture a snapshot"
            aria-label="Capture a fingerprint snapshot"
          >
            <Layers className="w-3.5 h-3.5" />
            Snapshot
          </button>
          {/* Refresh */}
          <button
            onClick={loadFingerprint}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] transition-all active:scale-[0.95] disabled:opacity-40"
            title="Recompute fingerprint"
            aria-label="Recompute fingerprint"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Graph View */}
      {viewMode === 'graph' && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden relative" style={{ height: 'calc(100dvh - 220px)', minHeight: '400px' }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#0a0a0b]/80 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <Brain className="w-5 h-5 text-teal-400 animate-pulse" />
                <p className="text-[13px] text-zinc-400">Mapping your mind…</p>
              </div>
            </div>
          )}

          {data && graphNodes.length > 0 && (
            <Suspense fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
              </div>
            }>
              <GraphCanvas
                nodes={graphNodes}
                edges={graphEdges}
                cameraMode="rotate"
                labelType="all"
              />
            </Suspense>
          )}

          {data && graphNodes.length === 0 && !loading && (
            <EmptyFeatureState
              icon={Brain}
              title="See the shape of your thinking"
              description="Your Knowledge Fingerprint maps every connection between your ideas into a living 3D graph. Import conversations, notes, or articles to watch your mind's topology emerge."
              ctaText="Import your first data →"
              ctaHref="/app/import"
              secondaryText="or explore with demo data"
              secondaryHref="/app?demo=true"
            />
          )}
        </div>
      )}

      {/* Breakdown View */}
      {viewMode === 'breakdown' && (
        <div className="space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
            </div>
          )}

          {data && !loading && (
            <>
              {/* Summary — inline row, not cards */}
              <div className="flex items-baseline gap-6 text-[13px] text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5 text-teal-400" />
                  <span className="text-zinc-200 font-medium tabular-nums">{data.nodes.length.toLocaleString()}</span> nodes
                </span>
                <span className="flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-zinc-200 font-medium tabular-nums">{data.edges.length.toLocaleString()}</span> connections
                </span>
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-zinc-200 font-medium tabular-nums">{data.clusters.length}</span> clusters
                </span>
              </div>

              {/* Clusters */}
              {data.clusters.length > 0 && (
                <div className="space-y-4">
                  <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.08em]">
                    Knowledge Clusters
                  </p>
                  <div className="space-y-3">
                    {data.clusters.map((c: any) => {
                      const maxSize = Math.max(1, ...data.clusters.map((x: any) => x.size));
                      const pct = Math.min(100, (c.size / maxSize) * 100);
                      return (
                        <div key={c.name} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: c.color }}
                              />
                              <span className="text-[13px] font-medium capitalize">{c.name}</span>
                            </div>
                            <span className="text-[12px] text-zinc-500 tabular-nums">{c.size} items</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700 ease-out"
                              style={{ backgroundColor: c.color, width: `${pct}%`, opacity: 0.7 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* About — plain text, no decorative card */}
              <div className="border-t border-white/[0.06] pt-5 mt-2">
                <div className="flex items-start gap-2.5">
                  <Lightbulb className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-medium text-zinc-400 mb-1">What is a Knowledge Fingerprint?</p>
                    <p className="text-[12px] text-zinc-600 leading-relaxed max-w-lg">
                      A unique topology of your mind. Nodes are pieces of knowledge, edges show semantic connections.
                      Clusters reveal expertise areas; isolated nodes highlight blind spots. It grows as you learn.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
    </PageTransition>
  );
}

function clusterColor(group: string): string {
  const colors: Record<string, string> = {
    chatgpt: '#10b981',
    text: '#38bdf8',
    file: '#f59e0b',
    url: '#3b82f6',
  };
  return colors[group] || '#6b7280';
}
