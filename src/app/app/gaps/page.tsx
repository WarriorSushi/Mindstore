'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Target, Loader2, AlertTriangle, Sparkles, ArrowRight, RefreshCw,
  MessageCircle, FileText, Globe, Type, BookOpenCheck, Gem,
  MessageSquare, Zap, Link2, Clock, Eye, BookOpen, Layers,
  TrendingUp, Shield, Compass, ChevronRight, X,
} from 'lucide-react';
import { PageTransition, Stagger } from '@/components/PageTransition';
import { EmptyState } from '@/components/EmptyState';
import { EmptyFeatureState } from '@/components/EmptyFeatureState';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { usePageTitle } from "@/lib/use-page-title";

// ─── Types ──────────────────────────────────────────────────────

interface Topic {
  id: string;
  label: string;
  keywords: string[];
  memoryCount: number;
  coherence: number;
  density: 'deep' | 'moderate' | 'thin' | 'sparse';
  sourceTypes: Record<string, number>;
  avgAge: number;
  recentActivity: boolean;
  previewMemories: { id: string; title: string; preview: string; sourceType: string }[];
}

interface Gap {
  id: string;
  type: 'sparse-topic' | 'bridge-gap' | 'stale-knowledge' | 'single-source' | 'isolated-topic';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  relatedTopics: string[];
  suggestion: string;
}

interface CoverageItem {
  id: string;
  label: string;
  size: number;
  proportion: number;
  coherence: number;
  density: string;
  hasGap: boolean;
  gapTypes: string[];
}

interface Suggestion {
  topic: string;
  reason: string;
  relatedTo: string;
}

interface Stats {
  totalMemories: number;
  topicCount: number;
  gapCount: number;
  overallCoverage: number;
  deepTopics: number;
  moderateTopics: number;
  thinTopics: number;
  sparseTopics: number;
  staleTopics: number;
  avgCoherence: number;
  insufficientData?: boolean;
}

// ─── Config ─────────────────────────────────────────────────────

const sourceConfig: Record<string, { icon: any; color: string; label: string }> = {
  chatgpt: { icon: MessageCircle, color: 'text-green-400', label: 'ChatGPT' },
  text: { icon: Type, color: 'text-teal-400', label: 'Text' },
  file: { icon: FileText, color: 'text-blue-400', label: 'File' },
  url: { icon: Globe, color: 'text-orange-400', label: 'URL' },
  kindle: { icon: BookOpenCheck, color: 'text-amber-400', label: 'Kindle' },
  document: { icon: FileText, color: 'text-blue-400', label: 'Document' },
  obsidian: { icon: Gem, color: 'text-sky-400', label: 'Obsidian' },
  reddit: { icon: MessageSquare, color: 'text-orange-400', label: 'Reddit' },
};

const densityConfig: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  deep: { label: 'Deep', color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
  moderate: { label: 'Moderate', color: 'text-teal-400', bg: 'bg-teal-500/10', ring: 'ring-teal-500/20' },
  thin: { label: 'Thin', color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20' },
  sparse: { label: 'Sparse', color: 'text-rose-400', bg: 'bg-rose-500/10', ring: 'ring-rose-500/20' },
};

const gapTypeConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  'bridge-gap': { icon: Link2, color: 'text-teal-400', bg: 'bg-teal-500/10', label: 'Bridge Gap' },
  'sparse-topic': { icon: Eye, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Thin Coverage' },
  'stale-knowledge': { icon: Clock, color: 'text-zinc-400', bg: 'bg-zinc-500/10', label: 'Stale' },
  'single-source': { icon: Layers, color: 'text-sky-400', bg: 'bg-sky-500/10', label: 'Single Source' },
  'isolated-topic': { icon: Compass, color: 'text-rose-400', bg: 'bg-rose-500/10', label: 'Isolated' },
};

const severityConfig: Record<string, { color: string; bg: string; label: string }> = {
  high: { color: 'text-rose-400', bg: 'bg-rose-500/10', label: 'High' },
  medium: { color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Medium' },
  low: { color: 'text-zinc-400', bg: 'bg-zinc-500/10', label: 'Low' },
};

// 16 topic colors — zero violet/purple/fuchsia
const TOPIC_COLORS = [
  '#14b8a6', '#38bdf8', '#34d399', '#fbbf24', '#22d3ee',
  '#fb7185', '#a3e635', '#fb923c', '#60a5fa', '#94a3b8',
  '#2dd4bf', '#f59e0b', '#facc15', '#f87171', '#4ade80',
  '#67e8f9',
];

export default function KnowledgeGapsPage() {
  usePageTitle("Knowledge Gaps");
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [coverageMap, setCoverageMap] = useState<CoverageItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [selectedGap, setSelectedGap] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredTopic, setHoveredTopic] = useState<string | null>(null);

  // ─── Fetch data ───────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/plugins/knowledge-gaps?action=analyze');
      if (!res.ok) throw new Error('Failed to analyze knowledge gaps');
      const data = await res.json();
      setTopics(data.topics || []);
      setGaps(data.gaps || []);
      setCoverageMap(data.coverageMap || []);
      setStats(data.stats || null);
      setSuggestions(data.suggestions || []);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Failed to load knowledge gaps';
      setError(msg);
      toast.error('Could not load knowledge gaps', { description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Fetch AI suggestions ────────────────────────────────────
  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const res = await fetch('/api/v1/plugins/knowledge-gaps?action=suggest');
      if (!res.ok) throw new Error('Failed to get suggestions');
      const data = await res.json();
      setSuggestions(data.suggestions || []);
      if (data.suggestions?.length) {
        toast.success(`Generated ${data.suggestions.length} learning suggestions`);
      } else {
        toast('No AI provider configured for suggestions', { description: 'Connect OpenAI or Gemini in Settings' });
      }
    } catch (err: any) {
      toast.error('Failed to generate suggestions');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // ─── Coverage treemap canvas ─────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || coverageMap.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;

    // Clear
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, W, H);

    // Sort by size descending for treemap
    const sorted = [...coverageMap].sort((a, b) => b.size - a.size);
    const total = sorted.reduce((a, b) => a + b.size, 0);

    // Simple squarified treemap layout
    const rects = squarify(sorted.map((c, i) => ({
      ...c,
      value: c.size,
      index: i,
    })), { x: 0, y: 0, w: W, h: H }, total);

    // Draw each rect
    for (const r of rects) {
      const item = r.data;
      const color = TOPIC_COLORS[item.index % TOPIC_COLORS.length];
      const isHovered = hoveredTopic === item.id;
      const hasGap = item.hasGap;

      // Background
      const alpha = isHovered ? 0.35 : hasGap ? 0.12 : 0.2;
      ctx.fillStyle = hexToRGBA(color, alpha);
      ctx.beginPath();
      roundRect(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 8);
      ctx.fill();

      // Border
      ctx.strokeStyle = hexToRGBA(color, isHovered ? 0.6 : 0.25);
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.beginPath();
      roundRect(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 8);
      ctx.stroke();

      // Gap indicator — dashed border overlay
      if (hasGap) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(251, 113, 133, 0.4)'; // rose-400
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        roundRect(ctx, r.x + 4, r.y + 4, r.w - 8, r.h - 8, 6);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Label (only if rect is big enough)
      if (r.w > 60 && r.h > 40) {
        ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(255,255,255,0.85)';
        ctx.font = `600 ${r.w > 120 ? 13 : 11}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const maxLabelWidth = r.w - 16;
        let label = item.label;
        const textWidth = ctx.measureText(label).width;
        if (textWidth > maxLabelWidth) {
          while (ctx.measureText(label + '…').width > maxLabelWidth && label.length > 0) {
            label = label.slice(0, -1);
          }
          label += '…';
        }
        ctx.fillText(label, r.x + 10, r.y + 10);

        // Count
        if (r.h > 55) {
          ctx.fillStyle = hexToRGBA(color, 0.8);
          ctx.font = `500 10px system-ui, -apple-system, sans-serif`;
          ctx.fillText(`${item.size} memories`, r.x + 10, r.y + 28);
        }

        // Density badge
        if (r.h > 70 && r.w > 90) {
          const density = item.density;
          const densityLabel = densityConfig[density]?.label || density;
          ctx.fillStyle = density === 'sparse' ? 'rgba(251,113,133,0.7)' : 
                          density === 'thin' ? 'rgba(251,191,36,0.7)' :
                          density === 'moderate' ? 'rgba(20,184,166,0.7)' :
                          'rgba(52,211,153,0.7)';
          ctx.font = '500 9px system-ui, -apple-system, sans-serif';
          ctx.fillText(densityLabel, r.x + 10, r.y + 42);
        }
      }
    }
  }, [coverageMap, hoveredTopic]);

  // Canvas mouse interaction
  useEffect(() => {
    if (!canvasRef.current || coverageMap.length === 0) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const sorted = [...coverageMap].sort((a, b) => b.size - a.size);
    const total = sorted.reduce((a, b) => a + b.size, 0);
    const rects = squarify(sorted.map((c, i) => ({ ...c, value: c.size, index: i })), { x: 0, y: 0, w: rect.width, h: rect.height }, total);

    const handleMove = (e: MouseEvent) => {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const found = rects.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      setHoveredTopic(found ? found.data.id : null);
      canvas.style.cursor = found ? 'pointer' : 'default';
    };

    const handleClick = (e: MouseEvent) => {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const found = rects.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      if (found) {
        const topic = topics.find(t => t.id === found.data.id);
        if (topic) setSelectedTopic(topic);
      }
    };

    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mouseleave', () => { setHoveredTopic(null); canvas.style.cursor = 'default'; });
    return () => {
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [coverageMap, topics]);

  // ─── Loading state ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="animate-pulse rounded-xl bg-white/[0.04] h-7 w-44" />
          <div className="animate-pulse rounded-xl bg-white/[0.04] h-4 w-60" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="animate-pulse rounded-xl bg-white/[0.04] w-10 h-10" />
                <div className="flex-1 space-y-1.5">
                  <div className="animate-pulse rounded-xl bg-white/[0.04] h-4 w-32" />
                  <div className="animate-pulse rounded-xl bg-white/[0.04] h-3 w-48" />
                </div>
              </div>
              <div className="animate-pulse rounded-xl bg-white/[0.04] h-3 w-full" />
              <div className="animate-pulse rounded-xl bg-white/[0.04] h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Error state ─────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-rose-400" />
          </div>
          <p className="text-sm text-zinc-400">{error}</p>
          <button onClick={fetchData} className="text-sm text-teal-400 hover:text-teal-300 transition-colors">
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ─── Empty state ─────────────────────────────────────────────
  if (stats?.insufficientData) {
    return (
      <PageTransition>
        <div className="py-8">
          <EmptyFeatureState
            icon={Target}
            title="Find the blind spots in your knowledge"
            description="Knowledge Gaps analysis scans your library for thin coverage, stale topics, and missing connections. Import diverse content to reveal where your understanding runs shallow."
            ctaText="Import your first data →"
            ctaHref="/app/import"
            secondaryText="or explore with demo data"
            secondaryHref="/app?demo=true"
          />
        </div>
      </PageTransition>
    );
  }

  const highGaps = gaps.filter(g => g.severity === 'high');
  const medGaps = gaps.filter(g => g.severity === 'medium');
  const lowGaps = gaps.filter(g => g.severity === 'low');

  return (
    <PageTransition>
      <div className="space-y-8">

        {/* ─── Header ─────────────────────────────────────────── */}
        <Stagger>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em] text-zinc-100">
                Knowledge Gaps
              </h1>
              <p className="text-sm text-zinc-500 mt-1">
                Blind spots, thin coverage, and missing connections in your knowledge
              </p>
            </div>
            <button
              onClick={fetchData}
              className="h-9 w-9 rounded-xl border border-white/[0.06] bg-white/[0.02]
                flex items-center justify-center hover:bg-white/[0.04] transition-all
                active:scale-[0.95] shrink-0"
              title="Re-analyze"
              aria-label="Re-analyze knowledge gaps"
            >
              <RefreshCw className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </Stagger>

        {/* ─── Stats Overview ─────────────────────────────────── */}
        {stats && (
          <Stagger>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard
                label="Topics"
                value={stats.topicCount}
                icon={<Layers className="w-3.5 h-3.5 text-teal-400" />}
              />
              <StatCard
                label="Gaps Found"
                value={stats.gapCount}
                icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                alert={stats.gapCount > 5}
              />
              <StatCard
                label="Deep Topics"
                value={stats.deepTopics}
                icon={<Shield className="w-3.5 h-3.5 text-emerald-400" />}
              />
              <StatCard
                label="Thin/Sparse"
                value={stats.thinTopics + stats.sparseTopics}
                icon={<Eye className="w-3.5 h-3.5 text-rose-400" />}
                alert={(stats.thinTopics + stats.sparseTopics) > stats.deepTopics}
              />
              <StatCard
                label="Coherence"
                value={`${Math.round(stats.avgCoherence * 100)}%`}
                icon={<Target className="w-3.5 h-3.5 text-sky-400" />}
              />
            </div>
          </Stagger>
        )}

        {/* ─── Coverage Treemap ───────────────────────────────── */}
        <Stagger>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-teal-500/10 flex items-center justify-center">
                  <Target className="w-3.5 h-3.5 text-teal-400" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-zinc-200">Coverage Map</h2>
                  <p className="text-[11px] text-zinc-600">Size = memory count. Dashed border = gap detected.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40" /> Deep
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-teal-500/30" /> Moderate
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/30" /> Thin
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/30 border border-dashed border-rose-400/40" /> Gap
                </span>
              </div>
            </div>
            <div className="p-3">
              <canvas
                ref={canvasRef}
                className="w-full rounded-xl"
                style={{ height: 280 }}
              />
            </div>
          </div>
        </Stagger>

        {/* ─── Main content grid ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ─── Gaps List (2/3 width) ────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Gap severity summary */}
            {gaps.length > 0 && (
              <Stagger>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span className="font-medium text-zinc-400">{gaps.length} gaps found</span>
                  {highGaps.length > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                      {highGaps.length} high
                    </span>
                  )}
                  {medGaps.length > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      {medGaps.length} medium
                    </span>
                  )}
                  {lowGaps.length > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                      {lowGaps.length} low
                    </span>
                  )}
                </div>
              </Stagger>
            )}

            {/* Gap cards */}
            {gaps.map((gap) => {
              const typeConf = gapTypeConfig[gap.type] || gapTypeConfig['sparse-topic'];
              const sevConf = severityConfig[gap.severity];
              const GapIcon = typeConf.icon;
              const isExpanded = selectedGap === gap.id;

              return (
                <Stagger key={gap.id}>
                  <button
                    onClick={() => setSelectedGap(isExpanded ? null : gap.id)}
                    className={`w-full text-left rounded-2xl border transition-all duration-200
                      ${isExpanded
                        ? 'border-white/[0.1] bg-white/[0.04]'
                        : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] hover:border-white/[0.08]'
                      }`}
                  >
                    <div className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg ${typeConf.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                          <GapIcon className={`w-4 h-4 ${typeConf.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-[13px] font-semibold text-zinc-200">{gap.title}</h3>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${sevConf.bg} ${sevConf.color} font-medium`}>
                              {sevConf.label}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${typeConf.bg} ${typeConf.color} font-medium`}>
                              {typeConf.label}
                            </span>
                          </div>
                          <p className="text-[12px] text-zinc-500 mt-1.5 leading-relaxed">{gap.description}</p>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-zinc-600 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>

                      {/* Expanded: suggestion */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-white/[0.04]">
                          <div className="flex items-start gap-2.5">
                            <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[11px] font-medium text-teal-400 mb-1">Suggestion</p>
                              <p className="text-[12px] text-zinc-400 leading-relaxed">{gap.suggestion}</p>
                            </div>
                          </div>

                          {/* Related topics */}
                          {gap.relatedTopics.length > 0 && (
                            <div className="flex items-center gap-2 mt-3 flex-wrap">
                              <span className="text-[10px] text-zinc-600">Related:</span>
                              {gap.relatedTopics.map(tid => {
                                const topic = topics.find(t => t.id === tid);
                                if (!topic) return null;
                                return (
                                  <span
                                    key={tid}
                                    onClick={(e) => { e.stopPropagation(); setSelectedTopic(topic); }}
                                    className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400
                                      hover:bg-white/[0.06] hover:text-zinc-300 transition-colors cursor-pointer"
                                  >
                                    {topic.label}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                </Stagger>
              );
            })}

            {gaps.length === 0 && (
              <Stagger>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
                  <Shield className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-zinc-300">No significant gaps detected</p>
                  <p className="text-xs text-zinc-600 mt-1">Your knowledge base has solid coverage across topics</p>
                </div>
              </Stagger>
            )}
          </div>

          {/* ─── Right sidebar ────────────────────────────────── */}
          <div className="space-y-4">

            {/* Coverage density breakdown */}
            <Stagger>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="text-[13px] font-semibold text-zinc-300 mb-4 flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-teal-400" />
                  Topic Density
                </h3>
                <div className="space-y-3">
                  {topics.map((topic, i) => {
                    const dc = densityConfig[topic.density];
                    const color = TOPIC_COLORS[i % TOPIC_COLORS.length];
                    const maxCount = Math.max(...topics.map(t => t.memoryCount));

                    return (
                      <button
                        key={topic.id}
                        onClick={() => setSelectedTopic(topic)}
                        className={`w-full text-left group transition-colors ${
                          selectedTopic?.id === topic.id ? 'opacity-100' : 'opacity-80 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-zinc-400 truncate max-w-[140px] group-hover:text-zinc-300 transition-colors">
                            {topic.label}
                          </span>
                          <span className={`text-[10px] ${dc.color} font-medium`}>
                            {topic.memoryCount}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${(topic.memoryCount / maxCount) * 100}%`,
                              backgroundColor: color,
                              opacity: topic.density === 'sparse' ? 0.4 : topic.density === 'thin' ? 0.55 : 0.75,
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Stagger>

            {/* AI Suggestions */}
            <Stagger>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[13px] font-semibold text-zinc-300 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                    What to Learn Next
                  </h3>
                  <button
                    onClick={fetchSuggestions}
                    disabled={loadingSuggestions}
                    className="text-[11px] text-teal-400 hover:text-teal-300 transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {loadingSuggestions ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Zap className="w-3 h-3" />
                    )}
                    {loadingSuggestions ? 'Thinking…' : 'Generate'}
                  </button>
                </div>

                {suggestions.length > 0 ? (
                  <div className="space-y-3">
                    {suggestions.map((s, i) => (
                      <div
                        key={i}
                        className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3
                          hover:bg-white/[0.03] hover:border-white/[0.06] transition-all"
                      >
                        <p className="text-[12px] font-medium text-zinc-200">{s.topic}</p>
                        <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">{s.reason}</p>
                        {s.relatedTo && (
                          <p className="text-[10px] text-teal-400/70 mt-1.5">
                            Connects to: {s.relatedTo}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-[11px] text-zinc-600">
                      Click "Generate" to get AI-powered learning suggestions based on your gaps
                    </p>
                  </div>
                )}
              </div>
            </Stagger>

            {/* Stale knowledge */}
            {stats && stats.staleTopics > 0 && (
              <Stagger>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <h3 className="text-[13px] font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                    Stale Knowledge
                  </h3>
                  <p className="text-[11px] text-zinc-600 mb-3">
                    {stats.staleTopics} topic{stats.staleTopics !== 1 ? 's have' : ' has'} no updates in 30+ days
                  </p>
                  <div className="space-y-2">
                    {topics.filter(t => !t.recentActivity).slice(0, 5).map(topic => (
                      <button
                        key={topic.id}
                        onClick={() => setSelectedTopic(topic)}
                        className="w-full flex items-center justify-between py-1.5 text-left
                          hover:text-zinc-300 transition-colors group"
                      >
                        <span className="text-[11px] text-zinc-500 group-hover:text-zinc-400 truncate max-w-[160px]">
                          {topic.label}
                        </span>
                        <span className="text-[10px] text-zinc-700">
                          {Math.round(topic.avgAge)}d ago
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </Stagger>
            )}
          </div>
        </div>

        {/* ─── Topic Detail Panel (Modal) ─────────────────────── */}
        {selectedTopic && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedTopic(null)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#111113]
                shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              style={{ animation: 'kg-scale-in 200ms ease-out' }}
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-white/[0.06]">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-[16px] font-semibold text-zinc-100">{selectedTopic.label}</h2>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[11px] px-2.5 py-0.5 rounded-full ring-1 font-medium
                        ${densityConfig[selectedTopic.density].bg} ${densityConfig[selectedTopic.density].color} ${densityConfig[selectedTopic.density].ring}`}>
                        {densityConfig[selectedTopic.density].label}
                      </span>
                      <span className="text-[11px] text-zinc-600">
                        {selectedTopic.memoryCount} memories · {Math.round(selectedTopic.coherence * 100)}% coherence
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedTopic(null)}
                    className="w-7 h-7 rounded-lg hover:bg-white/[0.06] flex items-center justify-center
                      transition-colors"
                  >
                    <X className="w-4 h-4 text-zinc-500" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-5 space-y-5">
                {/* Keywords */}
                {selectedTopic.keywords.length > 0 && (
                  <div>
                    <p className="text-[11px] text-zinc-600 mb-2 font-medium uppercase tracking-wider">Keywords</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTopic.keywords.map((kw, i) => (
                        <span key={i} className="text-[11px] px-2.5 py-1 rounded-lg bg-teal-500/8 text-teal-400 border border-teal-500/10">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sources */}
                <div>
                  <p className="text-[11px] text-zinc-600 mb-2 font-medium uppercase tracking-wider">Sources</p>
                  <div className="space-y-2">
                    {Object.entries(selectedTopic.sourceTypes)
                      .sort((a, b) => b[1] - a[1])
                      .map(([src, count]) => {
                        const conf = sourceConfig[src] || { icon: FileText, color: 'text-zinc-400', label: src };
                        const SrcIcon = conf.icon;
                        return (
                          <div key={src} className="flex items-center gap-2.5">
                            <SrcIcon className={`w-3.5 h-3.5 ${conf.color}`} />
                            <span className="text-[11px] text-zinc-400 flex-1">{conf.label}</span>
                            <div className="flex-1 max-w-[100px]">
                              <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-teal-500/40"
                                  style={{ width: `${(count / selectedTopic.memoryCount) * 100}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-[10px] text-zinc-600 tabular-nums w-6 text-right">{count}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Activity */}
                <div className="flex items-center gap-2 text-[11px]">
                  <Clock className="w-3 h-3 text-zinc-600" />
                  <span className="text-zinc-500">
                    Avg age: {Math.round(selectedTopic.avgAge)} days
                  </span>
                  <span className="text-zinc-700">·</span>
                  <span className={selectedTopic.recentActivity ? 'text-emerald-400' : 'text-zinc-600'}>
                    {selectedTopic.recentActivity ? 'Recently active' : 'No recent activity'}
                  </span>
                </div>

                {/* Related gaps */}
                {gaps.filter(g => g.relatedTopics.includes(selectedTopic.id)).length > 0 && (
                  <div>
                    <p className="text-[11px] text-zinc-600 mb-2 font-medium uppercase tracking-wider">Related Gaps</p>
                    <div className="space-y-2">
                      {gaps.filter(g => g.relatedTopics.includes(selectedTopic.id)).map(gap => {
                        const tc = gapTypeConfig[gap.type];
                        return (
                          <div key={gap.id} className="flex items-center gap-2 text-[11px]">
                            <tc.icon className={`w-3 h-3 ${tc.color}`} />
                            <span className="text-zinc-400">{gap.title}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Preview memories */}
                <div>
                  <p className="text-[11px] text-zinc-600 mb-2 font-medium uppercase tracking-wider">Sample Memories</p>
                  <div className="space-y-2">
                    {selectedTopic.previewMemories.map(mem => {
                      const conf = sourceConfig[mem.sourceType] || { icon: FileText, color: 'text-zinc-400', label: mem.sourceType };
                      const SrcIcon = conf.icon;
                      return (
                        <button
                          key={mem.id}
                          onClick={() => router.push(`/app/explore?q=${encodeURIComponent(mem.preview.slice(0, 40))}`)}
                          className="w-full text-left rounded-xl bg-white/[0.02] border border-white/[0.04] p-3
                            hover:bg-white/[0.04] hover:border-white/[0.06] transition-all group"
                        >
                          <div className="flex items-start gap-2">
                            <SrcIcon className={`w-3.5 h-3.5 ${conf.color} shrink-0 mt-0.5`} />
                            <div className="min-w-0">
                              <p className="text-[11px] text-zinc-400 group-hover:text-zinc-300 truncate transition-colors">
                                {mem.title}
                              </p>
                              <p className="text-[10px] text-zinc-600 mt-0.5 line-clamp-2">
                                {mem.preview}
                              </p>
                            </div>
                            <ArrowRight className="w-3 h-3 text-zinc-700 group-hover:text-zinc-500 shrink-0 transition-colors" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── CSS ───────────────────────────────────────────── */}
        <style>{`
          @keyframes kg-scale-in {
            from { opacity: 0; transform: scale(0.96) translateY(8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
      </div>
    </PageTransition>
  );
}

// ─── Stat card component ─────────────────────────────────────────

function StatCard({ label, value, icon, alert }: { label: string; value: string | number; icon: React.ReactNode; alert?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white/[0.02] p-3.5 ${alert ? 'border-amber-500/15' : 'border-white/[0.06]'}`}>
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className={`text-[20px] font-semibold tabular-nums tracking-[-0.02em] ${alert ? 'text-amber-400' : 'text-zinc-200'}`}>
        {value}
      </p>
    </div>
  );
}

// ─── Squarified treemap layout ───────────────────────────────────

interface TreemapRect {
  x: number;
  y: number;
  w: number;
  h: number;
  data: any;
}

interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function squarify(items: any[], bounds: LayoutRect, total: number): TreemapRect[] {
  if (items.length === 0 || total === 0) return [];
  if (items.length === 1) {
    return [{ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, data: items[0] }];
  }

  const results: TreemapRect[] = [];
  let remaining = [...items];
  let currentBounds = { ...bounds };
  let remainingTotal = total;

  while (remaining.length > 0) {
    const isWide = currentBounds.w >= currentBounds.h;
    const sideLength = isWide ? currentBounds.h : currentBounds.w;

    // Find the best row
    let row: any[] = [remaining[0]];
    let rowTotal = remaining[0].value;
    let bestAspect = worstAspectRatio(row, rowTotal, sideLength, remainingTotal, currentBounds);

    for (let i = 1; i < remaining.length; i++) {
      const newRow = [...row, remaining[i]];
      const newTotal = rowTotal + remaining[i].value;
      const newAspect = worstAspectRatio(newRow, newTotal, sideLength, remainingTotal, currentBounds);

      if (newAspect <= bestAspect) {
        row = newRow;
        rowTotal = newTotal;
        bestAspect = newAspect;
      } else {
        break;
      }
    }

    // Layout the row
    const rowArea = (rowTotal / remainingTotal) * currentBounds.w * currentBounds.h;
    const rowLength = isWide ? rowArea / currentBounds.h : rowArea / currentBounds.w;

    let offset = 0;
    for (const item of row) {
      const itemFraction = item.value / rowTotal;
      if (isWide) {
        const h = sideLength * itemFraction;
        results.push({ x: currentBounds.x, y: currentBounds.y + offset, w: rowLength, h, data: item });
        offset += h;
      } else {
        const w = sideLength * itemFraction;
        results.push({ x: currentBounds.x + offset, y: currentBounds.y, w, h: rowLength, data: item });
        offset += w;
      }
    }

    // Update bounds
    if (isWide) {
      currentBounds = {
        x: currentBounds.x + rowLength,
        y: currentBounds.y,
        w: currentBounds.w - rowLength,
        h: currentBounds.h,
      };
    } else {
      currentBounds = {
        x: currentBounds.x,
        y: currentBounds.y + rowLength,
        w: currentBounds.w,
        h: currentBounds.h - rowLength,
      };
    }

    remainingTotal -= rowTotal;
    remaining = remaining.slice(row.length);
  }

  return results;
}

function worstAspectRatio(row: any[], rowTotal: number, sideLength: number, total: number, bounds: LayoutRect): number {
  const area = (rowTotal / total) * bounds.w * bounds.h;
  const rowLength = area / sideLength;

  let worst = 0;
  for (const item of row) {
    const fraction = item.value / rowTotal;
    const w = rowLength;
    const h = sideLength * fraction;
    const aspect = Math.max(w / Math.max(h, 0.001), h / Math.max(w, 0.001));
    worst = Math.max(worst, aspect);
  }
  return worst;
}

// ─── Canvas helpers ──────────────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexToRGBA(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
