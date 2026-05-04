"use client";

import { useState, useCallback, useEffect } from "react";
import { FileText, Globe, Type, Loader2, CheckCircle, MessageCircle, BookOpen, StickyNote, Clock, Compass, Package, AlertCircle, Puzzle, FileBox, Hash, BookOpenCheck, PlayCircle, ExternalLink, Bookmark, FolderOpen, Gem, GitFork, Link2, Tags, ArrowUpRight, MessageSquare, AtSign, Send, BookmarkCheck, Music, Highlighter, Key, Lightbulb, Sparkles, Upload } from "lucide-react";
import { getSourceType } from "@/lib/source-types";
import { toast } from "sonner";
import Link from "next/link";
import { PageTransition, Stagger } from "@/components/PageTransition";
import { usePageTitle } from "@/lib/use-page-title";

type ImportState = "idle" | "parsing" | "uploading" | "done" | "error";
type Tab = "chatgpt" | "text" | "files" | "url" | "obsidian" | "notion" | "kindle" | "pdf-epub" | "youtube" | "bookmarks" | "reddit" | "twitter" | "telegram" | "pocket" | "spotify" | "readwise";

interface PluginTab {
  slug: string;
  label: string;
  icon: string;
  desc: string;
}

const BASE_TABS: { id: Tab; label: string; icon: any; desc: string }[] = [
  { id: "chatgpt", label: "ChatGPT", icon: MessageCircle, desc: "ZIP or JSON" },
  { id: "text", label: "Text", icon: Type, desc: "Paste anything" },
  { id: "files", label: "Files", icon: FileText, desc: ".txt, .md" },
  { id: "url", label: "URL", icon: Globe, desc: "Extract page" },
  { id: "obsidian", label: "Obsidian", icon: Gem, desc: "Vault ZIP" },
  { id: "notion", label: "Notion", icon: StickyNote, desc: "MD export" },
  { id: "kindle", label: "Kindle", icon: BookOpenCheck, desc: "Highlights" },
  { id: "pdf-epub", label: "PDF/EPUB", icon: FileBox, desc: "Documents" },
  { id: "youtube", label: "YouTube", icon: PlayCircle, desc: "Transcripts" },
  { id: "bookmarks", label: "Bookmarks", icon: Bookmark, desc: "Browser" },
  { id: "reddit", label: "Reddit", icon: MessageSquare, desc: "Saved posts" },
  { id: "twitter", label: "Twitter/X", icon: AtSign, desc: "Bookmarks" },
  { id: "telegram", label: "Telegram", icon: Send, desc: "Messages" },
  { id: "pocket", label: "Pocket", icon: BookmarkCheck, desc: "Articles" },
  { id: "spotify", label: "Spotify", icon: Music, desc: "Listening" },
  { id: "readwise", label: "Readwise", icon: Highlighter, desc: "Highlights" },
];

const SOURCE_CATEGORIES: { label: string; ids: Tab[] }[] = [
  { label: "Quick Import", ids: ["chatgpt", "text", "files", "url"] },
  { label: "Note Apps", ids: ["obsidian", "notion"] },
  { label: "Documents", ids: ["kindle", "pdf-epub", "youtube"] },
  { label: "Web & Social", ids: ["bookmarks", "reddit", "twitter", "telegram"] },
  { label: "Reading", ids: ["pocket", "spotify", "readwise"] },
];

// Plugin icon mapping — maps manifest icon names to actual components
const PLUGIN_ICON_MAP: Record<string, any> = {
  BookOpen, FileText, Globe, MessageCircle, Type, StickyNote, Puzzle, PlayCircle, Bookmark, Gem,
};

interface ImportSource {
  id: string;
  type: string;
  title: string;
  itemCount: number;
  importedAt: string;
}

export default function ImportPage() {
  usePageTitle("Import");
  const [tab, setTab] = useState<Tab>("chatgpt");
  const [state, setState] = useState<ImportState>("idle");
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [importHistory, setImportHistory] = useState<ImportSource[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [totalMemories, setTotalMemories] = useState(0);
  const [pluginTabs, setPluginTabs] = useState<PluginTab[]>([]);
  
  // ─── Kindle-specific state ───────────────────────────────
  const [kindlePreview, setKindlePreview] = useState<any>(null);
  const [kindleParsing, setKindleParsing] = useState(false);

  // ─── PDF/EPUB-specific state ────────────────────────────
  const [docPreview, setDocPreview] = useState<any>(null);
  const [docParsing, setDocParsing] = useState(false);

  // ─── YouTube-specific state ─────────────────────────────
  const [ytUrl, setYtUrl] = useState("");
  const [ytPreview, setYtPreview] = useState<any>(null);
  const [ytLoading, setYtLoading] = useState(false);

  // ─── Bookmarks-specific state ─────────────────────────────
  const [bmPreview, setBmPreview] = useState<any>(null);
  const [bmParsing, setBmParsing] = useState(false);
  const [bmFetchContent, setBmFetchContent] = useState(false);

  // ─── Obsidian-specific state ──────────────────────────────
  const [obPreview, setObPreview] = useState<any>(null);
  const [obParsing, setObParsing] = useState(false);

  // ─── Reddit-specific state ───────────────────────────────
  const [rdPreview, setRdPreview] = useState<any>(null);
  const [rdParsing, setRdParsing] = useState(false);

  // ─── Notion Enhanced state ────────────────────────────────
  const [notionPreview, setNotionPreview] = useState<any>(null);
  const [notionParsing, setNotionParsing] = useState(false);

  // ─── Twitter/X state ──────────────────────────────────────
  const [twParsing, setTwParsing] = useState(false);

  // ─── Telegram state ───────────────────────────────────────
  const [tgParsing, setTgParsing] = useState(false);

  // ─── Pocket/Instapaper state ──────────────────────────────
  const [pkParsing, setPkParsing] = useState(false);
  const [pkFormat, setPkFormat] = useState<'pocket' | 'instapaper'>('pocket');

  // ─── Spotify state ────────────────────────────────────────
  const [spParsing, setSpParsing] = useState(false);

  // ─── Readwise state ───────────────────────────────────────
  const [rwToken, setRwToken] = useState("");
  const [rwImporting, setRwImporting] = useState(false);
  const [rwTokenSaved, setRwTokenSaved] = useState(false);

  // Fetch import history on mount
  const refreshHistory = useCallback(async () => {
    try {
      const [sourcesRes, statsRes] = await Promise.all([
        fetch('/api/v1/sources'),
        fetch('/api/v1/stats'),
      ]);
      if (sourcesRes.ok) {
        const data = await sourcesRes.json();
        // Sort by importedAt (most recent first)
        const sorted = (data.sources || []).sort((a: ImportSource, b: ImportSource) =>
          new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()
        );
        setImportHistory(sorted);
      }
      if (statsRes.ok) {
        const stats = await statsRes.json();
        setTotalMemories(stats.totalMemories || 0);
      }
    } catch {}
    setHistoryLoading(false);
  }, []);

  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  // Fetch installed import plugins to add their tabs dynamically
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/plugins?category=import&installed=true');
        if (!res.ok) return;
        const data = await res.json();
        const importPlugins = (data.plugins || [])
          .filter((p: any) => p.status === 'active' && p.slug)
          .map((p: any) => ({
            slug: p.slug,
            label: p.name?.replace(/\s*(Importer|Import|Plugin)$/i, '') || p.slug,
            icon: p.icon || 'Puzzle',
            desc: p.description?.substring(0, 20) || '',
          }));
        setPluginTabs(importPlugins);
      } catch {}
    })();
  }, []);

  const importViaApi = async (formData: FormData) => {
    setState("uploading"); setProgress(50); setProgressText("Processing…");
    try {
      const res = await fetch('/api/v1/import', { method: 'POST', body: formData });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      const r = await res.json();
      setState("done"); setProgress(100);
      setProgressText(`${r.imported.chunks} memories from ${r.imported.documents} source(s)`);
      toast.success(`Imported ${r.imported.chunks} memories`);
      refreshHistory(); // Refresh import history after successful import
    } catch (err: any) { toast.error(err.message); setState("error"); setProgressText(err.message); }
  };

  const importJsonViaApi = async (docs: Array<{ title: string; content: string; sourceType: string }>) => {
    setState("uploading"); setProgress(50); setProgressText("Processing…");
    try {
      const res = await fetch('/api/v1/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documents: docs }) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      const r = await res.json();
      setState("done"); setProgress(100);
      setProgressText(`${r.imported.chunks} memories from ${r.imported.documents} source(s)`);
      toast.success(`Imported ${r.imported.chunks} memories`);
      refreshHistory(); // Refresh import history after successful import
    } catch (err: any) { toast.error(err.message); setState("error"); setProgressText(err.message); }
  };

  const handleChatGPTImport = useCallback(async (file: File) => {
    setState("parsing"); setProgressText("Reading export…"); setProgress(10);
    const fd = new FormData(); fd.append('files', file); fd.append('source_type', 'chatgpt');
    await importViaApi(fd);
  }, []);

  const handleTextImport = async () => {
    if (!textContent.trim()) return;
    await importJsonViaApi([{ title: textTitle.trim() || `Note — ${new Date().toLocaleDateString()}`, content: textContent, sourceType: 'text' }]);
    setTextTitle(""); setTextContent("");
  };

  const handleFileImport = async (files: FileList | null) => {
    if (!files?.length) return; setState("parsing");
    const fd = new FormData(); fd.append('source_type', 'file');
    for (const f of Array.from(files)) { if (f.name.match(/\.(txt|md|markdown)$/i)) fd.append('files', f); }
    await importViaApi(fd);
  };

  const handleUrlImport = async () => {
    if (!urlInput.trim()) return; setState("parsing"); setProgressText("Fetching page…");
    try {
      // Server-side fetch — no CORS proxy needed
      const fetchRes = await fetch('/api/v1/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      if (!fetchRes.ok) {
        const e = await fetchRes.json();
        throw new Error(e.error || 'Failed to fetch URL');
      }
      const { title, content } = await fetchRes.json();
      await importJsonViaApi([{ title, content, sourceType: 'url' }]);
      setUrlInput("");
    } catch (err: any) { toast.error(err.message); setState("error"); setProgressText(err.message); }
  };

  const handleVaultImport = async (files: FileList | null) => {
    if (!files?.length) return; setState("parsing");
    const fd = new FormData(); fd.append('source_type', 'file');
    for (const f of Array.from(files)) { if (f.name.endsWith('.md') || f.name.endsWith('.txt')) fd.append('files', f); }
    await importViaApi(fd);
  };

  // ─── KINDLE IMPORT HANDLERS ────────────────────────────────

  const handleKindlePreview = async (file: File) => {
    setKindleParsing(true);
    setKindlePreview(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('action', 'preview');
      const res = await fetch('/api/v1/plugins/kindle-importer', { method: 'POST', body: fd });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Failed to parse clippings file');
      }
      const data = await res.json();
      setKindlePreview({ ...data, file }); // Keep file ref for actual import
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setKindleParsing(false);
    }
  };

  const handleKindleImport = async () => {
    if (!kindlePreview?.file) return;
    setState("uploading"); setProgress(30);
    setProgressText(`Importing ${kindlePreview.totalHighlights} highlights from ${kindlePreview.totalBooks} books…`);
    try {
      const fd = new FormData();
      fd.append('file', kindlePreview.file);
      const res = await fetch('/api/v1/plugins/kindle-importer', { method: 'POST', body: fd });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Import failed');
      }
      const data = await res.json();
      const { imported } = data;
      setState("done"); setProgress(100);
      setProgressText(`${imported.highlights} highlights from ${imported.books} book${imported.books !== 1 ? 's' : ''}${imported.duplicatesRemoved > 0 ? ` (${imported.duplicatesRemoved} duplicates removed)` : ''}`);
      toast.success(`Imported ${imported.highlights} Kindle highlights`, {
        description: `${imported.books} books → ${imported.chunks} memories`,
      });
      setKindlePreview(null);
      refreshHistory();
    } catch (err: any) {
      toast.error(err.message);
      setState("error"); setProgressText(err.message);
    }
  };

  // ─── PDF/EPUB IMPORT HANDLERS ──────────────────────────────

  const handleDocPreview = async (file: File) => {
    setDocParsing(true);
    setDocPreview(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('action', 'preview');
      const res = await fetch('/api/v1/plugins/pdf-epub-parser', { method: 'POST', body: fd });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Failed to parse document');
      }
      const data = await res.json();
      setDocPreview({ ...data, file });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDocParsing(false);
    }
  };

  const handleDocImport = async () => {
    if (!docPreview?.file) return;
    setState("uploading"); setProgress(30);
    const doc = docPreview.document;
    setProgressText(`Importing "${doc.title}" — ${doc.totalChapters} sections…`);
    try {
      const fd = new FormData();
      fd.append('file', docPreview.file);
      const res = await fetch('/api/v1/plugins/pdf-epub-parser', { method: 'POST', body: fd });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Import failed');
      }
      const data = await res.json();
      const { imported } = data;
      setState("done"); setProgress(100);
      setProgressText(`"${imported.title}" — ${imported.sections} sections → ${imported.chunks} memories`);
      toast.success(`Imported ${imported.title}`, {
        description: `${imported.words.toLocaleString()} words · ${imported.chunks} memories · ~${imported.readingTime}min read`,
      });
      setDocPreview(null);
      refreshHistory();
    } catch (err: any) {
      toast.error(err.message);
      setState("error"); setProgressText(err.message);
    }
  };

  // ─── YouTube handlers ──────────────────────────────────
  const handleYtPreview = async () => {
    const url = ytUrl.trim();
    if (!url) return;
    setYtLoading(true);
    setYtPreview(null);
    try {
      const res = await fetch('/api/v1/plugins/youtube-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, action: 'preview' }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Failed to fetch transcript');
      }
      const data = await res.json();
      setYtPreview(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setYtLoading(false);
    }
  };

  const handleYtImport = async () => {
    if (!ytPreview) return;
    setState("uploading"); setProgress(30);
    const { video, transcript } = ytPreview;
    setProgressText(`Importing "${video.title}" — ${transcript.totalChunks} segments…`);
    try {
      const res = await fetch('/api/v1/plugins/youtube-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${video.videoId}` }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Import failed');
      }
      const data = await res.json();
      const { imported } = data;
      setState("done"); setProgress(100);
      setProgressText(`"${imported.video.title}" — ${imported.totalWords.toLocaleString()} words → ${imported.chunks} memories`);
      toast.success(`Imported ${imported.video.title}`, {
        description: `${imported.totalWords.toLocaleString()} words · ${imported.chunks} memories · ${imported.video.channel}`,
      });
      setYtPreview(null);
      setYtUrl("");
      refreshHistory();
    } catch (err: any) {
      toast.error(err.message);
      setState("error"); setProgressText(err.message);
    }
  };

  // ─── Bookmarks handlers ──────────────────────────────────
  const handleBmPreview = async (file: File) => {
    setBmParsing(true);
    setBmPreview(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('action', 'preview');
      const res = await fetch('/api/v1/plugins/browser-bookmarks', { method: 'POST', body: fd });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Failed to parse bookmarks');
      }
      const data = await res.json();
      setBmPreview({ ...data, file });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBmParsing(false);
    }
  };

  const handleBmImport = async () => {
    if (!bmPreview?.file) return;
    setState("uploading"); setProgress(30);
    setProgressText(`Importing ${bmPreview.stats.totalBookmarks} bookmarks${bmFetchContent ? ' (fetching content…)' : ''}…`);
    try {
      const fd = new FormData();
      fd.append('file', bmPreview.file);
      fd.append('fetchContent', bmFetchContent ? 'true' : 'false');
      const res = await fetch('/api/v1/plugins/browser-bookmarks', { method: 'POST', body: fd });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Import failed');
      }
      const data = await res.json();
      const { imported } = data;
      setState("done"); setProgress(100);
      setProgressText(`${imported.totalBookmarks} bookmarks imported${imported.withContent ? ` (${imported.withContent} with content)` : ''}`);
      toast.success(`Imported ${imported.totalBookmarks} bookmarks`, {
        description: `${imported.stats.totalFolders} folders · ${imported.embedded || 0} embedded`,
      });
      setBmPreview(null);
      setBmFetchContent(false);
      refreshHistory();
    } catch (err: any) {
      toast.error(err.message);
      setState("error"); setProgressText(err.message);
    }
  };

  // ─── OBSIDIAN VAULT IMPORT HANDLERS ───────────────────────

  const handleObPreview = async (file: File) => {
    setObParsing(true);
    setObPreview(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('action', 'preview');
      const res = await fetch('/api/v1/plugins/obsidian-importer', { method: 'POST', body: fd });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Failed to parse vault');
      }
      const data = await res.json();
      setObPreview({ ...data, file });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setObParsing(false);
    }
  };

  const handleObImport = async () => {
    if (!obPreview?.file) return;
    setState("uploading"); setProgress(30);
    setProgressText(`Importing ${obPreview.stats.totalNotes} notes from Obsidian vault…`);
    try {
      const fd = new FormData();
      fd.append('file', obPreview.file);
      const res = await fetch('/api/v1/plugins/obsidian-importer', { method: 'POST', body: fd });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Import failed');
      }
      const data = await res.json();
      const { imported } = data;
      setState("done"); setProgress(100);
      setProgressText(`${imported.totalNotes} notes → ${imported.totalChunks} memories · ${imported.connections} connections`);
      toast.success(`Imported ${imported.totalNotes} Obsidian notes`, {
        description: `${imported.totalChunks} memories · ${imported.connections} connections · ${imported.tags} tags`,
      });
      setObPreview(null);
      refreshHistory();
    } catch (err: any) {
      toast.error(err.message);
      setState("error"); setProgressText(err.message);
    }
  };

  // ─── REDDIT IMPORT HANDLERS ───────────────────────────────

  const handleRdPreview = async (file: File) => {
    setRdParsing(true);
    setRdPreview(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('action', 'preview');
      const res = await fetch('/api/v1/plugins/reddit-saved', { method: 'POST', body: fd });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Failed to parse Reddit export');
      }
      const data = await res.json();
      setRdPreview({ ...data, file });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRdParsing(false);
    }
  };

  const handleRdImport = async () => {
    if (!rdPreview?.file) return;
    setState("uploading"); setProgress(30);
    setProgressText(`Importing ${rdPreview.stats.totalItems} Reddit items…`);
    try {
      const fd = new FormData();
      fd.append('file', rdPreview.file);
      const res = await fetch('/api/v1/plugins/reddit-saved', { method: 'POST', body: fd });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Import failed');
      }
      const data = await res.json();
      const { imported } = data;
      setState("done"); setProgress(100);
      setProgressText(`${imported.totalItems} items → ${imported.chunks} memories (${imported.totalPosts} posts, ${imported.totalComments} comments)`);
      toast.success(`Imported ${imported.totalItems} Reddit items`, {
        description: `${imported.chunks} memories · ${imported.totalPosts} posts · ${imported.totalComments} comments`,
      });
      setRdPreview(null);
      refreshHistory();
    } catch (err: any) {
      toast.error(err.message);
      setState("error"); setProgressText(err.message);
    }
  };

  // ─── Notion Enhanced Import (ZIP) ────────────────────────

  // ─── TWITTER IMPORT HANDLER ─────────────────────────────────

  const handleTwitterImport = async (file: File) => {
    setTwParsing(true);
    try {
      const text = await file.text();
      setState("uploading"); setProgress(30);
      setProgressText("Importing Twitter bookmarks…");
      const res = await fetch('/api/v1/plugins/twitter-importer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import-archive', data: text }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Import failed');
      }
      const data = await res.json();
      setState("done"); setProgress(100);
      setProgressText(`${data.imported} tweets imported${data.skipped > 0 ? ` (${data.skipped} duplicates skipped)` : ''}`);
      toast.success(`Imported ${data.imported} tweets`, {
        description: `${data.total} found · ${data.skipped} duplicates skipped`,
      });
      refreshHistory();
    } catch (err: any) {
      toast.error(err.message);
      setState("error"); setProgressText(err.message);
    } finally {
      setTwParsing(false);
    }
  };

  // ─── TELEGRAM IMPORT HANDLER ────────────────────────────────

  const handleTelegramImport = async (file: File) => {
    setTgParsing(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setState("uploading"); setProgress(30);
      setProgressText("Importing Telegram messages…");
      const res = await fetch('/api/v1/plugins/telegram-importer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', data }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Import failed');
      }
      const result = await res.json();
      setState("done"); setProgress(100);
      setProgressText(`${result.imported} message groups from "${result.chatName || 'Telegram'}"${result.skipped > 0 ? ` (${result.skipped} duplicates skipped)` : ''}`);
      toast.success(`Imported ${result.imported} message groups`, {
        description: `${result.totalMessages} messages → ${result.groups} groups`,
      });
      refreshHistory();
    } catch (err: any) {
      toast.error(err.message);
      setState("error"); setProgressText(err.message);
    } finally {
      setTgParsing(false);
    }
  };

  // ─── POCKET / INSTAPAPER IMPORT HANDLER ─────────────────────

  const handlePocketImport = async (file: File) => {
    setPkParsing(true);
    try {
      const text = await file.text();
      const action = pkFormat === 'pocket' ? 'import-pocket' : 'import-instapaper';
      setState("uploading"); setProgress(30);
      setProgressText(`Importing ${pkFormat === 'pocket' ? 'Pocket' : 'Instapaper'} articles…`);
      const res = await fetch('/api/v1/plugins/pocket-importer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data: text }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Import failed');
      }
      const data = await res.json();
      setState("done"); setProgress(100);
      setProgressText(`${data.imported} articles imported from ${data.source}${data.skipped > 0 ? ` (${data.skipped} duplicates skipped)` : ''}`);
      toast.success(`Imported ${data.imported} articles`, {
        description: `From ${data.source} · ${data.total} found · ${data.skipped} duplicates skipped`,
      });
      refreshHistory();
    } catch (err: any) {
      toast.error(err.message);
      setState("error"); setProgressText(err.message);
    } finally {
      setPkParsing(false);
    }
  };

  // ─── SPOTIFY IMPORT HANDLER ─────────────────────────────────

  const handleSpotifyImport = async (file: File) => {
    setSpParsing(true);
    try {
      const text = await file.text();
      setState("uploading"); setProgress(30);
      setProgressText("Building music taste profile…");
      const res = await fetch('/api/v1/plugins/spotify-importer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', data: text }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Import failed');
      }
      const data = await res.json();
      setState("done"); setProgress(100);
      setProgressText(`Music profile built! ${data.stats.totalHours}h of listening · ${data.stats.uniqueArtists} artists · Top: ${data.stats.topArtist}`);
      toast.success(`Spotify profile created`, {
        description: `${data.stats.totalStreams.toLocaleString()} streams · ${data.stats.totalHours}h · ${data.stats.uniqueArtists} artists`,
      });
      refreshHistory();
    } catch (err: any) {
      toast.error(err.message);
      setState("error"); setProgressText(err.message);
    } finally {
      setSpParsing(false);
    }
  };

  // ─── READWISE IMPORT HANDLER ────────────────────────────────

  const handleReadwiseSaveToken = async () => {
    if (!rwToken.trim()) return;
    try {
      const res = await fetch('/api/v1/plugins/readwise-importer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-token', token: rwToken.trim() }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Token validation failed');
      }
      setRwTokenSaved(true);
      toast.success('Readwise token saved and validated');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleReadwiseImport = async () => {
    setRwImporting(true);
    try {
      setState("uploading"); setProgress(30);
      setProgressText("Fetching highlights from Readwise…");
      const res = await fetch('/api/v1/plugins/readwise-importer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', token: rwToken.trim() || undefined }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Import failed');
      }
      const data = await res.json();
      setState("done"); setProgress(100);
      if (data.imported === 0) {
        setProgressText(data.message || 'No new highlights to import');
        toast.info(data.message || 'No new highlights');
      } else {
        setProgressText(`${data.imported} highlights from ${data.booksProcessed} sources${data.skipped > 0 ? ` (${data.skipped} duplicates skipped)` : ''}`);
        toast.success(`Imported ${data.imported} Readwise highlights`, {
          description: `${data.booksProcessed} books/articles · ${data.totalHighlights} total highlights`,
        });
      }
      refreshHistory();
    } catch (err: any) {
      toast.error(err.message);
      setState("error"); setProgressText(err.message);
    } finally {
      setRwImporting(false);
    }
  };

  // ─── Readwise config check on tab switch ────────────────────
  useEffect(() => {
    if (tab === 'readwise') {
      fetch('/api/v1/plugins/readwise-importer?action=config')
        .then(r => r.json())
        .then(d => {
          if (d.hasToken) setRwTokenSaved(true);
        })
        .catch(() => {});
    }
  }, [tab]);
  const handleNotionZipPreview = async (file: File) => {
    setNotionParsing(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('action', 'preview');
      const res = await fetch('/api/v1/plugins/notion-importer', { method: 'POST', body: form });
      const data = await res.json();
      if (data.success) {
        setNotionPreview(data.stats);
      } else {
        toast.error(data.error || 'Failed to parse Notion export');
      }
    } catch (err: any) {
      toast.error(err.message || 'Parse error');
    } finally {
      setNotionParsing(false);
    }
  };

  const handleNotionZipImport = async () => {
    if (!notionPreview?._file) return;
    setState("uploading"); setProgressText("Importing Notion workspace...");
    try {
      const form = new FormData();
      form.append('file', notionPreview._file);
      form.append('action', 'import');
      const res = await fetch('/api/v1/plugins/notion-importer', { method: 'POST', body: form });
      const data = await res.json();
      if (data.success) {
        setProgress(100);
        setProgressText(`Imported ${data.imported} memories (${data.pages} pages, ${data.databaseRows} database rows)`);
        setState("done");
        refreshHistory();
        setNotionPreview(null);
      } else {
        throw new Error(data.error || 'Import failed');
      }
    } catch (err: any) {
      setProgressText(err.message);
      setState("error");
    }
  };

  const handleNotionImport = async (files: FileList | null) => {
    if (!files?.length) return; setState("parsing"); setProgressText("Cleaning Notion files…");
    // Notion exports have UUIDs in filenames and content links
    // e.g. "My Page 32 char hex.md" and "[link](Another%20Page%2032charhex)"
    const notionIdPattern = /\s+[a-f0-9]{32}(?=\.(md|csv)$)/i;
    const notionLinkIdPattern = /(%20)?[a-f0-9]{32}/gi;
    const docs: Array<{ title: string; content: string; sourceType: string }> = [];

    for (const f of Array.from(files)) {
      if (!f.name.endsWith('.md') && !f.name.endsWith('.txt')) continue;
      let text = await f.text();
      // Clean title: remove Notion UUID from filename
      const title = f.name.replace(notionIdPattern, '').replace(/\.(md|txt)$/, '');
      // Clean content: remove UUIDs from internal links
      text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
        const cleanUrl = url.replace(notionLinkIdPattern, '');
        return `[${label}](${cleanUrl})`;
      });
      docs.push({ title, content: text, sourceType: 'file' });
    }

    if (docs.length === 0) { toast.error("No .md files found"); setState("idle"); return; }
    await importJsonViaApi(docs);
  };

  const reset = () => { setState("idle"); setProgress(0); setProgressText(""); };
  const busy = state === "parsing" || state === "uploading";

  return (
    <PageTransition className="space-y-6 md:space-y-8">
      {/* Header */}
      <Stagger>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em]">Import</h1>
            <p className="text-[13px] text-zinc-500 mt-1">
              Bring your knowledge from anywhere — or{' '}
              <Link href="/app/portable" className="text-teal-400 hover:text-teal-300 underline-offset-2 hover:underline transition-colors">
                import a .mind backup
              </Link>
              .
            </p>
          </div>
          {totalMemories > 0 && (
            <div className="text-right shrink-0">
              <p className="text-[20px] font-semibold text-zinc-200 tabular-nums tracking-tight">{totalMemories.toLocaleString()}</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">memories</p>
            </div>
          )}
        </div>
      </Stagger>

      {/* Progress */}
      {state !== "idle" && (
        <Stagger>
        <div className={`rounded-2xl border p-5 space-y-4 transition-colors duration-300 ${
          state === "done" ? "border-emerald-500/20 bg-emerald-500/[0.03]" :
          state === "error" ? "border-red-500/20 bg-red-500/[0.03]" :
          "border-teal-500/15 bg-teal-500/[0.02]"
        }`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              state === "done" ? "bg-emerald-500/10" :
              state === "error" ? "bg-red-500/10" :
              "bg-teal-500/10"
            }`}>
              {state === "done" ? <CheckCircle className="w-4 h-4 text-emerald-400" /> :
               state === "error" ? <AlertCircle className="w-4 h-4 text-red-400" /> :
               <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-medium ${
                state === "done" ? "text-emerald-300" :
                state === "error" ? "text-red-300" :
                "text-zinc-200"
              }`}>
                {state === "done" ? "Import complete" :
                 state === "error" ? "Import failed" :
                 state === "parsing" ? "Preparing..." : "Importing..."}
              </p>
              <p className="text-[12px] text-zinc-500 mt-0.5">{progressText}</p>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ease-out ${
              state === "done" ? "bg-emerald-500" :
              state === "error" ? "bg-red-500" :
              "bg-gradient-to-r from-teal-500 to-sky-500"
            }`} style={{ width: `${progress}%` }} />
          </div>
          {(state === "done" || state === "error") && (
            <div className="flex items-center gap-3">
              <button onClick={reset} className={`h-8 px-4 rounded-lg text-[12px] font-medium transition-all active:scale-[0.97] ${
                state === "done"
                  ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
                  : "bg-red-500/10 text-red-400 hover:bg-red-500/15"
              }`}>
                {state === "done" ? "Import more" : "Try again"}
              </button>
              {state === "done" && (
                <Link href="/app/explore" className="text-[12px] text-zinc-500 hover:text-teal-400 transition-colors flex items-center gap-1">
                  <Compass className="w-3 h-3" />
                  View in Explore
                </Link>
              )}
            </div>
          )}
        </div>
        </Stagger>
      )}

      {/* Source Selector — Categorized */}
      <Stagger>
      <div className="space-y-4">
        {SOURCE_CATEGORIES.map((cat) => {
          const tabs = cat.ids.map(id => BASE_TABS.find(t => t.id === id)!).filter(Boolean);
          return (
            <div key={cat.label}>
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.1em] mb-2 px-0.5">{cat.label}</p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none md:flex-wrap md:overflow-visible">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setTab(t.id); setKindlePreview(null); setDocPreview(null); setYtPreview(null); setRdPreview(null); }}
                    className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border transition-all duration-150 active:scale-[0.97] whitespace-nowrap shrink-0 ${
                      tab === t.id
                        ? "bg-teal-500/10 border-teal-500/25 shadow-sm shadow-teal-500/10"
                        : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.1]"
                    }`}
                  >
                    <t.icon className={`w-4 h-4 shrink-0 ${tab === t.id ? "text-teal-400" : "text-zinc-500"}`} />
                    <span className={`text-[12px] font-medium ${tab === t.id ? "text-teal-300" : "text-zinc-400"}`}>{t.label}</span>
                    <span className={`text-[10px] hidden sm:inline ${tab === t.id ? "text-teal-500/60" : "text-zinc-600"}`}>{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {/* Plugin tabs */}
        {pluginTabs
          .filter((pt) => !['kindle-importer', 'pdf-epub-parser', 'youtube-transcript', 'browser-bookmarks', 'obsidian-importer', 'reddit-saved', 'twitter-importer', 'telegram-importer', 'pocket-importer', 'spotify-importer', 'readwise-importer'].includes(pt.slug))
          .length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.1em] mb-1.5 px-0.5">Plugins</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none md:flex-wrap md:overflow-visible">
              {pluginTabs
                .filter((pt) => !['kindle-importer', 'pdf-epub-parser', 'youtube-transcript', 'browser-bookmarks', 'obsidian-importer', 'reddit-saved', 'twitter-importer', 'telegram-importer', 'pocket-importer', 'spotify-importer', 'readwise-importer'].includes(pt.slug))
                .map((pt) => {
                const tabId = pt.slug.replace('-importer', '').replace('-import', '').replace('-parser', '') as Tab;
                const PluginTabIcon = PLUGIN_ICON_MAP[pt.icon] || Puzzle;
                return (
                  <button
                    key={pt.slug}
                    onClick={() => { setTab(tabId); setKindlePreview(null); setDocPreview(null); setYtPreview(null); setRdPreview(null); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all active:scale-[0.97] whitespace-nowrap shrink-0 ${
                      tab === tabId
                        ? "bg-amber-500/10 border-amber-500/25 shadow-sm shadow-amber-500/10"
                        : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                    }`}
                  >
                    <PluginTabIcon className={`w-4 h-4 shrink-0 ${tab === tabId ? "text-amber-400" : "text-zinc-500"}`} />
                    <span className={`text-[12px] font-medium ${tab === tabId ? "text-amber-300" : "text-zinc-400"}`}>{pt.label}</span>
                    <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-wider">plugin</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      </Stagger>

      {/* Tab Content */}
      <Stagger>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="p-5 md:p-6 space-y-4">
          {tab === "chatgpt" && (
            <>
              <div className="text-[12px] text-zinc-500 space-y-1.5">
                <p className="text-[13px] text-zinc-300 font-medium">How to export from ChatGPT</p>
                <ol className="space-y-1 list-decimal list-inside text-zinc-500">
                  <li>Go to <span className="text-zinc-400">Profile → Settings → Data Controls</span></li>
                  <li>Click <span className="text-zinc-400">Export data</span></li>
                  <li>Download the ZIP from your email</li>
                </ol>
              </div>
              <DropZone
                id="chatgpt-file" accept=".json,.zip" disabled={busy}
                onFile={handleChatGPTImport}
                title="Drop your ChatGPT export"
                subtitle=".zip or .json — all conversations will be imported"
                icon={<MessageCircle className="w-7 h-7 text-teal-400/60" />}
              />
            </>
          )}
          {tab === "text" && (
            <div className="space-y-3">
              <input
                placeholder="Title (optional)"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-500/30 focus:border-teal-500/20 transition-all"
              />
              <textarea
                placeholder="Paste notes, articles, thoughts..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={8}
                className="w-full px-3.5 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] leading-relaxed placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-500/30 focus:border-teal-500/20 transition-all resize-none"
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-zinc-600">
                  {textContent.length > 0 && `${textContent.split(/\s+/).filter(Boolean).length} words`}
                </p>
                <button
                  onClick={handleTextImport}
                  disabled={busy || !textContent.trim()}
                  className="h-9 px-5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-[13px] font-medium text-white transition-all active:scale-[0.97] flex items-center gap-2"
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Import
                </button>
              </div>
            </div>
          )}
          {tab === "files" && (
            <DropZone
              id="file-upload" accept=".txt,.md,.markdown" multiple disabled={busy}
              onFiles={handleFileImport}
              title="Drop text files"
              subtitle=".txt or .md — select multiple files at once"
              icon={<FileText className="w-7 h-7 text-teal-400/60" />}
            />
          )}
          {tab === "url" && (
            <div className="space-y-3">
              <p className="text-[12px] text-zinc-500">Paste any URL to extract and save its content</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                  <input
                    placeholder="https://..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleUrlImport()}
                    className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-500/30 focus:border-teal-500/20 transition-all"
                  />
                </div>
                <button
                  onClick={handleUrlImport}
                  disabled={busy || !urlInput.trim()}
                  className="h-10 px-5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-[13px] font-medium text-white shrink-0 transition-all active:scale-[0.97] flex items-center gap-2"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import"}
                </button>
              </div>
            </div>
          )}
          {tab === "obsidian" && (
            <>
              <div className="text-[12px] text-zinc-500 space-y-1.5">
                <p className="text-[13px] text-zinc-300 font-medium">Import Obsidian Vault</p>
                <p>ZIP your vault folder and upload it. Wikilinks, tags, and frontmatter are preserved.</p>
                <p className="text-zinc-600">Right-click your vault folder → Compress to ZIP</p>
              </div>

              {!obPreview ? (
                <div className="space-y-3">
                  <label
                    className={`flex flex-col items-center gap-3 py-10 md:py-12 rounded-2xl border-2 border-dashed transition-all cursor-pointer
                      ${obParsing ? 'border-zinc-700 bg-white/[0.01] opacity-60' : 'border-white/[0.1] hover:border-teal-500/30 hover:bg-teal-500/[0.04]'}`}
                  >
                    {obParsing ? (
                      <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
                    ) : (
                      <Gem className="w-6 h-6 text-teal-400" />
                    )}
                    <span className="text-[12px] text-zinc-400 font-medium">
                      {obParsing ? 'Parsing vault…' : 'Drop vault.zip or click to browse'}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      Supports wikilinks, #tags, YAML frontmatter, folder structure
                    </span>
                    <input
                      type="file"
                      accept=".zip"
                      className="hidden"
                      disabled={obParsing || busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleObPreview(f);
                      }}
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Stats card */}
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-teal-500/[0.08] border border-teal-500/15 flex items-center justify-center shrink-0">
                        <Gem className="w-5 h-5 text-teal-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-zinc-200 tabular-nums">
                          {obPreview.stats.totalNotes.toLocaleString()} notes
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {obPreview.stats.totalWords.toLocaleString()} words · {obPreview.stats.totalFolders} folders
                          {obPreview.stats.dateRange.oldest && ` · ${obPreview.stats.dateRange.oldest} – ${obPreview.stats.dateRange.newest}`}
                        </p>
                      </div>
                      <button
                        onClick={() => setObPreview(null)}
                        className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
                      >
                        Change
                      </button>
                    </div>

                    {/* Graph stats */}
                    <div className="border-t border-white/[0.04] px-4 py-2.5">
                      <div className="flex items-center gap-4 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Link2 className="w-3 h-3 text-teal-400/60" />
                          <span className="text-zinc-400">{obPreview.graphPreview.totalLinks} wikilinks</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <GitFork className="w-3 h-3 text-emerald-400/60" />
                          <span className="text-zinc-400">{obPreview.graphPreview.connectedNotes} connected</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-600">{obPreview.stats.orphanNotes} orphans</span>
                        </div>
                        <div className="flex items-center gap-1.5 ml-auto">
                          <span className="text-zinc-600">{obPreview.graphPreview.avgLinksPerNote} links/note</span>
                        </div>
                      </div>
                    </div>

                    {/* Tags */}
                    {obPreview.stats.topTags?.length > 0 && (
                      <div className="border-t border-white/[0.04] px-4 py-2.5">
                        <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Tags className="w-2.5 h-2.5" /> Tags
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {obPreview.stats.topTags.slice(0, 12).map((t: any, i: number) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-500/[0.06] border border-teal-500/10 text-[10px] text-teal-300/80"
                            >
                              #{t.tag}
                              <span className="text-zinc-600 tabular-nums">{t.count}</span>
                            </span>
                          ))}
                          {obPreview.stats.topTags.length > 12 && (
                            <span className="text-[10px] text-zinc-600 self-center">
                              +{obPreview.stats.topTags.length - 12} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Top folders */}
                    {obPreview.stats.topFolders?.length > 0 && (
                      <div className="border-t border-white/[0.04] px-4 py-2.5">
                        <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider mb-2 flex items-center gap-1">
                          <FolderOpen className="w-2.5 h-2.5" /> Folders
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {obPreview.stats.topFolders.map((f: any, i: number) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] text-[10px] text-zinc-400"
                            >
                              <FolderOpen className="w-2.5 h-2.5 text-teal-400/50" />
                              {f.path}
                              <span className="text-zinc-600 tabular-nums">{f.count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Most linked notes */}
                    {obPreview.stats.mostLinked?.length > 0 && (
                      <div className="border-t border-white/[0.04] px-4 py-2.5">
                        <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Link2 className="w-2.5 h-2.5" /> Most Linked
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {obPreview.stats.mostLinked.slice(0, 6).map((n: any, i: number) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] text-[10px] text-zinc-400"
                            >
                              {n.name}
                              <span className="text-emerald-400/60 tabular-nums">← {n.inLinks}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sample notes */}
                    {obPreview.sampleNotes?.length > 0 && (
                      <div className="border-t border-white/[0.04] max-h-[200px] overflow-y-auto">
                        {obPreview.sampleNotes.slice(0, 6).map((n: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 px-4 py-2 hover:bg-white/[0.02] transition-colors border-b border-white/[0.02] last:border-b-0"
                          >
                            <span className="text-[10px] text-teal-400/60 font-mono tabular-nums w-4 text-right shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-[11px] text-zinc-300 truncate">{n.name}</p>
                                {n.linkCount > 0 && (
                                  <span className="text-[9px] text-emerald-400/50 shrink-0">{n.linkCount} links</span>
                                )}
                              </div>
                              <p className="text-[10px] text-zinc-600 truncate">
                                {n.folder || 'Root'} · {n.wordCount} words
                                {n.tags.length > 0 && ` · ${n.tags.map((t: string) => `#${t}`).join(' ')}`}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Import button */}
                  <button
                    onClick={handleObImport}
                    disabled={busy}
                    className="w-full h-11 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-[13px] font-semibold text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Gem className="w-4 h-4" />
                    )}
                    Import {obPreview.stats.totalNotes.toLocaleString()} Notes
                  </button>
                </div>
              )}
            </>
          )}
          {tab === "notion" && (
            <>
              <div className="text-[12px] text-zinc-500 space-y-1.5">
                <p className="text-[13px] text-zinc-300 font-medium">Export from Notion</p>
                <p>Settings → Export → Markdown & CSV → Upload the ZIP file <span className="text-teal-400/80 font-medium">(recommended)</span> or extract and select .md files</p>
              </div>

              {notionPreview ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center">
                          <StickyNote className="w-4 h-4 text-teal-400" />
                        </div>
                        <div>
                          <p className="text-[14px] font-medium text-white">{notionPreview.totalPages} pages found</p>
                          <p className="text-[11px] text-zinc-500">
                            {notionPreview.totalDatabases} database{notionPreview.totalDatabases !== 1 ? 's' : ''}
                            {' · '}{(notionPreview.totalWords / 1000).toFixed(0)}k words
                          </p>
                        </div>
                      </div>
                      <button onClick={() => setNotionPreview(null)} className="text-[11px] text-zinc-600 hover:text-zinc-400">Change</button>
                    </div>

                    {/* Database info */}
                    {notionPreview.databases?.length > 0 && (
                      <div className="pt-2 border-t border-white/[0.04]">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Databases</p>
                        {notionPreview.databases.map((db: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.02]">
                            <span className="text-xs text-zinc-300">{db.name}</span>
                            <span className="text-[10px] text-teal-400">{db.rowCount} rows</span>
                            <span className="text-[10px] text-zinc-600 ml-auto">{db.columns.length} cols</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Sample pages */}
                    {notionPreview.samplePages?.length > 0 && (
                      <div className="pt-2 border-t border-white/[0.04] max-h-[200px] overflow-y-auto space-y-1">
                        {notionPreview.samplePages.map((p: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/[0.02]">
                            <span className={`text-[10px] px-1 py-0.5 rounded ${p.type === 'database-page' ? 'bg-sky-500/10 text-sky-400' : 'bg-teal-500/10 text-teal-400'}`}>
                              {p.type === 'database-page' ? 'DB' : 'Page'}
                            </span>
                            <span className="text-xs text-zinc-400 truncate flex-1">{p.name}</span>
                            <span className="text-[10px] text-zinc-600">{p.wordCount}w</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleNotionZipImport}
                    disabled={busy}
                    className="w-full h-11 rounded-xl text-[13px] font-semibold bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-40 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <StickyNote className="w-4 h-4" />}
                    Import {notionPreview.totalPages} Notion pages
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <DropZone
                    id="notion-zip-upload" accept=".zip" disabled={busy || notionParsing}
                    onFile={(f: File) => {
                      // Store file reference for later import
                      const preview = { _file: f };
                      handleNotionZipPreview(f).then(() => {
                        setNotionPreview((prev: any) => prev ? { ...prev, _file: f } : null);
                      });
                    }}
                    title={notionParsing ? "Parsing Notion export..." : "Drop Notion export ZIP"}
                    subtitle={notionParsing ? "Analyzing pages and databases..." : ".zip file — pages + databases supported"}
                    icon={notionParsing
                      ? <Loader2 className="w-7 h-7 text-teal-400 animate-spin" />
                      : <StickyNote className="w-7 h-7 text-teal-400/60" />
                    }
                  />
                  <div className="text-center">
                    <span className="text-[10px] text-zinc-600">or</span>
                  </div>
                  <DropZone
                    id="notion-upload" accept=".md,.markdown" multiple disabled={busy}
                    onFiles={(f) => handleNotionImport(f)}
                    title="Drop individual .md files"
                    subtitle="For pre-extracted Notion exports"
                    icon={<StickyNote className="w-7 h-7 text-zinc-500" />}
                  />
                </div>
              )}
            </>
          )}
          {tab === "kindle" && (
            <>
              <div className="text-[12px] text-zinc-500 space-y-1.5">
                <p className="text-[13px] text-zinc-300 font-medium">Import Kindle Highlights</p>
                <p>Find <code className="text-[11px] text-amber-400/80 bg-amber-500/[0.06] px-1.5 py-0.5 rounded-md font-mono">My Clippings.txt</code> on your Kindle:</p>
                <p className="text-zinc-600">Connect Kindle → Open drive → Documents → My Clippings.txt</p>
              </div>
              
              {!kindlePreview ? (
                <DropZone
                  id="kindle-upload" accept=".txt" disabled={busy || kindleParsing}
                  onFile={handleKindlePreview}
                  title={kindleParsing ? "Parsing highlights…" : "Drop My Clippings.txt"}
                  subtitle={kindleParsing ? "Grouping by book…" : ".txt file from your Kindle"}
                  icon={kindleParsing
                    ? <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                    : <BookOpen className="w-6 h-6 text-zinc-600" />
                  }
                />
              ) : (
                <div className="space-y-4">
                  {/* Preview summary */}
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[14px] font-medium text-white">
                          {kindlePreview.totalHighlights} highlights found
                        </p>
                        <p className="text-[12px] text-zinc-500 mt-0.5">
                          from {kindlePreview.totalBooks} book{kindlePreview.totalBooks !== 1 ? 's' : ''}
                          {kindlePreview.duplicatesRemoved > 0 && (
                            <span className="text-amber-400/70"> · {kindlePreview.duplicatesRemoved} duplicates removed</span>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => setKindlePreview(null)}
                        className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        Change file
                      </button>
                    </div>

                    {/* Book list */}
                    <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                      {kindlePreview.books.map((book: any, i: number) => (
                        <div
                          key={i}
                          className="group flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.02] transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-amber-500/[0.08] border border-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
                            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-zinc-200 truncate">
                              {book.title}
                            </p>
                            <p className="text-[11px] text-zinc-600 mt-0.5">
                              {book.author} · {book.highlightCount} highlight{book.highlightCount !== 1 ? 's' : ''}
                              {book.noteCount > 0 && ` · ${book.noteCount} note${book.noteCount !== 1 ? 's' : ''}`}
                            </p>
                            {book.preview?.[0] && (
                              <p className="text-[11px] text-zinc-600 mt-1 line-clamp-2 italic">
                                "{book.preview[0].content}"
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Import button */}
                  <button
                    onClick={handleKindleImport}
                    disabled={busy}
                    className="w-full h-11 rounded-xl bg-amber-500/90 hover:bg-amber-500 disabled:opacity-40 text-[13px] font-semibold text-black transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <BookOpen className="w-4 h-4" />
                    )}
                    Import {kindlePreview.totalHighlights} Highlights from {kindlePreview.totalBooks} Book{kindlePreview.totalBooks !== 1 ? 's' : ''}
                  </button>
                </div>
              )}
            </>
          )}
          {tab === "pdf-epub" && (
            <>
              <div className="text-[12px] text-zinc-500 space-y-1.5">
                <p className="text-[13px] text-zinc-300 font-medium">Import PDF & EPUB Documents</p>
                <p>Smart parsing preserves chapter structure, headings, and section boundaries.</p>
                <p className="text-zinc-600">Up to 50MB · Scanned PDFs (image-only) not supported</p>
              </div>

              {!docPreview ? (
                <DropZone
                  id="doc-upload" accept=".pdf,.epub" disabled={busy || docParsing}
                  onFile={handleDocPreview}
                  title={docParsing ? "Parsing document…" : "Drop a PDF or EPUB file"}
                  subtitle={docParsing ? "Detecting structure…" : ".pdf or .epub — up to 50MB"}
                  icon={docParsing
                    ? <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                    : <FileBox className="w-6 h-6 text-zinc-600" />
                  }
                />
              ) : (
                <div className="space-y-4">
                  {/* Document preview */}
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[14px] font-medium text-white">
                          {docPreview.document.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {docPreview.document.author && (
                            <span className="text-[12px] text-zinc-500">{docPreview.document.author}</span>
                          )}
                          <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400/70 bg-blue-500/[0.06] px-1.5 py-0.5 rounded-md">
                            {docPreview.document.format}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setDocPreview(null)}
                        className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        Change file
                      </button>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                      {docPreview.document.totalPages && (
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {docPreview.document.totalPages} pages
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        {docPreview.document.totalWords.toLocaleString()} words
                      </span>
                      <span>{docPreview.document.totalChapters} section{docPreview.document.totalChapters !== 1 ? 's' : ''}</span>
                      <span>~{docPreview.estimatedReadingTime}min read</span>
                      <span>→ {docPreview.chunks} chunk{docPreview.chunks !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Sections list */}
                    <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1">
                      {docPreview.sections.map((section: any, i: number) => (
                        <div
                          key={i}
                          className="group flex items-start gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.02] transition-colors"
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            section.level === 1
                              ? 'bg-blue-500/[0.08] border border-blue-500/15'
                              : section.level === 2
                              ? 'bg-teal-500/[0.06] border border-teal-500/10'
                              : 'bg-white/[0.03] border border-white/[0.06]'
                          }`}>
                            <span className={`text-[10px] font-mono tabular-nums ${
                              section.level === 1 ? 'text-blue-400' :
                              section.level === 2 ? 'text-teal-400' : 'text-zinc-500'
                            }`}>
                              {i + 1}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[12px] font-medium truncate ${
                              section.level === 1 ? 'text-zinc-200' : 'text-zinc-400'
                            }`}>
                              {section.title}
                            </p>
                            <p className="text-[10px] text-zinc-600 mt-0.5">
                              {section.wordCount.toLocaleString()} words · {section.charCount.toLocaleString()} chars
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Import button */}
                  <button
                    onClick={handleDocImport}
                    disabled={busy}
                    className="w-full h-11 rounded-xl bg-blue-500/90 hover:bg-blue-500 disabled:opacity-40 text-[13px] font-semibold text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileBox className="w-4 h-4" />
                    )}
                    Import "{docPreview.document.title}" — {docPreview.chunks} Memories
                  </button>
                </div>
              )}
            </>
          )}
          {tab === "youtube" && (
            <>
              <div className="text-[12px] text-zinc-500 space-y-1.5">
                <p className="text-[13px] text-zinc-300 font-medium">Import YouTube Transcripts</p>
                <p>Paste a YouTube URL to extract the full transcript as searchable knowledge.</p>
                <p className="text-zinc-600">Supports youtube.com, youtu.be, and shorts links</p>
              </div>

              {!ytPreview ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={ytUrl}
                      onChange={(e) => setYtUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !ytLoading && handleYtPreview()}
                      disabled={ytLoading}
                      className="flex-1 h-10 px-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-500/30 transition-all disabled:opacity-50"
                    />
                    <button
                      onClick={handleYtPreview}
                      disabled={ytLoading || !ytUrl.trim()}
                      className="h-10 px-5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-[13px] font-medium text-white shrink-0 transition-all active:scale-[0.97] flex items-center gap-2"
                    >
                      {ytLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <PlayCircle className="w-4 h-4" />
                      )}
                      {ytLoading ? "Fetching…" : "Preview"}
                    </button>
                  </div>
                  {ytLoading && (
                    <div className="flex items-center gap-2 text-[12px] text-zinc-500 px-1">
                      <Loader2 className="w-3 h-3 animate-spin text-red-400" />
                      <span>Extracting transcript from YouTube…</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Video preview card */}
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                    {/* Thumbnail + metadata */}
                    <div className="flex gap-3 p-3">
                      <div className="relative w-[140px] h-[79px] rounded-lg overflow-hidden shrink-0 bg-zinc-900">
                        <img
                          src={ytPreview.video.thumbnailUrl}
                          alt={ytPreview.video.title}
                          className="w-full h-full object-cover"
                        />
                        {ytPreview.video.duration && (
                          <span className="absolute bottom-1 right-1 text-[10px] font-mono font-medium bg-black/80 text-white px-1.5 py-0.5 rounded">
                            {ytPreview.video.duration}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-zinc-200 line-clamp-2 leading-snug">
                          {ytPreview.video.title}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-1">
                          {ytPreview.video.channel}
                        </p>
                        {ytPreview.video.publishDate && (
                          <p className="text-[10px] text-zinc-600 mt-0.5">
                            {ytPreview.video.publishDate}
                          </p>
                        )}
                        <a
                          href={ytPreview.video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-red-400/70 hover:text-red-400 mt-1 transition-colors"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          Watch on YouTube
                        </a>
                      </div>
                      <button
                        onClick={() => { setYtPreview(null); }}
                        className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors self-start shrink-0"
                      >
                        Change
                      </button>
                    </div>

                    {/* Transcript stats */}
                    <div className="flex items-center gap-3 px-3 py-2 border-t border-white/[0.04] text-[11px] text-zinc-500">
                      <span><strong className="text-zinc-400 tabular-nums">{ytPreview.transcript.totalWords.toLocaleString()}</strong> words</span>
                      <span className="text-zinc-700">·</span>
                      <span><strong className="text-zinc-400 tabular-nums">{ytPreview.transcript.totalSegments.toLocaleString()}</strong> segments</span>
                      <span className="text-zinc-700">·</span>
                      <span>{ytPreview.transcript.readingTime} read</span>
                      <span className="text-zinc-700">·</span>
                      <span><strong className="text-zinc-400 tabular-nums">{ytPreview.transcript.totalChunks}</strong> {ytPreview.transcript.totalChunks === 1 ? 'memory' : 'memories'}</span>
                    </div>
                  </div>

                  {/* Chunk preview */}
                  {ytPreview.transcript.chunks.length > 0 && (
                    <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                      {ytPreview.transcript.chunks.map((chunk: any, i: number) => (
                        <div
                          key={i}
                          className="group flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.02] transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-red-500/[0.08] border border-red-500/15 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[11px] font-mono font-semibold text-red-400 tabular-nums">{i + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-mono text-red-400/70 tabular-nums">{chunk.startTimestamp}–{chunk.endTimestamp}</span>
                              <span className="text-[10px] text-zinc-600">{chunk.wordCount.toLocaleString()} words</span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                              {chunk.preview}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Transcript preview text */}
                  {ytPreview.transcript.preview && (
                    <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3">
                      <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider mb-2">Transcript Preview</p>
                      <p className="text-[12px] text-zinc-500 leading-relaxed line-clamp-4">
                        {ytPreview.transcript.preview}
                      </p>
                    </div>
                  )}

                  {/* Import button */}
                  <button
                    onClick={handleYtImport}
                    disabled={busy}
                    className="w-full h-11 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-[13px] font-semibold text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <PlayCircle className="w-4 h-4" />
                    )}
                    Import {ytPreview.transcript.totalWords.toLocaleString()} Words — {ytPreview.transcript.totalChunks} {ytPreview.transcript.totalChunks === 1 ? 'Memory' : 'Memories'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ─── Bookmarks Tab ──────────────────────────── */}
          {tab === "bookmarks" && (
            <>
              <div className="text-[12px] text-zinc-500 space-y-1.5">
                <p className="text-[13px] text-zinc-300 font-medium">Import Browser Bookmarks</p>
                <p>Upload your bookmarks HTML export from Chrome, Firefox, Safari, Edge, Brave, or Arc.</p>
                <p className="text-zinc-600">Folder structure and dates are preserved</p>
              </div>

              {!bmPreview ? (
                <div className="space-y-3">
                  <label
                    className={`flex flex-col items-center gap-3 py-10 md:py-12 rounded-2xl border-2 border-dashed transition-all cursor-pointer
                      ${bmParsing ? 'border-zinc-700 bg-white/[0.01] opacity-60' : 'border-white/[0.1] hover:border-sky-500/30 hover:bg-sky-500/[0.04]'}`}
                  >
                    {bmParsing ? (
                      <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
                    ) : (
                      <Bookmark className="w-6 h-6 text-sky-400" />
                    )}
                    <span className="text-[12px] text-zinc-400 font-medium">
                      {bmParsing ? 'Parsing bookmarks…' : 'Drop bookmarks.html or click to browse'}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      Chrome: ⋮ → Bookmarks → Export · Firefox: Library → Export · Safari: File → Export
                    </span>
                    <input
                      type="file"
                      accept=".html,.htm"
                      className="hidden"
                      disabled={bmParsing || busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleBmPreview(f);
                      }}
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Stats card */}
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-sky-500/[0.08] border border-sky-500/15 flex items-center justify-center shrink-0">
                        <Bookmark className="w-5 h-5 text-sky-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-zinc-200 tabular-nums">
                          {bmPreview.stats.totalBookmarks.toLocaleString()} bookmarks
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {bmPreview.stats.totalFolders} folders
                          {bmPreview.stats.oldestDate && ` · ${bmPreview.stats.oldestDate} – ${bmPreview.stats.newestDate}`}
                        </p>
                      </div>
                      <button
                        onClick={() => setBmPreview(null)}
                        className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
                      >
                        Change
                      </button>
                    </div>

                    {/* Top folders */}
                    {bmPreview.stats.topFolders?.length > 0 && (
                      <div className="border-t border-white/[0.04] px-4 py-2.5">
                        <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider mb-2">Top Folders</p>
                        <div className="flex flex-wrap gap-1.5">
                          {bmPreview.stats.topFolders.map((f: any, i: number) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] text-[10px] text-zinc-400"
                            >
                              <FolderOpen className="w-2.5 h-2.5 text-sky-400/60" />
                              {f.name}
                              <span className="text-zinc-600 tabular-nums">{f.count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sample bookmarks */}
                    {bmPreview.sampleBookmarks?.length > 0 && (
                      <div className="border-t border-white/[0.04] max-h-[200px] overflow-y-auto">
                        {bmPreview.sampleBookmarks.slice(0, 6).map((b: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 px-4 py-2 hover:bg-white/[0.02] transition-colors border-b border-white/[0.02] last:border-b-0"
                          >
                            <span className="text-[10px] text-sky-400/60 font-mono tabular-nums w-4 text-right shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-zinc-300 truncate">{b.title}</p>
                              <p className="text-[10px] text-zinc-600 truncate">{b.domain} · {b.folder}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Fetch content toggle */}
                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.03] transition-colors">
                    <div className="relative shrink-0">
                      <input
                        type="checkbox"
                        checked={bmFetchContent}
                        onChange={(e) => setBmFetchContent(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-[18px] rounded-full bg-zinc-700 peer-checked:bg-sky-600 transition-colors" />
                      <div className="absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform peer-checked:translate-x-[14px]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-zinc-300 font-medium">Fetch page content</p>
                      <p className="text-[10px] text-zinc-600">Downloads and extracts text from each URL. Takes longer but makes bookmarks fully searchable.</p>
                    </div>
                  </label>

                  {/* Import button */}
                  <button
                    onClick={handleBmImport}
                    disabled={busy}
                    className="w-full h-11 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-[13px] font-semibold text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Bookmark className="w-4 h-4" />
                    )}
                    Import {bmPreview.stats.totalBookmarks.toLocaleString()} Bookmarks
                    {bmFetchContent && ' + Content'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ─── Reddit Tab ──────────────────────────────── */}
          {tab === "reddit" && (
            <>
              <div className="text-[12px] text-zinc-500 space-y-1.5">
                <p className="text-[13px] text-zinc-300 font-medium">Import Reddit Saved Posts</p>
                <p>Upload your Reddit data export to import saved posts and comments.</p>
                <p className="text-zinc-600">
                  <a href="https://www.reddit.com/settings/data-request" target="_blank" rel="noopener noreferrer" className="text-orange-400/70 hover:text-orange-400 transition-colors">
                    reddit.com/settings/data-request
                  </a>
                  {" "}→ Download → Upload ZIP
                </p>
              </div>

              {!rdPreview ? (
                <div className="space-y-3">
                  <label
                    className={`flex flex-col items-center gap-3 py-10 md:py-12 rounded-2xl border-2 border-dashed transition-all cursor-pointer
                      ${rdParsing ? 'border-zinc-700 bg-white/[0.01] opacity-60' : 'border-white/[0.1] hover:border-orange-500/30 hover:bg-orange-500/[0.04]'}`}
                  >
                    {rdParsing ? (
                      <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
                    ) : (
                      <MessageSquare className="w-6 h-6 text-orange-400" />
                    )}
                    <span className="text-[12px] text-zinc-400 font-medium">
                      {rdParsing ? 'Parsing Reddit export…' : 'Drop Reddit export or click to browse'}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      ZIP from Reddit data export · Also accepts CSV or JSON files
                    </span>
                    <input
                      type="file"
                      accept=".zip,.csv,.json"
                      className="hidden"
                      disabled={rdParsing || busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleRdPreview(f);
                      }}
                    />
                  </label>
                </div>
              ) : (
                /* existing Reddit preview UI */
                <div className="space-y-4">
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-500/[0.08] border border-orange-500/15 flex items-center justify-center shrink-0">
                        <MessageSquare className="w-5 h-5 text-orange-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-zinc-200 tabular-nums">
                          {rdPreview.stats.totalItems.toLocaleString()} items found
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {rdPreview.stats.totalPosts} post{rdPreview.stats.totalPosts !== 1 ? 's' : ''} · {rdPreview.stats.totalComments} comment{rdPreview.stats.totalComments !== 1 ? 's' : ''}
                          {rdPreview.stats.dateRange.oldest && ` · ${rdPreview.stats.dateRange.oldest} – ${rdPreview.stats.dateRange.newest}`}
                        </p>
                      </div>
                      <button onClick={() => setRdPreview(null)} className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors shrink-0">Change</button>
                    </div>
                    <div className="border-t border-white/[0.04] px-4 py-2.5">
                      <div className="flex items-center gap-4 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3 h-3 text-orange-400/60" />
                          <span className="text-zinc-400">{rdPreview.stats.totalPosts} posts</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3 text-blue-400/60" />
                          <span className="text-zinc-400">{rdPreview.stats.totalComments} comments</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-600">{rdPreview.stats.subreddits.length} subreddits</span>
                        </div>
                        {rdPreview.stats.avgScore > 0 && (
                          <div className="flex items-center gap-1.5 ml-auto">
                            <ArrowUpRight className="w-3 h-3 text-emerald-400/60" />
                            <span className="text-zinc-600">avg {rdPreview.stats.avgScore} pts</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {rdPreview.stats.subreddits?.length > 0 && (
                      <div className="border-t border-white/[0.04] px-4 py-2.5">
                        <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider mb-2">Subreddits</p>
                        <div className="flex flex-wrap gap-1.5">
                          {rdPreview.stats.subreddits.slice(0, 15).map((s: any, i: number) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/[0.06] border border-orange-500/10 text-[10px] text-orange-300/80">
                              r/{s.name}
                              <span className="text-zinc-600 tabular-nums">{s.count}</span>
                            </span>
                          ))}
                          {rdPreview.stats.subreddits.length > 15 && (
                            <span className="text-[10px] text-zinc-600 self-center">+{rdPreview.stats.subreddits.length - 15} more</span>
                          )}
                        </div>
                      </div>
                    )}
                    {rdPreview.sampleItems?.length > 0 && (
                      <div className="border-t border-white/[0.04] max-h-[220px] overflow-y-auto">
                        {rdPreview.sampleItems.map((item: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 px-4 py-2 hover:bg-white/[0.02] transition-colors border-b border-white/[0.02] last:border-b-0">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${item.type === 'comment' ? 'bg-blue-500/[0.08] border border-blue-500/15' : 'bg-orange-500/[0.08] border border-orange-500/15'}`}>
                              {item.type === 'comment' ? <MessageSquare className="w-3 h-3 text-blue-400" /> : <FileText className="w-3 h-3 text-orange-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-zinc-300 truncate">{item.title}</p>
                              <p className="text-[10px] text-zinc-600 truncate">
                                r/{item.subreddit}{item.score > 0 && ` · ${item.score} pts`}{item.date && ` · ${item.date}`}
                              </p>
                              {item.preview && <p className="text-[10px] text-zinc-600 truncate mt-0.5 italic">{item.preview}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={handleRdImport} disabled={busy} className="w-full h-11 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-[13px] font-semibold text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    Import {rdPreview.stats.totalItems.toLocaleString()} Reddit Items
                  </button>
                </div>
              )}
            </>
          )}

          {/* ─── Twitter/X Tab ───────────────────────────── */}
          {tab === "twitter" && (
            <>
              <div className="text-[12px] text-zinc-500 space-y-1.5">
                <p className="text-[13px] text-zinc-300 font-medium">Import Twitter/X Bookmarks</p>
                <p>Download your Twitter data archive and upload the <code className="text-[11px] text-sky-400/80 bg-sky-500/[0.06] px-1.5 py-0.5 rounded-md font-mono">bookmarks.js</code> or <code className="text-[11px] text-sky-400/80 bg-sky-500/[0.06] px-1.5 py-0.5 rounded-md font-mono">tweets.js</code> file.</p>
                <p className="text-zinc-600">Settings → Your Account → Download an archive of your data → Extract ZIP → Find data/bookmarks.js</p>
              </div>
              <label
                className={`flex flex-col items-center gap-3 py-10 md:py-12 rounded-2xl border-2 border-dashed transition-all cursor-pointer
                  ${twParsing ? 'border-zinc-700 bg-white/[0.01] opacity-60' : 'border-white/[0.1] hover:border-sky-500/30 hover:bg-sky-500/[0.04]'}`}
              >
                {twParsing ? (
                  <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
                ) : (
                  <AtSign className="w-6 h-6 text-sky-400" />
                )}
                <span className="text-[12px] text-zinc-400 font-medium">
                  {twParsing ? 'Importing tweets…' : 'Drop bookmarks.js or tweets.js'}
                </span>
                <span className="text-[10px] text-zinc-600">
                  .js file from Twitter data export
                </span>
                <input
                  type="file"
                  accept=".js,.json"
                  className="hidden"
                  disabled={twParsing || busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleTwitterImport(f);
                  }}
                />
              </label>
            </>
          )}

          {/* ─── Telegram Tab ────────────────────────────── */}
          {tab === "telegram" && (
            <>
              <div className="text-[12px] text-zinc-500 space-y-1.5">
                <p className="text-[13px] text-zinc-300 font-medium">Import Telegram Messages</p>
                <p>Export from Telegram Desktop: Settings → Advanced → Export Telegram Data → Choose <strong className="text-zinc-400">JSON</strong> format.</p>
                <p className="text-zinc-600">Upload the <code className="text-[11px] text-teal-400/80 bg-teal-500/[0.06] px-1.5 py-0.5 rounded-md font-mono">result.json</code> file from the export folder.</p>
              </div>
              <label
                className={`flex flex-col items-center gap-3 py-10 md:py-12 rounded-2xl border-2 border-dashed transition-all cursor-pointer
                  ${tgParsing ? 'border-zinc-700 bg-white/[0.01] opacity-60' : 'border-white/[0.1] hover:border-teal-500/30 hover:bg-teal-500/[0.04]'}`}
              >
                {tgParsing ? (
                  <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
                ) : (
                  <Send className="w-6 h-6 text-teal-400" />
                )}
                <span className="text-[12px] text-zinc-400 font-medium">
                  {tgParsing ? 'Importing messages…' : 'Drop result.json from Telegram export'}
                </span>
                <span className="text-[10px] text-zinc-600">
                  JSON format only · Saved messages, chats, and channels
                </span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  disabled={tgParsing || busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleTelegramImport(f);
                  }}
                />
              </label>
            </>
          )}

          {/* ─── Pocket / Instapaper Tab ─────────────────── */}
          {tab === "pocket" && (
            <>
              <div className="text-[12px] text-zinc-500 space-y-1.5">
                <p className="text-[13px] text-zinc-300 font-medium">Import Pocket or Instapaper</p>
                <p>
                  <strong className="text-zinc-400">Pocket:</strong>{" "}
                  <a href="https://getpocket.com/export" target="_blank" rel="noopener noreferrer" className="text-emerald-400/70 hover:text-emerald-400 transition-colors">getpocket.com/export</a>
                  {" "}→ Download HTML
                </p>
                <p>
                  <strong className="text-zinc-400">Instapaper:</strong>{" "}
                  <a href="https://www.instapaper.com/export" target="_blank" rel="noopener noreferrer" className="text-emerald-400/70 hover:text-emerald-400 transition-colors">instapaper.com/export</a>
                  {" "}→ Download CSV
                </p>
              </div>

              {/* Format toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setPkFormat('pocket')}
                  className={`flex-1 h-9 rounded-xl text-[12px] font-medium transition-all ${
                    pkFormat === 'pocket'
                      ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-300'
                      : 'bg-white/[0.02] border border-white/[0.06] text-zinc-500 hover:bg-white/[0.04]'
                  }`}
                >
                  Pocket (HTML)
                </button>
                <button
                  onClick={() => setPkFormat('instapaper')}
                  className={`flex-1 h-9 rounded-xl text-[12px] font-medium transition-all ${
                    pkFormat === 'instapaper'
                      ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-300'
                      : 'bg-white/[0.02] border border-white/[0.06] text-zinc-500 hover:bg-white/[0.04]'
                  }`}
                >
                  Instapaper (CSV)
                </button>
              </div>

              <label
                className={`flex flex-col items-center gap-3 py-10 md:py-12 rounded-2xl border-2 border-dashed transition-all cursor-pointer
                  ${pkParsing ? 'border-zinc-700 bg-white/[0.01] opacity-60' : 'border-white/[0.1] hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]'}`}
              >
                {pkParsing ? (
                  <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                ) : (
                  <BookmarkCheck className="w-6 h-6 text-emerald-400" />
                )}
                <span className="text-[12px] text-zinc-400 font-medium">
                  {pkParsing ? 'Importing articles…' : `Drop ${pkFormat === 'pocket' ? 'ril_export.html' : 'instapaper-export.csv'}`}
                </span>
                <span className="text-[10px] text-zinc-600">
                  {pkFormat === 'pocket' ? '.html file from Pocket export' : '.csv file from Instapaper export'}
                </span>
                <input
                  type="file"
                  accept={pkFormat === 'pocket' ? '.html,.htm' : '.csv'}
                  className="hidden"
                  disabled={pkParsing || busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePocketImport(f);
                  }}
                />
              </label>
            </>
          )}

          {/* ─── Spotify Tab ─────────────────────────────── */}
          {tab === "spotify" && (
            <>
              <div className="text-[12px] text-zinc-500 space-y-1.5">
                <p className="text-[13px] text-zinc-300 font-medium">Import Spotify Listening History</p>
                <p>Request your data from{" "}
                  <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noopener noreferrer" className="text-emerald-400/70 hover:text-emerald-400 transition-colors">
                    spotify.com/account/privacy
                  </a>
                  {" "}→ Download your data (takes a few days).
                </p>
                <p className="text-zinc-600">Upload <code className="text-[11px] text-emerald-400/80 bg-emerald-500/[0.06] px-1.5 py-0.5 rounded-md font-mono">StreamingHistory_music_0.json</code> from the ZIP.</p>
              </div>

              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                <p className="text-[11px] text-zinc-500 leading-relaxed flex items-start gap-2">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400/70 shrink-0 mt-0.5" />
                  <span>This builds a <strong className="text-zinc-400">music taste profile</strong> from your listening data. 
                  After import, ask MindStore: <em className="text-teal-400/70">"What kind of music do I like?"</em> or <em className="text-teal-400/70">"Who are my top artists?"</em></span>
                </p>
              </div>

              <label
                className={`flex flex-col items-center gap-3 py-10 md:py-12 rounded-2xl border-2 border-dashed transition-all cursor-pointer
                  ${spParsing ? 'border-zinc-700 bg-white/[0.01] opacity-60' : 'border-white/[0.1] hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]'}`}
              >
                {spParsing ? (
                  <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                ) : (
                  <Music className="w-6 h-6 text-emerald-400" />
                )}
                <span className="text-[12px] text-zinc-400 font-medium">
                  {spParsing ? 'Building taste profile…' : 'Drop StreamingHistory JSON file'}
                </span>
                <span className="text-[10px] text-zinc-600">
                  .json file from Spotify privacy data export
                </span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  disabled={spParsing || busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSpotifyImport(f);
                  }}
                />
              </label>
            </>
          )}

          {/* ─── Readwise Tab ────────────────────────────── */}
          {tab === "readwise" && (
            <>
              <div className="text-[12px] text-zinc-500 space-y-1.5">
                <p className="text-[13px] text-zinc-300 font-medium">Import Readwise Highlights</p>
                <p>Import all your highlights from books, articles, tweets, and podcasts via the Readwise API.</p>
                <p className="text-zinc-600">
                  Get your API token at{" "}
                  <a href="https://readwise.io/access_token" target="_blank" rel="noopener noreferrer" className="text-amber-400/70 hover:text-amber-400 transition-colors">
                    readwise.io/access_token
                  </a>
                </p>
              </div>

              <div className="space-y-3">
                {/* Token input */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                    <input
                      type="password"
                      placeholder="Readwise API token"
                      value={rwToken}
                      onChange={(e) => { setRwToken(e.target.value); setRwTokenSaved(false); }}
                      className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30 transition-all font-mono"
                    />
                  </div>
                  <button
                    onClick={handleReadwiseSaveToken}
                    disabled={!rwToken.trim() || rwTokenSaved}
                    className={`h-10 px-4 rounded-xl text-[12px] font-medium shrink-0 transition-all active:scale-[0.97] flex items-center gap-1.5 ${
                      rwTokenSaved
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/90 hover:bg-amber-500 disabled:opacity-40 text-black'
                    }`}
                  >
                    {rwTokenSaved ? (
                      <><CheckCircle className="w-3.5 h-3.5" /> Verified</>
                    ) : (
                      'Validate'
                    )}
                  </button>
                </div>

                {/* Import button */}
                {rwTokenSaved && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                      <p className="text-[11px] text-zinc-500 leading-relaxed flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400/70 shrink-0 mt-0.5" />
                        <span>Token verified! Click Import to fetch all your highlights. Readwise will sync: 
                        <strong className="text-zinc-400"> books, articles, tweets, podcasts</strong>. 
                        Re-importing only fetches new highlights since the last sync.</span>
                      </p>
                    </div>

                    <button
                      onClick={handleReadwiseImport}
                      disabled={rwImporting || busy}
                      className="w-full h-11 rounded-xl bg-amber-500/90 hover:bg-amber-500 disabled:opacity-40 text-[13px] font-semibold text-black transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      {rwImporting ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Fetching from Readwise…</>
                      ) : (
                        <><Highlighter className="w-4 h-4" /> Import All Highlights</>
                      )}
                    </button>
                  </div>
                )}

                {!rwTokenSaved && !rwToken.trim() && (
                  <div className="text-center py-4">
                    <p className="text-[11px] text-zinc-600">Enter your Readwise API token above to get started</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      </Stagger>

      {/* Import History */}
      {!historyLoading && importHistory.length > 0 && (
        <Stagger>
          <div className="space-y-3">
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-zinc-600" />
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.08em]">Recent Imports</p>
                <span className="text-[10px] text-zinc-700 tabular-nums bg-white/[0.04] px-1.5 py-0.5 rounded-md">{importHistory.length}</span>
              </div>
              <Link href="/app/explore" className="text-[11px] text-zinc-600 hover:text-teal-400 font-medium transition-colors flex items-center gap-1">
                <Compass className="w-3 h-3" />
                <span className="hidden sm:inline">Explore all</span>
              </Link>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.04]">
              {importHistory.slice(0, 8).map((src, i) => {
                const st = getSourceType(src.type);
                const Icon = st.icon;
                return (
                  <Link key={src.id || i} href={`/app/explore?q=${encodeURIComponent(src.title)}`}>
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors group">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${st.bgColor} border ${st.borderColor}`}>
                        <Icon className={`w-3.5 h-3.5 ${st.textColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-zinc-300 font-medium truncate group-hover:text-white transition-colors">{src.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[10px] font-semibold uppercase tracking-wide ${st.textColor}`}>{src.type}</span>
                          <span className="text-[10px] text-zinc-700">·</span>
                          <span className="text-[10px] text-zinc-600 tabular-nums">{src.itemCount} chunk{src.itemCount !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Clock className="w-3 h-3 text-zinc-700" />
                        <span className="text-[10px] text-zinc-600 whitespace-nowrap tabular-nums">{formatRelativeTime(src.importedAt)}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            {importHistory.length > 8 && (
              <div className="text-center pt-1">
                <Link href="/app/explore" className="text-[11px] text-teal-400 hover:text-teal-300 font-medium transition-colors">
                  View all {importHistory.length} sources in Explore →
                </Link>
              </div>
            )}
          </div>
        </Stagger>
      )}

      {/* Empty state — no imports yet */}
      {!historyLoading && importHistory.length === 0 && state === "idle" && (
        <Stagger>
          <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/[0.06] border border-teal-500/10 flex items-center justify-center mx-auto mb-4">
              <Upload className="w-5 h-5 text-teal-400/60" />
            </div>
            <p className="text-[14px] text-zinc-300 font-medium">Your knowledge base is empty</p>
            <p className="text-[12px] text-zinc-600 mt-1 max-w-[280px] mx-auto">Choose a source above to import your first knowledge. Start with ChatGPT or paste some text.</p>
          </div>
        </Stagger>
      )}
    </PageTransition>
  );
}

/** Format a timestamp to relative time */
function formatRelativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function DropZone({ id, accept, multiple, disabled, onFile, onFiles, title, subtitle, icon }: {
  id: string; accept: string; multiple?: boolean; disabled: boolean;
  onFile?: (f: File) => void; onFiles?: (f: FileList) => void;
  title: string; subtitle: string; icon: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <>
      <div
        onClick={() => !disabled && document.getElementById(id)?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setOver(false);
          if (disabled) return;
          if (onFile) onFile(e.dataTransfer.files[0]);
          if (onFiles) onFiles(e.dataTransfer.files);
        }}
        className={`group relative flex flex-col items-center justify-center py-12 md:py-16 rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer active:scale-[0.99] ${
          over
            ? "border-teal-500/50 bg-teal-500/[0.08] scale-[1.01] shadow-[inset_0_0_40px_rgba(20,184,166,0.04)]"
            : disabled
            ? "border-white/[0.06] bg-white/[0.01] opacity-60 cursor-not-allowed"
            : "border-white/[0.1] hover:border-teal-500/25 hover:bg-white/[0.02]"
        }`}
      >
        {over && (
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-teal-500/[0.06] to-transparent pointer-events-none" />
        )}
        <div className={`mb-4 transition-all duration-200 ${over ? "scale-125 -translate-y-1.5" : "group-hover:scale-110"}`}>
          {over ? <Upload className="w-7 h-7 text-teal-400" /> : icon}
        </div>
        <p className={`text-[14px] font-medium transition-colors ${over ? "text-teal-300" : "text-zinc-300"}`}>{title}</p>
        <p className="text-[12px] text-zinc-600 mt-1">{subtitle}</p>
        <p className={`text-[11px] mt-4 transition-all duration-200 ${
          over ? "text-teal-400/70 opacity-100" : "text-zinc-700 opacity-0 group-hover:opacity-100"
        }`}>
          {over ? "Release to upload" : "Click to browse or drag & drop"}
        </p>
      </div>
      <input
        id={id} type="file" accept={accept} multiple={multiple}
        className="hidden" disabled={disabled}
        onChange={(e) => {
          if (onFile && e.target.files?.[0]) onFile(e.target.files[0]);
          if (onFiles && e.target.files) onFiles(e.target.files);
        }}
      />
    </>
  );
}
