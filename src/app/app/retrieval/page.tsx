"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Cog, Zap, Search, Clock, TrendingUp,
  Check, Loader2, AlertTriangle, ChevronRight, Play,
  Layers, TreePine, Type, Sparkles, Maximize2,
  Database, Brain, Cpu, GitBranch, Target, Gauge,
  BarChart3, ArrowRight, Info, Shield, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/lib/use-page-title";
import { PageTransition } from "@/components/PageTransition";
import { EmptyFeatureState } from "@/components/EmptyFeatureState";

// ─── Types ──────────────────────────────────────────────────────

type RAGStrategy = 'default' | 'hyde' | 'multi-query' | 'reranking' | 'contextual-compression' | 'maximal';

interface StrategyInfo {
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  latency: string;
  accuracy: string;
}

interface RAGConfig {
  activeStrategy: RAGStrategy;
  rerankTopK: number;
  compressionMaxTokens: number;
  multiQueryCount: number;
  enabledLayers: { bm25: boolean; vector: boolean; tree: boolean };
  rrfK: number;
  treeBoost: number;
}

interface TestResult {
  id: string;
  title: string | null;
  sourceType: string;
  score: number;
  preview: string;
  layers: any;
  createdAt: string;
}

// ─── Strategy icon/color map ────────────────────────────────────

const STRATEGY_META: Record<RAGStrategy, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  'default': {
    icon: Layers,
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/8',
    borderColor: 'border-teal-500/20',
  },
  'hyde': {
    icon: Brain,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/8',
    borderColor: 'border-sky-500/20',
  },
  'multi-query': {
    icon: GitBranch,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/8',
    borderColor: 'border-amber-500/20',
  },
  'reranking': {
    icon: Target,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/8',
    borderColor: 'border-emerald-500/20',
  },
  'contextual-compression': {
    icon: Maximize2,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/8',
    borderColor: 'border-orange-500/20',
  },
  'maximal': {
    icon: Sparkles,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/8',
    borderColor: 'border-rose-500/20',
  },
};

// ─── Component ──────────────────────────────────────────────────

export default function RetrievalPage() {
  usePageTitle("RAG Settings");
  const router = useRouter();
  const [config, setConfig] = useState<RAGConfig | null>(null);
  const [strategies, setStrategies] = useState<Record<string, StrategyInfo>>({});
  const [availableStrategies, setAvailableStrategies] = useState<string[]>([]);
  const [hasAI, setHasAI] = useState(false);
  const [embeddingProvider, setEmbeddingProvider] = useState<string | null>(null);
  const [embeddingModel, setEmbeddingModel] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<RAGStrategy>('default');

  // Test query state
  const [testQuery, setTestQuery] = useState('');
  const [testStrategy, setTestStrategy] = useState<RAGStrategy>('default');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testDetails, setTestDetails] = useState<any>(null);
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);

  // Advanced config
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Fetch config + stats
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [configRes, statsRes] = await Promise.all([
          fetch('/api/v1/plugins/custom-rag?action=config'),
          fetch('/api/v1/plugins/custom-rag?action=stats'),
        ]);
        if (configRes.ok) {
          const data = await configRes.json();
          setConfig(data.config);
          setStrategies(data.strategies);
          setAvailableStrategies(data.availableStrategies || ['default']);
          setHasAI(data.hasAI);
          setEmbeddingProvider(data.embeddingProvider);
          setEmbeddingModel(data.embeddingModel);
          setSelectedStrategy(data.config.activeStrategy);
          setTestStrategy(data.config.activeStrategy);
        }
        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data);
        }
      } catch (e) {
        console.error('Failed to load RAG config:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Save strategy
  const saveStrategy = useCallback(async (strategy: RAGStrategy) => {
    setSaving(true);
    try {
      const res = await fetch('/api/v1/plugins/custom-rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-config', strategy }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setSelectedStrategy(strategy);
        toast.success(`Strategy set to ${strategies[strategy]?.name || strategy}`);
      } else {
        toast.error('Failed to save strategy');
      }
    } catch {
      toast.error('Failed to save strategy');
    } finally {
      setSaving(false);
    }
  }, [strategies]);

  // Save advanced config
  const saveAdvanced = useCallback(async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/plugins/custom-rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-config',
          enabledLayers: config.enabledLayers,
          rrfK: config.rrfK,
          treeBoost: config.treeBoost,
          rerankTopK: config.rerankTopK,
          multiQueryCount: config.multiQueryCount,
          compressionMaxTokens: config.compressionMaxTokens,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        toast.success('Advanced settings saved');
      }
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [config]);

  // Test query
  const runTest = useCallback(async () => {
    if (!testQuery.trim()) return;
    setTesting(true);
    setTestResults([]);
    setTestDetails(null);
    setTestLatency(null);
    try {
      const res = await fetch('/api/v1/plugins/custom-rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-query', query: testQuery, strategy: testStrategy }),
      });
      if (res.ok) {
        const data = await res.json();
        setTestResults(data.results || []);
        setTestDetails(data.details || null);
        setTestLatency(data.totalLatencyMs);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Test failed');
      }
    } catch {
      toast.error('Test failed');
    } finally {
      setTesting(false);
    }
  }, [testQuery, testStrategy]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
      </div>
    );
  }

  // Data-zero: no memories indexed yet — RAG settings are meaningless without data
  if (stats && stats.totalMemories === 0) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-[#0a0a0b] pb-24">
          <div className="sticky top-0 z-20 bg-[#0a0a0b]/80 backdrop-blur-xl border-b border-white/[0.06]">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
              <div className="flex-1">
                <h1 className="text-[15px] font-semibold text-zinc-100 flex items-center gap-2">
                  <Cog className="w-4 h-4 text-teal-400" />
                  Retrieval Strategies
                </h1>
                <p className="text-[12px] text-zinc-500 mt-0.5">
                  Customize how MindStore finds your memories
                </p>
              </div>
            </div>
          </div>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
            <EmptyFeatureState
              icon={Layers}
              title="Retrieval is ready when your knowledge is"
              description="Strategy tuning (HyDE, reranking, multi-query) only matters once there's data to search. Import your first memories so the engine has something to retrieve."
              ctaText="Import your first data →"
              ctaHref="/app/import"
              secondaryText="or paste text directly from the home screen"
              secondaryHref="/app"
            />
          </div>
        </div>
      </PageTransition>
    );
  }

  const strategyOrder: RAGStrategy[] = ['default', 'hyde', 'multi-query', 'reranking', 'contextual-compression', 'maximal'];

  return (
    <PageTransition>
    <div className="min-h-screen bg-[#0a0a0b] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0b]/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-[15px] font-semibold text-zinc-100 flex items-center gap-2">
              <Cog className="w-4 h-4 text-teal-400" />
              Retrieval Strategies
            </h1>
            <p className="text-[12px] text-zinc-500 mt-0.5">
              Customize how MindStore finds your memories
            </p>
          </div>
          {config && (
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border",
              STRATEGY_META[selectedStrategy]?.bgColor,
              STRATEGY_META[selectedStrategy]?.borderColor,
              STRATEGY_META[selectedStrategy]?.color,
            )}>
              {(() => { const Icon = STRATEGY_META[selectedStrategy]?.icon || Layers; return <Icon className="w-3 h-3" />; })()}
              Active
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Stats Row */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Memories', value: stats.totalMemories, icon: Database, color: 'text-teal-400' },
              { label: 'Embedded', value: `${stats.embeddingCoverage}%`, icon: Cpu, color: 'text-sky-400' },
              { label: 'Tree Nodes', value: stats.treeNodes, icon: TreePine, color: 'text-emerald-400' },
              { label: 'Strategy', value: strategies[stats.activeStrategy]?.name?.split(' ')[0] || 'Default', icon: Cog, color: 'text-amber-400' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-3.5"
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <stat.icon className={cn("w-3.5 h-3.5", stat.color)} />
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{stat.label}</span>
                </div>
                <div className="text-[18px] font-semibold text-zinc-100">{stat.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* No AI Warning */}
        {!hasAI && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/[0.06] border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[13px] font-medium text-amber-300">AI Provider Required</p>
              <p className="text-[12px] text-amber-400/70 mt-0.5">
                Advanced strategies (HyDE, Multi-Query, Reranking) require an AI provider. 
                Configure one in{' '}
                <button onClick={() => router.push('/app/settings')} className="underline hover:text-amber-300 transition-colors">Settings</button>.
              </p>
            </div>
          </div>
        )}

        {/* Embedding Provider Info */}
        {embeddingProvider && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <Cpu className="w-3.5 h-3.5 text-teal-400" />
            <span className="text-[12px] text-zinc-400">
              Embedding provider: <span className="text-zinc-200 font-medium">{embeddingProvider}</span>
              {embeddingModel && <span className="text-zinc-500"> · {embeddingModel}</span>}
            </span>
          </div>
        )}

        {/* Strategy Selection */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-teal-400" />
            <h2 className="text-[14px] font-semibold text-zinc-200">Choose Strategy</h2>
          </div>

          <div className="space-y-3">
            {strategyOrder.map((key) => {
              const info = strategies[key];
              const meta = STRATEGY_META[key];
              if (!info || !meta) return null;
              const isActive = selectedStrategy === key;
              const isAvailable = availableStrategies.includes(key);
              const Icon = meta.icon;

              return (
                <button
                  key={key}
                  disabled={!isAvailable || saving}
                  onClick={() => {
                    if (isAvailable && !saving) {
                      saveStrategy(key);
                    }
                  }}
                  className={cn(
                    "w-full text-left rounded-2xl border p-4 transition-all duration-200",
                    isActive
                      ? `${meta.bgColor} ${meta.borderColor} ring-1 ring-inset ${meta.borderColor}`
                      : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1]",
                    !isAvailable && "opacity-40 cursor-not-allowed",
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border",
                      isActive ? `${meta.bgColor} ${meta.borderColor}` : "bg-white/[0.04] border-white/[0.06]",
                    )}>
                      <Icon className={cn("w-4 h-4", isActive ? meta.color : "text-zinc-400")} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[13px] font-semibold",
                          isActive ? "text-zinc-100" : "text-zinc-300",
                        )}>
                          {info.name}
                        </span>
                        {isActive && (
                          <span className={cn(
                            "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border",
                            meta.bgColor, meta.borderColor, meta.color,
                          )}>
                            <Check className="w-2.5 h-2.5" />
                            Active
                          </span>
                        )}
                        {!isAvailable && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-500 border border-zinc-700">
                            Requires AI
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-zinc-500 mt-1 leading-relaxed">
                        {info.description}
                      </p>

                      {/* Pros/Cons + Performance */}
                      <div className="flex flex-wrap items-center gap-3 mt-2.5">
                        <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                          <Clock className="w-3 h-3" />
                          {info.latency}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                          <Gauge className="w-3 h-3" />
                          {info.accuracy}
                        </span>
                      </div>

                      {/* Pros/Cons chips */}
                      {isActive && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {info.pros.map((pro) => (
                            <span key={pro} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              ✓ {pro}
                            </span>
                          ))}
                          {info.cons.map((con) => (
                            <span key={con} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-500 border border-zinc-700/50">
                              {con}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Advanced Configuration */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Cog className="w-4 h-4 text-zinc-400" />
              <span className="text-[13px] font-semibold text-zinc-300">Advanced Configuration</span>
            </div>
            <ChevronRight className={cn(
              "w-4 h-4 text-zinc-500 transition-transform duration-200",
              showAdvanced && "rotate-90",
            )} />
          </button>

          {showAdvanced && config && (
            <div className="border-t border-white/[0.06] p-4 space-y-5">
              {/* Retrieval Layers */}
              <div>
                <label className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-2.5 block">
                  Retrieval Layers
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { key: 'bm25' as const, label: 'BM25 Full-Text', icon: Type, desc: 'Keyword matching' },
                    { key: 'vector' as const, label: 'Vector Similarity', icon: Cpu, desc: 'Semantic search' },
                    { key: 'tree' as const, label: 'Tree Navigation', icon: TreePine, desc: 'Structural' },
                  ].map((layer) => (
                    <button
                      key={layer.key}
                      onClick={() => {
                        setConfig({
                          ...config,
                          enabledLayers: {
                            ...config.enabledLayers,
                            [layer.key]: !config.enabledLayers[layer.key],
                          },
                        });
                      }}
                      className={cn(
                        "flex items-center gap-2.5 p-3 rounded-xl border transition-all",
                        config.enabledLayers[layer.key]
                          ? "bg-teal-500/[0.06] border-teal-500/20 text-teal-400"
                          : "bg-white/[0.02] border-white/[0.06] text-zinc-500",
                      )}
                    >
                      <layer.icon className="w-4 h-4 shrink-0" />
                      <div className="text-left">
                        <div className="text-[12px] font-medium">{layer.label}</div>
                        <div className="text-[10px] opacity-60">{layer.desc}</div>
                      </div>
                      {config.enabledLayers[layer.key] && (
                        <Check className="w-3.5 h-3.5 ml-auto shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Numeric settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-medium text-zinc-500 mb-1.5 block">
                    RRF Constant (k)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={config.rrfK}
                      onChange={(e) => setConfig({ ...config, rrfK: Number(e.target.value) })}
                      className="flex-1 accent-teal-500 h-1.5"
                    />
                    <span className="text-[12px] text-zinc-300 font-mono w-8 text-right">{config.rrfK}</span>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">Lower = top ranks weighted more. Default: 60</p>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-zinc-500 mb-1.5 block">
                    Tree Layer Boost
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={config.treeBoost}
                      onChange={(e) => setConfig({ ...config, treeBoost: Number(e.target.value) })}
                      className="flex-1 accent-teal-500 h-1.5"
                    />
                    <span className="text-[12px] text-zinc-300 font-mono w-8 text-right">{config.treeBoost}x</span>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">How much to boost tree-navigated results. Default: 1.2</p>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-zinc-500 mb-1.5 block">
                    Rerank Top-K
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="5"
                      max="50"
                      step="5"
                      value={config.rerankTopK}
                      onChange={(e) => setConfig({ ...config, rerankTopK: Number(e.target.value) })}
                      className="flex-1 accent-teal-500 h-1.5"
                    />
                    <span className="text-[12px] text-zinc-300 font-mono w-8 text-right">{config.rerankTopK}</span>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">How many results to fetch before reranking. Default: 20</p>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-zinc-500 mb-1.5 block">
                    Multi-Query Count
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="2"
                      max="5"
                      step="1"
                      value={config.multiQueryCount}
                      onChange={(e) => setConfig({ ...config, multiQueryCount: Number(e.target.value) })}
                      className="flex-1 accent-teal-500 h-1.5"
                    />
                    <span className="text-[12px] text-zinc-300 font-mono w-8 text-right">{config.multiQueryCount}</span>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">Number of query expansions. Default: 3</p>
                </div>
              </div>

              {/* Save button */}
              <button
                onClick={saveAdvanced}
                disabled={saving}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-[13px] font-medium text-teal-400 hover:bg-teal-500/15 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save Advanced Settings
              </button>
            </div>
          )}
        </div>

        {/* Test Bench */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="p-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-teal-400" />
              <h2 className="text-[14px] font-semibold text-zinc-200">Test Bench</h2>
            </div>
            <p className="text-[12px] text-zinc-500 mt-1">
              Try a query with any strategy and compare results in real time
            </p>
          </div>

          <div className="p-4 space-y-4">
            {/* Query input + strategy selector */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Enter a test query…"
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runTest()}
                  className="w-full h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30 focus:ring-1 focus:ring-teal-500/20 transition-all"
                />
              </div>

              <select
                value={testStrategy}
                onChange={(e) => setTestStrategy(e.target.value as RAGStrategy)}
                className="h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[12px] text-zinc-300 focus:outline-none focus:border-teal-500/30 appearance-none cursor-pointer"
                style={{ minWidth: '160px' }}
              >
                {strategyOrder.map((s) => (
                  <option key={s} value={s} disabled={!availableStrategies.includes(s)}>
                    {strategies[s]?.name?.split('(')[0]?.trim() || s}
                  </option>
                ))}
              </select>

              <button
                onClick={runTest}
                disabled={testing || !testQuery.trim()}
                className="h-10 px-5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-[13px] font-medium text-teal-400 hover:bg-teal-500/15 active:scale-[0.97] transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Run
              </button>
            </div>

            {/* Test Results */}
            {testing && (
              <div className="flex items-center justify-center gap-2 py-8 text-zinc-500">
                <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                <span className="text-[12px]">Running {strategies[testStrategy]?.name || testStrategy}…</span>
              </div>
            )}

            {!testing && testResults.length > 0 && (
              <div className="space-y-3">
                {/* Latency + Details bar */}
                <div className="flex flex-wrap items-center gap-3">
                  {testLatency !== null && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20">
                      <Clock className="w-3 h-3" />
                      {testLatency}ms
                    </span>
                  )}
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/[0.04] text-zinc-400 border border-white/[0.08]">
                    <BarChart3 className="w-3 h-3" />
                    {testResults.length} results
                  </span>
                  {testDetails?.hydeDocument && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
                      <Brain className="w-3 h-3" />
                      HyDE generated
                    </span>
                  )}
                  {testDetails?.expandedQueries && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <GitBranch className="w-3 h-3" />
                      {testDetails.expandedQueries.length} queries
                    </span>
                  )}
                  {testDetails?.rerankedCount > 0 && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Target className="w-3 h-3" />
                      {testDetails.rerankedCount} reranked
                    </span>
                  )}
                </div>

                {/* HyDE Document Preview */}
                {testDetails?.hydeDocument && (
                  <div className="rounded-xl bg-sky-500/[0.04] border border-sky-500/15 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Brain className="w-3 h-3 text-sky-400" />
                      <span className="text-[10px] uppercase tracking-wider text-sky-400/70 font-medium">
                        Hypothetical Document
                      </span>
                    </div>
                    <p className="text-[12px] text-zinc-400 leading-relaxed">
                      {testDetails.hydeDocument.slice(0, 300)}
                      {testDetails.hydeDocument.length > 300 ? '…' : ''}
                    </p>
                  </div>
                )}

                {/* Expanded Queries */}
                {testDetails?.expandedQueries && testDetails.expandedQueries.length > 1 && (
                  <div className="rounded-xl bg-amber-500/[0.04] border border-amber-500/15 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <GitBranch className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] uppercase tracking-wider text-amber-400/70 font-medium">
                        Expanded Queries
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {testDetails.expandedQueries.map((q: string, i: number) => (
                        <span
                          key={i}
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[11px] border",
                            i === 0
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20 font-medium"
                              : "bg-white/[0.03] text-zinc-400 border-white/[0.08]",
                          )}
                        >
                          {i === 0 ? '● ' : ''}{q}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Results list */}
                <div className="space-y-2">
                  {testResults.map((result, i) => (
                    <div
                      key={result.id}
                      className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 hover:bg-white/[0.04] transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {/* Rank number */}
                        <div className="w-6 h-6 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                          <span className={cn(
                            "text-[11px] font-bold",
                            i === 0 ? "text-teal-400" : i < 3 ? "text-zinc-300" : "text-zinc-500",
                          )}>
                            {i + 1}
                          </span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-medium text-zinc-200 truncate">
                              {result.title || 'Untitled'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/[0.04] text-zinc-500 border border-white/[0.06] shrink-0">
                              {result.sourceType}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                            {result.preview}
                          </p>

                          {/* Layer indicators */}
                          {result.layers && (
                            <div className="flex items-center gap-2 mt-2">
                              {result.layers.bm25 && (
                                <span className="flex items-center gap-0.5 text-[9px] text-sky-400/60">
                                  <Type className="w-2.5 h-2.5" /> BM25
                                </span>
                              )}
                              {result.layers.vector && (
                                <span className="flex items-center gap-0.5 text-[9px] text-teal-400/60">
                                  <Cpu className="w-2.5 h-2.5" /> Vector
                                </span>
                              )}
                              {result.layers.tree && (
                                <span className="flex items-center gap-0.5 text-[9px] text-emerald-400/60">
                                  <TreePine className="w-2.5 h-2.5" /> Tree
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Score */}
                        <div className="shrink-0 text-right">
                          <div className="text-[12px] font-mono text-zinc-400">
                            {(result.score * 100).toFixed(1)}
                          </div>
                          <div className="w-12 h-1.5 rounded-full bg-white/[0.06] mt-1 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-teal-500/50"
                              style={{ width: `${Math.min(100, result.score * 100 * (testResults[0]?.score > 0 ? (1 / testResults[0].score) : 1))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!testing && testResults.length === 0 && testQuery && testLatency !== null && (
              <div className="flex flex-col items-center gap-2 py-8">
                <Search className="w-5 h-5 text-zinc-600" />
                <p className="text-[12px] text-zinc-500">No results found for this query</p>
              </div>
            )}
          </div>
        </div>

        {/* How It Works */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-zinc-500" />
            <h2 className="text-[13px] font-semibold text-zinc-300">How Retrieval Works</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[11px] font-bold text-teal-400">1</span>
              </div>
              <div>
                <p className="text-[12px] font-medium text-zinc-300">Query Processing</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Your query is embedded into a vector and tokenized for keyword search.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[11px] font-bold text-teal-400">2</span>
              </div>
              <div>
                <p className="text-[12px] font-medium text-zinc-300">Triple-Layer Search</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">BM25 (keywords), Vector (semantic meaning), and Tree (structure) run in parallel.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[11px] font-bold text-teal-400">3</span>
              </div>
              <div>
                <p className="text-[12px] font-medium text-zinc-300">Fusion & Ranking</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Results are fused using Reciprocal Rank Fusion (RRF) for a unified ranking.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[11px] font-bold text-teal-400">4</span>
              </div>
              <div>
                <p className="text-[12px] font-medium text-zinc-300">Strategy Enhancement</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">The active strategy (HyDE, reranking, etc.) enhances results before returning them.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
    </PageTransition>
  );
}
