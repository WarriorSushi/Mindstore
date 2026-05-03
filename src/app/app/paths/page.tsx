"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Route, Plus, Loader2, ArrowLeft, Trash2, ChevronRight,
  CheckCircle2, Circle, BookOpen, Code, Rocket, FileText,
  Trophy, Clock, Sparkles, ChevronDown, ChevronUp,
  StickyNote, ExternalLink, Brain,
  GraduationCap, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageTransition, Stagger } from "@/components/PageTransition";
import { EmptyFeatureState } from "@/components/EmptyFeatureState";
import { toast } from "sonner";
import { usePageTitle } from "@/lib/use-page-title";

// ─── Types ────────────────────────────────────────────────────

interface PathSummary {
  id: string;
  topic: string;
  description: string;
  difficulty: string;
  estimatedHours: number;
  nodeCount: number;
  completedNodes: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

interface Resource {
  title: string;
  type: "article" | "video" | "book" | "exercise" | "tool";
  url?: string;
}

interface PathNode {
  id: string;
  title: string;
  description: string;
  type: "concept" | "practice" | "project" | "reading" | "milestone";
  depth: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  completed: boolean;
  completedAt?: string;
  note?: string;
  resources: Resource[];
  dependencies: string[];
  relatedMemoryIds: string[];
  relatedMemoryTitles: string[];
}

interface LearningPath {
  id: string;
  topic: string;
  description: string;
  difficulty: string;
  estimatedHours: number;
  nodes: PathNode[];
  progress: number;
  existingKnowledge: { title: string; preview: string; sourceType: string }[];
  createdAt: string;
  updatedAt: string;
}

interface Suggestion {
  topic: string;
  reason: string;
  difficulty: string;
  estimatedHours: number;
}

// ─── Node Type Config ────────────────────────────────────────

const NODE_TYPES: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string; bg: string; border: string }> = {
  concept:   { icon: BookOpen,  label: "Concept",   color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/20" },
  practice:  { icon: Code,      label: "Practice",  color: "text-teal-400",    bg: "bg-teal-500/10",    border: "border-teal-500/20" },
  project:   { icon: Rocket,    label: "Project",   color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20" },
  reading:   { icon: FileText,  label: "Reading",   color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  milestone: { icon: Trophy,    label: "Milestone", color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20" },
};

const DEPTH_COLORS: Record<string, { text: string; bg: string }> = {
  beginner:     { text: "text-emerald-400", bg: "bg-emerald-500/10" },
  intermediate: { text: "text-sky-400",     bg: "bg-sky-500/10" },
  advanced:     { text: "text-amber-400",   bg: "bg-amber-500/10" },
};

const RESOURCE_ICONS: Record<string, string> = {
  article: "📄", video: "🎬", book: "📚", exercise: "🏋️", tool: "🔧",
};

const DIFFICULTY_LABELS: Record<string, { text: string; color: string }> = {
  beginner:     { text: "Beginner",     color: "text-emerald-400" },
  intermediate: { text: "Intermediate", color: "text-sky-400" },
  advanced:     { text: "Advanced",     color: "text-amber-400" },
  mixed:        { text: "Mixed",        color: "text-zinc-400" },
};

// ─── Component ───────────────────────────────────────────────

export default function LearningPathsPage() {
  usePageTitle("Learning Paths");
  const [view, setView] = useState<"home" | "create" | "detail">("home");
  const [paths, setPaths] = useState<PathSummary[]>([]);
  const [activePath, setActivePath] = useState<LearningPath | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  // ─── Fetch Paths ────────────────────────────────────────────

  const fetchPaths = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/plugins/learning-paths?action=list");
      if (!res.ok) throw new Error(`Failed to load learning paths (${res.status})`);
      const data = await res.json();
      setPaths(data.paths || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load learning paths";
      toast.error("Could not load learning paths", { description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPath = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/plugins/learning-paths?action=get&id=${id}`);
      const data = await res.json();
      if (data.path) {
        setActivePath(data.path);
        setView("detail");
      } else {
        toast.error("Path not found");
      }
    } catch {
      toast.error("Failed to load path");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    try {
      setLoadingSuggestions(true);
      const res = await fetch("/api/v1/plugins/learning-paths?action=suggestions");
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch {
      // Silently fail — suggestions are optional
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    fetchPaths();
    fetchSuggestions();
  }, [fetchPaths, fetchSuggestions]);

  // ─── Generate Path ─────────────────────────────────────────

  const generatePath = async (topicOverride?: string) => {
    const t = topicOverride || topic;
    if (!t.trim()) return;

    try {
      setGenerating(true);
      const res = await fetch("/api/v1/plugins/learning-paths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", topic: t.trim(), context: context.trim() || undefined }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      if (data.path) {
        setActivePath(data.path);
        setView("detail");
        setTopic("");
        setContext("");
        fetchPaths(); // refresh list
        toast.success(`Learning path created: ${data.path.topic}`);
      }
    } catch {
      toast.error("Failed to generate path");
    } finally {
      setGenerating(false);
    }
  };

  // ─── Toggle Node Completion ─────────────────────────────────

  const toggleNode = async (nodeId: string) => {
    if (!activePath) return;
    const node = activePath.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const newCompleted = !node.completed;

    // Optimistic update
    const updatedNodes = activePath.nodes.map(n =>
      n.id === nodeId ? { ...n, completed: newCompleted, completedAt: newCompleted ? new Date().toISOString() : undefined } : n
    );
    const completedCount = updatedNodes.filter(n => n.completed).length;
    const newProgress = Math.round((completedCount / updatedNodes.length) * 100);
    setActivePath({ ...activePath, nodes: updatedNodes, progress: newProgress });

    try {
      const res = await fetch("/api/v1/plugins/learning-paths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-progress", pathId: activePath.id, nodeId, completed: newCompleted }),
      });
      const data = await res.json();
      if (data.path) setActivePath(data.path);
      fetchPaths(); // refresh list
    } catch {
      // Revert on error
      setActivePath(activePath);
    }
  };

  // ─── Save Note ──────────────────────────────────────────────

  const saveNote = async (nodeId: string) => {
    if (!activePath) return;
    try {
      const res = await fetch("/api/v1/plugins/learning-paths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-note", pathId: activePath.id, nodeId, note: noteText }),
      });
      const data = await res.json();
      if (data.path) setActivePath(data.path);
      setEditingNote(null);
      setNoteText("");
      toast.success("Note saved");
    } catch {
      toast.error("Failed to save note");
    }
  };

  // ─── Delete Path ────────────────────────────────────────────

  const deletePath = async (id: string) => {
    try {
      await fetch("/api/v1/plugins/learning-paths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      fetchPaths();
      if (activePath?.id === id) {
        setActivePath(null);
        setView("home");
      }
      toast.success("Path deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  // ─── Render ─────────────────────────────────────────────────

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#0a0a0b] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

          {/* ─── Header ─────────────────────────────────────── */}
          <div className="flex items-center gap-3 mb-8">
            {view !== "home" && (
              <button
                onClick={() => { setView("home"); setActivePath(null); setExpandedNode(null); }}
                className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-zinc-400" />
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20">
                <Route className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  {view === "home" ? "Learning Paths" : view === "create" ? "New Path" : activePath?.topic || "Path"}
                </h1>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {view === "home"
                    ? "Structured learning plans from your knowledge"
                    : view === "create"
                    ? "AI-designed curriculum based on what you know"
                    : activePath ? `${activePath.nodes.length} steps · ${activePath.estimatedHours}h estimated` : ""}
                </p>
              </div>
            </div>
            {view === "home" && (
              <button
                onClick={() => setView("create")}
                className="ml-auto p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 hover:bg-teal-500/20 transition-colors"
              >
                <Plus className="w-4 h-4 text-teal-400" />
              </button>
            )}
          </div>

          {/* ─── HOME VIEW ──────────────────────────────────── */}
          {view === "home" && (
            <Stagger>
              {/* Quick Generate Bar */}
              <div className="mb-8">
                <div className="relative">
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !generating && generatePath()}
                    placeholder="What do you want to learn? e.g. Rust programming, machine learning..."
                    className="w-full px-4 py-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-white placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30 focus:bg-white/[0.04] transition-all text-sm"
                    disabled={generating}
                  />
                  <button
                    onClick={() => generatePath()}
                    disabled={!topic.trim() || generating}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-medium hover:bg-teal-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Generate"}
                  </button>
                </div>
              </div>

              {/* AI Suggestions */}
              {(loadingSuggestions || suggestions.length > 0) && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                    <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Suggested for you</span>
                  </div>
                  {loadingSuggestions ? (
                    <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing your knowledge...
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => { setTopic(s.topic); setView("create"); }}
                          className="text-left p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] hover:border-teal-500/20 transition-all group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">{s.topic}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-teal-400 transition-colors mt-0.5 shrink-0" />
                          </div>
                          <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{s.reason}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className={cn("text-[10px] font-medium", DIFFICULTY_LABELS[s.difficulty]?.color || "text-zinc-500")}>
                              {DIFFICULTY_LABELS[s.difficulty]?.text || s.difficulty}
                            </span>
                            <span className="text-[10px] text-zinc-600">~{s.estimatedHours}h</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Existing Paths */}
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-3">
                      <div className="animate-pulse rounded-xl bg-white/[0.04] w-10 h-10 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="animate-pulse rounded-xl bg-white/[0.04] h-4 w-40" />
                        <div className="animate-pulse rounded-xl bg-white/[0.04] h-3 w-64" />
                      </div>
                      <div className="animate-pulse rounded-xl bg-white/[0.04] h-6 w-16 shrink-0" />
                    </div>
                  ))}
                </div>
              ) : paths.length === 0 ? (
                <EmptyFeatureState
                  icon={Route}
                  title="Chart your learning journey"
                  description="Learning Paths creates structured study plans from your existing knowledge — identifying what you already know and what comes next. Enter a topic above or import data to get started."
                  ctaText="Import your first data →"
                  ctaHref="/app/import"
                  secondaryText="or explore with demo data"
                  secondaryHref="/app?demo=true"
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <GraduationCap className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Your paths</span>
                    <span className="text-[10px] text-zinc-600 bg-white/[0.04] px-1.5 py-0.5 rounded-md">{paths.length}</span>
                  </div>
                  {paths.map((p) => {
                    const diff = DIFFICULTY_LABELS[p.difficulty] || DIFFICULTY_LABELS.mixed;
                    return (
                      <div
                        key={p.id}
                        className="group flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] hover:border-teal-500/15 cursor-pointer transition-all"
                        onClick={() => fetchPath(p.id)}
                      >
                        {/* Progress Ring */}
                        <div className="relative w-11 h-11 shrink-0">
                          <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
                            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="2.5" className="stroke-white/[0.06]" />
                            <circle
                              cx="18" cy="18" r="15" fill="none" strokeWidth="2.5"
                              strokeDasharray={`${p.progress * 0.942} 100`}
                              strokeLinecap="round"
                              className={p.progress === 100 ? "stroke-emerald-400" : "stroke-teal-400"}
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-zinc-300">
                            {p.progress}%
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors truncate">
                            {p.topic}
                          </h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={cn("text-[10px] font-medium", diff.color)}>{diff.text}</span>
                            <span className="text-[10px] text-zinc-600">{p.completedNodes}/{p.nodeCount} steps</span>
                            <span className="text-[10px] text-zinc-600">{p.estimatedHours}h</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); deletePath(p.id); }}
                            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-rose-500/10 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-zinc-600 hover:text-rose-400" />
                          </button>
                          <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-teal-400 transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Stagger>
          )}

          {/* ─── CREATE VIEW ────────────────────────────────── */}
          {view === "create" && (
            <Stagger>
              <div className="space-y-6">
                {/* Topic Input */}
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-2 block">Topic</label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !generating && generatePath()}
                    placeholder="What do you want to learn?"
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30 transition-all text-sm"
                    autoFocus
                    disabled={generating}
                  />
                </div>

                {/* Optional Context */}
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-2 block">
                    Context <span className="text-zinc-600">(optional)</span>
                  </label>
                  <textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="Any specific goals, current skill level, or focus areas..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30 transition-all text-sm resize-none"
                    disabled={generating}
                  />
                </div>

                {/* Suggestion Chips */}
                {suggestions.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-zinc-400 mb-2 block">Or pick a suggestion</label>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => setTopic(s.topic)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs border transition-all",
                            topic === s.topic
                              ? "bg-teal-500/10 border-teal-500/30 text-teal-400"
                              : "bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:bg-white/[0.04]"
                          )}
                        >
                          {s.topic}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Generate Button */}
                <button
                  onClick={() => generatePath()}
                  disabled={!topic.trim() || generating}
                  className="w-full py-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 font-medium text-sm hover:bg-teal-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Designing your curriculum...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate Learning Path
                    </>
                  )}
                </button>
              </div>
            </Stagger>
          )}

          {/* ─── DETAIL VIEW ────────────────────────────────── */}
          {view === "detail" && activePath && (
            <Stagger>
              {/* Progress Bar */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-500">Progress</span>
                  <span className={cn(
                    "text-xs font-semibold",
                    activePath.progress === 100 ? "text-emerald-400" : "text-teal-400"
                  )}>
                    {activePath.progress}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      activePath.progress === 100 ? "bg-emerald-400" : "bg-teal-400"
                    )}
                    style={{ width: `${activePath.progress}%` }}
                  />
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-[10px] text-zinc-600">
                    {activePath.nodes.filter(n => n.completed).length} of {activePath.nodes.length} steps complete
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    ~{Math.round(activePath.nodes.filter(n => !n.completed).reduce((s, n) => s + n.estimatedMinutes, 0) / 60 * 10) / 10}h remaining
                  </span>
                  {activePath.progress === 100 && (
                    <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                      <Trophy className="w-3 h-3" /> Completed!
                    </span>
                  )}
                </div>
              </div>

              {/* Existing Knowledge Section */}
              {activePath.existingKnowledge.length > 0 && (
                <div className="mb-6 p-4 rounded-xl bg-sky-500/[0.03] border border-sky-500/10">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-3.5 h-3.5 text-sky-400" />
                    <span className="text-xs font-medium text-sky-400">What you already know</span>
                    <span className="text-[10px] text-zinc-600 bg-white/[0.04] px-1.5 py-0.5 rounded-md">
                      {activePath.existingKnowledge.length}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {activePath.existingKnowledge.slice(0, 5).map((m, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <div className="w-1 h-1 rounded-full bg-sky-400/40 mt-1.5 shrink-0" />
                        <span className="text-zinc-400">
                          <span className="text-zinc-300">{m.title}</span>
                          {m.preview && ` — ${m.preview.slice(0, 80)}...`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Node List — Timeline Style */}
              <div className="space-y-1">
                {activePath.nodes.map((node, idx) => {
                  const typeConfig = NODE_TYPES[node.type] || NODE_TYPES.concept;
                  const depthConfig = DEPTH_COLORS[node.depth] || DEPTH_COLORS.beginner;
                  const Icon = typeConfig.icon;
                  const isExpanded = expandedNode === node.id;
                  const isLast = idx === activePath.nodes.length - 1;

                  return (
                    <div key={node.id} className="relative">
                      {/* Timeline connector */}
                      {!isLast && (
                        <div className="absolute left-5 top-12 bottom-0 w-px bg-white/[0.04]" />
                      )}

                      <div
                        className={cn(
                          "relative flex gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                          node.completed
                            ? "bg-emerald-500/[0.02] border-emerald-500/10"
                            : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-teal-500/15",
                          isExpanded && "bg-white/[0.04]"
                        )}
                        onClick={() => setExpandedNode(isExpanded ? null : node.id)}
                      >
                        {/* Completion toggle + Icon */}
                        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }}
                            className="relative z-10"
                          >
                            {node.completed ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <Circle className="w-5 h-5 text-zinc-600 hover:text-teal-400 transition-colors" />
                            )}
                          </button>
                          <div className={cn("p-1 rounded-md mt-1", typeConfig.bg)}>
                            <Icon className={cn("w-3 h-3", typeConfig.color)} />
                          </div>
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className={cn(
                              "text-sm font-medium transition-colors",
                              node.completed ? "text-zinc-500 line-through" : "text-zinc-200"
                            )}>
                              {node.title}
                            </h3>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded", depthConfig.bg, depthConfig.text)}>
                                {node.depth}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-zinc-600" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
                              )}
                            </div>
                          </div>

                          {/* Inline meta */}
                          <div className="flex items-center gap-3 mt-1">
                            <span className={cn("text-[10px] font-medium", typeConfig.color)}>{typeConfig.label}</span>
                            <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" /> {node.estimatedMinutes}m
                            </span>
                            {node.note && (
                              <span className="text-[10px] text-amber-400/60 flex items-center gap-1">
                                <StickyNote className="w-2.5 h-2.5" /> note
                              </span>
                            )}
                            {node.relatedMemoryTitles.length > 0 && (
                              <span className="text-[10px] text-sky-400/60 flex items-center gap-1">
                                <Brain className="w-2.5 h-2.5" /> {node.relatedMemoryTitles.length} related
                              </span>
                            )}
                          </div>

                          {/* Expanded Content */}
                          {isExpanded && (
                            <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                              {/* Description */}
                              <p className="text-xs text-zinc-400 leading-relaxed">{node.description}</p>

                              {/* Resources */}
                              {node.resources.length > 0 && (
                                <div>
                                  <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5 block">Resources</span>
                                  <div className="space-y-1">
                                    {node.resources.map((r, ri) => (
                                      <div key={ri} className="flex items-center gap-2 text-xs">
                                        <span>{RESOURCE_ICONS[r.type] || "📎"}</span>
                                        {r.url ? (
                                          <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline flex items-center gap-1">
                                            {r.title} <ExternalLink className="w-2.5 h-2.5" />
                                          </a>
                                        ) : (
                                          <span className="text-zinc-400">{r.title}</span>
                                        )}
                                        <span className="text-[9px] text-zinc-600">{r.type}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Related Memories */}
                              {node.relatedMemoryTitles.length > 0 && (
                                <div>
                                  <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5 block">From your knowledge</span>
                                  <div className="space-y-1">
                                    {node.relatedMemoryTitles.map((title, mi) => (
                                      <div key={mi} className="flex items-center gap-2 text-xs text-sky-400/80">
                                        <Brain className="w-2.5 h-2.5" />
                                        <span>{title}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Note Section */}
                              <div>
                                {editingNote === node.id ? (
                                  <div className="space-y-2">
                                    <textarea
                                      value={noteText}
                                      onChange={(e) => setNoteText(e.target.value)}
                                      placeholder="Add your notes for this step..."
                                      rows={3}
                                      className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/30 resize-none"
                                      autoFocus
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => saveNote(node.id)}
                                        className="px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs hover:bg-teal-500/20 transition-colors"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => { setEditingNote(null); setNoteText(""); }}
                                        className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-zinc-400 text-xs hover:bg-white/[0.08] transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingNote(node.id);
                                      setNoteText(node.note || "");
                                    }}
                                    className="flex items-center gap-1.5 text-[10px] text-zinc-600 hover:text-amber-400 transition-colors"
                                  >
                                    <StickyNote className="w-3 h-3" />
                                    {node.note ? "Edit note" : "Add note"}
                                  </button>
                                )}
                                {node.note && editingNote !== node.id && (
                                  <p className="mt-1.5 text-xs text-amber-400/60 bg-amber-500/[0.04] border border-amber-500/10 rounded-lg px-3 py-2 italic">
                                    {node.note}
                                  </p>
                                )}
                              </div>

                              {/* Completed At */}
                              {node.completed && node.completedAt && (
                                <p className="text-[10px] text-emerald-400/50">
                                  Completed {new Date(node.completedAt).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Path Meta Footer */}
              <div className="mt-8 pt-4 border-t border-white/[0.04] flex items-center justify-between text-[10px] text-zinc-600">
                <span>Created {new Date(activePath.createdAt).toLocaleDateString()}</span>
                <div className="flex items-center gap-3">
                  <span>{activePath.difficulty}</span>
                  <span>{activePath.estimatedHours}h total</span>
                  <button
                    onClick={() => deletePath(activePath.id)}
                    className="text-zinc-600 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </Stagger>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
