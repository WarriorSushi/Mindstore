'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Heart, Loader2, Smile, Frown, Meh, TrendingUp, TrendingDown,
  Minus, RefreshCw, Calendar, BarChart3, Sparkles, ArrowRight,
  MessageCircle, FileText, Globe, Type, BookOpenCheck, Gem,
  MessageSquare, Zap, Sun, Cloud, CloudRain, Info,
} from 'lucide-react';
import { PageTransition, Stagger } from '@/components/PageTransition';
import { EmptyFeatureState } from '@/components/EmptyFeatureState';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { usePageTitle } from "@/lib/use-page-title";

// ─── Types ──────────────────────────────────────────────────────

interface DailyMood {
  date: string;
  avgScore: number;
  count: number;
  dominantMood: string;
}

interface WeeklyMood {
  week: string;
  avgScore: number;
  count: number;
}

interface MonthlyTrend {
  month: string;
  avgScore: number;
  count: number;
  label: string;
}

interface SummaryData {
  analyzed: number;
  total: number;
  overallMood: string;
  overallScore: number;
  distribution: Record<string, number>;
  happiest: MemoryHighlight[];
  saddest: MemoryHighlight[];
  moodBySource: Record<string, { count: number; avgScore: number; label: string }>;
  trends: MonthlyTrend[];
}

interface MemoryHighlight {
  id: string;
  title: string;
  content: string;
  score: number;
  sourceType: string;
  createdAt: string;
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

const moodConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  positive: { icon: Smile, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Positive' },
  negative: { icon: Frown, color: 'text-rose-400', bg: 'bg-rose-500/10', label: 'Negative' },
  neutral: { icon: Meh, color: 'text-zinc-400', bg: 'bg-zinc-500/10', label: 'Neutral' },
  mixed: { icon: Cloud, color: 'text-sky-400', bg: 'bg-sky-500/10', label: 'Mixed' },
  unknown: { icon: Meh, color: 'text-zinc-500', bg: 'bg-zinc-500/10', label: 'Unknown' },
};

// Heatmap color scale (score → color) — teal/emerald positive, rose negative, zinc neutral
function getHeatmapColor(score: number, count: number): string {
  if (count === 0) return 'bg-white/[0.02]';
  if (score >= 0.5) return 'bg-emerald-500/60';
  if (score >= 0.3) return 'bg-emerald-500/40';
  if (score >= 0.1) return 'bg-teal-500/30';
  if (score >= -0.1) return 'bg-zinc-500/20';
  if (score >= -0.3) return 'bg-amber-500/30';
  if (score >= -0.5) return 'bg-rose-500/35';
  return 'bg-rose-500/50';
}

function getScoreColor(score: number): string {
  if (score >= 0.3) return 'text-emerald-400';
  if (score >= 0.1) return 'text-teal-400';
  if (score >= -0.1) return 'text-zinc-400';
  if (score >= -0.3) return 'text-amber-400';
  return 'text-rose-400';
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr + '-01');
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── Main Component ─────────────────────────────────────────────

export default function SentimentPage() {
  usePageTitle("Sentiment Analysis");
  const router = useRouter();
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [daily, setDaily] = useState<DailyMood[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [resultsRes, summaryRes] = await Promise.all([
        fetch('/api/v1/plugins/sentiment-timeline?action=results'),
        fetch('/api/v1/plugins/sentiment-timeline?action=summary'),
      ]);

      if (resultsRes.ok) {
        const data = await resultsRes.json();
        setDaily(data.daily || []);
      }
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load sentiment data';
      setError(msg);
      toast.error('Could not load sentiment timeline', { description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/v1/plugins/sentiment-timeline?action=analyze');
      if (!res.ok) throw new Error('Analysis failed');
      const data = await res.json();
      if (data.analyzed > 0) {
        toast.success(`Analyzed ${data.analyzed} memories`, {
          description: data.aiPowered ? 'AI-powered sentiment analysis' : 'Lexicon-based analysis',
        });
        await fetchData(); // Refresh
      } else {
        toast.info(data.message || 'All memories analyzed');
      }
    } catch (e) {
      toast.error('Sentiment analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  const needsAnalysis = summary && summary.analyzed < summary.total;
  const hasData = summary && summary.analyzed > 0;

  return (
    <PageTransition className="space-y-6 md:space-y-8">
      {/* Header */}
      <Stagger>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em]">Sentiment Timeline</h1>
            <p className="text-[13px] text-zinc-500 mt-0.5">The emotional arc of your knowledge</p>
          </div>
          <div className="flex items-center gap-2">
            {needsAnalysis && (
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 text-[12px] font-medium transition-all hover:bg-teal-500/15 active:scale-[0.96] disabled:opacity-50"
              >
                {analyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">{analyzing ? 'Analyzing…' : `Analyze ${summary!.total - summary!.analyzed} memories`}</span>
                <span className="sm:hidden">{analyzing ? '…' : 'Analyze'}</span>
              </button>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] text-[12px] font-medium text-zinc-400 transition-all active:scale-[0.96] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </Stagger>

      {/* Loading */}
      {loading && !hasData && (
        <Stagger>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                  <div className="animate-pulse rounded-lg bg-white/[0.04] w-8 h-8" />
                  <div className="animate-pulse rounded-xl bg-white/[0.04] h-6 w-14" />
                  <div className="animate-pulse rounded-xl bg-white/[0.04] h-3 w-20" />
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
              <div className="animate-pulse rounded-xl bg-white/[0.04] h-5 w-36" />
              <div className="animate-pulse rounded-xl bg-white/[0.04] h-40 w-full" />
            </div>
          </div>
        </Stagger>
      )}

      {/* Error */}
      {error && (
        <Stagger>
          <div className="text-center py-12">
            <p className="text-[13px] text-rose-400">{error}</p>
            <button onClick={fetchData} className="mt-3 text-[12px] text-teal-400 hover:underline">Retry</button>
          </div>
        </Stagger>
      )}

      {/* Empty State */}
      {!loading && summary && summary.analyzed === 0 && (
        <Stagger>
          <EmptyFeatureState
            icon={Heart}
            title="Understand the emotional tone of your knowledge"
            description="Sentiment Timeline reveals the emotional arc across your memories — are your notes optimistic, neutral, or critical? Run an analysis to find out."
            ctaText="Import your first data →"
            ctaHref="/app/import"
            secondaryText="or explore with demo data"
            secondaryHref="/app?demo=true"
            onAction={runAnalysis}
            actionLabel={analyzing ? 'Analyzing…' : `Analyze ${summary.total} memories`}
            actionIcon={Sparkles}
            actionLoading={analyzing}
          />
        </Stagger>
      )}

      {/* Content */}
      {hasData && summary && (
        <>
          {/* Overall Mood Card */}
          <Stagger>
            <OverallMoodCard summary={summary} />
          </Stagger>

          {/* Distribution + Stats Row */}
          <Stagger>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(summary.distribution)
                .sort((a, b) => b[1] - a[1])
                .map(([label, count]) => {
                  const cfg = moodConfig[label] || moodConfig.unknown;
                  const pct = summary.analyzed > 0 ? Math.round((count / summary.analyzed) * 100) : 0;
                  return (
                    <div key={label} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                          <cfg.icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                        </div>
                        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.06em]">{cfg.label}</span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-[24px] font-bold tabular-nums ${cfg.color}`}>{pct}%</span>
                        <span className="text-[11px] text-zinc-600">{count} memories</span>
                      </div>
                      {/* Distribution bar */}
                      <div className="mt-2 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            label === 'positive' ? 'bg-emerald-500' :
                            label === 'negative' ? 'bg-rose-500' :
                            label === 'mixed' ? 'bg-sky-500' : 'bg-zinc-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </Stagger>

          {/* Calendar Heatmap */}
          {daily.length > 0 && (
            <Stagger>
              <CalendarHeatmap daily={daily} />
            </Stagger>
          )}

          {/* Monthly Trend Chart */}
          {summary.trends.length > 1 && (
            <Stagger>
              <TrendChart trends={summary.trends} />
            </Stagger>
          )}

          {/* Mood by Source */}
          {Object.keys(summary.moodBySource).length > 0 && (
            <Stagger>
              <MoodBySourceCard moodBySource={summary.moodBySource} />
            </Stagger>
          )}

          {/* Happiest & Saddest */}
          <Stagger>
            <div className="grid md:grid-cols-2 gap-3">
              {summary.happiest && summary.happiest.length > 0 && (
                <HighlightCard
                  title="Most Positive"
                  icon={Sun}
                  color="emerald"
                  memories={summary.happiest}
                  router={router}
                />
              )}
              {summary.saddest && summary.saddest.length > 0 && (
                <HighlightCard
                  title="Most Negative"
                  icon={CloudRain}
                  color="rose"
                  memories={summary.saddest}
                  router={router}
                />
              )}
            </div>
          </Stagger>

          {/* Analysis Progress */}
          {needsAnalysis && (
            <Stagger>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-[12px] text-zinc-400">
                      {summary.analyzed} of {summary.total} memories analyzed
                    </span>
                  </div>
                  <button
                    onClick={runAnalysis}
                    disabled={analyzing}
                    className="text-[11px] text-teal-400 hover:text-teal-300 font-medium transition-colors disabled:opacity-50"
                  >
                    {analyzing ? 'Analyzing…' : 'Analyze more'}
                  </button>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-teal-500 transition-all"
                    style={{ width: `${Math.round((summary.analyzed / summary.total) * 100)}%` }}
                  />
                </div>
              </div>
            </Stagger>
          )}
        </>
      )}
    </PageTransition>
  );
}

// ──────────────────────────────────────────────────────────────
// Overall Mood Card
// ──────────────────────────────────────────────────────────────

function OverallMoodCard({ summary }: { summary: SummaryData }) {
  const cfg = moodConfig[summary.overallMood] || moodConfig.unknown;
  const scoreDisplay = summary.overallScore >= 0 ? `+${summary.overallScore.toFixed(2)}` : summary.overallScore.toFixed(2);

  // Determine trend direction from monthly data
  let trendDirection: 'up' | 'down' | 'flat' = 'flat';
  if (summary.trends.length >= 2) {
    const lastTwo = summary.trends.slice(-2);
    const diff = lastTwo[1].avgScore - lastTwo[0].avgScore;
    if (diff > 0.05) trendDirection = 'up';
    else if (diff < -0.05) trendDirection = 'down';
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      <div className="relative p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-teal-400" />
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.08em]">Overall Mood</span>
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center`}>
                <cfg.icon className={`w-5 h-5 ${cfg.color}`} />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-[24px] md:text-[28px] font-bold tracking-[-0.04em] ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  <span className={`text-[14px] font-medium tabular-nums ${getScoreColor(summary.overallScore)}`}>
                    {scoreDisplay}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {trendDirection === 'up' && <TrendingUp className="w-3 h-3 text-emerald-400" />}
                  {trendDirection === 'down' && <TrendingDown className="w-3 h-3 text-rose-400" />}
                  {trendDirection === 'flat' && <Minus className="w-3 h-3 text-zinc-500" />}
                  <span className="text-[11px] text-zinc-500">
                    {trendDirection === 'up' ? 'Trending more positive' :
                     trendDirection === 'down' ? 'Trending more negative' :
                     'Mood is stable'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-4 md:gap-6 shrink-0 text-right">
            <div>
              <p className="text-[22px] md:text-[26px] font-semibold tabular-nums">{summary.analyzed}</p>
              <p className="text-[10px] text-zinc-600 font-medium mt-0.5">Analyzed</p>
            </div>
            <div>
              <p className="text-[22px] md:text-[26px] font-semibold tabular-nums">{summary.trends.length}</p>
              <p className="text-[10px] text-zinc-600 font-medium mt-0.5">Months</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Calendar Heatmap — GitHub-contribution-style mood heatmap
// ──────────────────────────────────────────────────────────────

function CalendarHeatmap({ daily }: { daily: DailyMood[] }) {
  const [hoveredDay, setHoveredDay] = useState<DailyMood | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  if (daily.length === 0) return null;

  // Build a map for quick lookup
  const dayMap: Record<string, DailyMood> = {};
  for (const d of daily) dayMap[d.date] = d;

  // Calculate date range — show last 365 days or from first data point
  const today = new Date();
  const firstDate = new Date(daily[0].date);
  const startDate = new Date(Math.max(firstDate.getTime(), today.getTime() - 365 * 24 * 60 * 60 * 1000));
  // Align to Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay());

  // Build week columns
  const weeks: { date: Date; key: string }[][] = [];
  let currentWeek: { date: Date; key: string }[] = [];
  const cursor = new Date(startDate);

  while (cursor <= today) {
    const key = cursor.toISOString().split('T')[0];
    currentWeek.push({ date: new Date(cursor), key });
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  // Month labels
  const monthLabels: { label: string; weekIndex: number }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks.length; w++) {
    const firstDay = weeks[w][0]?.date;
    if (firstDay) {
      const month = firstDay.getMonth();
      if (month !== lastMonth) {
        monthLabels.push({
          label: firstDay.toLocaleDateString('en-US', { month: 'short' }),
          weekIndex: w,
        });
        lastMonth = month;
      }
    }
  }

  const DAY_SIZE = 12;
  const GAP = 2;
  const CELL = DAY_SIZE + GAP;

  function handleMouseEnter(day: DailyMood | null, e: React.MouseEvent) {
    setHoveredDay(day);
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }

  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 md:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-teal-400" />
          <span className="text-[13px] font-medium text-zinc-300">Mood Calendar</span>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-600">negative</span>
          <div className="flex gap-[2px]">
            <div className="w-[10px] h-[10px] rounded-[2px] bg-rose-500/50" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-rose-500/35" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-amber-500/30" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-zinc-500/20" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-teal-500/30" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-emerald-500/40" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-emerald-500/60" />
          </div>
          <span className="text-[10px] text-zinc-600">positive</span>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-none" ref={containerRef}>
        <div className="relative" style={{ minWidth: weeks.length * CELL + 24 }}>
          {/* Month labels */}
          <div className="flex mb-1" style={{ paddingLeft: 24 }}>
            {monthLabels.map((m, i) => (
              <span
                key={i}
                className="text-[9px] text-zinc-600 font-medium absolute"
                style={{ left: 24 + m.weekIndex * CELL }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div className="flex mt-4" style={{ gap: 0 }}>
            {/* Day labels */}
            <div className="shrink-0" style={{ width: 24 }}>
              {dayLabels.map((label, i) => (
                <div key={i} style={{ height: CELL }} className="flex items-center">
                  <span className="text-[9px] text-zinc-600">{label}</span>
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="flex" style={{ gap: GAP }}>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                  {Array.from({ length: 7 }).map((_, di) => {
                    const day = week[di];
                    if (!day) return <div key={di} style={{ width: DAY_SIZE, height: DAY_SIZE }} />;
                    if (day.date > today) return <div key={di} style={{ width: DAY_SIZE, height: DAY_SIZE }} />;
                    const data = dayMap[day.key];
                    const colorClass = data ? getHeatmapColor(data.avgScore, data.count) : 'bg-white/[0.02]';

                    return (
                      <div
                        key={di}
                        className={`rounded-[2px] transition-all cursor-pointer hover:ring-1 hover:ring-white/20 ${colorClass}`}
                        style={{ width: DAY_SIZE, height: DAY_SIZE }}
                        onMouseEnter={(e) => handleMouseEnter(data || null, e)}
                        onMouseLeave={() => setHoveredDay(null)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Tooltip */}
          {hoveredDay && (
            <div
              className="absolute z-10 pointer-events-none"
              style={{ left: tooltipPos.x - 60, top: tooltipPos.y - 60 }}
            >
              <div className="bg-[#111113] border border-white/[0.1] rounded-xl p-2.5 shadow-xl min-w-[120px]">
                <p className="text-[11px] text-zinc-300 font-medium">{formatDate(hoveredDay.date)}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[13px] font-semibold tabular-nums ${getScoreColor(hoveredDay.avgScore)}`}>
                    {hoveredDay.avgScore >= 0 ? '+' : ''}{hoveredDay.avgScore.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {hoveredDay.count} {hoveredDay.count === 1 ? 'memory' : 'memories'}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 capitalize">{hoveredDay.dominantMood}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Monthly Trend Chart — Canvas-based line chart
// ──────────────────────────────────────────────────────────────

function TrendChart({ trends }: { trends: MonthlyTrend[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ trend: MonthlyTrend; x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || trends.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = 180;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const pad = { top: 20, right: 20, bottom: 30, left: 40 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Score range: -1 to 1, but typically -0.5 to 0.5
    const scores = trends.map(t => t.avgScore);
    const minScore = Math.min(-0.2, Math.min(...scores) - 0.1);
    const maxScore = Math.max(0.2, Math.max(...scores) + 0.1);
    const scoreRange = maxScore - minScore;

    const toX = (i: number) => pad.left + (i / (trends.length - 1)) * chartW;
    const toY = (score: number) => pad.top + (1 - (score - minScore) / scoreRange) * chartH;

    // Zero line
    const zeroY = toY(0);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(width - pad.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Zero label
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText('0', pad.left - 6, zeroY + 3);

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
    gradient.addColorStop(0, 'rgba(20, 184, 166, 0.15)'); // teal
    gradient.addColorStop(0.5, 'rgba(20, 184, 166, 0.03)');
    gradient.addColorStop(1, 'rgba(244, 63, 94, 0.08)'); // rose

    // Area fill
    ctx.beginPath();
    ctx.moveTo(toX(0), zeroY);
    for (let i = 0; i < trends.length; i++) {
      ctx.lineTo(toX(i), toY(trends[i].avgScore));
    }
    ctx.lineTo(toX(trends.length - 1), zeroY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < trends.length; i++) {
      const x = toX(i);
      const y = toY(trends[i].avgScore);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#14b8a6'; // teal-500
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Points
    for (let i = 0; i < trends.length; i++) {
      const x = toX(i);
      const y = toY(trends[i].avgScore);
      const score = trends[i].avgScore;

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = score >= 0.1 ? '#10b981' : score <= -0.1 ? '#f43f5e' : '#71717a';
      ctx.fill();
      ctx.strokeStyle = '#0a0a0b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // X-axis labels — show every nth label to avoid crowding
    const labelEvery = Math.max(1, Math.ceil(trends.length / 8));
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';
    for (let i = 0; i < trends.length; i += labelEvery) {
      ctx.fillText(formatMonth(trends[i].month), toX(i), height - 8);
    }
    // Always show last label
    if ((trends.length - 1) % labelEvery !== 0) {
      ctx.fillText(formatMonth(trends[trends.length - 1].month), toX(trends.length - 1), height - 8);
    }

  }, [trends]);

  function handleCanvasMove(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas || trends.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pad = { left: 40, right: 20 };
    const chartW = rect.width - pad.left - pad.right;
    const relX = (x - pad.left) / chartW;
    const idx = Math.round(relX * (trends.length - 1));
    if (idx >= 0 && idx < trends.length) {
      const ptX = pad.left + (idx / (trends.length - 1)) * chartW;
      setHoveredPoint({ trend: trends[idx], x: ptX, y: e.clientY - rect.top });
    } else {
      setHoveredPoint(null);
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-teal-400" />
        <span className="text-[13px] font-medium text-zinc-300">Monthly Mood Trend</span>
        <span className="text-[10px] text-zinc-600 ml-auto">{trends.length} months</span>
      </div>

      <div ref={containerRef} className="relative">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair"
          onMouseMove={handleCanvasMove}
          onMouseLeave={() => setHoveredPoint(null)}
        />

        {hoveredPoint && (
          <div
            className="absolute z-10 pointer-events-none"
            style={{ left: hoveredPoint.x - 50, top: hoveredPoint.y - 65 }}
          >
            <div className="bg-[#111113] border border-white/[0.1] rounded-xl p-2.5 shadow-xl min-w-[100px]">
              <p className="text-[11px] text-zinc-300 font-medium">{formatMonth(hoveredPoint.trend.month)}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[14px] font-bold tabular-nums ${getScoreColor(hoveredPoint.trend.avgScore)}`}>
                  {hoveredPoint.trend.avgScore >= 0 ? '+' : ''}{hoveredPoint.trend.avgScore.toFixed(2)}
                </span>
              </div>
              <span className="text-[10px] text-zinc-600">{hoveredPoint.trend.count} memories</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Mood by Source Type
// ──────────────────────────────────────────────────────────────

function MoodBySourceCard({ moodBySource }: { moodBySource: Record<string, { count: number; avgScore: number; label: string }> }) {
  const entries = Object.entries(moodBySource).sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 md:p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-teal-400" />
        <span className="text-[13px] font-medium text-zinc-300">Mood by Source</span>
      </div>
      <div className="space-y-2.5">
        {entries.map(([src, data]) => {
          const cfg = sourceConfig[src] || { icon: FileText, color: 'text-zinc-400', label: src };
          const SrcIcon = cfg.icon;
          const barWidth = Math.round(((data.avgScore + 1) / 2) * 100); // Normalize -1..1 to 0..100%
          const mCfg = moodConfig[data.label] || moodConfig.neutral;

          return (
            <div key={src} className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-[100px] shrink-0">
                <SrcIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
                <span className="text-[11px] text-zinc-400 font-medium truncate">{cfg.label}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="relative h-5 rounded-lg bg-white/[0.03] overflow-hidden">
                  {/* Center line (neutral) */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/[0.06]" />

                  {/* Score bar — starts from center */}
                  {data.avgScore >= 0 ? (
                    <div
                      className="absolute top-0 bottom-0 bg-emerald-500/30 rounded-r"
                      style={{ left: '50%', width: `${(data.avgScore / 1) * 50}%` }}
                    />
                  ) : (
                    <div
                      className="absolute top-0 bottom-0 bg-rose-500/30 rounded-l"
                      style={{ right: '50%', width: `${(Math.abs(data.avgScore) / 1) * 50}%` }}
                    />
                  )}

                  {/* Score label */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-[10px] font-semibold tabular-nums ${getScoreColor(data.avgScore)}`}>
                      {data.avgScore >= 0 ? '+' : ''}{data.avgScore.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <span className="text-[10px] text-zinc-600 w-[40px] shrink-0 text-right tabular-nums">
                {data.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Highlight Card — happiest/saddest memories
// ──────────────────────────────────────────────────────────────

function HighlightCard({
  title, icon: Icon, color, memories, router
}: {
  title: string;
  icon: any;
  color: 'emerald' | 'rose';
  memories: MemoryHighlight[];
  router: any;
}) {
  const accentMap = {
    emerald: {
      headerBg: 'bg-emerald-500/[0.04]',
      border: 'border-emerald-500/10',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-400',
    },
    rose: {
      headerBg: 'bg-rose-500/[0.04]',
      border: 'border-rose-500/10',
      iconBg: 'bg-rose-500/10',
      iconColor: 'text-rose-400',
    },
  };

  const accent = accentMap[color];

  return (
    <div className={`rounded-2xl border ${accent.border} bg-white/[0.02] overflow-hidden`}>
      <div className={`${accent.headerBg} px-4 py-3 flex items-center gap-2`}>
        <div className={`w-7 h-7 rounded-lg ${accent.iconBg} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${accent.iconColor}`} />
        </div>
        <span className="text-[13px] font-medium text-zinc-300">{title}</span>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {memories.map((m) => {
          const cfg = sourceConfig[m.sourceType] || { icon: FileText, color: 'text-zinc-400', label: m.sourceType };
          const SrcIcon = cfg.icon;

          return (
            <button
              key={m.id}
              onClick={() => router.push(`/app/explore?q=${encodeURIComponent(m.title)}`)}
              className="w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors group"
            >
              <div className="flex items-center gap-2 mb-1">
                <SrcIcon className={`w-3 h-3 ${cfg.color}`} />
                <span className="text-[11px] text-zinc-500 truncate flex-1">{m.title}</span>
                <span className={`text-[11px] font-semibold tabular-nums ${getScoreColor(m.score)}`}>
                  {m.score >= 0 ? '+' : ''}{m.score.toFixed(2)}
                </span>
              </div>
              <p className="text-[12px] text-zinc-400 line-clamp-2 leading-relaxed">{m.content}</p>
              {m.createdAt && (
                <p className="text-[10px] text-zinc-600 mt-1">
                  {new Date(m.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
