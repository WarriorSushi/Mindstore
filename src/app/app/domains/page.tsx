"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dna, Loader2, AlertTriangle, Check,
  Box, Code, Heart, Scale, FlaskConical, TrendingUp,
  Cpu, Tag, RefreshCw, Info, ChevronDown, ChevronUp,
  BarChart3, Layers, Zap, CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/lib/use-page-title";
import { PageTransition } from "@/components/PageTransition";
import { EmptyFeatureState } from "@/components/EmptyFeatureState";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────

interface DomainModel {
  name: string;
  provider: string;
  model: string;
  dimensions: number;
  description: string;
  strengths: string[];
  available?: boolean;
}

interface Domain {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  keywords: string[];
  recommendedModels: DomainModel[];
}

interface DomainDistribution {
  domain: string;
  name: string;
  count: number;
  examples: string[];
}

interface Config {
  domains: Domain[];
  config: Record<string, any>;
  availableProviders: { openai: boolean; gemini: boolean; ollama: boolean };
  currentProvider: string;
}

interface Stats {
  domainDistribution: DomainDistribution[];
  totalAnalyzed: number;
  embeddingCoverage: { withEmbeddings: number; total: number };
}

// ─── Icon map ───────────────────────────────────────────────────

const DOMAIN_ICONS: Record<string, typeof Box> = {
  Box, Code, Heart, Scale, FlaskConical, TrendingUp,
};

const DOMAIN_COLORS: Record<string, { bg: string; border: string; text: string; bar: string }> = {
  general: { bg: 'bg-teal-500/[0.06]', border: 'border-teal-500/20', text: 'text-teal-400', bar: 'bg-teal-500' },
  code: { bg: 'bg-sky-500/[0.06]', border: 'border-sky-500/20', text: 'text-sky-400', bar: 'bg-sky-500' },
  medical: { bg: 'bg-rose-500/[0.06]', border: 'border-rose-500/20', text: 'text-rose-400', bar: 'bg-rose-500' },
  legal: { bg: 'bg-amber-500/[0.06]', border: 'border-amber-500/20', text: 'text-amber-400', bar: 'bg-amber-500' },
  scientific: { bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/20', text: 'text-emerald-400', bar: 'bg-emerald-500' },
  financial: { bg: 'bg-sky-500/[0.06]', border: 'border-sky-500/20', text: 'text-sky-400', bar: 'bg-sky-500' },
};

// ─── Component ──────────────────────────────────────────────────

export default function DomainEmbeddingsPage() {
  usePageTitle("Domain Embeddings");
  const [config, setConfig] = useState<Config | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [tagging, setTagging] = useState(false);
  const [tagResult, setTagResult] = useState<{ tagged: number; remaining: number } | null>(null);
  const [detectText, setDetectText] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, statsRes] = await Promise.all([
        fetch("/api/v1/plugins/domain-embeddings?action=config"),
        fetch("/api/v1/plugins/domain-embeddings?action=stats"),
      ]);
      if (configRes.ok) setConfig(await configRes.json());
      else throw new Error("Failed to load domain config");
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load domain data";
      setError(msg);
      toast.error("Could not load domain analytics", { description: msg });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBatchDetect = async () => {
    setTagging(true);
    setTagResult(null);
    try {
      const res = await fetch("/api/v1/plugins/domain-embeddings?action=batch-detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 100 }),
      });
      if (res.ok) {
        const data = await res.json();
        setTagResult({ tagged: data.tagged, remaining: data.remaining });
        fetchData();
      }
    } catch { toast.error("Failed to detect domains"); }
    setTagging(false);
  };

  const handleDetect = async () => {
    if (!detectText.trim()) return;
    setDetecting(true);
    setDetectResult(null);
    try {
      const res = await fetch(`/api/v1/plugins/domain-embeddings?action=detect&text=${encodeURIComponent(detectText)}`);
      if (res.ok) setDetectResult(await res.json());
    } catch { toast.error("Detection failed"); }
    setDetecting(false);
  };

  const embeddingPct = stats
    ? Math.round((stats.embeddingCoverage.withEmbeddings / Math.max(stats.embeddingCoverage.total, 1)) * 100)
    : 0;

  const totalDomainMemories = stats?.domainDistribution.reduce((sum, d) => sum + d.count, 0) || 0;

  return (
    <PageTransition>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
          <Dna className="w-5 h-5 text-teal-400" />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-white">Domain Embeddings</h1>
          <p className="text-[13px] text-zinc-500">Specialized models for specific knowledge domains</p>
        </div>
      </div>

      {/* Provider info */}
      {config && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06]">
          <Cpu className="w-3.5 h-3.5 text-teal-400" />
          <span className="text-xs text-zinc-400">Current provider:</span>
          <span className="text-xs text-teal-400 font-medium">{config.currentProvider}</span>
          <span className="text-zinc-600 mx-1">·</span>
          {Object.entries(config.availableProviders).map(([k, v]) => (
            <span key={k} className={cn("text-[10px] px-1.5 py-0.5 rounded", v ? "text-emerald-400 bg-emerald-500/10" : "text-zinc-600 bg-white/[0.02]")}>
              {k}
            </span>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <div className="animate-pulse rounded-lg bg-white/[0.04] w-8 h-8" />
                <div className="animate-pulse rounded-xl bg-white/[0.04] h-7 w-14" />
                <div className="animate-pulse rounded-xl bg-white/[0.04] h-3 w-24" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
            <div className="animate-pulse rounded-xl bg-white/[0.04] h-5 w-40" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl bg-white/[0.04] h-12 w-full" />
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-red-500/[0.06] border border-red-500/10 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <p className="text-[14px] text-zinc-400 font-medium mb-1">{error}</p>
          <button onClick={fetchData} className="text-[13px] text-teal-400 hover:text-teal-300 transition-colors">
            Try again
          </button>
        </div>
      )}

      {!loading && config && stats && stats.embeddingCoverage.total === 0 && (
        <EmptyFeatureState
          icon={Dna}
          title="Domain Embeddings is ready when your knowledge is"
          description="Domain detection and routing only kicks in once there are memories to classify. Import some data so we can analyze and tag it by knowledge area."
          ctaText="Import your first data →"
          ctaHref="/app/import"
        />
      )}

      {!loading && config && stats && stats.embeddingCoverage.total > 0 && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Domains Found", value: stats.domainDistribution.filter(d => d.domain !== 'general' && d.count > 0).length, icon: Layers, color: "text-teal-400" },
              { label: "Analyzed", value: stats.totalAnalyzed.toLocaleString(), icon: BarChart3, color: "text-sky-400" },
              { label: "Embedded", value: `${embeddingPct}%`, icon: CircleDot, color: "text-emerald-400" },
              { label: "Total", value: stats.embeddingCoverage.total.toLocaleString(), icon: Box, color: "text-zinc-400" },
            ].map((s, i) => (
              <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className={cn("w-3.5 h-3.5", s.color)} />
                  <span className="text-[11px] text-zinc-500 uppercase tracking-wider">{s.label}</span>
                </div>
                <p className="text-xl font-bold text-white">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Domain Distribution */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-semibold text-white">Domain Distribution</h3>
              </div>
              <button
                onClick={handleBatchDetect}
                disabled={tagging}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  tagging
                    ? "bg-teal-500/10 text-teal-400"
                    : "bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 border border-teal-500/20"
                )}
              >
                {tagging ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Detecting...</>
                ) : (
                  <><Tag className="w-3 h-3" /> Auto-detect domains</>
                )}
              </button>
            </div>

            {tagResult && (
              <div className="mb-3 p-2.5 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs text-emerald-300">
                    Tagged {tagResult.tagged} memories · {tagResult.remaining} remaining
                  </span>
                </div>
              </div>
            )}

            {stats.domainDistribution.length === 0 ? (
              <div className="py-8 text-center">
                <Dna className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No domain analysis yet</p>
                <p className="text-xs text-zinc-600 mt-1">Click "Auto-detect domains" to analyze your memories</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.domainDistribution.map((d, i) => {
                  const maxCount = stats.domainDistribution[0]?.count || 1;
                  const pct = Math.round((d.count / totalDomainMemories) * 100);
                  const barWidth = Math.max((d.count / maxCount) * 100, 4);
                  const colors = DOMAIN_COLORS[d.domain] || DOMAIN_COLORS.general;
                  const profile = config.domains.find(p => p.id === d.domain);
                  const IconComp = DOMAIN_ICONS[profile?.icon || 'Box'] || Box;

                  return (
                    <div key={d.domain}>
                      <div className="flex items-center gap-3 mb-1">
                        <div className={cn("w-6 h-6 rounded-md flex items-center justify-center", colors.bg, `border ${colors.border}`)}>
                          <IconComp className={cn("w-3.5 h-3.5", colors.text)} />
                        </div>
                        <span className="text-sm text-zinc-300 flex-1 font-medium">{d.name}</span>
                        <span className="text-xs text-zinc-500 tabular-nums">{d.count.toLocaleString()}</span>
                        <span className="text-xs text-zinc-600 w-10 text-right tabular-nums">{pct}%</span>
                      </div>
                      <div className="ml-9 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", colors.bar)}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Domain Profiles */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Dna className="w-4 h-4 text-teal-400" />
              <h3 className="text-sm font-semibold text-white">Available Domains</h3>
            </div>
            
            {config.domains.map(domain => {
              const isExpanded = expandedDomain === domain.id;
              const colors = DOMAIN_COLORS[domain.id] || DOMAIN_COLORS.general;
              const IconComp = DOMAIN_ICONS[domain.icon] || Box;
              const distItem = stats.domainDistribution.find(d => d.domain === domain.id);

              return (
                <div key={domain.id} className={cn(
                  "rounded-xl border transition-all",
                  isExpanded ? `${colors.bg} ${colors.border}` : "bg-white/[0.02] border-white/[0.06]"
                )}>
                  <button
                    onClick={() => setExpandedDomain(isExpanded ? null : domain.id)}
                    className="w-full flex items-center gap-3 p-3 text-left"
                  >
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", colors.bg, `border ${colors.border}`)}>
                      <IconComp className={cn("w-4 h-4", colors.text)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{domain.name}</span>
                        {distItem && distItem.count > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-zinc-500">
                            {distItem.count} memories
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">{domain.description}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3">
                      {/* Keywords */}
                      {domain.keywords.length > 0 && (
                        <div>
                          <p className="text-xs text-zinc-500 mb-1.5">Detection keywords:</p>
                          <div className="flex flex-wrap gap-1">
                            {domain.keywords.slice(0, 15).map(kw => (
                              <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-zinc-400">
                                {kw}
                              </span>
                            ))}
                            {domain.keywords.length > 15 && (
                              <span className="text-[10px] px-1.5 py-0.5 text-zinc-600">+{domain.keywords.length - 15} more</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Recommended Models */}
                      <div>
                        <p className="text-xs text-zinc-500 mb-1.5">Recommended embedding models:</p>
                        <div className="space-y-2">
                          {domain.recommendedModels.map((model, i) => (
                            <div key={i} className="p-2.5 rounded-lg bg-black/20 border border-white/[0.04]">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-white">{model.name}</span>
                                <span className="text-[10px] px-1 py-0.5 rounded bg-white/[0.04] text-zinc-500">{model.provider}</span>
                                <span className="text-[10px] text-zinc-600">{model.dimensions}d</span>
                              </div>
                              <p className="text-[11px] text-zinc-500 mb-1.5">{model.description}</p>
                              <div className="flex flex-wrap gap-1">
                                {model.strengths.map(s => (
                                  <span key={s} className={cn("text-[9px] px-1.5 py-0.5 rounded-md", colors.bg, colors.text)}>
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Domain Detection Test */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-teal-400" />
              <h3 className="text-sm font-semibold text-white">Test Domain Detection</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              Paste any text to see which domain it would be classified under.
            </p>
            <textarea
              value={detectText}
              onChange={(e) => setDetectText(e.target.value)}
              placeholder="Paste text to detect its knowledge domain..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20 transition-all resize-none"
            />
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={handleDetect}
                disabled={detecting || !detectText.trim()}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  detecting
                    ? "bg-teal-500/10 text-teal-400"
                    : "bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 border border-teal-500/20"
                )}
              >
                {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Dna className="w-4 h-4" />}
                Detect Domain
              </button>
            </div>

            {detectResult && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">Primary domain:</span>
                  <span className={cn(
                    "text-sm font-medium px-2 py-0.5 rounded-md",
                    DOMAIN_COLORS[detectResult.primaryDomain.domain]?.bg || 'bg-teal-500/10',
                    DOMAIN_COLORS[detectResult.primaryDomain.domain]?.text || 'text-teal-400',
                  )}>
                    {config.domains.find(d => d.id === detectResult.primaryDomain.domain)?.name || detectResult.primaryDomain.domain}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {Math.round(detectResult.primaryDomain.score * 100)}% confidence
                  </span>
                </div>
                
                {detectResult.detectedDomains.length > 1 && (
                  <div className="space-y-1">
                    <span className="text-xs text-zinc-500">Other matches:</span>
                    {detectResult.detectedDomains.slice(1, 4).map((d: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={cn("px-1.5 py-0.5 rounded", 
                          DOMAIN_COLORS[d.domain]?.bg || 'bg-white/[0.04]',
                          DOMAIN_COLORS[d.domain]?.text || 'text-zinc-400'
                        )}>
                          {config.domains.find(p => p.id === d.domain)?.name || d.domain}
                        </span>
                        <span className="text-zinc-600">{Math.round(d.score * 100)}%</span>
                        <span className="text-zinc-600">({d.matches.slice(0, 5).join(', ')})</span>
                      </div>
                    ))}
                  </div>
                )}

                {detectResult.primaryDomain.matches?.length > 0 && (
                  <div>
                    <span className="text-xs text-zinc-500">Matched keywords: </span>
                    <span className="text-xs text-zinc-400">
                      {detectResult.primaryDomain.matches.slice(0, 10).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* How It Works */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-white">How Domain Embeddings Work</h3>
            </div>
            <div className="space-y-3">
              {[
                { step: "1", title: "Detect Domain", desc: "Each memory is analyzed for domain keywords (medical, legal, code, etc.) and tagged with its primary domain." },
                { step: "2", title: "Route to Model", desc: "When searching, queries are routed to the embedding model best suited for the detected domain." },
                { step: "3", title: "Better Results", desc: "Domain-specific models understand specialized terminology better, producing more accurate search results." },
                { step: "4", title: "Local Options", desc: "Use Ollama to run specialized models locally — no data leaves your device. Perfect for sensitive domains." },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-md bg-sky-500/10 border border-sky-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-sky-400">{s.step}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-300">{s.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
    </PageTransition>
  );
}
