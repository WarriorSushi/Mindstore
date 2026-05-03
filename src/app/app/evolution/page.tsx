'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Loader2, Clock, Sparkles,
  ChevronRight, ArrowUpRight, ArrowDownRight, Minus,
  RotateCcw, Zap, Moon, Flame, MessageCircle, FileText,
  Globe, Type, BookOpenCheck, Gem, MessageSquare, Calendar,
  BarChart3,
} from 'lucide-react';
import { PageTransition, Stagger } from '@/components/PageTransition';
import { EmptyState } from '@/components/EmptyState';
import { EmptyFeatureState } from '@/components/EmptyFeatureState';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { usePageTitle } from "@/lib/use-page-title";

// ─── Types ──────────────────────────────────────────────────────────

interface PeriodTopic {
  topicId: string;
  count: number;
  memories: { id: string; title: string; preview: string; sourceType: string }[];
}

interface TimelinePeriod {
  label: string;
  shortLabel: string;
  start: string;
  end: string;
  totalCount: number;
  topics: PeriodTopic[];
}

interface Topic {
  id: string;
  label: string;
  keywords: string[];
  memoryCount: number;
  sourceTypes: Record<string, number>;
  coherence: number;
  color: string;
  peakPeriod?: string;
  peakCount?: number;
  firstSeen?: string;
  lastSeen?: string;
}

interface Shift {
  topicId: string;
  topicLabel: string;
  type: 'rising' | 'declining' | 'new' | 'dormant' | 'resurgent' | 'steady';
  description: string;
  periodLabel: string;
  magnitude: number;
}

interface Stats {
  totalMemories: number;
  topicCount: number;
  periodCount: number;
  granularity: string;
  dateRange: { start: string; end: string } | null;
  mostActiveMonth: string;
  insufficientData: boolean;
}

type Granularity = 'week' | 'month' | 'quarter';

// ─── Source Config ──────────────────────────────────────────────────

const sourceConfig: Record<string, { icon: any; color: string }> = {
  chatgpt: { icon: MessageCircle, color: 'text-green-400' },
  text: { icon: Type, color: 'text-teal-400' },
  file: { icon: FileText, color: 'text-blue-400' },
  url: { icon: Globe, color: 'text-orange-400' },
  kindle: { icon: BookOpenCheck, color: 'text-amber-400' },
  document: { icon: FileText, color: 'text-blue-400' },
  obsidian: { icon: Gem, color: 'text-sky-400' },
  reddit: { icon: MessageSquare, color: 'text-orange-400' },
};

// ─── Shift type config ──────────────────────────────────────────────

const shiftConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  rising: { icon: ArrowUpRight, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Rising' },
  new: { icon: Zap, color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20', label: 'New' },
  resurgent: { icon: RotateCcw, color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20', label: 'Comeback' },
  steady: { icon: Minus, color: 'text-zinc-400', bg: 'bg-zinc-500/10 border-zinc-500/20', label: 'Steady' },
  declining: { icon: ArrowDownRight, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Declining' },
  dormant: { icon: Moon, color: 'text-zinc-500', bg: 'bg-zinc-500/10 border-zinc-500/20', label: 'Dormant' },
};

// ─── Main Component ─────────────────────────────────────────────────

export default function TopicEvolutionPage() {
  usePageTitle("Topic Evolution");
  const router = useRouter();
  const [timeline, setTimeline] = useState<TimelinePeriod[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [hoveredPeriod, setHoveredPeriod] = useState<number | null>(null);
  const [expandedShift, setExpandedShift] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Fetch data ─────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/plugins/topic-evolution?granularity=${granularity}&maxTopics=10`);
      if (!res.ok) throw new Error('Failed to load evolution data');
      const data = await res.json();
      setTimeline(data.timeline || []);
      setTopics(data.topics || []);
      setShifts(data.shifts || []);
      setStats(data.stats || null);
    } catch (err: any) {
      const msg = err?.message || 'Something went wrong';
      setError(msg);
      toast.error('Could not load topic evolution', { description: msg });
    } finally {
      setLoading(false);
    }
  }, [granularity]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Stream Graph Canvas ────────────────────────────────────
  useEffect(() => {
    if (loading || !timeline.length || !topics.length) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // Calculate layout
    const padL = 48, padR = 24, padT = 32, padB = 56;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    // Get max stacked height per period
    const maxStack = Math.max(...timeline.map(p =>
      p.topics.reduce((sum, t) => sum + t.count, 0)
    ), 1);

    // Get visible topic IDs (filter to ones with data)
    const visibleTopics = topics.filter(t =>
      !selectedTopic || t.id === selectedTopic
    );

    // Clear
    ctx.clearRect(0, 0, W, H);

    // ─── Draw grid lines ──────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = padT + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();

      // Y-axis labels
      const val = Math.round(maxStack * (1 - i / gridLines));
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '10px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(val), padL - 8, y + 3);
    }

    // ─── Draw stacked area chart ──────────────────────────
    const slotW = chartW / Math.max(timeline.length - 1, 1);
    
    // Build stacked values bottom-up
    const stacks: { topicId: string; color: string; points: { x: number; y0: number; y1: number }[] }[] = [];
    
    // Reversed so first topic (largest) is on bottom
    const drawOrder = [...visibleTopics].reverse();
    
    for (const topic of drawOrder) {
      const points: { x: number; y0: number; y1: number }[] = [];
      
      for (let i = 0; i < timeline.length; i++) {
        const x = padL + slotW * i;
        const pt = timeline[i].topics.find(t => t.topicId === topic.id);
        const count = pt?.count || 0;
        
        // Sum of all previous stacks at this position
        const prevY1 = stacks.length > 0
          ? stacks[stacks.length - 1].points[i]?.y1 || 0
          : 0;
        
        const barH = (count / maxStack) * chartH;
        const y0 = padT + chartH - prevY1;
        const y1 = prevY1 + barH;
        
        points.push({ x, y0: padT + chartH - y1, y1 });
      }
      
      stacks.push({ topicId: topic.id, color: topic.color, points });
    }

    // Draw areas from top to bottom (reversed for proper layering)
    for (let s = stacks.length - 1; s >= 0; s--) {
      const stack = stacks[s];
      const isSelected = selectedTopic === stack.topicId;
      const isDimmed = selectedTopic && !isSelected;
      
      ctx.beginPath();
      
      // Top edge (left to right) with smoothing
      for (let i = 0; i < stack.points.length; i++) {
        const p = stack.points[i];
        if (i === 0) {
          ctx.moveTo(p.x, p.y0);
        } else {
          // Smooth curve between points
          const prev = stack.points[i - 1];
          const cpx = (prev.x + p.x) / 2;
          ctx.bezierCurveTo(cpx, prev.y0, cpx, p.y0, p.x, p.y0);
        }
      }
      
      // Bottom edge (right to left)
      const prevStack = s > 0 ? stacks[s - 1] : null;
      for (let i = stack.points.length - 1; i >= 0; i--) {
        const bottomY = prevStack
          ? prevStack.points[i].y0
          : padT + chartH;
        
        if (i === stack.points.length - 1) {
          ctx.lineTo(stack.points[i].x, bottomY);
        } else {
          const next = stack.points[i + 1];
          const nextBottomY = prevStack
            ? prevStack.points[i + 1].y0
            : padT + chartH;
          const cpx = (next.x + stack.points[i].x) / 2;
          ctx.bezierCurveTo(cpx, nextBottomY, cpx, bottomY, stack.points[i].x, bottomY);
        }
      }
      
      ctx.closePath();
      
      // Fill with gradient
      const alpha = isDimmed ? 0.08 : isSelected ? 0.45 : 0.25;
      ctx.fillStyle = hexToRgba(stack.color, alpha);
      ctx.fill();
      
      // Stroke top edge
      if (!isDimmed) {
        ctx.beginPath();
        for (let i = 0; i < stack.points.length; i++) {
          const p = stack.points[i];
          if (i === 0) {
            ctx.moveTo(p.x, p.y0);
          } else {
            const prev = stack.points[i - 1];
            const cpx = (prev.x + p.x) / 2;
            ctx.bezierCurveTo(cpx, prev.y0, cpx, p.y0, p.x, p.y0);
          }
        }
        ctx.strokeStyle = hexToRgba(stack.color, isSelected ? 0.8 : 0.4);
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();
      }
    }

    // ─── Draw hover indicator ─────────────────────────────
    if (hoveredPeriod !== null && hoveredPeriod < timeline.length) {
      const x = padL + slotW * hoveredPeriod;
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + chartH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Period highlight dot at top
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(x, padT - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // ─── X-axis labels ────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    
    // Show a reasonable number of labels
    const maxLabels = Math.min(timeline.length, Math.floor(chartW / 60));
    const step = Math.max(1, Math.ceil(timeline.length / maxLabels));
    
    for (let i = 0; i < timeline.length; i += step) {
      const x = padL + slotW * i;
      ctx.fillText(timeline[i].shortLabel, x, H - padB + 16);
      
      // Year label below if this is Jan or Q1
      if (timeline[i].shortLabel === 'Jan' || timeline[i].shortLabel === 'Q1' || i === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = '9px system-ui, -apple-system, sans-serif';
        ctx.fillText(timeline[i].label.split(' ').pop() || '', x, H - padB + 28);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '10px system-ui, -apple-system, sans-serif';
      }
    }
    // Always show last label
    if (timeline.length > 1) {
      const lastIdx = timeline.length - 1;
      const lastX = padL + slotW * lastIdx;
      ctx.fillText(timeline[lastIdx].shortLabel, lastX, H - padB + 16);
    }

  }, [timeline, topics, loading, selectedTopic, hoveredPeriod]);

  // ─── Canvas mouse tracking ──────────────────────────────────
  const handleCanvasMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!timeline.length || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const padL = 48, padR = 24;
    const chartW = rect.width - padL - padR;
    const x = e.clientX - rect.left - padL;
    const slotW = chartW / Math.max(timeline.length - 1, 1);
    const idx = Math.round(x / slotW);
    if (idx >= 0 && idx < timeline.length) {
      setHoveredPeriod(idx);
    } else {
      setHoveredPeriod(null);
    }
  }, [timeline]);

  // ─── Render ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="animate-pulse rounded-xl bg-white/[0.04] h-7 w-48" />
          <div className="animate-pulse rounded-xl bg-white/[0.04] h-4 w-64" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
              <div className="animate-pulse rounded-lg bg-white/[0.04] w-8 h-8" />
              <div className="animate-pulse rounded-xl bg-white/[0.04] h-6 w-12" />
              <div className="animate-pulse rounded-xl bg-white/[0.04] h-3 w-20" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
          <div className="animate-pulse rounded-xl bg-white/[0.04] h-5 w-36" />
          <div className="animate-pulse rounded-xl bg-white/[0.04] h-40 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-rose-400" />
        </div>
        <p className="text-sm text-zinc-500">{error}</p>
        <button
          onClick={fetchData}
          className="h-8 px-4 rounded-xl bg-white/[0.06] border border-white/[0.06] text-xs text-zinc-300 hover:bg-white/[0.1] transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (stats?.insufficientData || !timeline.length) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <Stagger>
            <div>
              <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em] text-white">
                Topic Evolution
              </h1>
              <p className="text-[13px] text-zinc-500 mt-1">
                How your interests have changed over time
              </p>
            </div>
          </Stagger>
          <div className="mt-8">
            <EmptyFeatureState
              icon={TrendingUp}
              title="Watch your interests evolve over time"
              description="Topic Evolution tracks how your focus areas shift week by week. Import memories spanning at least a few weeks to reveal the arc of your intellectual journey."
              ctaText="Import your first data →"
              ctaHref="/app/import"
              secondaryText="or explore with demo data"
              secondaryHref="/app?demo=true"
            />
          </div>
        </div>
      </PageTransition>
    );
  }

  const maxPeriodCount = Math.max(...timeline.map(p => p.totalCount), 1);
  const hoveredPeriodData = hoveredPeriod !== null ? timeline[hoveredPeriod] : null;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <Stagger>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em] text-white">
                Topic Evolution
              </h1>
              <p className="text-[13px] text-zinc-500 mt-1">
                How your interests have changed over time
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Granularity toggle */}
              {(['week', 'month', 'quarter'] as Granularity[]).map(g => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`h-8 px-3 rounded-full text-xs font-medium transition-all ${
                    granularity === g
                      ? 'bg-teal-500/15 text-teal-400 border border-teal-500/25'
                      : 'bg-white/[0.04] text-zinc-500 border border-white/[0.06] hover:text-zinc-300'
                  }`}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </Stagger>

        {/* Stats bar */}
        <Stagger>
          <div className="flex flex-wrap gap-3 mb-6">
            {stats && (
              <>
                <div className="flex items-center gap-2 h-8 px-3 rounded-full bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-400">
                  <BarChart3 className="w-3.5 h-3.5 text-teal-400" />
                  <span className="text-zinc-300 font-medium tabular-nums">{stats.totalMemories}</span>
                  memories
                </div>
                <div className="flex items-center gap-2 h-8 px-3 rounded-full bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-400">
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-zinc-300 font-medium tabular-nums">{stats.topicCount}</span>
                  topics
                </div>
                <div className="flex items-center gap-2 h-8 px-3 rounded-full bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-400">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-zinc-300 font-medium tabular-nums">{stats.periodCount}</span>
                  periods
                </div>
                {stats.mostActiveMonth && (
                  <div className="flex items-center gap-2 h-8 px-3 rounded-full bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-400">
                    <Flame className="w-3.5 h-3.5 text-orange-400" />
                    Peak: <span className="text-zinc-300 font-medium">{stats.mostActiveMonth}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </Stagger>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stream Graph */}
          <Stagger>
            <div className="lg:col-span-2">
              <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                {/* Chart header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-teal-400" />
                    <span className="text-xs font-medium text-zinc-300">Knowledge Stream</span>
                  </div>
                  {selectedTopic && (
                    <button
                      onClick={() => setSelectedTopic(null)}
                      className="text-xs text-teal-400 hover:text-teal-300 transition-colors"
                    >
                      Show all topics
                    </button>
                  )}
                </div>
                
                {/* Canvas chart */}
                <div
                  ref={containerRef}
                  className="relative w-full"
                  style={{ height: 'clamp(280px, 40vh, 420px)' }}
                >
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 cursor-crosshair"
                    onMouseMove={handleCanvasMove}
                    onMouseLeave={() => setHoveredPeriod(null)}
                  />
                  
                  {/* Hover tooltip */}
                  {hoveredPeriodData && hoveredPeriod !== null && (
                    <div
                      className="absolute pointer-events-none z-10"
                      style={{
                        left: `${48 + ((containerRef.current?.getBoundingClientRect().width || 0) - 72) / Math.max(timeline.length - 1, 1) * hoveredPeriod}px`,
                        top: '8px',
                        transform: hoveredPeriod > timeline.length / 2 ? 'translateX(-100%)' : 'translateX(0)',
                      }}
                    >
                      <div className="bg-[#111113] border border-white/[0.1] rounded-xl px-3 py-2.5 shadow-2xl min-w-[160px]">
                        <p className="text-[11px] font-medium text-zinc-300 mb-1.5">
                          {hoveredPeriodData.label}
                        </p>
                        <p className="text-[10px] text-zinc-500 mb-2">
                          {hoveredPeriodData.totalCount} total memories
                        </p>
                        <div className="space-y-1">
                          {hoveredPeriodData.topics
                            .filter(t => t.count > 0)
                            .sort((a, b) => b.count - a.count)
                            .slice(0, 6)
                            .map(pt => {
                              const topic = topics.find(t => t.id === pt.topicId);
                              if (!topic) return null;
                              return (
                                <div key={pt.topicId} className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <div
                                      className="w-2 h-2 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: topic.color }}
                                    />
                                    <span className="text-[10px] text-zinc-400 truncate">
                                      {topic.label}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-zinc-300 font-medium tabular-nums flex-shrink-0">
                                    {pt.count}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Topic legend */}
                <div className="px-5 py-3 border-t border-white/[0.04] flex flex-wrap gap-2">
                  {topics.map(topic => (
                    <button
                      key={topic.id}
                      onClick={() => setSelectedTopic(
                        selectedTopic === topic.id ? null : topic.id
                      )}
                      className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] transition-all ${
                        selectedTopic === topic.id
                          ? 'bg-white/[0.08] text-zinc-200 ring-1 ring-white/[0.1]'
                          : selectedTopic
                            ? 'bg-white/[0.02] text-zinc-600 hover:text-zinc-400'
                            : 'bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-300'
                      }`}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: topic.color, opacity: selectedTopic && selectedTopic !== topic.id ? 0.3 : 1 }}
                      />
                      <span className="truncate max-w-[100px]">{topic.label}</span>
                      <span className="text-[9px] text-zinc-600 tabular-nums">{topic.memoryCount}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Period breakdown — bar chart underneath on larger screens */}
              <div className="mt-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden hidden md:block">
                <div className="px-5 py-3 border-b border-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-medium text-zinc-300">Activity by Period</span>
                  </div>
                </div>
                <div className="p-4 overflow-x-auto">
                  <div className="flex items-end gap-[3px] h-[100px]" style={{ minWidth: `${timeline.length * 24}px` }}>
                    {timeline.map((period, i) => {
                      const h = Math.max(2, (period.totalCount / maxPeriodCount) * 88);
                      const isHovered = hoveredPeriod === i;
                      return (
                        <div
                          key={i}
                          className="flex flex-col items-center flex-1 min-w-[20px] group cursor-pointer"
                          onMouseEnter={() => setHoveredPeriod(i)}
                          onMouseLeave={() => setHoveredPeriod(null)}
                          title={`${period.label}: ${period.totalCount} memories`}
                        >
                          <div
                            className={`w-full rounded-t-[3px] transition-all duration-150 ${
                              isHovered ? 'bg-teal-400/50' : 'bg-teal-500/20'
                            }`}
                            style={{ height: `${h}px` }}
                          />
                          {(i === 0 || i === timeline.length - 1 || i % Math.ceil(timeline.length / 8) === 0) && (
                            <span className="text-[8px] text-zinc-600 mt-1 truncate w-full text-center">
                              {period.shortLabel}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </Stagger>

          {/* Right sidebar: Shifts & Topic Details */}
          <Stagger>
            <div className="space-y-4">
              {/* Interest Shifts */}
              <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                <div className="px-5 py-3 border-b border-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-400" />
                    <span className="text-xs font-medium text-zinc-300">Interest Shifts</span>
                    <span className="text-[10px] text-zinc-600 ml-auto tabular-nums">{shifts.length}</span>
                  </div>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {shifts.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <p className="text-xs text-zinc-600">No significant shifts detected yet</p>
                    </div>
                  ) : (
                    shifts.map((shift, i) => {
                      const config = shiftConfig[shift.type] || shiftConfig.steady;
                      const ShiftIcon = config.icon;
                      const topic = topics.find(t => t.id === shift.topicId);
                      const isExpanded = expandedShift === `${shift.topicId}-${i}`;

                      return (
                        <button
                          key={`${shift.topicId}-${i}`}
                          onClick={() => {
                            setExpandedShift(isExpanded ? null : `${shift.topicId}-${i}`);
                            setSelectedTopic(isExpanded ? null : shift.topicId);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-white/[0.02] transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-7 h-7 rounded-lg ${config.bg} border flex items-center justify-center flex-shrink-0 mt-0.5`}>
                              <ShiftIcon className={`w-3.5 h-3.5 ${config.color}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-medium text-zinc-300 truncate">
                                  {shift.topicLabel}
                                </span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${config.bg} border ${config.color}`}>
                                  {config.label}
                                </span>
                              </div>
                              {isExpanded && (
                                <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
                                  {shift.description}
                                </p>
                              )}
                              {isExpanded && topic && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {topic.keywords.slice(0, 4).map(kw => (
                                    <span key={kw} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-500">
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <ChevronRight className={`w-3.5 h-3.5 text-zinc-600 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Topic Detail (when selected) */}
              {selectedTopic && (() => {
                const topic = topics.find(t => t.id === selectedTopic);
                if (!topic) return null;

                return (
                  <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/[0.04]">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: topic.color }}
                        />
                        <span className="text-xs font-medium text-zinc-300 truncate">
                          {topic.label}
                        </span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      {/* Topic stats */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                          <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Memories</p>
                          <p className="text-sm font-semibold text-zinc-200 tabular-nums mt-0.5">{topic.memoryCount}</p>
                        </div>
                        <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                          <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Coherence</p>
                          <p className="text-sm font-semibold text-zinc-200 tabular-nums mt-0.5">{Math.round(topic.coherence * 100)}%</p>
                        </div>
                      </div>

                      {/* Peak & activity range */}
                      {(topic as any).peakPeriod && (
                        <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                          <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Peak Activity</p>
                          <p className="text-[11px] text-zinc-300 mt-0.5">{(topic as any).peakPeriod} · {(topic as any).peakCount} memories</p>
                        </div>
                      )}
                      {(topic as any).firstSeen && (
                        <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                          <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Active Range</p>
                          <p className="text-[11px] text-zinc-300 mt-0.5">{(topic as any).firstSeen} → {(topic as any).lastSeen}</p>
                        </div>
                      )}

                      {/* Keywords */}
                      <div>
                        <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5">Keywords</p>
                        <div className="flex flex-wrap gap-1">
                          {topic.keywords.map(kw => (
                            <span
                              key={kw}
                              className="text-[10px] px-2 py-1 rounded-md bg-white/[0.04] text-zinc-400 border border-white/[0.04]"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Source breakdown */}
                      <div>
                        <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5">Sources</p>
                        <div className="space-y-1">
                          {Object.entries(topic.sourceTypes)
                            .sort(([, a], [, b]) => b - a)
                            .map(([type, count]) => {
                              const sc = sourceConfig[type] || sourceConfig.text;
                              const Icon = sc.icon;
                              const pct = Math.round((count / topic.memoryCount) * 100);
                              return (
                                <div key={type} className="flex items-center gap-2">
                                  <Icon className={`w-3 h-3 ${sc.color} flex-shrink-0`} />
                                  <span className="text-[10px] text-zinc-500 flex-1">{type}</span>
                                  <div className="w-16 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-teal-500/40"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-[9px] text-zinc-600 tabular-nums w-6 text-right">{count}</span>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      {/* Sample memories from most recent period */}
                      {(() => {
                        // Get memories from all periods for this topic
                        const topicMemories = timeline
                          .flatMap(p => p.topics.find(t => t.topicId === selectedTopic)?.memories || [])
                          .slice(0, 4);

                        if (!topicMemories.length) return null;

                        return (
                          <div>
                            <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5">Sample Memories</p>
                            <div className="space-y-1.5">
                              {topicMemories.map(mem => {
                                const sc = sourceConfig[mem.sourceType] || sourceConfig.text;
                                const Icon = sc.icon;
                                return (
                                  <button
                                    key={mem.id}
                                    onClick={() => router.push(`/app/explore?q=${encodeURIComponent(mem.title)}`)}
                                    className="w-full text-left rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2 hover:bg-white/[0.04] transition-colors"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Icon className={`w-3 h-3 ${sc.color} flex-shrink-0`} />
                                      <span className="text-[10px] text-zinc-400 truncate">{mem.title}</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-600 mt-0.5 line-clamp-1">{mem.preview}</p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}

              {/* Topic list (when nothing selected) */}
              {!selectedTopic && (
                <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                  <div className="px-5 py-3 border-b border-white/[0.04]">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-sky-400" />
                      <span className="text-xs font-medium text-zinc-300">Topics by Size</span>
                    </div>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {topics.map(topic => (
                      <button
                        key={topic.id}
                        onClick={() => setSelectedTopic(topic.id)}
                        className="w-full text-left px-4 py-2.5 hover:bg-white/[0.02] transition-colors flex items-center gap-3"
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: topic.color }}
                        />
                        <span className="text-[11px] text-zinc-300 truncate flex-1">{topic.label}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${(topic.memoryCount / (topics[0]?.memoryCount || 1)) * 100}%`,
                                backgroundColor: topic.color,
                                opacity: 0.5,
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-zinc-600 tabular-nums w-5 text-right">
                            {topic.memoryCount}
                          </span>
                        </div>
                        <ChevronRight className="w-3 h-3 text-zinc-700" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Stagger>
        </div>
      </div>
    </PageTransition>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
