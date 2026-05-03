"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users, Plus, Loader2, ArrowLeft, Trash2,
  ChevronRight, Clock, User, ListChecks, Network,
  MessageCircle, HelpCircle, ClipboardList, Search,
  Building2, FolderKanban, Hash, Send, Sparkles,
  ChevronDown, History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageTransition, Stagger } from "@/components/PageTransition";
import { EmptyFeatureState } from "@/components/EmptyFeatureState";
import { toast } from "sonner";
import { usePageTitle } from "@/lib/use-page-title";

// ─── Types ────────────────────────────────────────────────────

interface BriefingSummary {
  id: string;
  subject: string;
  type: "person" | "topic" | "company" | "project";
  context?: string;
  sectionCount: number;
  sourceCount: number;
  createdAt: string;
  preview: string;
}

interface BriefingSection {
  title: string;
  icon: string;
  items: string[];
}

interface Briefing {
  id: string;
  subject: string;
  type: "person" | "topic" | "company" | "project";
  context?: string;
  sections: BriefingSection[];
  sourceCount: number;
  sourceMemoryIds: string[];
  createdAt: string;
}

// ─── Icon Map ────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  User,
  ListChecks,
  Clock,
  Network,
  MessageCircle,
  HelpCircle,
  ClipboardList,
};

const TYPE_CONFIG = {
  person: { icon: User, label: "Person", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
  company: { icon: Building2, label: "Company", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  project: { icon: FolderKanban, label: "Project", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  topic: { icon: Hash, label: "Topic", color: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/20" },
};

// ─── Section Color Cycling ───────────────────────────────────

const SECTION_ACCENTS = [
  { border: "border-teal-500/20", text: "text-teal-400", bg: "bg-teal-500/[0.04]" },
  { border: "border-sky-500/20", text: "text-sky-400", bg: "bg-sky-500/[0.04]" },
  { border: "border-emerald-500/20", text: "text-emerald-400", bg: "bg-emerald-500/[0.04]" },
  { border: "border-amber-500/20", text: "text-amber-400", bg: "bg-amber-500/[0.04]" },
  { border: "border-rose-500/20", text: "text-rose-400", bg: "bg-rose-500/[0.04]" },
  { border: "border-cyan-500/20", text: "text-cyan-400", bg: "bg-cyan-500/[0.04]" },
  { border: "border-orange-500/20", text: "text-orange-400", bg: "bg-orange-500/[0.04]" },
];

// ─── Component ───────────────────────────────────────────────

export default function ConversationPrepPage() {
  usePageTitle("Meeting Prep");
  const [view, setView] = useState<"home" | "create" | "detail">("home");
  const [history, setHistory] = useState<BriefingSummary[]>([]);
  const [activeBriefing, setActiveBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Create form
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<"person" | "topic" | "company" | "project">("person");
  const [context, setContext] = useState("");

  // Follow-up
  const [followUp, setFollowUp] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [askingFollowUp, setAskingFollowUp] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Fetch History ─────────────────────────────────────────

  const [historyError, setHistoryError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setHistoryError(null);
    try {
      const res = await fetch("/api/v1/plugins/conversation-prep?action=history");
      if (!res.ok) throw new Error(`Failed to fetch history (${res.status})`);
      const data = await res.json();
      setHistory(data.briefings || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch history";
      setHistoryError(msg);
      toast.error("Could not load past briefings", { description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ─── Generate Briefing ────────────────────────────────────

  const generateBriefing = async () => {
    if (!subject.trim()) {
      toast.error("Enter a subject first — who or what to prepare for");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/v1/plugins/conversation-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare", subject: subject.trim(), type, context: context.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate briefing");
      setActiveBriefing(data.briefing);
      setView("detail");
      setFollowUpAnswer("");
      toast.success("Briefing ready!");
      fetchHistory();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate briefing");
    } finally {
      setGenerating(false);
    }
  };

  // ─── Load Briefing ────────────────────────────────────────

  const loadBriefing = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/plugins/conversation-prep?action=briefing&id=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActiveBriefing(data.briefing);
      setView("detail");
      setFollowUpAnswer("");
    } catch (err: any) {
      toast.error("Failed to load briefing");
    } finally {
      setLoading(false);
    }
  };

  // ─── Delete Briefing ──────────────────────────────────────

  const deleteBriefing = async (id: string) => {
    try {
      const res = await fetch("/api/v1/plugins/conversation-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (!res.ok) throw new Error("Delete failed");
      setHistory(prev => prev.filter(b => b.id !== id));
      if (activeBriefing?.id === id) {
        setActiveBriefing(null);
        setView("home");
      }
      toast.success("Briefing deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  // ─── Ask Follow-up ────────────────────────────────────────

  const askFollowUp = async () => {
    if (!activeBriefing || !followUp.trim()) return;
    setAskingFollowUp(true);
    try {
      const res = await fetch("/api/v1/plugins/conversation-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "follow-up",
          id: activeBriefing.id,
          question: followUp.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFollowUpAnswer(data.answer);
      setFollowUp("");
    } catch (err: any) {
      toast.error(err.message || "Failed to get answer");
    } finally {
      setAskingFollowUp(false);
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

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  // ─── Detail View ───────────────────────────────────────────

  if (view === "detail" && activeBriefing) {
    const tc = TYPE_CONFIG[activeBriefing.type];
    const TypeIcon = tc.icon;

    return (
      <PageTransition>
        <div className="min-h-[100dvh] bg-[#0a0a0b] px-4 sm:px-6 py-6 max-w-3xl mx-auto">
          {/* Header */}
          <button
            onClick={() => {
              setView("home");
              setActiveBriefing(null);
              setFollowUpAnswer("");
            }}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          {/* Subject Header */}
          <div className="flex items-start gap-4 mb-8">
            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0", tc.bg, `border ${tc.border}`)}>
              <TypeIcon className={cn("w-6 h-6", tc.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[24px] sm:text-[28px] font-bold tracking-[-0.04em] text-white">
                {activeBriefing.subject}
              </h1>
              <div className="flex items-center gap-3 mt-1.5 text-sm text-zinc-500">
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", tc.bg, tc.color)}>
                  {tc.label}
                </span>
                <span>{activeBriefing.sourceCount} sources</span>
                <span>·</span>
                <span>{formatTime(activeBriefing.createdAt)}</span>
              </div>
              {activeBriefing.context && (
                <p className="text-sm text-zinc-500 mt-2 italic">"{activeBriefing.context}"</p>
              )}
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-4">
            {activeBriefing.sections.map((section, idx) => {
              const IconComponent = ICON_MAP[section.icon] || ListChecks;
              const accent = SECTION_ACCENTS[idx % SECTION_ACCENTS.length];

              return (
                <div
                  key={idx}
                  className={cn(
                    "rounded-2xl border p-5 transition-all",
                    accent.border,
                    accent.bg,
                  )}
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <IconComponent className={cn("w-4 h-4", accent.text)} />
                    <h2 className="text-[15px] font-semibold text-zinc-200 tracking-[-0.01em]">
                      {section.title}
                    </h2>
                  </div>
                  <ul className="space-y-2">
                    {section.items.map((item, i) => (
                      <li key={i} className="flex gap-2.5 text-[14px] leading-[1.6] text-zinc-400">
                        <span className={cn("mt-[7px] w-1.5 h-1.5 rounded-full shrink-0", accent.text.replace('text-', 'bg-'))} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Follow-up Answer */}
          {followUpAnswer && (
            <div className="mt-6 rounded-2xl bg-teal-500/[0.04] border border-teal-500/20 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-semibold text-teal-300">Follow-up Answer</h3>
              </div>
              <p className="text-[14px] leading-[1.7] text-zinc-300 whitespace-pre-wrap">{followUpAnswer}</p>
            </div>
          )}

          {/* Follow-up Input */}
          <div className="mt-6 mb-8">
            <div className="flex gap-2">
              <input
                type="text"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Ask a follow-up question about this briefing…"
                className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30 focus:ring-1 focus:ring-teal-500/20 transition-all"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && followUp.trim()) askFollowUp();
                }}
              />
              <button
                onClick={askFollowUp}
                disabled={askingFollowUp || !followUp.trim()}
                className="px-4 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {askingFollowUp ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </PageTransition>
    );
  }

  // ─── Create View ───────────────────────────────────────────

  if (view === "create") {
    return (
      <PageTransition>
        <div className="min-h-[100dvh] bg-[#0a0a0b] px-4 sm:px-6 py-6 max-w-3xl mx-auto">
          {/* Header */}
          <button
            onClick={() => setView("home")}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-white">New Briefing</h1>
              <p className="text-sm text-zinc-500">Prepare for any conversation</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Type Picker */}
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-3 block">What are you prepping for?</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(TYPE_CONFIG) as Array<keyof typeof TYPE_CONFIG>).map((key) => {
                  const tc = TYPE_CONFIG[key];
                  const Icon = tc.icon;
                  const active = type === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setType(key)}
                      className={cn(
                        "p-3 rounded-xl border text-center transition-all",
                        active
                          ? `${tc.bg} ${tc.border} ring-1 ring-${key === 'person' ? 'sky' : key === 'company' ? 'emerald' : key === 'project' ? 'amber' : 'teal'}-500/20`
                          : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]"
                      )}
                    >
                      <Icon className={cn("w-5 h-5 mx-auto mb-1.5", active ? tc.color : "text-zinc-500")} />
                      <p className={cn("text-sm font-medium", active ? tc.color : "text-zinc-400")}>{tc.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subject Input */}
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-2 block">
                {type === "person" ? "Who?" : type === "company" ? "Which company?" : type === "project" ? "Which project?" : "What topic?"}
              </label>
              <input
                ref={inputRef}
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={
                  type === "person" ? "e.g. Sarah Chen, John from marketing…"
                  : type === "company" ? "e.g. Stripe, OpenAI, that startup from the pitch…"
                  : type === "project" ? "e.g. Q2 launch, website redesign…"
                  : "e.g. AI regulation, pricing strategy…"
                }
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20 transition-all text-[15px]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && subject.trim()) {
                    e.preventDefault();
                    generateBriefing();
                  }
                }}
              />
            </div>

            {/* Context Input (optional) */}
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-2 block">
                Context <span className="text-zinc-600 font-normal">(optional)</span>
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="What's the meeting about? Any specific angle you want to prepare for?"
                rows={3}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20 transition-all text-[14px] resize-none"
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={generateBriefing}
              disabled={!subject.trim() || generating}
              className="w-full py-3.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-semibold text-[15px] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching your knowledge…
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Generate Briefing
                </>
              )}
            </button>

            {generating && (
              <div className="text-center">
                <p className="text-sm text-zinc-500">
                  Searching across all your memories, finding connections, and building the briefing…
                </p>
                <p className="text-xs text-zinc-600 mt-1">This may take 10-20 seconds</p>
              </div>
            )}
          </div>
        </div>
      </PageTransition>
    );
  }

  // ─── Home View (Default) ──────────────────────────────────

  return (
    <PageTransition>
      <div className="min-h-[100dvh] bg-[#0a0a0b] px-4 sm:px-6 py-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-white">Conversation Prep</h1>
              <p className="text-sm text-zinc-500">Brief me before any meeting</p>
            </div>
          </div>
          <button
            onClick={() => {
              setSubject("");
              setContext("");
              setFollowUpAnswer("");
              setView("create");
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-semibold text-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Prep</span>
          </button>
        </div>

        {/* Quick Prep — Always visible */}
        <div className="mb-8">
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-3">Quick prep</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Who or what are you meeting about?"
                className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30 focus:ring-1 focus:ring-teal-500/20 transition-all text-[15px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && subject.trim()) {
                    generateBriefing();
                  }
                }}
              />
              <button
                onClick={() => {
                  if (subject.trim()) generateBriefing();
                }}
                disabled={!subject.trim() || generating}
                className="px-5 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-semibold text-sm transition-all disabled:opacity-40 flex items-center gap-2"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Prep</span>
              </button>
            </div>
            <p className="text-xs text-zinc-600 mt-2">
              Enter a person, company, project, or topic — we'll search your knowledge and create a briefing.
            </p>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
          </div>
        )}

        {/* Inline error */}
        {!loading && historyError && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] p-4 flex items-center justify-between gap-3">
            <div className="text-[13px] text-rose-300">
              Could not load briefings. {historyError}
            </div>
            <button
              type="button"
              onClick={fetchHistory}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] text-zinc-200 hover:bg-white/[0.08] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !historyError && history.length === 0 && (
          <EmptyFeatureState
            icon={Users}
            title="Meeting Prep is ready when your knowledge is"
            description="Briefings pull from everything you've stored — import notes, contacts, and project context first so we can build a real one-pager."
            ctaText="Import your first data →"
            ctaHref="/app/import"
            secondaryText="Already imported? Use the form above to start a briefing."
          />
        )}

        {/* History */}
        {!loading && history.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">Past Briefings</h2>
            </div>
            <Stagger>
              <div className="space-y-2">
                {history.map((briefing) => {
                  const tc = TYPE_CONFIG[briefing.type];
                  const TypeIcon = tc.icon;
                  return (
                    <button
                      key={briefing.id}
                      onClick={() => loadBriefing(briefing.id)}
                      className="w-full text-left p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03] transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", tc.bg, `border ${tc.border}`)}>
                          <TypeIcon className={cn("w-4 h-4", tc.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-[15px] font-medium text-zinc-200 group-hover:text-white truncate transition-colors">
                              {briefing.subject}
                            </h3>
                          </div>
                          <p className="text-sm text-zinc-500 line-clamp-1">{briefing.preview || briefing.context || `${briefing.sectionCount} sections`}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-600">
                            <span>{briefing.sourceCount} sources</span>
                            <span>·</span>
                            <span>{briefing.sectionCount} sections</span>
                            <span>·</span>
                            <span>{formatTime(briefing.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Delete this briefing?")) deleteBriefing(briefing.id);
                            }}
                            className="p-1.5 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100"
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
          </div>
        )}
      </div>
    </PageTransition>
  );
}
