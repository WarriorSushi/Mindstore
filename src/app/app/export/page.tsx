"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FolderDown, Loader2, AlertTriangle, Check, Download,
  FileText, Code, Globe, Zap, ChevronDown, ChevronRight, Filter,
  CheckCircle2, Eye, Copy, Info, BookOpen,
} from "lucide-react";
import { PageTransition, Stagger } from "@/components/PageTransition";
import { usePageTitle } from "@/lib/use-page-title";

// ─── Types ────────────────────────────────────────────────────

interface ExportTemplate {
  id: string;
  name: string;
  description: string;
  framework: string;
  fileExtension: string;
  contentDir: string;
  features: string[];
}

interface SourceStat {
  type: string;
  count: number;
}

interface PreviewItem {
  id: string;
  fileName: string;
  title: string;
  preview: string;
  wordCount: number;
}

// ─── Framework Icons ──────────────────────────────────────────

const FRAMEWORK_COLORS: Record<string, string> = {
  'hugo': 'text-red-400 bg-red-500/10 border-red-500/20',
  'jekyll': 'text-red-400 bg-red-500/10 border-red-500/20',
  'astro': 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  'nextjs': 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  'plain': 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
};

// ─── Component ────────────────────────────────────────────────

export default function MarkdownBlogExportPage() {
  usePageTitle("Blog Export");
  const router = useRouter();
  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [stats, setStats] = useState({ total: 0, sourceTypes: [] as SourceStat[] });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [exportStats, setExportStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Config
  const [selectedTemplate, setSelectedTemplate] = useState('plain');
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [author, setAuthor] = useState('');
  const [draft, setDraft] = useState(false);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [groupBySource, setGroupBySource] = useState(false);

  // Preview
  const [showPreview, setShowPreview] = useState(false);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ─── Load config ─────────────────────────────────────

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/plugins/markdown-blog-export?action=config');
      const data = await res.json();
      setTemplates(data.templates || []);
      setStats(data.stats || { total: 0, sourceTypes: [] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ─── Load preview ────────────────────────────────────

  const loadPreview = async () => {
    setShowPreview(true);
    setPreviewLoading(true);
    try {
      const sourceParam = selectedSources.size > 0
        ? `&sourceType=${Array.from(selectedSources)[0]}`
        : '';
      const res = await fetch(
        `/api/v1/plugins/markdown-blog-export?action=preview&template=${selectedTemplate}${sourceParam}`
      );
      const data = await res.json();
      setPreviews(data.previews || []);
    } catch {
      setPreviews([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  // ─── Toggle source selection ─────────────────────────

  const toggleSource = (type: string) => {
    setSelectedSources(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // ─── Export ──────────────────────────────────────────

  const handleExport = async () => {
    setExporting(true);
    setExported(false);
    setError(null);
    try {
      const res = await fetch('/api/v1/plugins/markdown-blog-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'export',
          templateId: selectedTemplate,
          sourceTypes: selectedSources.size > 0 ? Array.from(selectedSources) : undefined,
          author,
          draft,
          includeMetadata,
          groupBySource,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Download the ZIP
      const blob = new Blob(
        [Buffer.from(data.file, 'base64')],
        { type: data.contentType }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportStats(data.stats);
      setExported(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────

  const activeTemplate = templates.find(t => t.id === selectedTemplate);
  const selectedMemoryCount = selectedSources.size > 0
    ? stats.sourceTypes.filter(s => selectedSources.has(s.type)).reduce((sum, s) => sum + s.count, 0)
    : stats.total;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-teal-500/60" />
          <span className="text-[11px] text-zinc-700 font-medium">Loading export options…</span>
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6 md:space-y-8">
        {/* ─── Header ──────────────────────────────── */}
        <div>
          <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em]">Blog Export</h1>
          <p className="text-[13px] text-zinc-500 mt-0.5">
            Export memories as blog-ready markdown files — or pack the whole base into a{' '}
            <a href="/app/portable" className="text-teal-400 hover:text-teal-300 underline-offset-2 hover:underline transition-colors">
              portable .mind file
            </a>
            .
          </p>
        </div>

        {/* ─── No Memories State ───────────────────── */}
        {stats.total === 0 ? (
          <div className="text-center py-16 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              <FileText className="w-8 h-8 text-zinc-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">No Memories to Export</h2>
              <p className="text-zinc-500 mt-1">Import some content first, then export it as a blog.</p>
            </div>
            <button
              onClick={() => router.push('/app/import')}
              className="px-5 py-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20 transition-colors text-sm font-medium"
            >
              Go to Import →
            </button>
          </div>
        ) : (
          <>
            {/* ─── Stats Row ──────────────────────── */}
            <Stagger>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Memories', value: stats.total, icon: BookOpen },
                  { label: 'Source Types', value: stats.sourceTypes.length, icon: Filter },
                  { label: 'To Export', value: selectedMemoryCount, icon: Download },
                  { label: 'Template', value: activeTemplate?.name || 'Plain', icon: Code },
                ].map((stat) => (
                  <div key={stat.label} className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                    <div className="flex items-center gap-2 mb-1">
                      <stat.icon className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-xs text-zinc-500">{stat.label}</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                      {typeof stat.value === 'number' ? stat.value : stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </Stagger>

            {/* ─── Template Selection ─────────────── */}
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-white">Choose Framework</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {templates.map(tpl => {
                  const colorClass = FRAMEWORK_COLORS[tpl.id] || FRAMEWORK_COLORS.plain;
                  const isSelected = selectedTemplate === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => setSelectedTemplate(tpl.id)}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        isSelected
                          ? 'bg-teal-500/5 border-teal-500/30 ring-1 ring-teal-500/20'
                          : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${colorClass}`}>
                          {tpl.framework}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-teal-400 ml-auto" />}
                      </div>
                      <h3 className={`font-medium ${isSelected ? 'text-white' : 'text-zinc-300'}`}>{tpl.name}</h3>
                      <p className="text-xs text-zinc-500 mt-1">{tpl.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tpl.features.slice(0, 3).map(f => (
                          <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-500">
                            {f}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─── Source Filter ───────────────────── */}
            {stats.sourceTypes.length > 1 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Filter className="w-4 h-4 text-zinc-500" />
                  Filter by Source
                  <span className="text-xs text-zinc-500 font-normal ml-2">
                    {selectedSources.size === 0 ? 'All sources' : `${selectedSources.size} selected`}
                  </span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {stats.sourceTypes.map(s => (
                    <button
                      key={s.type}
                      onClick={() => toggleSource(s.type)}
                      className={`px-3 py-1.5 rounded-xl text-sm transition-all flex items-center gap-1.5 ${
                        selectedSources.has(s.type)
                          ? 'bg-teal-500/10 border border-teal-500/30 text-teal-400'
                          : 'bg-white/[0.02] border border-white/[0.06] text-zinc-400 hover:border-white/[0.08]'
                      }`}
                    >
                      {selectedSources.has(s.type) && <Check className="w-3 h-3" />}
                      <span className="capitalize">{s.type}</span>
                      <span className="text-zinc-600 text-xs">{s.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ─── Options ─────────────────────────── */}
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
              <h3 className="text-sm font-semibold text-white">Export Options</h3>

              {/* Author */}
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">Author Name</label>
                <input
                  type="text"
                  value={author}
                  onChange={e => setAuthor(e.target.value)}
                  placeholder="Your name (optional)"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white text-sm placeholder-zinc-600 focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20 outline-none transition-all"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-3">
                {[
                  {
                    label: 'Mark as Draft',
                    detail: 'Add draft: true to frontmatter so posts aren\'t published automatically',
                    value: draft,
                    onChange: () => setDraft(!draft),
                  },
                  {
                    label: 'Include Source Metadata',
                    detail: 'Add HTML comment with source type and title at the end of each file',
                    value: includeMetadata,
                    onChange: () => setIncludeMetadata(!includeMetadata),
                  },
                  {
                    label: 'Group by Source Type',
                    detail: 'Create subdirectories for each source type (obsidian/, chatgpt/, etc.)',
                    value: groupBySource,
                    onChange: () => setGroupBySource(!groupBySource),
                  },
                ].map(toggle => (
                  <label key={toggle.label} className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={toggle.onChange}
                      className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                        toggle.value ? 'bg-teal-500/30' : 'bg-white/[0.06]'
                      }`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                        toggle.value ? 'left-4 bg-teal-400' : 'left-0.5 bg-zinc-500'
                      }`} />
                    </div>
                    <div>
                      <p className="text-sm text-white">{toggle.label}</p>
                      <p className="text-xs text-zinc-500">{toggle.detail}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* ─── Preview ─────────────────────────── */}
            <div className="space-y-3">
              <button
                onClick={loadPreview}
                className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300 transition-colors"
              >
                <Eye className="w-4 h-4" />
                {showPreview ? 'Refresh Preview' : 'Preview Output'}
                {previewLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              </button>

              {showPreview && !previewLoading && previews.length > 0 && (
                <div className="space-y-3">
                  {previews.map(p => (
                    <div key={p.id} className="rounded-2xl border border-white/[0.06] bg-black/20 overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center justify-between">
                        <span className="text-xs text-zinc-400 font-mono">{p.fileName}</span>
                        <span className="text-[10px] text-zinc-600">{p.wordCount} words</span>
                      </div>
                      <pre className="p-4 text-xs text-zinc-400 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                        {p.preview}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─── Error / Success ──────────────────── */}
            {error && (
              <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 flex items-center gap-2 text-sm text-red-400">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {exported && exportStats && (
              <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Export Complete!</span>
                </div>
                <p className="text-sm text-zinc-400">
                  Exported {exportStats.postsExported} posts ({exportStats.totalWords.toLocaleString()} words) 
                  as {exportStats.template} format. Your ZIP file has been downloaded.
                </p>
              </div>
            )}

            {/* ─── Export Button ────────────────────── */}
            <button
              onClick={handleExport}
              disabled={exporting || stats.total === 0}
              className="w-full py-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400 font-semibold hover:bg-teal-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating export...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Export {selectedMemoryCount} Memories as {activeTemplate?.framework || 'Markdown'}
                </>
              )}
            </button>

            {/* ─── Output Structure Info ────────────── */}
            {activeTemplate && (
              <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Info className="w-4 h-4 text-teal-400" />
                  Output Structure ({activeTemplate.name})
                </h3>
                <pre className="text-xs text-zinc-500 font-mono bg-black/30 p-3 rounded-xl border border-white/[0.04] overflow-x-auto">
{`${activeTemplate.contentDir}/
├── ${activeTemplate.id === 'jekyll' ? '2026-03-25-' : ''}my-first-post${activeTemplate.fileExtension}
├── ${activeTemplate.id === 'jekyll' ? '2026-03-24-' : ''}another-thought${activeTemplate.fileExtension}
├── ${activeTemplate.id === 'jekyll' ? '2026-03-23-' : ''}research-notes${activeTemplate.fileExtension}
└── ...
README.md`}
                </pre>
                <div className="flex flex-wrap gap-1.5">
                  {activeTemplate.features.map(f => (
                    <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-zinc-400">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}
