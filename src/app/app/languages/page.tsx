"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Languages, Globe, Search, Loader2, AlertTriangle,
  Check, BarChart3, Tag, RefreshCw, Sparkles,
  ArrowRightLeft, Zap, Info,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/lib/use-page-title";
import { PageTransition } from "@/components/PageTransition";
import { EmptyFeatureState } from "@/components/EmptyFeatureState";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────

interface LanguageStat {
  code: string;
  name: string;
  count: number;
}

interface Stats {
  totalMemories: number;
  taggedMemories: number;
  languages: LanguageStat[];
  supportedLanguages: { code: string; name: string }[];
}

interface CheckResult {
  aiAvailable: boolean;
  provider: string | null;
  supportedLanguages: number;
  features: {
    detection: boolean;
    translation: boolean;
    crossLanguageSearch: boolean;
    heuristicDetection: boolean;
  };
}

interface SearchResult {
  id: string;
  content: string;
  sourceType: string;
  sourceTitle: string;
  language: string;
  matchedQuery: string;
  matchedLanguage: string;
  score: number;
}

interface CrossSearchResult {
  query: string;
  queryLanguage: string;
  translations: { language: string; query: string }[];
  results: SearchResult[];
  totalResults: number;
}

// ─── Flag emoji from country code ───────────────────────────────

const LANG_FLAGS: Record<string, string> = {
  en: '🇬🇧', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪', it: '🇮🇹',
  pt: '🇧🇷', nl: '🇳🇱', sv: '🇸🇪', da: '🇩🇰', no: '🇳🇴',
  fi: '🇫🇮', pl: '🇵🇱', cs: '🇨🇿', hu: '🇭🇺', ro: '🇷🇴',
  bg: '🇧🇬', hr: '🇭🇷', ru: '🇷🇺', uk: '🇺🇦', el: '🇬🇷',
  tr: '🇹🇷', ar: '🇸🇦', he: '🇮🇱', fa: '🇮🇷', hi: '🇮🇳',
  bn: '🇧🇩', ta: '🇱🇰', te: '🇮🇳', th: '🇹🇭', vi: '🇻🇳',
  id: '🇮🇩', ms: '🇲🇾', zh: '🇨🇳', ja: '🇯🇵', ko: '🇰🇷',
  af: '🇿🇦', sw: '🇰🇪', ca: '🇪🇸', is: '🇮🇸', unknown: '🌐',
};

// ─── Component ──────────────────────────────────────────────────

export default function MultiLanguagePage() {
  usePageTitle("Languages");
  const [stats, setStats] = useState<Stats | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [tagging, setTagging] = useState(false);
  const [tagProgress, setTagProgress] = useState<{ tagged: number; remaining: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CrossSearchResult | null>(null);
  const [detectText, setDetectText] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectedLang, setDetectedLang] = useState<{ code: string; name: string; confidence: number; method: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "search" | "detect">("overview");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, checkRes] = await Promise.all([
        fetch("/api/v1/plugins/multi-language?action=stats"),
        fetch("/api/v1/plugins/multi-language?action=check"),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      else throw new Error("Failed to load language stats");
      if (checkRes.ok) setCheck(await checkRes.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load language data";
      setError(msg);
      toast.error("Could not load language stats", { description: msg });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBatchTag = async () => {
    setTagging(true);
    setTagProgress(null);
    try {
      const res = await fetch("/api/v1/plugins/multi-language?action=batch-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 50 }),
      });
      if (res.ok) {
        const data = await res.json();
        setTagProgress({ tagged: data.tagged, remaining: data.remaining });
        // Refresh stats
        fetchData();
      }
    } catch { toast.error("Failed to tag languages"); }
    setTagging(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const res = await fetch(`/api/v1/plugins/multi-language?action=search&q=${encodeURIComponent(searchQuery)}&limit=10`);
      if (res.ok) setSearchResults(await res.json());
    } catch { toast.error("Search failed"); }
    setSearching(false);
  };

  const handleDetect = async () => {
    if (!detectText.trim()) return;
    setDetecting(true);
    setDetectedLang(null);
    try {
      const res = await fetch(`/api/v1/plugins/multi-language?action=detect&text=${encodeURIComponent(detectText)}`);
      if (res.ok) {
        const data = await res.json();
        setDetectedLang({ ...data.language, method: data.method });
      }
    } catch { toast.error("Detection failed"); }
    setDetecting(false);
  };

  // Compute stats
  const totalLangs = stats?.languages?.filter(l => l.code !== 'unknown').length || 0;
  const coveragePercent = stats ? Math.round((stats.taggedMemories / Math.max(stats.totalMemories, 1)) * 100) : 0;
  const untagged = stats ? stats.totalMemories - stats.taggedMemories : 0;

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: BarChart3 },
    { key: "search" as const, label: "Cross-Language Search", icon: Search },
    { key: "detect" as const, label: "Detect & Translate", icon: Sparkles },
  ];

  return (
    <PageTransition>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
          <Languages className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-white">Multi-Language</h1>
          <p className="text-[13px] text-zinc-500">Search and store memories in any language</p>
        </div>
      </div>

      {/* AI Warning */}
      {check && !check.aiAvailable && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-300">No AI provider configured</p>
            <p className="text-xs text-amber-400/70 mt-1">
              Language detection, translation, and cross-language search require an AI provider.
              Heuristic script detection is still available.{" "}
              <Link href="/app/settings" className="underline hover:text-amber-300">Configure in Settings →</Link>
            </p>
          </div>
        </div>
      )}

      {/* Stats Row */}
      {!loading && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Languages", value: totalLangs, icon: Globe, color: "text-sky-400" },
            { label: "Total Memories", value: stats.totalMemories.toLocaleString(), icon: BarChart3, color: "text-teal-400" },
            { label: "Tagged", value: `${coveragePercent}%`, icon: Tag, color: "text-emerald-400" },
            { label: "Untagged", value: untagged.toLocaleString(), icon: AlertTriangle, color: untagged > 0 ? "text-amber-400" : "text-zinc-500" },
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
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === t.key
                ? "bg-white/[0.08] text-white"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
            )}
          >
            <t.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
        </div>
      )}

      {/* Error */}
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

      {/* ═══ OVERVIEW TAB ═══ */}
      {!loading && activeTab === "overview" && stats && (
        <div className="space-y-4">
          {/* Language Distribution */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-white">Language Distribution</h3>
              </div>
              {untagged > 0 && (
                <button
                  onClick={handleBatchTag}
                  disabled={tagging || !check?.aiAvailable}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                    tagging
                      ? "bg-teal-500/10 text-teal-400"
                      : check?.aiAvailable
                        ? "bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 border border-teal-500/20"
                        : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  )}
                >
                  {tagging ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Tagging...</>
                  ) : (
                    <><Tag className="w-3 h-3" /> Tag {Math.min(untagged, 50)} memories</>
                  )}
                </button>
              )}
            </div>

            {/* Tag progress */}
            {tagProgress && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-emerald-300">
                    Tagged {tagProgress.tagged} memories · {tagProgress.remaining} remaining
                  </span>
                </div>
              </div>
            )}

            {/* Language bars */}
            {stats.languages.length === 0 ? (
              <EmptyFeatureState
                icon={Languages}
                title="Discover the languages in your knowledge"
                description="Language analysis detects what languages your memories are written in and enables cross-language search. Import multilingual content to see your language distribution."
                ctaText="Import your first data →"
                ctaHref="/app/import"
                secondaryText="or explore with demo data"
                secondaryHref="/app?demo=true"
              />
            ) : (
              <div className="space-y-2">
                {stats.languages.map((lang, i) => {
                  const maxCount = stats.languages[0]?.count || 1;
                  const pct = Math.round((lang.count / stats.totalMemories) * 100);
                  const barWidth = Math.max((lang.count / maxCount) * 100, 4);
                  const flag = LANG_FLAGS[lang.code] || '🌐';
                  
                  return (
                    <div key={lang.code} className="group">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-base w-6 text-center">{flag}</span>
                        <span className="text-sm text-zinc-300 flex-1 font-medium">{lang.name}</span>
                        <span className="text-xs text-zinc-500 tabular-nums">{lang.count.toLocaleString()}</span>
                        <span className="text-xs text-zinc-600 w-10 text-right tabular-nums">{pct}%</span>
                      </div>
                      <div className="ml-9 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            i === 0 ? "bg-teal-500" :
                            i === 1 ? "bg-sky-500" :
                            i === 2 ? "bg-amber-500" :
                            i === 3 ? "bg-emerald-500" :
                            i === 4 ? "bg-rose-500" :
                            "bg-zinc-500"
                          )}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Features Card */}
          {check && (
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-semibold text-white">Capabilities</h3>
                {check.provider && (
                  <span className="ml-auto text-xs text-zinc-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                    {check.provider}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Auto Detection", enabled: check.features.detection, desc: "Detect language on import" },
                  { label: "Translation", enabled: check.features.translation, desc: "AI-powered translation" },
                  { label: "Cross-Language Search", enabled: check.features.crossLanguageSearch, desc: "Query in any language" },
                  { label: "Script Detection", enabled: check.features.heuristicDetection, desc: "Script-based identification" },
                ].map((f, i) => (
                  <div key={i} className={cn(
                    "p-2.5 rounded-lg border transition-all",
                    f.enabled
                      ? "bg-teal-500/[0.04] border-teal-500/15"
                      : "bg-white/[0.01] border-white/[0.04]"
                  )}>
                    <div className="flex items-center gap-2 mb-0.5">
                      {f.enabled ? (
                        <Check className="w-3.5 h-3.5 text-teal-400" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                      <span className={cn("text-xs font-medium", f.enabled ? "text-white" : "text-zinc-500")}>{f.label}</span>
                    </div>
                    <p className="text-[11px] text-zinc-600 ml-5">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How It Works */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-white">How It Works</h3>
            </div>
            <div className="space-y-3">
              {[
                { step: "1", title: "Detect", desc: "When you import memories, the plugin auto-detects the language using script analysis + AI." },
                { step: "2", title: "Tag", desc: "Each memory gets a language tag in its metadata (e.g., 'en', 'es', 'ja'). Run batch tagging for existing memories." },
                { step: "3", title: "Search", desc: "Cross-language search translates your query into all detected languages, then searches each. RRF fuses results." },
                { step: "4", title: "Translate", desc: "View any memory in your preferred language with one-click AI translation." },
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
        </div>
      )}

      {/* ═══ CROSS-LANGUAGE SEARCH TAB ═══ */}
      {!loading && activeTab === "search" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3">
              <ArrowRightLeft className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-white">Cross-Language Search</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              Search in any language — your query is translated to all detected languages in your knowledge base, then results are fused.
            </p>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search across all languages..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20 transition-all"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searching || !searchQuery.trim()}
                className={cn(
                  "px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all",
                  searching
                    ? "bg-teal-500/10 text-teal-400"
                    : "bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 border border-teal-500/20"
                )}
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
            </div>
          </div>

          {/* Search Results */}
          {searchResults && (
            <div className="space-y-3">
              {/* Query Info */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-zinc-500">Query language:</span>
                <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
                  {LANG_FLAGS[searchResults.queryLanguage] || '🌐'} {searchResults.queryLanguage}
                </span>
                {searchResults.translations.length > 0 && (
                  <>
                    <span className="text-zinc-600">→ translated to:</span>
                    {searchResults.translations.map((t, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium" title={t.query}>
                        {LANG_FLAGS[t.language] || '🌐'} {t.language}
                      </span>
                    ))}
                  </>
                )}
              </div>

              {/* Translated Queries */}
              {searchResults.translations.length > 0 && (
                <div className="p-3 rounded-lg bg-sky-500/[0.04] border border-sky-500/15">
                  <p className="text-xs text-sky-400/70 mb-1.5">Translated queries:</p>
                  <div className="space-y-1">
                    {searchResults.translations.map((t, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span>{LANG_FLAGS[t.language] || '🌐'}</span>
                        <span className="text-zinc-300">{t.query}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Results List */}
              {searchResults.results.length === 0 ? (
                <div className="py-8 text-center">
                  <Search className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">No results found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500">{searchResults.totalResults} results</p>
                  {searchResults.results.map((r, i) => (
                    <div key={r.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all">
                      <div className="flex items-start gap-3">
                        <span className="text-sm font-bold text-zinc-600 mt-0.5 tabular-nums w-5 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {r.sourceTitle && (
                              <span className="text-sm font-medium text-zinc-200 truncate">{r.sourceTitle}</span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-zinc-500">
                              {r.sourceType}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-400">
                              {LANG_FLAGS[r.language] || '🌐'} {r.language}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 line-clamp-2">{r.content}</p>
                          {r.matchedLanguage !== searchResults.queryLanguage && (
                            <p className="text-[10px] text-amber-500/70 mt-1">
                              Matched via {LANG_FLAGS[r.matchedLanguage]} translation: &ldquo;{r.matchedQuery}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ DETECT & TRANSLATE TAB ═══ */}
      {!loading && activeTab === "detect" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-teal-400" />
              <h3 className="text-sm font-semibold text-white">Language Detection</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              Paste any text to detect its language. Uses script analysis + AI for high accuracy.
            </p>
            <textarea
              value={detectText}
              onChange={(e) => setDetectText(e.target.value)}
              placeholder="Paste text in any language to detect..."
              rows={4}
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
                {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Detect Language
              </button>

              {detectedLang && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20">
                  <span className="text-base">{LANG_FLAGS[detectedLang.code] || '🌐'}</span>
                  <div>
                    <span className="text-sm font-medium text-emerald-300">{detectedLang.name}</span>
                    <span className="text-[10px] text-emerald-500 ml-2">
                      {Math.round(detectedLang.confidence * 100)}% · {detectedLang.method}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Detect Examples */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-white">Try These</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { text: "The quick brown fox jumps over the lazy dog", lang: "English" },
                { text: "El zorro marrón rápido salta sobre el perro perezoso", lang: "Spanish" },
                { text: "こんにちは世界。今日はいい天気ですね。", lang: "Japanese" },
                { text: "Быстрая коричневая лиса прыгает через ленивую собаку", lang: "Russian" },
                { text: "مرحبا بالعالم. اليوم هو يوم جميل", lang: "Arabic" },
                { text: "안녕하세요 세계. 오늘은 좋은 날씨입니다.", lang: "Korean" },
              ].map((ex, i) => (
                <button
                  key={i}
                  onClick={() => { setDetectText(ex.text); setDetectedLang(null); }}
                  className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.06] hover:border-white/[0.08] transition-all text-left"
                >
                  <p className="text-xs text-zinc-400 line-clamp-1">{ex.text}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{ex.lang}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Batch Tagging Section */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">Batch Language Tagging</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              {untagged > 0
                ? `You have ${untagged.toLocaleString()} memories without language tags. Run batch tagging to detect and tag them (50 at a time).`
                : "All memories are tagged! ✓"
              }
            </p>
            {untagged > 0 && (
              <button
                onClick={handleBatchTag}
                disabled={tagging || !check?.aiAvailable}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  tagging
                    ? "bg-amber-500/10 text-amber-400"
                    : check?.aiAvailable
                      ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20"
                      : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                )}
              >
                {tagging ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processing batch...</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> Tag Next 50 Memories</>
                )}
              </button>
            )}
            {tagProgress && (
              <div className="mt-3 p-3 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-emerald-300">
                    Tagged {tagProgress.tagged} memories · {tagProgress.remaining} remaining
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </PageTransition>
  );
}
