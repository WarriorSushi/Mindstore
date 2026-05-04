'use client';

import { useState } from 'react';
import { Download, Upload, FileBox, Loader2, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { PageTransition } from '@/components/PageTransition';
import { usePageTitle } from '@/lib/use-page-title';

interface ImportManifest {
  format: string;
  generatedAt: string;
  generatorVersion: string;
  label: string;
  memoryCount: number;
  embeddingCount: number;
  embeddingDimension: number | null;
  connectionCount: number;
  treeNodeCount: number;
  contentSha256: string;
}

interface ImportReport {
  imported: number;
  skippedDuplicates: number;
  failed: number;
  warnings: string[];
}

interface ImportResponse {
  manifest: ImportManifest;
  report: ImportReport;
  dryRun: boolean;
}

export default function PortablePage() {
  usePageTitle('Portable .mind File');

  // ─── Export state ────────────────────────────────────────
  const [exportLabel, setExportLabel] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportSummary, setExportSummary] = useState<{ memoryCount: string; checksum: string } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // ─── Import state ────────────────────────────────────────
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // ─── Export handler ──────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    setExportError(null);
    setExportSummary(null);
    try {
      const qs = exportLabel.trim() ? `?label=${encodeURIComponent(exportLabel.trim())}` : '';
      const res = await fetch(`/api/v1/export/mind${qs}`, { method: 'POST' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Export failed (${res.status})`);
      }
      const memoryCount = res.headers.get('X-Mind-Memory-Count') || '?';
      const checksum = res.headers.get('X-Mind-Checksum') || '';
      const blob = await res.blob();

      // Trigger browser download.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Try to honor any filename the server sent.
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] || `mindstore-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.mind`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportSummary({ memoryCount, checksum: checksum.slice(0, 12) });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setExporting(false);
    }
  }

  // ─── Import preview ──────────────────────────────────────
  async function handlePreview() {
    if (!importFile) return;
    setPreviewing(true);
    setImportError(null);
    setPreview(null);
    setImportResult(null);
    try {
      const form = new FormData();
      form.append('file', importFile);
      const res = await fetch('/api/v1/import/mind?dryRun=1', { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Preview failed (${res.status})`);
      }
      const data: ImportResponse = await res.json();
      setPreview(data);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setPreviewing(false);
    }
  }

  // ─── Import commit ───────────────────────────────────────
  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportError(null);
    try {
      const form = new FormData();
      form.append('file', importFile);
      const res = await fetch('/api/v1/import/mind', { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Import failed (${res.status})`);
      }
      const data: ImportResponse = await res.json();
      setImportResult(data);
      setPreview(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setImportFile(null);
    setPreview(null);
    setImportResult(null);
    setImportError(null);
  }

  return (
    <PageTransition>
      <div className="space-y-8 md:space-y-10">
        {/* ─── Header ──────────────────────────── */}
        <div>
          <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em]">Portable .mind File</h1>
          <p className="text-[13px] text-zinc-500 mt-0.5">
            Pack your entire knowledge base into a single file, or rehydrate one elsewhere.
            Format <code className="text-[11px] px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">mindstore.mind/1.0</code>{' '}
            — a checksummed ZIP with your memories, embeddings, tree index, connections, and profile.
          </p>
        </div>

        {/* ─── Export section ──────────────────── */}
        <section className="p-5 md:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4 text-teal-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white">Export</h2>
              <p className="text-[13px] text-zinc-500 mt-0.5">
                Build a .mind file from your current knowledge base. The file is checksummed end-to-end so any
                tampering is detected on import.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-500">Label (optional, embedded in manifest)</label>
            <input
              type="text"
              value={exportLabel}
              onChange={(e) => setExportLabel(e.target.value)}
              placeholder="e.g. April 2026 snapshot before refactor"
              maxLength={200}
              disabled={exporting}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white text-sm placeholder-zinc-600 focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20 outline-none transition-all"
            />
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-5 py-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium inline-flex items-center gap-2"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Building .mind file…
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export to .mind
              </>
            )}
          </button>

          {exportError && (
            <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 flex items-center gap-2 text-sm text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {exportError}
            </div>
          )}

          {exportSummary && (
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Downloaded
              </div>
              <p className="text-xs text-zinc-400">
                {exportSummary.memoryCount} memories · checksum prefix{' '}
                <code className="px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] font-mono">
                  {exportSummary.checksum}…
                </code>
              </p>
            </div>
          )}
        </section>

        {/* ─── Import section ──────────────────── */}
        <section className="p-5 md:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
              <Upload className="w-4 h-4 text-sky-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white">Import</h2>
              <p className="text-[13px] text-zinc-500 mt-0.5">
                Pick a .mind file and preview the merge before committing. Dedup happens by content hash,
                so re-importing the same file is a no-op.
              </p>
            </div>
          </div>

          <label className="block">
            <span className="text-xs text-zinc-500">Choose a .mind file</span>
            <input
              type="file"
              accept=".mind,.zip,application/zip"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setImportFile(f);
                setPreview(null);
                setImportResult(null);
                setImportError(null);
              }}
              disabled={previewing || importing}
              className="block w-full mt-2 text-sm text-zinc-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border file:border-white/[0.08] file:bg-white/[0.04] file:text-zinc-200 file:text-sm file:cursor-pointer hover:file:bg-white/[0.06] file:transition-colors"
            />
          </label>

          {importFile && (
            <div className="text-xs text-zinc-500 flex items-center gap-2">
              <FileBox className="w-3.5 h-3.5" />
              {importFile.name} ({Math.round(importFile.size / 1024)} KB)
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handlePreview}
              disabled={!importFile || previewing || importing}
              className="px-5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium inline-flex items-center gap-2"
            >
              {previewing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Previewing…
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Preview merge (dry run)
                </>
              )}
            </button>

            <button
              onClick={handleImport}
              disabled={!importFile || importing || previewing}
              className="px-5 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium inline-flex items-center gap-2"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Import now
                </>
              )}
            </button>

            {(preview || importResult || importError) && (
              <button
                onClick={reset}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          {importError && (
            <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 flex items-center gap-2 text-sm text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {importError}
            </div>
          )}

          {preview && <ImportSummary title="Dry run preview" data={preview} />}
          {importResult && <ImportSummary title="Import complete" data={importResult} success />}
        </section>
      </div>
    </PageTransition>
  );
}

function ImportSummary({ title, data, success = false }: { title: string; data: ImportResponse; success?: boolean }) {
  const { manifest, report } = data;
  return (
    <div className={`p-4 rounded-xl border space-y-3 ${success ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/[0.02] border-white/[0.08]'}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-white">
        {success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <ShieldCheck className="w-4 h-4 text-zinc-400" />}
        {title}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Format" value={manifest.format} />
        <Stat label="Generated" value={new Date(manifest.generatedAt).toLocaleString()} />
        <Stat label="Memories in file" value={String(manifest.memoryCount)} />
        <Stat label="Embeddings" value={`${manifest.embeddingCount}${manifest.embeddingDimension ? ` × ${manifest.embeddingDimension}` : ''}`} />
        <Stat label={success ? 'Imported' : 'Would import'} value={String(report.imported)} accent="text-emerald-400" />
        <Stat label="Skipped (duplicate)" value={String(report.skippedDuplicates)} accent="text-zinc-400" />
        <Stat label="Failed" value={String(report.failed)} accent={report.failed > 0 ? 'text-red-400' : 'text-zinc-500'} />
        <Stat label="Label" value={manifest.label || '—'} />
      </dl>

      {report.warnings.length > 0 && (
        <div className="text-xs text-amber-300/80 space-y-1">
          {report.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`mt-0.5 font-medium ${accent || 'text-zinc-200'}`} title={value}>{value}</dd>
    </div>
  );
}
