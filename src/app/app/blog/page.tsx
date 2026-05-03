"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileEdit, Plus, Loader2, Sparkles, Trash2,
  ChevronRight, ArrowLeft, Copy, Check, Download,
  BookOpen, Clock, AlignLeft, RotateCcw,
  Wand2, Eye, EyeOff, FileText, Code2,
  Lightbulb, PenTool, Megaphone, GraduationCap, MessageSquare,
  ChevronDown, Save, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageTransition, Stagger } from "@/components/PageTransition";
import { EmptyFeatureState } from "@/components/EmptyFeatureState";
import { toast } from "sonner";
import { usePageTitle } from "@/lib/use-page-title";

// ─── Types ────────────────────────────────────────────────────

interface DraftSummary {
  id: string;
  title: string;
  topic: string;
  style: string;
  tone: string;
  wordCount: number;
  sourceCount: number;
  status: "draft" | "refining" | "ready";
  createdAt: string;
  updatedAt: string;
  preview: string;
}

interface BlogDraft {
  id: string;
  title: string;
  topic: string;
  style: string;
  tone: string;
  content: string;
  outline: string[];
  wordCount: number;
  sourceMemoryIds: string[];
  sourceCount: number;
  status: "draft" | "refining" | "ready";
  createdAt: string;
  updatedAt: string;
}

interface TopicSuggestion {
  title: string;
  description: string;
  readingTime: number;
  style: string;
}

// ─── Style/Tone Config ───────────────────────────────────────

const STYLES = [
  { id: "technical", label: "Technical", icon: Code2, desc: "Deep-dive with precision" },
  { id: "casual", label: "Casual", icon: MessageSquare, desc: "Like talking to a friend" },
  { id: "storytelling", label: "Storytelling", icon: BookOpen, desc: "Narrative with a hook" },
  { id: "tutorial", label: "Tutorial", icon: GraduationCap, desc: "Step-by-step guide" },
  { id: "opinion", label: "Opinion", icon: Megaphone, desc: "Thought leadership" },
];

const TONES = [
  { id: "professional", label: "Professional" },
  { id: "conversational", label: "Conversational" },
  { id: "academic", label: "Academic" },
  { id: "witty", label: "Witty" },
];

const STATUS_CONFIG = {
  draft: { label: "Draft", color: "text-zinc-400", bg: "bg-zinc-500/10" },
  refining: { label: "Refining", color: "text-amber-400", bg: "bg-amber-500/10" },
  ready: { label: "Ready", color: "text-emerald-400", bg: "bg-emerald-500/10" },
};

// ─── Component ───────────────────────────────────────────────

export default function BlogPage() {
  usePageTitle("Blog Writer");
  // State
  const [view, setView] = useState<"list" | "create" | "edit" | "preview">("list");
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [activeDraft, setActiveDraft] = useState<BlogDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRefine, setShowRefine] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [suggestedTopics, setSuggestedTopics] = useState<TopicSuggestion[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [exportFormat, setExportFormat] = useState<string | null>(null);

  // Create form
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("casual");
  const [tone, setTone] = useState("conversational");
  const [targetLength, setTargetLength] = useState(1200);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const hasUnsaved = useRef(false);

  // ─── Fetch Drafts ──────────────────────────────────────────

  const [draftsError, setDraftsError] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    setDraftsError(null);
    try {
      const res = await fetch("/api/v1/plugins/blog-draft?action=drafts");
      if (!res.ok) throw new Error(`Failed to fetch drafts (${res.status})`);
      const data = await res.json();
      setDrafts(data.drafts || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch drafts";
      setDraftsError(msg);
      toast.error("Could not load blog drafts", { description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  // ─── Generate Draft ────────────────────────────────────────

  const generateDraft = async () => {
    if (!topic.trim()) {
      toast.error("Enter a topic first");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/v1/plugins/blog-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", topic, style, tone, targetLength }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setActiveDraft(data.draft);
      setView("edit");
      toast.success("Blog draft generated!");
      fetchDrafts();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate draft");
    } finally {
      setGenerating(false);
    }
  };

  // ─── Load Draft ────────────────────────────────────────────

  const loadDraft = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/plugins/blog-draft?action=draft&id=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActiveDraft(data.draft);
      setView("edit");
    } catch (err: any) {
      toast.error("Failed to load draft");
    } finally {
      setLoading(false);
    }
  };

  // ─── Save Draft ────────────────────────────────────────────

  const saveDraft = async () => {
    if (!activeDraft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/plugins/blog-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          id: activeDraft.id,
          content: activeDraft.content,
          title: activeDraft.title,
          status: activeDraft.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActiveDraft(data.draft);
      hasUnsaved.current = false;
      toast.success("Draft saved");
      fetchDrafts();
    } catch (err: any) {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete Draft ──────────────────────────────────────────

  const deleteDraft = async (id: string) => {
    try {
      const res = await fetch("/api/v1/plugins/blog-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (!res.ok) throw new Error("Delete failed");
      setDrafts(prev => prev.filter(d => d.id !== id));
      if (activeDraft?.id === id) {
        setActiveDraft(null);
        setView("list");
      }
      toast.success("Draft deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  // ─── Refine with AI ───────────────────────────────────────

  const refineDraft = async () => {
    if (!activeDraft || !refineInstruction.trim()) return;
    setRefining(true);
    try {
      const selection = editorRef.current
        ? activeDraft.content.substring(
            editorRef.current.selectionStart,
            editorRef.current.selectionEnd
          )
        : "";

      const res = await fetch("/api/v1/plugins/blog-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refine",
          id: activeDraft.id,
          instruction: refineInstruction,
          selection: selection.length > 10 ? selection : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (selection.length > 10 && editorRef.current) {
        // Replace selection
        const before = activeDraft.content.substring(0, editorRef.current.selectionStart);
        const after = activeDraft.content.substring(editorRef.current.selectionEnd);
        setActiveDraft(prev => prev ? { ...prev, content: before + data.refined + after } : prev);
      } else {
        setActiveDraft(prev => prev ? { ...prev, content: data.refined } : prev);
      }
      hasUnsaved.current = true;
      setRefineInstruction("");
      setShowRefine(false);
      toast.success("Draft refined!");
    } catch (err: any) {
      toast.error(err.message || "Refinement failed");
    } finally {
      setRefining(false);
    }
  };

  // ─── Export ────────────────────────────────────────────────

  const exportDraft = async (format: "markdown" | "html") => {
    if (!activeDraft) return;
    try {
      const res = await fetch("/api/v1/plugins/blog-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export", id: activeDraft.id, format }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Download file
      const blob = new Blob([data.content], { type: format === "html" ? "text/html" : "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportFormat(null);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (err: any) {
      toast.error("Export failed");
    }
  };

  // ─── Copy to clipboard ────────────────────────────────────

  const copyContent = () => {
    if (!activeDraft) return;
    navigator.clipboard.writeText(activeDraft.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  };

  // ─── Suggest Topics ───────────────────────────────────────

  const suggestTopics = async () => {
    setLoadingTopics(true);
    try {
      const res = await fetch("/api/v1/plugins/blog-draft?action=topics");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuggestedTopics(data.topics || []);
    } catch (err: any) {
      toast.error("Failed to get suggestions");
    } finally {
      setLoadingTopics(false);
    }
  };

  // ─── Format Time ──────────────────────────────────────────

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // ─── Markdown Preview ─────────────────────────────────────

  const renderMarkdown = (md: string) => {
    let html = md;
    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold & italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    // Unordered lists
    html = html.replace(/^- (.+)$/gm, '<li class="ul-item">$1</li>');
    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="ol-item">$1</li>');
    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr />');
    // Paragraphs (double newline)
    html = html.replace(/\n\n/g, '</p><p>');
    // Single newlines within paragraphs
    html = html.replace(/\n/g, '<br />');
    return `<p>${html}</p>`;
  };

  // ─── Keyboard shortcuts ───────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && view === "edit") {
        e.preventDefault();
        saveDraft();
      }
      if (e.key === "Escape") {
        if (showRefine) setShowRefine(false);
        else if (exportFormat) setExportFormat(null);
        else if (view === "preview") setView("edit");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view, showRefine, exportFormat, activeDraft]);

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  // ─── Create View ───────────────────────────────────────────

  if (view === "create") {
    return (
      <PageTransition>
        <div className="min-h-[100dvh] bg-[#0a0a0b] px-4 sm:px-6 py-6 max-w-3xl mx-auto">
          {/* Header */}
          <button
            onClick={() => setView("list")}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to drafts
          </button>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
              <FileEdit className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-white">New Blog Post</h1>
              <p className="text-sm text-zinc-500">Generate from your knowledge</p>
            </div>
          </div>

          {/* Topic Input */}
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-2 block">Topic</label>
              <div className="relative">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="What do you want to write about?"
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20 transition-all text-[15px]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && topic.trim()) {
                      e.preventDefault();
                      generateDraft();
                    }
                  }}
                />
              </div>
            </div>

            {/* AI Topic Suggestions */}
            <div>
              <button
                onClick={suggestTopics}
                disabled={loadingTopics}
                className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300 transition-colors disabled:opacity-50"
              >
                {loadingTopics ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Lightbulb className="w-3.5 h-3.5" />
                )}
                Suggest topics from my knowledge
              </button>

              {suggestedTopics.length > 0 && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {suggestedTopics.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setTopic(t.title);
                        setStyle(t.style);
                      }}
                      className="text-left p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-teal-500/30 hover:bg-teal-500/[0.03] transition-all group"
                    >
                      <p className="text-sm font-medium text-zinc-200 group-hover:text-white line-clamp-1">{t.title}</p>
                      <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{t.description}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-zinc-600">
                        <Clock className="w-3 h-3" />
                        <span>{t.readingTime} min read</span>
                        <span className="text-zinc-700">·</span>
                        <span className="capitalize">{t.style}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Style Picker */}
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-3 block">Writing Style</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {STYLES.map((s) => {
                  const Icon = s.icon;
                  const active = style === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStyle(s.id)}
                      className={cn(
                        "p-3 rounded-xl border text-left transition-all",
                        active
                          ? "bg-teal-500/[0.08] border-teal-500/30 ring-1 ring-teal-500/20"
                          : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]"
                      )}
                    >
                      <Icon className={cn("w-4 h-4 mb-1.5", active ? "text-teal-400" : "text-zinc-500")} />
                      <p className={cn("text-sm font-medium", active ? "text-teal-300" : "text-zinc-300")}>{s.label}</p>
                      <p className="text-xs text-zinc-600 mt-0.5">{s.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tone Picker */}
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-3 block">Tone</label>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTone(t.id)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm border transition-all",
                      tone === t.id
                        ? "bg-teal-500/[0.08] border-teal-500/30 text-teal-300"
                        : "bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:border-white/[0.12] hover:text-zinc-300"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Length */}
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-2 block">
                Target length: ~{targetLength.toLocaleString()} words
              </label>
              <input
                type="range"
                min={400}
                max={3000}
                step={100}
                value={targetLength}
                onChange={(e) => setTargetLength(parseInt(e.target.value))}
                className="w-full accent-teal-500"
              />
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>Short (400)</span>
                <span>Medium (1200)</span>
                <span>Long (3000)</span>
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={generateDraft}
              disabled={!topic.trim() || generating}
              className="w-full py-3.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-semibold text-[15px] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating from your knowledge…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Blog Post
                </>
              )}
            </button>

            {generating && (
              <div className="text-center">
                <p className="text-sm text-zinc-500">
                  Searching your memories, building an outline, and writing the draft…
                </p>
                <p className="text-xs text-zinc-600 mt-1">This may take 15-30 seconds</p>
              </div>
            )}
          </div>
        </div>
      </PageTransition>
    );
  }

  // ─── Edit View ─────────────────────────────────────────────

  if ((view === "edit" || view === "preview") && activeDraft) {
    const wordCount = activeDraft.content.split(/\s+/).filter(Boolean).length;
    const readTime = Math.max(1, Math.round(wordCount / 200));

    return (
      <PageTransition>
        <div className="min-h-[100dvh] bg-[#0a0a0b] flex flex-col">
          {/* Editor Toolbar */}
          <div className="sticky top-0 z-20 bg-[#0a0a0b]/90 backdrop-blur-xl border-b border-white/[0.04]">
            <div className="px-4 sm:px-6 py-3 flex items-center justify-between max-w-5xl mx-auto">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (hasUnsaved.current) {
                      saveDraft().then(() => {
                        setView("list");
                        setActiveDraft(null);
                      });
                    } else {
                      setView("list");
                      setActiveDraft(null);
                    }
                  }}
                  className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Drafts</span>
                </button>

                <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-600">
                  <span>{wordCount.toLocaleString()} words</span>
                  <span>·</span>
                  <span>{readTime} min read</span>
                  <span>·</span>
                  <span>{activeDraft.sourceCount} sources</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* View Toggle */}
                <div className="flex bg-white/[0.03] rounded-lg border border-white/[0.06] p-0.5">
                  <button
                    onClick={() => setView("edit")}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      view === "edit"
                        ? "bg-white/[0.08] text-white"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <PenTool className="w-3 h-3 sm:hidden" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                  <button
                    onClick={() => setView("preview")}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      view === "preview"
                        ? "bg-white/[0.08] text-white"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <Eye className="w-3 h-3 sm:hidden" />
                    <span className="hidden sm:inline">Preview</span>
                  </button>
                </div>

                {/* Refine */}
                <button
                  onClick={() => setShowRefine(!showRefine)}
                  className={cn(
                    "p-2 rounded-lg border transition-all",
                    showRefine
                      ? "bg-teal-500/[0.08] border-teal-500/30 text-teal-400"
                      : "border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.12]"
                  )}
                  title="Refine with AI"
                  aria-label="Refine draft with AI"
                >
                  <Wand2 className="w-4 h-4" />
                </button>

                {/* Copy */}
                <button
                  onClick={copyContent}
                  className="p-2 rounded-lg border border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.12] transition-all"
                  title="Copy markdown"
                  aria-label="Copy draft as markdown"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>

                {/* Export */}
                <div className="relative">
                  <button
                    onClick={() => setExportFormat(exportFormat ? null : "open")}
                    className="p-2 rounded-lg border border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.12] transition-all"
                    title="Export"
                    aria-label="Export draft"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  {exportFormat && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setExportFormat(null)} />
                      <div className="absolute right-0 top-full mt-1 z-40 bg-[#131315] border border-white/[0.08] rounded-xl p-1 min-w-[160px] shadow-2xl shadow-black/60">
                        <button
                          onClick={() => exportDraft("markdown")}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:bg-white/[0.05] transition-colors"
                        >
                          <FileText className="w-4 h-4 text-zinc-500" />
                          Markdown (.md)
                        </button>
                        <button
                          onClick={() => exportDraft("html")}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:bg-white/[0.05] transition-colors"
                        >
                          <Code2 className="w-4 h-4 text-zinc-500" />
                          HTML (.html)
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Save */}
                <button
                  onClick={saveDraft}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400 hover:bg-teal-500/20 text-sm font-medium transition-all disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Save</span>
                </button>
              </div>
            </div>

            {/* Refine Panel */}
            {showRefine && (
              <div className="px-4 sm:px-6 pb-3 max-w-5xl mx-auto">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={refineInstruction}
                    onChange={(e) => setRefineInstruction(e.target.value)}
                    placeholder={
                      editorRef.current && editorRef.current.selectionStart !== editorRef.current.selectionEnd
                        ? "How should I refine the selected text?"
                        : "How should I refine the entire post? (e.g., make it more concise, add examples…)"
                    }
                    className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && refineInstruction.trim()) refineDraft();
                    }}
                    autoFocus
                  />
                  <button
                    onClick={refineDraft}
                    disabled={refining || !refineInstruction.trim()}
                    className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-black text-sm font-medium transition-all disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {refining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                    Refine
                  </button>
                </div>
                <p className="text-xs text-zinc-600 mt-1.5">
                  💡 Select text in the editor to refine just that section, or leave empty to refine the whole post.
                </p>
              </div>
            )}
          </div>

          {/* Editor / Preview Area */}
          <div className="flex-1 px-4 sm:px-6 py-6 max-w-4xl mx-auto w-full">
            {/* Editable title */}
            <input
              type="text"
              value={activeDraft.title}
              onChange={(e) => {
                setActiveDraft(prev => prev ? { ...prev, title: e.target.value } : prev);
                hasUnsaved.current = true;
              }}
              className="w-full bg-transparent text-[28px] sm:text-[32px] font-bold tracking-[-0.04em] text-white placeholder:text-zinc-700 focus:outline-none mb-4 border-none"
              placeholder="Post title…"
            />

            {/* Meta bar */}
            <div className="flex flex-wrap items-center gap-3 mb-6 text-xs text-zinc-600">
              <span className="capitalize px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.06]">
                {activeDraft.style}
              </span>
              <span className="capitalize px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.06]">
                {activeDraft.tone}
              </span>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {readTime} min read
              </div>
              <div className="flex items-center gap-1">
                <AlignLeft className="w-3 h-3" />
                {wordCount.toLocaleString()} words
              </div>

              {/* Status toggle */}
              <div className="relative ml-auto">
                <button
                  onClick={() => {
                    const statuses: Array<"draft" | "refining" | "ready"> = ["draft", "refining", "ready"];
                    const idx = statuses.indexOf(activeDraft.status);
                    const next = statuses[(idx + 1) % statuses.length];
                    setActiveDraft(prev => prev ? { ...prev, status: next } : prev);
                    hasUnsaved.current = true;
                  }}
                  className={cn(
                    "px-2.5 py-0.5 rounded-full text-xs font-medium transition-all",
                    STATUS_CONFIG[activeDraft.status].bg,
                    STATUS_CONFIG[activeDraft.status].color
                  )}
                >
                  {STATUS_CONFIG[activeDraft.status].label}
                </button>
              </div>
            </div>

            {view === "edit" ? (
              <textarea
                ref={editorRef}
                value={activeDraft.content}
                onChange={(e) => {
                  setActiveDraft(prev => prev ? { ...prev, content: e.target.value } : prev);
                  hasUnsaved.current = true;
                }}
                className="w-full min-h-[calc(100dvh-280px)] bg-transparent text-[15px] leading-[1.8] text-zinc-300 placeholder:text-zinc-700 focus:outline-none resize-none font-mono"
                placeholder="Start writing…"
                spellCheck
              />
            ) : (
              <div
                className="prose-mindstore min-h-[calc(100dvh-280px)]"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(activeDraft.content) }}
              />
            )}
          </div>
        </div>

        {/* Preview styles */}
        <style jsx global>{`
          .prose-mindstore {
            color: #d4d4d8;
            font-size: 16px;
            line-height: 1.8;
          }
          .prose-mindstore h1 {
            color: #fff;
            font-size: 1.8rem;
            font-weight: 700;
            letter-spacing: -0.03em;
            margin: 2rem 0 0.75rem;
          }
          .prose-mindstore h2 {
            color: #f4f4f5;
            font-size: 1.35rem;
            font-weight: 600;
            letter-spacing: -0.02em;
            margin: 2.5rem 0 0.75rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid rgba(255,255,255,0.06);
          }
          .prose-mindstore h3 {
            color: #e4e4e7;
            font-size: 1.1rem;
            font-weight: 600;
            margin: 1.5rem 0 0.5rem;
          }
          .prose-mindstore strong {
            color: #fff;
            font-weight: 600;
          }
          .prose-mindstore em {
            color: #a1a1aa;
            font-style: italic;
          }
          .prose-mindstore blockquote {
            border-left: 3px solid #14b8a6;
            padding-left: 1rem;
            margin: 1.5rem 0;
            color: #a1a1aa;
            font-style: italic;
          }
          .prose-mindstore .code-block {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 12px;
            padding: 1rem;
            overflow-x: auto;
            font-size: 0.85rem;
            margin: 1.5rem 0;
          }
          .prose-mindstore .inline-code {
            background: rgba(255,255,255,0.06);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.9em;
            color: #5eead4;
          }
          .prose-mindstore .ul-item,
          .prose-mindstore .ol-item {
            margin: 0.25rem 0;
            padding-left: 1.5rem;
            position: relative;
          }
          .prose-mindstore .ul-item::before {
            content: "•";
            position: absolute;
            left: 0.25rem;
            color: #14b8a6;
          }
          .prose-mindstore hr {
            border: none;
            border-top: 1px solid rgba(255,255,255,0.06);
            margin: 2rem 0;
          }
          .prose-mindstore a {
            color: #14b8a6;
            text-decoration: underline;
            text-underline-offset: 2px;
          }
          .prose-mindstore p {
            margin: 0.75rem 0;
          }
        `}</style>
      </PageTransition>
    );
  }

  // ─── List View (Default) ──────────────────────────────────

  return (
    <PageTransition>
      <div className="min-h-[100dvh] bg-[#0a0a0b] px-4 sm:px-6 py-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
              <FileEdit className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-white">Blog Writer</h1>
              <p className="text-sm text-zinc-500">Turn your knowledge into posts</p>
            </div>
          </div>
          <button
            onClick={() => {
              setTopic("");
              setSuggestedTopics([]);
              setView("create");
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-semibold text-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Post</span>
          </button>
        </div>

        {/* Loading Skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.04] animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-48 rounded-lg bg-white/[0.05] animate-pulse" />
                    <div className="h-3 w-32 rounded-lg bg-white/[0.03] animate-pulse" />
                  </div>
                  <div className="h-6 w-16 rounded-full bg-white/[0.04] animate-pulse" />
                </div>
                <div className="h-3 w-full rounded bg-white/[0.03] animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-white/[0.02] animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* Inline error */}
        {!loading && draftsError && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] p-4 flex items-center justify-between gap-3">
            <div className="text-[13px] text-rose-300">
              Could not load blog drafts. {draftsError}
            </div>
            <button
              type="button"
              onClick={fetchDrafts}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] text-zinc-200 hover:bg-white/[0.08] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !draftsError && drafts.length === 0 && (
          <EmptyFeatureState
            icon={FileEdit}
            title="Blog Writer is ready when your knowledge is"
            description="Drafts are generated from your stored memories — import notes, articles, or chats first so the AI has something real to write from."
            onAction={() => setView("create")}
            actionLabel="Create your first post"
            actionIcon={Wand2}
            ctaText="Import more data →"
            ctaHref="/app/import"
          />
        )}

        {/* Draft List */}
        {!loading && drafts.length > 0 && (
          <Stagger>
            <div className="space-y-2">
              {drafts.map((draft) => (
                <button
                  key={draft.id}
                  onClick={() => loadDraft(draft.id)}
                  className="w-full text-left p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03] transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-[15px] font-medium text-zinc-200 group-hover:text-white truncate transition-colors">
                          {draft.title}
                        </h3>
                        <span className={cn(
                          "shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium",
                          STATUS_CONFIG[draft.status].bg,
                          STATUS_CONFIG[draft.status].color
                        )}>
                          {STATUS_CONFIG[draft.status].label}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-500 line-clamp-2">{draft.preview}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-zinc-600">
                        <span className="capitalize">{draft.style}</span>
                        <span>·</span>
                        <span>{draft.wordCount.toLocaleString()} words</span>
                        <span>·</span>
                        <span>{draft.sourceCount} sources</span>
                        <span>·</span>
                        <span>{formatTime(draft.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Delete this draft?")) deleteDraft(draft.id);
                        }}
                        className="p-1.5 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Stagger>
        )}
      </div>
    </PageTransition>
  );
}
