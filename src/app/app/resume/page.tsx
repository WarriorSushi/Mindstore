"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileUser, Plus, Loader2, Sparkles, Trash2,
  ChevronRight, ArrowLeft, Copy, Check, Download,
  Eye, EyeOff, Wand2, GripVertical, PlusCircle,
  Briefcase, GraduationCap, Code2, Award, Globe,
  Heart, User, FileText, ChevronDown, ChevronUp,
  RotateCcw, Settings2, Layers, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageTransition, Stagger } from "@/components/PageTransition";
import { EmptyFeatureState } from "@/components/EmptyFeatureState";
import { toast } from "sonner";
import { usePageTitle } from "@/lib/use-page-title";

// ─── Types ────────────────────────────────────────────────────

interface ResumeSummary {
  id: string;
  title: string;
  targetRole: string;
  template: string;
  sectionCount: number;
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
  preview: string;
}

interface ResumeSection {
  id: string;
  type: string;
  title: string;
  content: string;
  visible: boolean;
  order: number;
}

interface Resume {
  id: string;
  title: string;
  targetRole: string;
  template: string;
  sections: ResumeSection[];
  sourceMemoryIds: string[];
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  sections: string[];
}

// ─── Section Icons ───────────────────────────────────────────

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  header: User,
  summary: FileText,
  experience: Briefcase,
  education: GraduationCap,
  skills: Code2,
  projects: Layers,
  certifications: Award,
  languages: Globe,
  interests: Heart,
  custom: Settings2,
};

const SECTION_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  header: { text: "text-teal-400", bg: "bg-teal-500/[0.06]", border: "border-teal-500/20" },
  summary: { text: "text-sky-400", bg: "bg-sky-500/[0.06]", border: "border-sky-500/20" },
  experience: { text: "text-emerald-400", bg: "bg-emerald-500/[0.06]", border: "border-emerald-500/20" },
  education: { text: "text-amber-400", bg: "bg-amber-500/[0.06]", border: "border-amber-500/20" },
  skills: { text: "text-cyan-400", bg: "bg-cyan-500/[0.06]", border: "border-cyan-500/20" },
  projects: { text: "text-teal-400", bg: "bg-teal-500/[0.06]", border: "border-teal-500/20" },
  certifications: { text: "text-amber-400", bg: "bg-amber-500/[0.06]", border: "border-amber-500/20" },
  languages: { text: "text-sky-400", bg: "bg-sky-500/[0.06]", border: "border-sky-500/20" },
  interests: { text: "text-rose-400", bg: "bg-rose-500/[0.06]", border: "border-rose-500/20" },
  custom: { text: "text-zinc-400", bg: "bg-zinc-500/[0.06]", border: "border-zinc-500/20" },
};

const TEMPLATE_ICONS: Record<string, string> = {
  modern: "⚡",
  classic: "📋",
  creative: "🎨",
  executive: "👔",
};

// ─── Markdown Renderer (simple) ──────────────────────────────

function renderMarkdown(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-zinc-200 mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold text-zinc-100 mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-white mt-4 mb-2">$1</h1>')
    .replace(/^- (.+)$/gm, '<li class="text-zinc-300 text-sm ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

// ─── Component ───────────────────────────────────────────────

export default function ResumeBuilderPage() {
  usePageTitle("Resume Builder");
  const [view, setView] = useState<"list" | "create" | "edit" | "preview">("list");
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [activeResume, setActiveResume] = useState<Resume | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refiningSection, setRefiningSection] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [showRefineInput, setShowRefineInput] = useState<string | null>(null);

  // Create form
  const [targetRole, setTargetRole] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("modern");
  const [additionalContext, setAdditionalContext] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Fetch ─────────────────────────────────────────────────

  const fetchResumes = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/plugins/resume-builder?action=list");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setResumes(data.resumes || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/plugins/resume-builder?action=templates");
      if (!res.ok) return;
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchResumes();
    fetchTemplates();
  }, [fetchResumes, fetchTemplates]);

  // ─── Actions ───────────────────────────────────────────────

  const generateResume = async () => {
    if (!targetRole.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/v1/plugins/resume-builder?action=generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRole: targetRole.trim(), template: selectedTemplate, additionalContext }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }
      const data = await res.json();
      setActiveResume(data.resume);
      setView("edit");
      setExpandedSection(data.resume.sections[0]?.id || null);
      toast.success("Resume generated!");
      fetchResumes();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const openResume = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/plugins/resume-builder?action=get&id=${id}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setActiveResume(data.resume);
      setView("edit");
      setExpandedSection(data.resume.sections[0]?.id || null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const deleteResume = async (id: string) => {
    try {
      await fetch("/api/v1/plugins/resume-builder?action=delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setResumes((prev) => prev.filter((r) => r.id !== id));
      if (activeResume?.id === id) {
        setActiveResume(null);
        setView("list");
      }
      toast.success("Resume deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const toggleSectionVisibility = async (sectionId: string) => {
    if (!activeResume) return;
    const section = activeResume.sections.find((s) => s.id === sectionId);
    if (!section) return;

    try {
      const res = await fetch("/api/v1/plugins/resume-builder?action=update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeResume.id, sectionId, visible: !section.visible }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const data = await res.json();
      setActiveResume(data.resume);
    } catch {
      toast.error("Failed to toggle section");
    }
  };

  const saveSection = async (sectionId: string, content: string) => {
    if (!activeResume) return;
    try {
      const res = await fetch("/api/v1/plugins/resume-builder?action=update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeResume.id, sectionId, content }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setActiveResume(data.resume);
      setEditingSection(null);
      toast.success("Section saved");
    } catch {
      toast.error("Failed to save");
    }
  };

  const refineSection = async (sectionId: string) => {
    if (!activeResume) return;
    setRefiningSection(sectionId);
    try {
      const res = await fetch("/api/v1/plugins/resume-builder?action=refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeResume.id,
          sectionId,
          instruction: refineInstruction || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Refine failed");
      }
      const data = await res.json();
      // Update the section locally
      setActiveResume((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: prev.sections.map((s) =>
            s.id === sectionId ? { ...s, content: data.section.content } : s
          ),
        };
      });
      setShowRefineInput(null);
      setRefineInstruction("");
      toast.success("Section refined!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRefiningSection(null);
    }
  };

  const copyAsMarkdown = () => {
    if (!activeResume) return;
    const md = activeResume.sections
      .filter((s) => s.visible)
      .map((s) => `## ${s.title}\n\n${s.content}`)
      .join("\n\n---\n\n");
    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied as Markdown");
  };

  const downloadAsMarkdown = () => {
    if (!activeResume) return;
    const md = `# ${activeResume.title}\n\n` +
      activeResume.sections
        .filter((s) => s.visible)
        .map((s) => `## ${s.title}\n\n${s.content}`)
        .join("\n\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeResume.targetRole.replace(/\s+/g, '-').toLowerCase()}-resume.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded as Markdown");
  };

  const moveSectionUp = async (sectionId: string) => {
    if (!activeResume) return;
    const idx = activeResume.sections.findIndex((s) => s.id === sectionId);
    if (idx <= 0) return;
    const ids = activeResume.sections.map((s) => s.id);
    [ids[idx], ids[idx - 1]] = [ids[idx - 1], ids[idx]];
    try {
      const res = await fetch("/api/v1/plugins/resume-builder?action=reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeResume.id, sectionIds: ids }),
      });
      if (!res.ok) throw new Error("Failed to reorder");
      const data = await res.json();
      setActiveResume(data.resume);
    } catch {
      toast.error("Failed to reorder");
    }
  };

  const moveSectionDown = async (sectionId: string) => {
    if (!activeResume) return;
    const idx = activeResume.sections.findIndex((s) => s.id === sectionId);
    if (idx === -1 || idx >= activeResume.sections.length - 1) return;
    const ids = activeResume.sections.map((s) => s.id);
    [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    try {
      const res = await fetch("/api/v1/plugins/resume-builder?action=reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeResume.id, sectionIds: ids }),
      });
      if (!res.ok) throw new Error("Failed to reorder");
      const data = await res.json();
      setActiveResume(data.resume);
    } catch {
      toast.error("Failed to reorder");
    }
  };

  // ─── LIST VIEW ─────────────────────────────────────────────

  if (view === "list") {
    return (
      <PageTransition>
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/20">
                <FileUser className="h-5 w-5 text-teal-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-zinc-100">Resume Builder</h1>
                <p className="text-sm text-zinc-500">Build resumes from your knowledge</p>
              </div>
            </div>
            <button
              onClick={() => setView("create")}
              className="flex items-center gap-2 rounded-xl bg-teal-500/10 border border-teal-500/20 px-4 py-2.5 text-sm font-medium text-teal-400 transition-all hover:bg-teal-500/20 hover:border-teal-500/30"
            >
              <Plus className="h-4 w-4" />
              New Resume
            </button>
          </div>

          {/* Loading Skeleton */}
          {loading && (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/[0.04] animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-5 w-44 rounded-lg bg-white/[0.05] animate-pulse" />
                      <div className="h-3 w-28 rounded-lg bg-white/[0.03] animate-pulse" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-full rounded bg-white/[0.03] animate-pulse" />
                    <div className="h-3 w-5/6 rounded bg-white/[0.02] animate-pulse" />
                    <div className="h-3 w-2/3 rounded bg-white/[0.02] animate-pulse" />
                  </div>
                  <div className="flex gap-2">
                    <div className="h-6 w-16 rounded-full bg-white/[0.04] animate-pulse" />
                    <div className="h-6 w-20 rounded-full bg-white/[0.04] animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && resumes.length === 0 && (
            <EmptyFeatureState
              icon={FileUser}
              title="Resume Builder is ready when your knowledge is"
              description="Resumes are generated from your stored memories — import work history, projects, and skills first so the AI has real material to draw from."
              onAction={() => setView("create")}
              actionLabel="Create your first resume"
              actionIcon={Sparkles}
              ctaText="Import more data →"
              ctaHref="/app/import"
            />
          )}

          {/* Resume List */}
          {!loading && resumes.length > 0 && (
            <Stagger>
              <div className="space-y-3">
                {resumes.map((resume) => (
                  <button
                    key={resume.id}
                    onClick={() => openResume(resume.id)}
                    className="group w-full text-left rounded-2xl border border-white/[0.06] bg-zinc-900/50 p-5 transition-all hover:bg-zinc-900/80 hover:border-white/[0.1]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100 truncate">
                            {resume.title}
                          </h3>
                          <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wide">
                            {resume.template}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 mb-2">{resume.targetRole}</p>
                        {resume.preview && (
                          <p className="text-xs text-zinc-600 line-clamp-2">{resume.preview}</p>
                        )}
                        <div className="mt-3 flex items-center gap-4 text-[11px] text-zinc-600">
                          <span>{resume.sectionCount} sections</span>
                          <span>{resume.sourceCount} sources</span>
                          <span>{new Date(resume.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteResume(resume.id); }}
                          className="rounded-lg p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <ChevronRight className="h-4 w-4 text-zinc-600" />
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

  // ─── CREATE VIEW ───────────────────────────────────────────

  if (view === "create") {
    return (
      <PageTransition>
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          {/* Back */}
          <button
            onClick={() => setView("list")}
            className="mb-6 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to resumes
          </button>

          <div className="mb-8">
            <h1 className="text-xl font-semibold text-zinc-100 mb-1">Create Resume</h1>
            <p className="text-sm text-zinc-500">
              AI will extract your work experience, skills, and projects from your memories
            </p>
          </div>

          {/* Target Role */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Target Role</label>
              <input
                type="text"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g., Senior Software Engineer, Product Manager, Data Scientist..."
                className="w-full rounded-xl border border-white/[0.08] bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20 transition-all"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && targetRole.trim() && !generating) generateResume(); }}
              />
            </div>

            {/* Template Selection */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-3">Template</label>
              <div className="grid grid-cols-2 gap-3">
                {templates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl.id)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-all",
                      selectedTemplate === tmpl.id
                        ? "border-teal-500/40 bg-teal-500/[0.06]"
                        : "border-white/[0.06] bg-zinc-900/50 hover:bg-zinc-900/80 hover:border-white/[0.1]"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg">{TEMPLATE_ICONS[tmpl.id] || "📄"}</span>
                      <span className={cn(
                        "text-sm font-medium",
                        selectedTemplate === tmpl.id ? "text-teal-300" : "text-zinc-300"
                      )}>
                        {tmpl.name}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">{tmpl.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {tmpl.sections.slice(0, 4).map((s) => (
                        <span key={s} className="rounded-md bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-500 capitalize">
                          {s}
                        </span>
                      ))}
                      {tmpl.sections.length > 4 && (
                        <span className="text-[10px] text-zinc-600">+{tmpl.sections.length - 4}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Additional Context */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Additional Context <span className="text-zinc-600">(optional)</span>
              </label>
              <textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Any specific focus areas, skills to highlight, or companies you're targeting..."
                rows={3}
                className="w-full rounded-xl border border-white/[0.08] bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20 resize-none transition-all"
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={generateResume}
              disabled={!targetRole.trim() || generating}
              className={cn(
                "w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-medium transition-all",
                targetRole.trim() && !generating
                  ? "bg-teal-500/15 border border-teal-500/30 text-teal-300 hover:bg-teal-500/25"
                  : "bg-zinc-800/50 border border-white/[0.06] text-zinc-600 cursor-not-allowed"
              )}
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing your memories and building resume...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Resume
                </>
              )}
            </button>
          </div>
        </div>
      </PageTransition>
    );
  }

  // ─── PREVIEW VIEW ──────────────────────────────────────────

  if (view === "preview" && activeResume) {
    const visibleSections = activeResume.sections.filter((s) => s.visible);
    return (
      <PageTransition>
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          {/* Top bar */}
          <div className="mb-6 flex items-center justify-between">
            <button
              onClick={() => setView("edit")}
              className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to editor
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={copyAsMarkdown}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-300 hover:border-white/[0.12] transition-all"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={downloadAsMarkdown}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-300 hover:border-white/[0.12] transition-all"
              >
                <Download className="h-3.5 w-3.5" />
                Download .md
              </button>
            </div>
          </div>

          {/* Preview Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-8 sm:p-10">
            <h1 className="text-lg font-bold text-zinc-100 mb-1">{activeResume.title}</h1>
            <p className="text-xs text-zinc-500 mb-8">
              {activeResume.template} template · {visibleSections.length} sections · Built from {activeResume.sourceCount} memories
            </p>

            <div className="space-y-6">
              {visibleSections.map((section) => (
                <div key={section.id}>
                  <h2 className="text-sm font-semibold text-teal-400 uppercase tracking-wider mb-3 pb-1.5 border-b border-white/[0.06]">
                    {section.title}
                  </h2>
                  <div
                    className="text-sm text-zinc-300 leading-relaxed prose-sm"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(section.content) }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageTransition>
    );
  }

  // ─── EDIT VIEW ─────────────────────────────────────────────

  if (view === "edit" && activeResume) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          {/* Top Bar */}
          <div className="mb-6 flex items-center justify-between">
            <button
              onClick={() => { setView("list"); setActiveResume(null); }}
              className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              All resumes
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setView("preview")}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-300 hover:border-white/[0.12] transition-all"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
              <button
                onClick={copyAsMarkdown}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-300 hover:border-white/[0.12] transition-all"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={downloadAsMarkdown}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-300 hover:border-white/[0.12] transition-all"
              >
                <Download className="h-3.5 w-3.5" />
                .md
              </button>
            </div>
          </div>

          {/* Resume Header */}
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-zinc-100 mb-1">{activeResume.title}</h1>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 capitalize">{activeResume.template}</span>
              <span>{activeResume.sourceCount} memories used</span>
              <span>Updated {new Date(activeResume.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-3">
            {activeResume.sections.map((section, idx) => {
              const Icon = SECTION_ICONS[section.type] || Settings2;
              const colors = SECTION_COLORS[section.type] || SECTION_COLORS.custom;
              const isExpanded = expandedSection === section.id;
              const isEditing = editingSection === section.id;
              const isRefining = refiningSection === section.id;

              return (
                <div
                  key={section.id}
                  className={cn(
                    "rounded-2xl border transition-all",
                    section.visible
                      ? `${colors.border} ${colors.bg}`
                      : "border-white/[0.04] bg-zinc-900/30 opacity-50"
                  )}
                >
                  {/* Section Header */}
                  <button
                    onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                  >
                    <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg shrink-0", colors.bg)}>
                      <Icon className={cn("h-3.5 w-3.5", colors.text)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-zinc-200">{section.title}</span>
                      {!isExpanded && section.content && (
                        <p className="text-xs text-zinc-600 truncate mt-0.5">
                          {section.content.slice(0, 80)}...
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Reorder */}
                      {idx > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); moveSectionUp(section.id); }}
                          className="rounded-md p-1 text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {idx < activeResume.sections.length - 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); moveSectionDown(section.id); }}
                          className="rounded-md p-1 text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {/* Toggle visibility */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSectionVisibility(section.id); }}
                        className="rounded-md p-1 text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
                        title={section.visible ? "Hide section" : "Show section"}
                      >
                        {section.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                      <ChevronRight className={cn(
                        "h-4 w-4 text-zinc-600 transition-transform",
                        isExpanded && "rotate-90"
                      )} />
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4">
                      <div className="border-t border-white/[0.04] pt-3">
                        {isEditing ? (
                          /* Edit Mode */
                          <div className="space-y-3">
                            <textarea
                              ref={textareaRef}
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={Math.max(6, editContent.split("\n").length + 2)}
                              className="w-full rounded-xl border border-white/[0.08] bg-zinc-950/80 px-4 py-3 text-sm text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30 resize-y transition-all"
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => setEditingSection(null)}
                                className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveSection(section.id, editContent)}
                                className="rounded-lg bg-teal-500/15 border border-teal-500/30 px-3 py-1.5 text-xs text-teal-300 hover:bg-teal-500/25 transition-all"
                              >
                                Save Changes
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* View Mode */
                          <>
                            <div
                              className="text-sm text-zinc-300 leading-relaxed mb-3"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(section.content || "*Empty section*") }}
                            />

                            {/* Refine input */}
                            {showRefineInput === section.id && (
                              <div className="mb-3 flex items-center gap-2">
                                <input
                                  type="text"
                                  value={refineInstruction}
                                  onChange={(e) => setRefineInstruction(e.target.value)}
                                  placeholder="e.g., Add more metrics, focus on leadership..."
                                  className="flex-1 rounded-lg border border-white/[0.08] bg-zinc-950/80 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30 transition-all"
                                  autoFocus
                                  onKeyDown={(e) => { if (e.key === "Enter") refineSection(section.id); }}
                                />
                                <button
                                  onClick={() => refineSection(section.id)}
                                  disabled={isRefining}
                                  className="rounded-lg bg-teal-500/15 border border-teal-500/30 px-3 py-2 text-xs text-teal-300 hover:bg-teal-500/25 transition-all disabled:opacity-50"
                                >
                                  {isRefining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refine"}
                                </button>
                                <button
                                  onClick={() => { setShowRefineInput(null); setRefineInstruction(""); }}
                                  className="rounded-lg px-2 py-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                                >
                                  ✕
                                </button>
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => {
                                  setEditingSection(section.id);
                                  setEditContent(section.content);
                                  setTimeout(() => textareaRef.current?.focus(), 100);
                                }}
                                className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-zinc-900/60 px-2.5 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.1] transition-all"
                              >
                                <Pencil className="h-3 w-3" />
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  if (showRefineInput === section.id) {
                                    refineSection(section.id);
                                  } else {
                                    setShowRefineInput(section.id);
                                  }
                                }}
                                disabled={isRefining}
                                className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-zinc-900/60 px-2.5 py-1.5 text-[11px] text-zinc-500 hover:text-teal-400 hover:border-teal-500/20 transition-all disabled:opacity-50"
                              >
                                {isRefining ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Wand2 className="h-3 w-3" />
                                )}
                                {isRefining ? "Refining..." : "AI Refine"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Source info */}
          <div className="mt-6 rounded-xl border border-white/[0.04] bg-zinc-900/30 p-4">
            <p className="text-xs text-zinc-600 text-center">
              Built from {activeResume.sourceCount} memories · {activeResume.sections.filter((s) => s.visible).length} visible sections · Last updated {new Date(activeResume.updatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </PageTransition>
    );
  }

  // Fallback
  return null;
}
