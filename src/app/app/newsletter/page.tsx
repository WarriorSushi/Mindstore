"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Mail, Plus, Loader2, Sparkles, Trash2,
  ChevronRight, ArrowLeft, Copy, Check, Download,
  Clock, AlignLeft, Calendar, Send,
  Wand2, Eye, Edit3, ChevronDown, ChevronUp,
  Lightbulb, MessageSquare, Briefcase, Zap,
  FileText, BookOpen, Quote, Link2, PenTool,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageTransition, Stagger } from "@/components/PageTransition";
import { EmptyFeatureState } from "@/components/EmptyFeatureState";
import { toast } from "sonner";
import { usePageTitle } from "@/lib/use-page-title";

// ─── Types ────────────────────────────────────────────────────

interface NewsletterSummary {
  id: string;
  title: string;
  subject: string;
  period: string;
  periodDays: number;
  tone: string;
  sectionCount: number;
  wordCount: number;
  sourceCount: number;
  topicsCovered: string[];
  status: "draft" | "polishing" | "ready";
  createdAt: string;
  updatedAt: string;
}

interface NewsletterSection {
  id: string;
  type: "intro" | "topic" | "highlight" | "quicklinks" | "reflection" | "outro";
  title: string;
  content: string;
  sourceCount: number;
}

interface Newsletter {
  id: string;
  title: string;
  subject: string;
  period: string;
  periodDays: number;
  tone: string;
  sections: NewsletterSection[];
  wordCount: number;
  sourceCount: number;
  topicsCovered: string[];
  status: "draft" | "polishing" | "ready";
  createdAt: string;
  updatedAt: string;
}

interface Suggestion {
  title: string;
  subject: string;
  topics: string[];
  pitch: string;
}

// ─── Config ───────────────────────────────────────────────────

const TIMEFRAMES = [
  { id: 7, label: "Last 7 days", desc: "Weekly digest" },
  { id: 14, label: "Last 14 days", desc: "Bi-weekly recap" },
  { id: 30, label: "Last 30 days", desc: "Monthly roundup" },
];

const TONES = [
  { id: "casual", label: "Casual", icon: MessageSquare },
  { id: "professional", label: "Professional", icon: Briefcase },
  { id: "witty", label: "Witty", icon: Zap },
];

const SECTION_CONFIG: Record<string, { icon: typeof Mail; label: string; color: string }> = {
  intro: { icon: Send, label: "Introduction", color: "text-teal-400" },
  topic: { icon: BookOpen, label: "Deep Dive", color: "text-sky-400" },
  highlight: { icon: Quote, label: "Highlight", color: "text-amber-400" },
  quicklinks: { icon: Link2, label: "Quick Links", color: "text-emerald-400" },
  reflection: { icon: Lightbulb, label: "Reflection", color: "text-rose-400" },
  outro: { icon: PenTool, label: "Sign Off", color: "text-zinc-400" },
};

const STATUS_CONFIG = {
  draft: { label: "Draft", color: "text-zinc-400", bg: "bg-zinc-500/10" },
  polishing: { label: "Polishing", color: "text-amber-400", bg: "bg-amber-500/10" },
  ready: { label: "Ready to Send", color: "text-emerald-400", bg: "bg-emerald-500/10" },
};

// ─── Simple Markdown Renderer ─────────────────────────────────

function renderMarkdown(md: string) {
  if (!md) return null;
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(
        <h4 key={key++} className="text-sm font-semibold text-zinc-200 mt-4 mb-1.5">
          {line.slice(4)}
        </h4>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h3 key={key++} className="text-base font-semibold text-zinc-100 mt-5 mb-2">
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h2 key={key++} className="text-lg font-bold text-white mt-6 mb-2">
          {line.slice(2)}
        </h2>
      );
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote
          key={key++}
          className="border-l-2 border-teal-500/40 pl-3 my-2 text-zinc-400 italic text-sm"
        >
          {renderInline(line.slice(2))}
        </blockquote>
      );
    } else if (line.match(/^[-*] /)) {
      elements.push(
        <div key={key++} className="flex gap-2 text-sm text-zinc-300 my-0.5">
          <span className="text-teal-500/60 mt-0.5 shrink-0">•</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (line.match(/^\d+\. /)) {
      const num = line.match(/^(\d+)\. /)?.[1] || "1";
      elements.push(
        <div key={key++} className="flex gap-2 text-sm text-zinc-300 my-0.5">
          <span className="text-teal-500/60 mt-0.5 shrink-0 text-xs w-4 text-right">{num}.</span>
          <span>{renderInline(line.replace(/^\d+\. /, ""))}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-2" />);
    } else {
      elements.push(
        <p key={key++} className="text-sm text-zinc-300 leading-relaxed my-1">
          {renderInline(line)}
        </p>
      );
    }
    i++;
  }

  return <>{elements}</>;
}

function renderInline(text: string) {
  // Bold, italic, links, inline code
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let idx = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Italic
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+?)\*(?!\*)/);
    // Code
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Link
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    const matches = [boldMatch, italicMatch, codeMatch, linkMatch].filter(Boolean) as RegExpMatchArray[];
    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    // Find earliest match
    const earliest = matches.reduce((a, b) =>
      (a.index || 0) < (b.index || 0) ? a : b
    );

    const pos = earliest.index || 0;
    if (pos > 0) parts.push(remaining.slice(0, pos));

    if (earliest === boldMatch) {
      parts.push(<strong key={idx++} className="text-zinc-100 font-semibold">{earliest[1]}</strong>);
    } else if (earliest === codeMatch) {
      parts.push(
        <code key={idx++} className="px-1.5 py-0.5 rounded bg-zinc-800 text-teal-400 text-xs font-mono">
          {earliest[1]}
        </code>
      );
    } else if (earliest === linkMatch) {
      parts.push(
        <a key={idx++} href={earliest[2]} target="_blank" rel="noopener" className="text-teal-400 hover:text-teal-300 underline underline-offset-2">
          {earliest[1]}
        </a>
      );
    } else if (earliest === italicMatch) {
      parts.push(<em key={idx++} className="text-zinc-300 italic">{earliest[1]}</em>);
    }

    remaining = remaining.slice(pos + earliest[0].length);
  }

  return <>{parts}</>;
}

// ─── Relative Time ────────────────────────────────────────────

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Component ───────────────────────────────────────────────

export default function NewsletterPage() {
  usePageTitle("Newsletter");
  // ─── State ───────────────────────────────────────────
  const [view, setView] = useState<"list" | "create" | "edit" | "preview">("list");
  const [newsletters, setNewsletters] = useState<NewsletterSummary[]>([]);
  const [activeNewsletter, setActiveNewsletter] = useState<Newsletter | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestMemoryCount, setSuggestMemoryCount] = useState(0);
  const [copied, setCopied] = useState(false);

  // Create form
  const [createTitle, setCreateTitle] = useState("");
  const [createSubject, setCreateSubject] = useState("");
  const [createPeriod, setCreatePeriod] = useState(7);
  const [createTone, setCreateTone] = useState("casual");
  const [createTopics, setCreateTopics] = useState("");
  const [createCustom, setCreateCustom] = useState("");

  // Edit state
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [refiningSectionId, setRefiningSectionId] = useState<string | null>(null);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refineLoading, setRefineLoading] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Fetch newsletters ────────────────────────────────
  const fetchNewsletters = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/plugins/newsletter-writer?action=newsletters");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setNewsletters(data.newsletters || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNewsletters();
  }, [fetchNewsletters]);

  // ─── Fetch single newsletter ──────────────────────────
  const openNewsletter = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/plugins/newsletter-writer?action=newsletter&id=${id}`);
      if (!res.ok) throw new Error("Failed to fetch newsletter");
      const data = await res.json();
      setActiveNewsletter(data.newsletter);
      // Expand all sections by default
      const allIds = new Set<string>(data.newsletter.sections.map((s: NewsletterSection) => s.id));
      setExpandedSections(allIds);
      setView("edit");
    } catch {
      toast.error("Failed to load newsletter");
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Fetch suggestions ────────────────────────────────
  const fetchSuggestions = useCallback(async (days: number) => {
    setSuggestionsLoading(true);
    try {
      const res = await fetch(`/api/v1/plugins/newsletter-writer?action=suggest&days=${days}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setSuggestions(data.suggestions || []);
      setSuggestMemoryCount(data.memoryCount || 0);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  // ─── Generate newsletter ──────────────────────────────
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/v1/plugins/newsletter-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          title: createTitle || undefined,
          subject: createSubject || undefined,
          periodDays: createPeriod,
          tone: createTone,
          focusTopics: createTopics ? createTopics.split(",").map(t => t.trim()).filter(Boolean) : undefined,
          customPrompt: createCustom || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Generation failed");
      }
      const data = await res.json();
      setActiveNewsletter(data.newsletter);
      const allIds = new Set<string>(data.newsletter.sections.map((s: NewsletterSection) => s.id));
      setExpandedSections(allIds);
      setView("edit");
      toast.success("Newsletter generated!");
      fetchNewsletters();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate newsletter");
    } finally {
      setGenerating(false);
    }
  }, [createTitle, createSubject, createPeriod, createTone, createTopics, createCustom, fetchNewsletters]);

  // ─── Delete newsletter ────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch("/api/v1/plugins/newsletter-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (!res.ok) throw new Error("Delete failed");
      setNewsletters(prev => prev.filter(n => n.id !== id));
      if (activeNewsletter?.id === id) {
        setActiveNewsletter(null);
        setView("list");
      }
      toast.success("Newsletter deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }, [activeNewsletter]);

  // ─── Save section edit ────────────────────────────────
  const handleSaveSection = useCallback(async (sectionId: string) => {
    if (!activeNewsletter) return;
    try {
      const res = await fetch("/api/v1/plugins/newsletter-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: activeNewsletter.id,
          sectionId,
          content: editContent,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setActiveNewsletter(data.newsletter);
      setEditingSectionId(null);
      toast.success("Section saved");
    } catch {
      toast.error("Failed to save section");
    }
  }, [activeNewsletter, editContent]);

  // ─── Refine section ───────────────────────────────────
  const handleRefine = useCallback(async (sectionId: string) => {
    if (!activeNewsletter || !refineInstruction.trim()) return;
    setRefineLoading(true);
    try {
      const res = await fetch("/api/v1/plugins/newsletter-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refine",
          id: activeNewsletter.id,
          sectionId,
          instruction: refineInstruction,
        }),
      });
      if (!res.ok) throw new Error("Refine failed");
      const data = await res.json();

      // Apply refined content
      const updated = { ...activeNewsletter };
      const secIdx = updated.sections.findIndex(s => s.id === sectionId);
      if (secIdx !== -1) {
        updated.sections[secIdx] = { ...updated.sections[secIdx], content: data.refined };
        // Save to backend
        const saveRes = await fetch("/api/v1/plugins/newsletter-writer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            id: activeNewsletter.id,
            sectionId,
            content: data.refined,
          }),
        });
        if (saveRes.ok) {
          const saveData = await saveRes.json();
          setActiveNewsletter(saveData.newsletter);
        } else {
          setActiveNewsletter(updated);
        }
      }

      setRefiningSectionId(null);
      setRefineInstruction("");
      toast.success("Section refined!");
    } catch {
      toast.error("Refinement failed");
    } finally {
      setRefineLoading(false);
    }
  }, [activeNewsletter, refineInstruction]);

  // ─── Copy full newsletter ─────────────────────────────
  const handleCopy = useCallback(() => {
    if (!activeNewsletter) return;
    const full = activeNewsletter.sections
      .map(s => {
        if (s.type === "intro" || s.type === "outro") return s.content;
        return `## ${s.title}\n\n${s.content}`;
      })
      .join("\n\n---\n\n");
    const header = `# ${activeNewsletter.title}\n*${activeNewsletter.period}*\n\n`;
    navigator.clipboard.writeText(header + full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Newsletter copied to clipboard");
  }, [activeNewsletter]);

  // ─── Download as .md ──────────────────────────────────
  const handleDownload = useCallback(() => {
    if (!activeNewsletter) return;
    const full = activeNewsletter.sections
      .map(s => {
        if (s.type === "intro" || s.type === "outro") return s.content;
        return `## ${s.title}\n\n${s.content}`;
      })
      .join("\n\n---\n\n");
    const header = `# ${activeNewsletter.title}\n\n*${activeNewsletter.period}*\n\n`;
    const blob = new Blob([header + full], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeNewsletter.title.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded!");
  }, [activeNewsletter]);

  // ─── Toggle section expand ────────────────────────────
  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Open create view ────────────────────────────────
  const openCreate = () => {
    setCreateTitle("");
    setCreateSubject("");
    setCreatePeriod(7);
    setCreateTone("casual");
    setCreateTopics("");
    setCreateCustom("");
    setSuggestions([]);
    setView("create");
    fetchSuggestions(7);
  };

  // ─── Render ───────────────────────────────────────────

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-28 sm:pb-8">

        {/* ═══ LIST VIEW ═══ */}
        {view === "list" && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                    <Mail className="w-4.5 h-4.5 text-teal-400" />
                  </div>
                  Newsletter Writer
                </h1>
                <p className="text-sm text-zinc-500 mt-1">
                  Curate a digest from your recent knowledge
                </p>
              </div>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 hover:bg-teal-500/20 text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Newsletter</span>
                <span className="sm:hidden">New</span>
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
                        <div className="h-4 w-52 rounded-lg bg-white/[0.05] animate-pulse" />
                        <div className="h-3 w-36 rounded-lg bg-white/[0.03] animate-pulse" />
                      </div>
                      <div className="h-6 w-16 rounded-full bg-white/[0.04] animate-pulse" />
                    </div>
                    <div className="h-3 w-full rounded bg-white/[0.03] animate-pulse" />
                    <div className="h-3 w-2/3 rounded bg-white/[0.02] animate-pulse" />
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && newsletters.length === 0 && (
              <EmptyFeatureState
                icon={Mail}
                title="Newsletter Writer is ready when your knowledge is"
                description="Each newsletter is curated from your recent memories — import notes, articles, and saves first so we have something fresh to digest."
                onAction={openCreate}
                actionLabel="Create your first newsletter"
                actionIcon={Sparkles}
                ctaText="Import more data →"
                ctaHref="/app/import"
              />
            )}

            {/* Newsletter list */}
            {!loading && newsletters.length > 0 && (
              <Stagger>
                <div className="space-y-3">
                  {newsletters.map((nl) => {
                    const st = STATUS_CONFIG[nl.status] || STATUS_CONFIG.draft;
                    return (
                      <button
                        key={nl.id}
                        onClick={() => openNewsletter(nl.id)}
                        className="w-full text-left p-4 rounded-2xl bg-zinc-900/60 border border-white/[0.06] hover:border-white/[0.12] hover:bg-zinc-900/80 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-white truncate transition-colors">
                                {nl.title}
                              </h3>
                              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", st.bg, st.color)}>
                                {st.label}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-500 mb-2 truncate">
                              ✉️ {nl.subject}
                            </p>
                            <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {nl.period}
                              </span>
                              <span className="flex items-center gap-1">
                                <AlignLeft className="w-3 h-3" />
                                {nl.wordCount.toLocaleString()} words
                              </span>
                              <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                {nl.sectionCount} sections
                              </span>
                              <span className="flex items-center gap-1">
                                <BookOpen className="w-3 h-3" />
                                {nl.sourceCount} sources
                              </span>
                            </div>
                            {nl.topicsCovered.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {nl.topicsCovered.slice(0, 4).map((topic, i) => (
                                  <span key={i} className="px-2 py-0.5 rounded-full bg-teal-500/5 border border-teal-500/10 text-[10px] text-teal-400/70">
                                    {topic}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-zinc-600">{relativeTime(nl.updatedAt)}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(nl.id); }}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Stagger>
            )}
          </>
        )}

        {/* ═══ CREATE VIEW ═══ */}
        {view === "create" && (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
              <button
                onClick={() => setView("list")}
                className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4.5 h-4.5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">New Newsletter</h1>
                <p className="text-xs text-zinc-500">AI will curate and write from your recent memories</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Title + Subject */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Newsletter Title</label>
                  <input
                    type="text"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="This Week in My Mind"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.06] text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Email Subject</label>
                  <input
                    type="text"
                    value={createSubject}
                    onChange={(e) => setCreateSubject(e.target.value)}
                    placeholder="What I learned this week"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.06] text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30"
                  />
                </div>
              </div>

              {/* Timeframe */}
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-2 block">Timeframe</label>
                <div className="grid grid-cols-3 gap-2">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf.id}
                      onClick={() => {
                        setCreatePeriod(tf.id);
                        fetchSuggestions(tf.id);
                      }}
                      className={cn(
                        "p-3 rounded-xl border text-left transition-all",
                        createPeriod === tf.id
                          ? "bg-teal-500/10 border-teal-500/30 text-teal-400"
                          : "bg-zinc-900/40 border-white/[0.06] text-zinc-400 hover:border-white/[0.12]"
                      )}
                    >
                      <div className="text-sm font-medium">{tf.label}</div>
                      <div className="text-[10px] mt-0.5 opacity-60">{tf.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone */}
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-2 block">Tone</label>
                <div className="flex gap-2">
                  {TONES.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setCreateTone(t.id)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all",
                          createTone === t.id
                            ? "bg-teal-500/10 border-teal-500/30 text-teal-400"
                            : "bg-zinc-900/40 border-white/[0.06] text-zinc-400 hover:border-white/[0.12]"
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* AI Suggestions */}
              {(suggestionsLoading || suggestions.length > 0) && (
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1.5 block">
                    <Sparkles className="w-3 h-3 text-teal-400" />
                    AI Suggestions
                    {suggestMemoryCount > 0 && (
                      <span className="text-zinc-600">· {suggestMemoryCount} memories found</span>
                    )}
                  </label>

                  {suggestionsLoading ? (
                    <div className="flex items-center gap-2 py-6 justify-center text-zinc-500 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing your recent knowledge...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setCreateTitle(s.title);
                            setCreateSubject(s.subject);
                            setCreateTopics(s.topics.join(", "));
                          }}
                          className="w-full text-left p-3 rounded-xl bg-zinc-900/40 border border-white/[0.06] hover:border-teal-500/20 hover:bg-teal-500/[0.03] transition-all group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="text-sm font-medium text-zinc-300 group-hover:text-zinc-200">{s.title}</h4>
                              <p className="text-xs text-zinc-500 mt-0.5">{s.pitch}</p>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {s.topics.map((t, j) => (
                                  <span key={j} className="px-1.5 py-0.5 rounded-full bg-sky-500/5 border border-sky-500/10 text-[9px] text-sky-400/70">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <Lightbulb className="w-3.5 h-3.5 text-zinc-600 group-hover:text-teal-400 transition-colors shrink-0 mt-0.5" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Focus Topics */}
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
                  Focus Topics <span className="text-zinc-600">(optional, comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={createTopics}
                  onChange={(e) => setCreateTopics(e.target.value)}
                  placeholder="AI, productivity, book notes..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.06] text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30"
                />
              </div>

              {/* Custom Instructions */}
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
                  Additional Instructions <span className="text-zinc-600">(optional)</span>
                </label>
                <textarea
                  value={createCustom}
                  onChange={(e) => setCreateCustom(e.target.value)}
                  placeholder="e.g., Include a 'Tool of the Week' section, focus on actionable takeaways..."
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.06] text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30 resize-none"
                />
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full py-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20 font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Curating your newsletter...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Newsletter
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* ═══ EDIT VIEW ═══ */}
        {view === "edit" && activeNewsletter && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => { setView("list"); setActiveNewsletter(null); }}
                  className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors shrink-0"
                >
                  <ArrowLeft className="w-4.5 h-4.5" />
                </button>
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-white tracking-tight truncate">
                    {activeNewsletter.title}
                  </h1>
                  <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                    <Calendar className="w-3 h-3" />
                    {activeNewsletter.period}
                    <span>·</span>
                    <AlignLeft className="w-3 h-3" />
                    {activeNewsletter.wordCount.toLocaleString()} words
                    <span>·</span>
                    {activeNewsletter.sourceCount} sources
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setView("preview")}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800/50 border border-white/[0.06] text-zinc-400 hover:text-white text-xs font-medium transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Preview</span>
                </button>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800/50 border border-white/[0.06] text-zinc-400 hover:text-white text-xs font-medium transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800/50 border border-white/[0.06] text-zinc-400 hover:text-white text-xs font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">.md</span>
                </button>
              </div>
            </div>

            {/* Subject line */}
            <div className="p-3 rounded-xl bg-zinc-900/40 border border-white/[0.06] mb-4">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500 font-medium">Subject:</span>
                <span className="text-zinc-300">{activeNewsletter.subject}</span>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-3">
              {activeNewsletter.sections.map((section) => {
                const config = SECTION_CONFIG[section.type] || SECTION_CONFIG.topic;
                const Icon = config.icon;
                const isExpanded = expandedSections.has(section.id);
                const isEditing = editingSectionId === section.id;
                const isRefining = refiningSectionId === section.id;

                return (
                  <div
                    key={section.id}
                    className="rounded-2xl bg-zinc-900/60 border border-white/[0.06] overflow-hidden"
                  >
                    {/* Section header */}
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center", 
                          section.type === "intro" ? "bg-teal-500/10" :
                          section.type === "topic" ? "bg-sky-500/10" :
                          section.type === "highlight" ? "bg-amber-500/10" :
                          section.type === "quicklinks" ? "bg-emerald-500/10" :
                          section.type === "outro" ? "bg-zinc-500/10" : "bg-rose-500/10"
                        )}>
                          <Icon className={cn("w-3 h-3", config.color)} />
                        </div>
                        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                          {config.label}
                        </span>
                        <span className="text-sm font-medium text-zinc-300">
                          {section.title}
                        </span>
                        {section.sourceCount > 0 && (
                          <span className="text-[10px] text-zinc-600">
                            {section.sourceCount} sources
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!isExpanded && (
                          <span className="text-xs text-zinc-600 max-w-[200px] truncate hidden sm:block">
                            {section.content.slice(0, 80)}...
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-zinc-600" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-zinc-600" />
                        )}
                      </div>
                    </button>

                    {/* Section content (expanded) */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 border-t border-white/[0.04]">
                        {isEditing ? (
                          /* Edit mode */
                          <div className="mt-3">
                            <textarea
                              ref={textareaRef}
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full min-h-[160px] px-3 py-2.5 rounded-xl bg-zinc-950 border border-white/[0.08] text-sm text-zinc-200 font-mono focus:outline-none focus:border-teal-500/30 resize-y"
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  setEditingSectionId(null);
                                }
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                  handleSaveSection(section.id);
                                }
                              }}
                            />
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[10px] text-zinc-600">⌘+Enter to save · Esc to cancel</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setEditingSectionId(null)}
                                  className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleSaveSection(section.id)}
                                  className="px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-xs text-teal-400 hover:bg-teal-500/20 font-medium transition-colors"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Read mode */
                          <div className="mt-3">
                            <div className="text-sm text-zinc-300 leading-relaxed">
                              {renderMarkdown(section.content)}
                            </div>

                            {/* Action bar */}
                            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.04]">
                              <button
                                onClick={() => {
                                  setEditingSectionId(section.id);
                                  setEditContent(section.content);
                                  setTimeout(() => textareaRef.current?.focus(), 50);
                                }}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                              >
                                <Edit3 className="w-3 h-3" />
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  if (isRefining) {
                                    setRefiningSectionId(null);
                                  } else {
                                    setRefiningSectionId(section.id);
                                    setRefineInstruction("");
                                  }
                                }}
                                className={cn(
                                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors",
                                  isRefining
                                    ? "bg-teal-500/10 text-teal-400"
                                    : "hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                                )}
                              >
                                <Wand2 className="w-3 h-3" />
                                AI Refine
                              </button>
                            </div>

                            {/* Refine input */}
                            {isRefining && (
                              <div className="mt-2 flex gap-2">
                                <input
                                  type="text"
                                  value={refineInstruction}
                                  onChange={(e) => setRefineInstruction(e.target.value)}
                                  placeholder="e.g., make it punchier, add a personal anecdote, shorten..."
                                  className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-white/[0.08] text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && refineInstruction.trim()) {
                                      handleRefine(section.id);
                                    }
                                    if (e.key === "Escape") {
                                      setRefiningSectionId(null);
                                    }
                                  }}
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleRefine(section.id)}
                                  disabled={refineLoading || !refineInstruction.trim()}
                                  className="px-3 py-2 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-medium hover:bg-teal-500/20 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                                >
                                  {refineLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Wand2 className="w-3.5 h-3.5" />
                                  )}
                                  Refine
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ═══ PREVIEW VIEW ═══ */}
        {view === "preview" && activeNewsletter && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setView("edit")}
                  className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4.5 h-4.5" />
                </button>
                <div>
                  <h1 className="text-lg font-bold text-white tracking-tight">Preview</h1>
                  <p className="text-xs text-zinc-500">How your newsletter will look</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-medium hover:bg-teal-500/20 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy All"}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800/50 border border-white/[0.06] text-zinc-400 hover:text-white text-xs font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download .md
                </button>
              </div>
            </div>

            {/* Newsletter preview — document style */}
            <div className="rounded-2xl bg-zinc-900/80 border border-white/[0.06] p-6 sm:p-8">
              {/* Title */}
              <h1 className="text-2xl font-bold text-white tracking-tight mb-1">
                {activeNewsletter.title}
              </h1>
              <p className="text-sm text-zinc-500 mb-6 pb-6 border-b border-white/[0.06]">
                {activeNewsletter.period}
              </p>

              {/* Sections */}
              {activeNewsletter.sections.map((section, i) => {
                const config = SECTION_CONFIG[section.type] || SECTION_CONFIG.topic;
                const isLastSection = i === activeNewsletter.sections.length - 1;

                return (
                  <div
                    key={section.id}
                    className={cn(
                      "mb-6",
                      !isLastSection && "pb-6 border-b border-white/[0.04]"
                    )}
                  >
                    {/* Don't show title for intro/outro */}
                    {section.type !== "intro" && section.type !== "outro" && (
                      <h2 className={cn("text-base font-semibold mb-3", config.color)}>
                        {section.title}
                      </h2>
                    )}
                    <div className="prose-sm">
                      {renderMarkdown(section.content)}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

      </div>
    </PageTransition>
  );
}
