'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PenTool, Loader2, RefreshCw, BarChart3, BookOpen, Hash,
  MessageCircle, FileText, Globe, Type, BookOpenCheck, Gem,
  MessageSquare, Zap, TrendingUp,
  AlertTriangle,
  AlignLeft, CaseSensitive, Quote,
  type LucideIcon,
} from 'lucide-react';
import { PageTransition, Stagger } from '@/components/PageTransition';
import { EmptyFeatureState } from '@/components/EmptyFeatureState';
import { toast } from 'sonner';
import { usePageTitle } from "@/lib/use-page-title";

// ─── Types ──────────────────────────────────────────────────────

interface Profile {
  // Readability
  avgGradeLevel: number;
  medianGradeLevel: number;
  readabilityLevel: string;
  avgReadingEase: number;
  easeLabel: string;

  // Vocabulary
  totalWords: number;
  uniqueWordCount: number;
  typeTokenRatio: number;
  avgVocabRichness: number;
  rareWordCount: number;
  topWords: { word: string; count: number; pct: number }[];
  topBigrams: { phrase: string; count: number }[];
  topTrigrams: { phrase: string; count: number }[];

  // Sentence
  avgSentenceLength: number;
  medianSentenceLength: number;
  totalSentences: number;
  sentenceLengthDistribution: Record<string, number>;

  // Word level
  avgWordLength: number;

  // Tone
  toneDistribution: Record<string, number>;
  dominantTone: string;

  // Patterns
  avgQuestionRate: number;
  avgExclamationRate: number;
  avgHedgingRate: number;
  avgConfidenceRate: number;

  // Complexity
  complexityScore: number;

  // By source
  styleBySource: {
    source: string;
    count: number;
    avgGrade: number;
    avgEase: number;
    avgSentenceLength: number;
    dominantTone: string;
  }[];

  // Evolution
  evolution: {
    month: string;
    count: number;
    avgGrade: number;
    avgEase: number;
    avgSentenceLength: number;
    avgWordLength: number;
    vocabRichness: number;
    questionRate: number;
    confidenceRate: number;
    dominantTone: string;
  }[];
}

// ─── Config ─────────────────────────────────────────────────────

const sourceConfig: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  chatgpt: { icon: MessageCircle, color: 'text-green-400', label: 'ChatGPT' },
  text: { icon: Type, color: 'text-teal-400', label: 'Text' },
  file: { icon: FileText, color: 'text-blue-400', label: 'File' },
  url: { icon: Globe, color: 'text-orange-400', label: 'URL' },
  kindle: { icon: BookOpenCheck, color: 'text-amber-400', label: 'Kindle' },
  document: { icon: FileText, color: 'text-blue-400', label: 'Document' },
  obsidian: { icon: Gem, color: 'text-sky-400', label: 'Obsidian' },
  reddit: { icon: MessageSquare, color: 'text-orange-400', label: 'Reddit' },
};

const toneConfig: Record<string, { color: string; bg: string; border: string; label: string }> = {
  formal: { color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', label: 'Formal' },
  casual: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'Casual' },
  technical: { color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20', label: 'Technical' },
  conversational: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Conversational' },
  neutral: { color: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', label: 'Neutral' },
};

// ─── Component ──────────────────────────────────────────────────

export default function WritingStylePage() {
  usePageTitle("Writing Style");
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [analyzed, setAnalyzed] = useState(0);
  const [totalEligible, setTotalEligible] = useState(0);
  const [selectedMetric, setSelectedMetric] = useState<'grade' | 'ease' | 'sentLen' | 'confidence'>('grade');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const histogramRef = useRef<HTMLCanvasElement>(null);

  // ─── Data fetching ───

  const fetchProfile = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/v1/plugins/writing-style?action=profile');
      if (!res.ok) throw new Error('Failed to load writing style data');
      const data = await res.json();
      setProfile(data.profile);
      setAnalyzed(data.analyzed);
      setTotalEligible(data.totalEligible);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load writing style data';
      setError(msg);
      toast.error('Could not load writing style profile', { description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/v1/plugins/writing-style?action=analyze');
      if (!res.ok) throw new Error('Analysis failed');
      const data = await res.json();
      toast.success(`Analyzed ${data.analyzed} memories`, { description: data.message });
      await fetchProfile();
    } catch (err: unknown) {
      toast.error('Analysis failed', {
        description: err instanceof Error ? err.message : 'Failed to analyze writing style',
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // ─── Evolution chart ───

  useEffect(() => {
    if (!profile?.evolution?.length || !canvasRef.current) return;
    drawEvolutionChart(canvasRef.current, profile.evolution, selectedMetric);
  }, [profile, selectedMetric]);

  // ─── Sentence histogram ───

  useEffect(() => {
    if (!profile?.sentenceLengthDistribution || !histogramRef.current) return;
    drawHistogram(histogramRef.current, profile.sentenceLengthDistribution);
  }, [profile]);

  // ─── Loading ───

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="animate-pulse rounded-xl bg-white/[0.04] h-7 w-40" />
          <div className="animate-pulse rounded-xl bg-white/[0.04] h-4 w-52" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
              <div className="animate-pulse rounded-lg bg-white/[0.04] w-8 h-8" />
              <div className="animate-pulse rounded-xl bg-white/[0.04] h-6 w-14" />
              <div className="animate-pulse rounded-xl bg-white/[0.04] h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
          <div className="animate-pulse rounded-xl bg-white/[0.04] h-5 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl bg-white/[0.04] h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Error ───

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-rose-400" />
          </div>
          <div className="text-[13px] text-zinc-400">{error}</div>
          <button
            onClick={() => { setLoading(true); fetchProfile(); }}
            className="text-[12px] text-teal-400 hover:text-teal-300 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ─── Empty / Not analyzed ───

  if (!profile) {
    return (
      <PageTransition>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Stagger>
            <div>
              <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em] text-zinc-100">
                Writing Style
              </h1>
              <p className="text-[13px] text-zinc-500 mt-1">
                Analyze your vocabulary, readability, and writing patterns
              </p>
            </div>
          </Stagger>
          <Stagger>
            <EmptyFeatureState
              icon={PenTool}
              title="Discover your writing fingerprint"
              description="Writing Style analyzes vocabulary richness, readability scores, tone distribution, and sentence patterns across all your memories. See how you write — and how it's evolving."
              ctaText="Import your first data →"
              ctaHref="/app/import"
              secondaryText="or explore with demo data"
              secondaryHref="/app?demo=true"
              onAction={runAnalysis}
              actionLabel={analyzing ? 'Analyzing…' : `Analyze ${totalEligible} memories`}
              actionIcon={Zap}
              actionLoading={analyzing}
            />
          </Stagger>
        </div>
      </PageTransition>
    );
  }

  // ─── Computed values ───

  const toneEntries = Object.entries(profile.toneDistribution).sort((a, b) => b[1] - a[1]);
  const totalTone = toneEntries.reduce((s, [, c]) => s + c, 0);
  const confidenceVsHedging = profile.avgConfidenceRate - profile.avgHedgingRate;
  const confidenceLabel = confidenceVsHedging > 0.05 ? 'Confident' :
    confidenceVsHedging < -0.05 ? 'Hedging' : 'Balanced';
  const notAllAnalyzed = analyzed < totalEligible;

  // ─── Main view ───

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <Stagger>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em] text-zinc-100">
                Writing Style
              </h1>
              <p className="text-[13px] text-zinc-500 mt-1">
                Your writing fingerprint across {analyzed.toLocaleString()} analyzed memories
              </p>
            </div>
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="h-8 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-300 text-[12px] transition-all flex items-center gap-1.5 shrink-0"
            >
              {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Re-analyze
            </button>
          </div>
        </Stagger>

        {/* Analysis progress bar */}
        {notAllAnalyzed && (
          <Stagger>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="text-zinc-500">{analyzed} of {totalEligible} memories analyzed</span>
                  <span className="text-teal-400 tabular-nums">{Math.round((analyzed / totalEligible) * 100)}%</span>
                </div>
                <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-teal-500/60 transition-all"
                    style={{ width: `${(analyzed / totalEligible) * 100}%` }}
                  />
                </div>
              </div>
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="h-7 px-3 rounded-lg bg-teal-600/20 border border-teal-500/20 text-teal-400 text-[11px] font-medium hover:bg-teal-600/30 transition-colors disabled:opacity-50 shrink-0"
              >
                {analyzing ? 'Analyzing…' : 'Analyze more'}
              </button>
            </div>
          </Stagger>
        )}

        {/* ─── Complexity Score + Core Stats Row ─── */}
        <Stagger>
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">

            {/* Complexity score card */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-teal-500/[0.04] to-transparent" />
              <div className="relative">
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-3">Complexity Score</div>
                <div className="text-[48px] font-bold text-zinc-100 leading-none tabular-nums tracking-tight">
                  {profile.complexityScore}
                </div>
                <div className="text-[13px] text-teal-400 font-medium mt-1">{profile.readabilityLevel}</div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="text-[11px] text-zinc-500">Reading ease</div>
                  <div className="text-[11px] text-zinc-400 font-medium tabular-nums">{profile.avgReadingEase}</div>
                  <div className="text-[10px] text-zinc-600">({profile.easeLabel})</div>
                </div>
                {/* Circular progress arc */}
                <div className="absolute top-5 right-5 w-16 h-16">
                  <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
                    <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3" />
                    <circle
                      cx="24" cy="24" r="20" fill="none"
                      stroke="#14b8a6" strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${(profile.complexityScore / 100) * 125.6} 125.6`}
                      className="transition-all duration-1000"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* Core stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Vocabulary"
                value={profile.uniqueWordCount.toLocaleString()}
                sub="unique words"
                icon={<CaseSensitive className="w-4 h-4 text-sky-400" />}
              />
              <StatCard
                label="Grade Level"
                value={profile.avgGradeLevel.toString()}
                sub={`≈ ${profile.readabilityLevel}`}
                icon={<BookOpen className="w-4 h-4 text-teal-400" />}
              />
              <StatCard
                label="Avg Sentence"
                value={`${profile.avgSentenceLength}`}
                sub="words / sentence"
                icon={<AlignLeft className="w-4 h-4 text-amber-400" />}
              />
              <StatCard
                label="Total Words"
                value={profile.totalWords >= 1000 ? `${(profile.totalWords / 1000).toFixed(1)}K` : profile.totalWords.toString()}
                sub={`${profile.totalSentences.toLocaleString()} sentences`}
                icon={<Hash className="w-4 h-4 text-emerald-400" />}
              />
            </div>
          </div>
        </Stagger>

        {/* ─── Tone + Writing Patterns Row ─── */}
        <Stagger>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Tone distribution */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Quote className="w-4 h-4 text-teal-400" />
                <span className="text-[13px] font-medium text-zinc-200">Tone Distribution</span>
              </div>
              <div className="space-y-2.5">
                {toneEntries.map(([tone, count]) => {
                  const cfg = toneConfig[tone] || toneConfig.neutral;
                  const pct = totalTone > 0 ? (count / totalTone) * 100 : 0;
                  return (
                    <div key={tone} className="group">
                      <div className="flex items-center justify-between text-[12px] mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${cfg.bg} ${cfg.border} border`} />
                          <span className={cfg.color}>{cfg.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 tabular-nums">{count}</span>
                          <span className="text-zinc-600 tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cfg.bg.replace('/10', '/40')} transition-all duration-700`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-white/[0.04]">
                <div className="text-[11px] text-zinc-500">
                  Dominant tone:{' '}
                  <span className={toneConfig[profile.dominantTone]?.color || 'text-zinc-400'}>
                    {toneConfig[profile.dominantTone]?.label || profile.dominantTone}
                  </span>
                </div>
              </div>
            </div>

            {/* Writing patterns */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-teal-400" />
                <span className="text-[13px] font-medium text-zinc-200">Writing Patterns</span>
              </div>

              <div className="space-y-4">
                {/* Confidence vs Hedging */}
                <div>
                  <div className="flex items-center justify-between text-[12px] mb-2">
                    <span className="text-zinc-500">Hedging ↔ Confidence</span>
                    <span className={
                      confidenceLabel === 'Confident' ? 'text-emerald-400' :
                      confidenceLabel === 'Hedging' ? 'text-amber-400' : 'text-zinc-400'
                    }>{confidenceLabel}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.04] relative overflow-hidden">
                    {/* Center line */}
                    <div className="absolute top-0 left-1/2 w-px h-full bg-white/[0.1]" />
                    {/* Indicator */}
                    <div
                      className="absolute top-0 h-full rounded-full transition-all duration-700"
                      style={{
                        left: confidenceVsHedging >= 0 ? '50%' : `${50 + (confidenceVsHedging * 200)}%`,
                        width: `${Math.min(50, Math.abs(confidenceVsHedging) * 200)}%`,
                        background: confidenceVsHedging >= 0 ? 'rgba(52,211,153,0.4)' : 'rgba(251,191,36,0.4)',
                      }}
                    />
                  </div>
                </div>

                {/* Pattern metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <PatternMetric
                    label="Questions asked"
                    value={`${(profile.avgQuestionRate * 100).toFixed(1)}%`}
                    sub="of sentences"
                    color="text-sky-400"
                  />
                  <PatternMetric
                    label="Exclamations"
                    value={`${(profile.avgExclamationRate * 100).toFixed(1)}%`}
                    sub="of sentences"
                    color="text-amber-400"
                  />
                  <PatternMetric
                    label="Vocab richness"
                    value={`${(profile.avgVocabRichness * 100).toFixed(1)}%`}
                    sub="type-token ratio"
                    color="text-teal-400"
                  />
                  <PatternMetric
                    label="Avg word length"
                    value={`${profile.avgWordLength}`}
                    sub="characters"
                    color="text-emerald-400"
                  />
                </div>

                {/* Rare words count */}
                <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 flex items-center justify-between">
                  <div className="text-[11px] text-zinc-500">Rare words (used ≤ 2×)</div>
                  <div className="text-[13px] text-sky-400 font-medium tabular-nums">{profile.rareWordCount.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        </Stagger>

        {/* ─── Sentence Length Histogram ─── */}
        <Stagger>
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlignLeft className="w-4 h-4 text-teal-400" />
              <span className="text-[13px] font-medium text-zinc-200">Sentence Length Distribution</span>
              <span className="text-[11px] text-zinc-600 ml-1">words per sentence</span>
            </div>
            <div className="h-[160px]">
              <canvas ref={histogramRef} className="w-full h-full" />
            </div>
          </div>
        </Stagger>

        {/* ─── Top Words + Phrases ─── */}
        <Stagger>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Most used words */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <CaseSensitive className="w-4 h-4 text-sky-400" />
                <span className="text-[13px] font-medium text-zinc-200">Top Words</span>
              </div>
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                {profile.topWords.slice(0, 20).map((w, i) => (
                  <div key={w.word} className="flex items-center gap-2 group">
                    <span className="text-[10px] text-zinc-700 w-4 text-right tabular-nums shrink-0">{i + 1}</span>
                    <span className="text-[12px] text-zinc-300 font-mono truncate flex-1">{w.word}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-16 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-sky-500/40"
                          style={{ width: `${Math.min(100, (w.count / profile.topWords[0].count) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-600 tabular-nums w-8 text-right">{w.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top bigrams */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Quote className="w-4 h-4 text-teal-400" />
                <span className="text-[13px] font-medium text-zinc-200">Top Phrases (2-word)</span>
              </div>
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                {profile.topBigrams.slice(0, 15).map((b, i) => (
                  <div key={b.phrase} className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-700 w-4 text-right tabular-nums shrink-0">{i + 1}</span>
                    <span className="text-[12px] text-zinc-300 font-mono truncate flex-1">{b.phrase}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-12 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-teal-500/40"
                          style={{ width: `${Math.min(100, (b.count / profile.topBigrams[0].count) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-600 tabular-nums w-8 text-right">{b.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top trigrams */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Quote className="w-4 h-4 text-emerald-400" />
                <span className="text-[13px] font-medium text-zinc-200">Top Phrases (3-word)</span>
              </div>
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                {profile.topTrigrams.slice(0, 10).map((t, i) => (
                  <div key={t.phrase} className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-700 w-4 text-right tabular-nums shrink-0">{i + 1}</span>
                    <span className="text-[12px] text-zinc-300 font-mono truncate flex-1">{t.phrase}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-12 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500/40"
                          style={{ width: `${Math.min(100, (t.count / profile.topTrigrams[0].count) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-600 tabular-nums w-8 text-right">{t.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Stagger>

        {/* ─── Style Evolution Chart ─── */}
        {profile.evolution.length > 1 && (
          <Stagger>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-teal-400" />
                  <span className="text-[13px] font-medium text-zinc-200">Style Evolution</span>
                </div>
                <div className="flex items-center gap-1">
                  {[
                    { key: 'grade' as const, label: 'Grade' },
                    { key: 'ease' as const, label: 'Ease' },
                    { key: 'sentLen' as const, label: 'Sentence' },
                    { key: 'confidence' as const, label: 'Confidence' },
                  ].map(m => (
                    <button
                      key={m.key}
                      onClick={() => setSelectedMetric(m.key)}
                      className={`h-6 px-2.5 rounded-lg text-[11px] transition-all ${
                        selectedMetric === m.key
                          ? 'bg-teal-500/15 text-teal-400 border border-teal-500/20'
                          : 'text-zinc-500 hover:text-zinc-400 hover:bg-white/[0.04] border border-transparent'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[200px]">
                <canvas ref={canvasRef} className="w-full h-full" />
              </div>
            </div>
          </Stagger>
        )}

        {/* ─── Style by Source ─── */}
        {profile.styleBySource.length > 1 && (
          <Stagger>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-teal-400" />
                <span className="text-[13px] font-medium text-zinc-200">Style by Source</span>
                <span className="text-[11px] text-zinc-600">How your writing differs by import type</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left text-zinc-500 font-medium py-2 pr-4">Source</th>
                      <th className="text-right text-zinc-500 font-medium py-2 px-3">Memories</th>
                      <th className="text-right text-zinc-500 font-medium py-2 px-3">Grade</th>
                      <th className="text-right text-zinc-500 font-medium py-2 px-3">Ease</th>
                      <th className="text-right text-zinc-500 font-medium py-2 px-3">Avg Sent.</th>
                      <th className="text-left text-zinc-500 font-medium py-2 pl-3">Tone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.styleBySource
                      .sort((a, b) => b.count - a.count)
                      .map(src => {
                        const cfg = sourceConfig[src.source] || sourceConfig.text;
                        const toneCfg = toneConfig[src.dominantTone] || toneConfig.neutral;
                        const Icon = cfg.icon;
                        return (
                          <tr key={src.source} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                            <td className="py-2.5 pr-4">
                              <div className="flex items-center gap-2">
                                <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                                <span className="text-zinc-300">{cfg.label}</span>
                              </div>
                            </td>
                            <td className="text-right text-zinc-400 tabular-nums py-2.5 px-3">{src.count}</td>
                            <td className="text-right text-zinc-300 tabular-nums py-2.5 px-3">{src.avgGrade}</td>
                            <td className="text-right text-zinc-300 tabular-nums py-2.5 px-3">{src.avgEase}</td>
                            <td className="text-right text-zinc-300 tabular-nums py-2.5 px-3">{src.avgSentenceLength}</td>
                            <td className="py-2.5 pl-3">
                              <span className={`inline-flex items-center h-5 px-2 rounded-md text-[10px] font-medium ${toneCfg.bg} ${toneCfg.border} border ${toneCfg.color}`}>
                                {toneCfg.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </Stagger>
        )}

      </div>
    </PageTransition>
  );
}

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon }: {
  label: string; value: string; sub: string; icon: React.ReactNode;
}) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-[20px] font-bold text-zinc-100 tabular-nums leading-none">{value}</div>
      <div className="text-[11px] text-zinc-600 mt-1">{sub}</div>
    </div>
  );
}

function PatternMetric({ label, value, sub, color }: {
  label: string; value: string; sub: string; color: string;
}) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3">
      <div className="text-[10px] text-zinc-500 mb-1">{label}</div>
      <div className={`text-[16px] font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] text-zinc-600">{sub}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Canvas: Evolution line chart
// ──────────────────────────────────────────────────────────────

function drawEvolutionChart(
  canvas: HTMLCanvasElement,
  evolution: Profile['evolution'],
  metric: 'grade' | 'ease' | 'sentLen' | 'confidence',
) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  ctx.clearRect(0, 0, W, H);

  // Extract values
  const values = evolution.map(e => {
    if (metric === 'grade') return e.avgGrade;
    if (metric === 'ease') return e.avgEase;
    if (metric === 'sentLen') return e.avgSentenceLength;
    return e.confidenceRate;
  });

  const labels: Record<string, string> = {
    grade: 'Grade Level',
    ease: 'Reading Ease',
    sentLen: 'Avg Sentence Length',
    confidence: 'Confidence Rate',
  };

  const min = Math.min(...values) * 0.85;
  const max = Math.max(...values) * 1.15;
  const range = max - min || 1;

  const padL = 48;
  const padR = 16;
  const padT = 24;
  const padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Grid lines
  const gridLines = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridLines; i++) {
    const y = padT + (i / gridLines) * chartH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();

    // Y labels
    const val = max - (i / gridLines) * range;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(1), padL - 6, y + 3);
  }

  // Points
  const points: [number, number][] = values.map((v, i) => [
    padL + (i / Math.max(1, values.length - 1)) * chartW,
    padT + (1 - (v - min) / range) * chartH,
  ]);

  // Fill gradient
  if (points.length > 1) {
    const grad = ctx.createLinearGradient(0, padT, 0, H - padB);
    grad.addColorStop(0, 'rgba(20,184,166,0.15)');
    grad.addColorStop(1, 'rgba(20,184,166,0.0)');
    ctx.beginPath();
    ctx.moveTo(points[0][0], H - padB);
    for (const [x, y] of points) ctx.lineTo(x, y);
    ctx.lineTo(points[points.length - 1][0], H - padB);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const cpx = (points[i - 1][0] + points[i][0]) / 2;
      ctx.bezierCurveTo(cpx, points[i - 1][1], cpx, points[i][1], points[i][0], points[i][1]);
    }
    ctx.strokeStyle = '#14b8a6';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Data points
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#14b8a6';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a0b';
    ctx.fill();
  }

  // X labels (months)
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'center';
  const maxLabels = Math.min(evolution.length, 8);
  const step = Math.max(1, Math.ceil(evolution.length / maxLabels));
  for (let i = 0; i < evolution.length; i += step) {
    const x = padL + (i / Math.max(1, evolution.length - 1)) * chartW;
    const month = evolution[i].month;
    const [yr, mo] = month.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    ctx.fillText(`${monthNames[parseInt(mo) - 1]} '${yr.slice(2)}`, x, H - 6);
  }

  // Metric label
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(labels[metric], padL, 14);
}

// ──────────────────────────────────────────────────────────────
// Canvas: Sentence length histogram
// ──────────────────────────────────────────────────────────────

function drawHistogram(
  canvas: HTMLCanvasElement,
  distribution: Record<string, number>,
) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  ctx.clearRect(0, 0, W, H);

  const buckets = Object.entries(distribution);
  const maxCount = Math.max(...buckets.map(([, c]) => c), 1);

  const padL = 10;
  const padR = 10;
  const padT = 8;
  const padB = 24;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const barW = chartW / buckets.length;
  const gap = Math.max(2, barW * 0.15);

  for (let i = 0; i < buckets.length; i++) {
    const [label, count] = buckets[i];
    const barH = (count / maxCount) * chartH;
    const x = padL + i * barW + gap / 2;
    const y = padT + chartH - barH;
    const w = barW - gap;

    // Bar
    const grad = ctx.createLinearGradient(x, y, x, padT + chartH);
    grad.addColorStop(0, 'rgba(20,184,166,0.5)');
    grad.addColorStop(1, 'rgba(20,184,166,0.15)');
    ctx.fillStyle = grad;

    // Rounded top
    const r = Math.min(4, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, padT + chartH);
    ctx.lineTo(x, padT + chartH);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();

    // Count label
    if (count > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(count.toString(), x + w / 2, y - 4);
    }

    // X label
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, H - 6);
  }

  // Base line
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT + chartH);
  ctx.lineTo(W - padR, padT + chartH);
  ctx.stroke();
}
