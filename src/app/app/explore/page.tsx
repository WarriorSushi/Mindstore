"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, ChevronDown, ChevronUp, X, Trash2,
  Copy, Check, Loader2, MessageSquare, CheckSquare, Square, Download, Pencil, Save,
  MoreHorizontal, ArrowUpDown, ArrowDownNarrowWide, ArrowUpNarrowWide, ArrowDownAZ,
  ArrowUpAZ, AlignLeft, AlignRight, Clock, Hash, BookOpen, Pin, PinOff, Sparkles,
  ExternalLink, Bookmark, LayoutList, LayoutGrid, Tag, Plus,
  Star, Compass, Command,
  type LucideIcon,
} from "lucide-react";
import { getSourceType } from "@/lib/source-types";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { DidYouMean } from "@/components/DidYouMean";
import { EmptyState } from "@/components/EmptyState";
import { SavedSearchPills } from "@/components/SavedSearchPills";
import { SearchResultCard } from "@/components/SearchResultCard";
import { SearchStats } from "@/components/SearchStats";
import { toast } from "sonner";
import { PageTransition, Stagger } from "@/components/PageTransition";
import {
  type SavedSearch,
  getSavedSearches,
  createSavedSearch,
  useSavedSearch as applySavedSearch,
  deleteSavedSearch,
  togglePinSavedSearch,
  findMatchingSavedSearch,
  describeSavedSearch,
} from "@/lib/saved-searches";
import { usePageTitle } from "@/lib/use-page-title";
import {
  addSearchToHistory,
} from "@/lib/search-history";

interface TagData {
  id: string;
  name: string;
  color: string;
  memory_count?: number;
}

interface Memory {
  id: string;
  content: string;
  source: string;
  sourceId: string;
  sourceTitle: string;
  timestamp: string;
  importedAt: string;
  metadata: Record<string, unknown> & { pinned?: boolean };
  layers?: Record<string, unknown>;
  score?: number;
  pinned?: boolean;
  tags?: TagData[];
}

interface SearchResultRecord {
  id?: string;
  memoryId?: string;
  content?: string;
  sourceType?: string;
  sourceTitle?: string;
  createdAt?: string;
  metadata?: (Record<string, unknown> & { pinned?: boolean }) | undefined;
  layers?: Record<string, unknown>;
  score?: number;
  tags?: TagData[];
}

interface SearchResponse {
  results?: SearchResultRecord[];
  totalResults?: number;
  layers?: { bm25: number; vector: number; tree: number } | null;
}

interface MemoryRecord {
  id: string;
  content: string;
  source?: string;
  sourceId?: string;
  sourceTitle?: string;
  timestamp?: string;
  importedAt?: string;
  metadata?: Record<string, unknown>;
  layers?: Record<string, unknown>;
  score?: number;
  pinned?: boolean;
  tags?: TagData[];
}

interface MemoryListResponse {
  memories?: MemoryRecord[];
  total?: number;
}

interface Source {
  id: string;
  type: string;
  title: string;
  itemCount: number;
}

// Tag color utility
const TAG_COLOR_MAP: Record<string, string> = {
  teal:    'text-teal-400 bg-teal-500/10 border-teal-500/15',
  sky:     'text-sky-400 bg-sky-500/10 border-sky-500/15',
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/15',
  amber:   'text-amber-400 bg-amber-500/10 border-amber-500/15',
  red:     'text-red-400 bg-red-500/10 border-red-500/15',
  blue:    'text-blue-400 bg-blue-500/10 border-blue-500/15',
  orange:  'text-orange-400 bg-orange-500/10 border-orange-500/15',
  zinc:    'text-zinc-400 bg-zinc-500/10 border-zinc-500/15',
};

function tagColorClasses(color: string): string {
  return TAG_COLOR_MAP[color] || TAG_COLOR_MAP.teal;
}

function tagDotColor(color: string): string {
  const m: Record<string, string> = {
    teal: 'bg-teal-400', sky: 'bg-sky-400', emerald: 'bg-emerald-400',
    amber: 'bg-amber-400', red: 'bg-red-400', blue: 'bg-blue-400',
    orange: 'bg-orange-400', zinc: 'bg-zinc-400',
  };
  return m[color] || m.teal;
}

const SORT_OPTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "newest", label: "Newest first", icon: ArrowDownNarrowWide },
  { id: "oldest", label: "Oldest first", icon: ArrowUpNarrowWide },
  { id: "alpha-asc", label: "Title A → Z", icon: ArrowDownAZ },
  { id: "alpha-desc", label: "Title Z → A", icon: ArrowUpAZ },
  { id: "longest", label: "Longest first", icon: AlignLeft },
  { id: "shortest", label: "Shortest first", icon: AlignRight },
];

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function toMemory(record: SearchResultRecord | MemoryRecord): Memory {
  const id: string = (("memoryId" in record ? record.memoryId : record.id) ?? record.id ?? "");
  const metadata = ("metadata" in record && record.metadata ? record.metadata : {}) as Record<string, unknown> & {
    pinned?: boolean;
  };
  const source =
    ("sourceType" in record && typeof record.sourceType === "string")
      ? record.sourceType
      : (("source" in record && typeof record.source === "string") ? record.source : "text");
  const timestamp =
    ("createdAt" in record && typeof record.createdAt === "string")
      ? record.createdAt
      : (("timestamp" in record && typeof record.timestamp === "string") ? record.timestamp : new Date().toISOString());
  const importedAt =
    (("importedAt" in record && typeof record.importedAt === "string") ? record.importedAt : undefined) ??
    (("createdAt" in record && typeof record.createdAt === "string")
      ? record.createdAt
      : (("timestamp" in record && typeof record.timestamp === "string") ? record.timestamp : undefined)) ??
    timestamp;

  return {
    id,
    content: record.content ?? "",
    source,
    sourceId: "sourceId" in record ? (record.sourceId ?? "") : "",
    sourceTitle: record.sourceTitle ?? "",
    timestamp,
    importedAt,
    metadata,
    layers: record.layers ?? {},
    score: record.score ?? 0,
    pinned: "pinned" in record ? Boolean(record.pinned) : metadata.pinned === true,
    tags: record.tags ?? [],
  };
}

export default function ExplorePage() {
  usePageTitle("Explore");
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [sources, setSources] = useState<Source[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [totalMemories, setTotalMemories] = useState(0);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [filter, setFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("newest");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Memory | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const [copied, setCopied] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  // View mode state
  const [viewMode, setViewMode] = useState<"list" | "compact">("list");

  // Infinite scroll state
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchLayers, setSearchLayers] = useState<{ bm25: number; vector: number; tree: number } | null>(null);
  const [searchDurationMs, setSearchDurationMs] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Tags state ──────────────────
  const [allTags, setAllTags] = useState<TagData[]>([]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);
  const [tagAssignOpen, setTagAssignOpen] = useState(false);
  const [batchTagMenuOpen, setBatchTagMenuOpen] = useState(false);

  // Saved searches
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedSearchMenuOpen, setSavedSearchMenuOpen] = useState(false);
  const [saveSearchDialogOpen, setSaveSearchDialogOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [saveSearchColor, setSaveSearchColor] = useState<SavedSearch['color']>('teal');
  const [activeSavedSearchId, setActiveSavedSearchId] = useState<string | null>(null);

  // Load saved searches on mount
  useEffect(() => {
    setSavedSearches(getSavedSearches());
  }, []);

  const handleSaveSearch = useCallback(() => {
    if (!saveSearchName.trim()) return;
    const ss = createSavedSearch({
      name: saveSearchName.trim(),
      query: search,
      sourceFilter: filter,
      tagFilter: tagFilter,
      sortBy,
      color: saveSearchColor,
    });
    setSavedSearches(getSavedSearches());
    setSaveSearchDialogOpen(false);
    setSaveSearchName('');
    setActiveSavedSearchId(ss.id);
    toast.success(`Saved "${ss.name}"`);
  }, [saveSearchName, search, filter, tagFilter, sortBy, saveSearchColor]);

  const handleApplySavedSearch = useCallback((ss: SavedSearch) => {
    applySavedSearch(ss.id);
    setSearch(ss.query);
    setFilter(ss.sourceFilter);
    setTagFilter(ss.tagFilter);
    setSortBy(ss.sortBy);
    setActiveSavedSearchId(ss.id);
    setSavedSearchMenuOpen(false);
    setSavedSearches(getSavedSearches());
    toast.success(`Applied "${ss.name}"`);
  }, []);

  const handleDeleteSavedSearch = useCallback((id: string, name: string) => {
    deleteSavedSearch(id);
    if (activeSavedSearchId === id) setActiveSavedSearchId(null);
    setSavedSearches(getSavedSearches());
    toast.success(`Deleted "${name}"`);
  }, [activeSavedSearchId]);

  const handleTogglePinSavedSearch = useCallback((id: string) => {
    togglePinSavedSearch(id);
    setSavedSearches(getSavedSearches());
  }, []);

  // Check if current search matches a saved search
  const currentMatchesSaved = findMatchingSavedSearch({ query: search, sourceFilter: filter, tagFilter, sortBy });
  const hasActiveFilters = search || filter || tagFilter || sortBy !== 'newest';

  // Derive unique source types from actual data
  const sourceTypeCounts = useMemo(() => {
    return sources.reduce((acc, s) => {
      acc[s.type] = (acc[s.type] || 0) + s.itemCount;
      return acc;
    }, {} as Record<string, number>);
  }, [sources]);

  const activeSourceTypes = useMemo(() => {
    return Object.entries(sourceTypeCounts)
      .filter(([, count]) => count > 0)
      .sort(([, leftCount], [, rightCount]) => rightCount - leftCount);
  }, [sourceTypeCounts]);

  // Navigate to adjacent memory in detail view
  const navigateMemory = useCallback((direction: 'prev' | 'next') => {
    if (!selected || memories.length === 0) return;
    const currentIdx = selectedIndex >= 0 ? selectedIndex : memories.findIndex(m => m.id === selected.id);
    const nextIdx = direction === 'next'
      ? Math.min(currentIdx + 1, memories.length - 1)
      : Math.max(currentIdx - 1, 0);
    if (nextIdx !== currentIdx && memories[nextIdx]) {
      setSelected(memories[nextIdx]);
      setSelectedIndex(nextIdx);
      setFocusedIndex(nextIdx);
      setCopied(false);
      setEditing(false);
      setEditContent("");
      setEditTitle("");
    }
  }, [selected, selectedIndex, memories]);

  // Ask about this memory in chat
  const askAboutMemory = useCallback((memory: Memory) => {
    const snippet = memory.content.slice(0, 300);
    const query = encodeURIComponent(`Tell me more about this from my knowledge: "${snippet}${memory.content.length > 300 ? '…' : ''}"`);
    router.push(`/app/chat?q=${query}`);
  }, [router]);

  // ── Multi-select helpers ──────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(memories.map(m => m.id)));
  }, [memories]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} memor${count === 1 ? 'y' : 'ies'}? This can't be undone.`)) return;
    setBatchDeleting(true);
    let deleted = 0;
    const ids = Array.from(selectedIds);
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map(id => fetch(`/api/v1/memories?id=${id}`, { method: 'DELETE' }))
      );
      deleted += results.filter(r => r.status === 'fulfilled').length;
    }
    setMemories(prev => prev.filter(m => !selectedIds.has(m.id)));
    setTotalMemories(prev => prev - deleted);
    exitSelectMode();
    setBatchDeleting(false);
    toast.success(`Deleted ${deleted} memor${deleted === 1 ? 'y' : 'ies'}`);
  }, [selectedIds, exitSelectMode]);

  const handleBatchExport = useCallback(() => {
    if (selectedIds.size === 0) return;
    const sel = memories.filter(m => selectedIds.has(m.id));
    const md = sel.map(m => {
      const date = new Date(m.timestamp).toLocaleDateString();
      return `## ${m.sourceTitle || 'Untitled'}\n*${m.source} · ${date}*\n\n${m.content}`;
    }).join('\n\n---\n\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mindstore-export-${selectedIds.size}-memories.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Exported ${selectedIds.size} memor${selectedIds.size === 1 ? 'y' : 'ies'}`);
  }, [selectedIds, memories]);

  const handleBatchCopy = useCallback(() => {
    if (selectedIds.size === 0) return;
    const sel = memories.filter(m => selectedIds.has(m.id));
    const text = sel.map(m => {
      return `[${m.source}] ${m.sourceTitle || 'Untitled'}\n${m.content}`;
    }).join('\n\n---\n\n');
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`Copied ${selectedIds.size} memor${selectedIds.size === 1 ? 'y' : 'ies'} to clipboard`);
    });
  }, [selectedIds, memories]);

  // ── Batch Pin/Unpin ──────────────────
  const [batchPinning, setBatchPinning] = useState(false);

  const handleBatchPin = useCallback(async (pinState: boolean) => {
    if (selectedIds.size === 0) return;
    setBatchPinning(true);
    let updated = 0;
    const ids = Array.from(selectedIds);
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map(id =>
          fetch('/api/v1/memories', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, pinned: pinState }),
          })
        )
      );
      updated += results.filter(r => r.status === 'fulfilled').length;
    }
    setMemories(prev => prev.map(m => selectedIds.has(m.id) ? { ...m, pinned: pinState } : m));
    setBatchPinning(false);
    toast.success(`${pinState ? 'Pinned' : 'Unpinned'} ${updated} memor${updated === 1 ? 'y' : 'ies'}`);
  }, [selectedIds]);

  // ── Edit memory ──────────────────
  const startEditing = useCallback(() => {
    if (!selected) return;
    setEditContent(selected.content);
    setEditTitle(selected.sourceTitle);
    setEditing(true);
    setTimeout(() => editTextareaRef.current?.focus(), 50);
  }, [selected]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setEditContent("");
    setEditTitle("");
  }, []);

  const saveEdit = useCallback(async () => {
    if (!selected || saving) return;
    const trimmedContent = editContent.trim();
    const trimmedTitle = editTitle.trim();
    if (!trimmedContent) { toast.error("Content can't be empty"); return; }

    const contentChanged = trimmedContent !== selected.content;
    const titleChanged = trimmedTitle !== (selected.sourceTitle || '');
    if (!contentChanged && !titleChanged) { setEditing(false); return; }

    setSaving(true);
    try {
      const body: { id: string; content?: string; title?: string } = { id: selected.id };
      if (contentChanged) body.content = trimmedContent;
      if (titleChanged) body.title = trimmedTitle;

      const res = await fetch('/api/v1/memories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Update failed');
      }

      const updatedMemory = { ...selected, content: trimmedContent, sourceTitle: trimmedTitle };
      setSelected(updatedMemory);
      setMemories(prev => prev.map(m => m.id === selected.id ? updatedMemory : m));
      setEditing(false);
      toast.success("Memory updated" + (contentChanged ? " · embedding refreshed" : ""));
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to save"));
    }
    setSaving(false);
  }, [selected, editContent, editTitle, saving]);

  // ── Pin/Unpin memory ──────────────────
  const [pinning, setPinning] = useState(false);

  // Related memories state
  const [relatedMemories, setRelatedMemories] = useState<Array<{ id: string; title: string; type: string; score: number; preview: string }>>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const relatedAbortRef = useRef<AbortController | null>(null);

  const togglePin = useCallback(async (memory: Memory) => {
    if (pinning) return;
    setPinning(true);
    const newPinned = !memory.pinned;
    try {
      const res = await fetch('/api/v1/memories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: memory.id, pinned: newPinned }),
      });
      if (!res.ok) throw new Error('Failed to update');
      const updatedMemory = { ...memory, pinned: newPinned, metadata: { ...memory.metadata, pinned: newPinned || undefined } };
      if (!newPinned) delete updatedMemory.metadata.pinned;
      setMemories(prev => prev.map(m => m.id === memory.id ? { ...m, pinned: newPinned } : m));
      if (selected?.id === memory.id) {
        setSelected({ ...selected, pinned: newPinned });
      }
      toast.success(newPinned ? "Pinned to top" : "Unpinned");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to pin"));
    }
    setPinning(false);
  }, [pinning, selected]);

  // Fetch related memories when detail view opens
  useEffect(() => {
    if (!selected) {
      setRelatedMemories([]);
      setRelatedLoading(false);
      return;
    }

    if (relatedAbortRef.current) relatedAbortRef.current.abort();
    const controller = new AbortController();
    relatedAbortRef.current = controller;

    setRelatedLoading(true);
    setRelatedMemories([]);

    const searchQuery = (selected.sourceTitle ? selected.sourceTitle + " " : "") +
      selected.content.slice(0, 200).replace(/\n/g, " ");

    fetch(`/api/v1/search?q=${encodeURIComponent(searchQuery)}&limit=6`, { signal: controller.signal })
      .then(r => r.json())
      .then((data: SearchResponse) => {
        if (controller.signal.aborted) return;
        const results = (data.results || [])
          .filter((result) => (result.id ?? result.memoryId) !== selected.id)
          .slice(0, 4)
          .map((result) => ({
            id: result.id ?? result.memoryId ?? "",
            title: result.sourceTitle || "Untitled",
            type: result.sourceType || "text",
            score: result.score || 0,
            preview: (result.content || "").slice(0, 100).replace(/\n/g, " ").trim(),
          }));
        setRelatedMemories(results);
        setRelatedLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setRelatedLoading(false);
        }
      });

    return () => controller.abort();
  }, [selected]);

  // Close tag dropdowns when selected memory changes
  useEffect(() => {
    setTagAssignOpen(false);
  }, [selected?.id]);

  // Navigate to a related memory
  const openRelatedMemory = useCallback((relatedId: string) => {
    const mem = memories.find(m => m.id === relatedId);
    if (mem) {
      const idx = memories.indexOf(mem);
      setSelected(mem);
      setSelectedIndex(idx);
      setFocusedIndex(idx);
      setCopied(false);
      setEditing(false);
      setEditContent("");
      setEditTitle("");
    } else {
      fetch(`/api/v1/memories?limit=2000`)
        .then(r => r.json())
        .then((data: MemoryListResponse) => {
          const found = (data.memories || []).find((memory) => memory.id === relatedId);
          if (found) {
            const m = toMemory(found);
            setSelected(m);
            setSelectedIndex(-1);
            setCopied(false);
            setEditing(false);
          } else {
            toast.error("Memory not found");
          }
        })
        .catch(() => toast.error("Could not load memory"));
    }
  }, [memories]);

  // Keyboard: j/k to navigate list, Enter to open, Escape to close, ↑↓ in modal
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const isInput = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";

      // ─── Detail modal open ───
      if (selected) {
        if (e.key === "Escape") {
          if (editing) {
            cancelEditing();
          } else {
            setSelected(null);
            setCopied(false);
            setEditing(false);
          }
          return;
        }
        if (e.key === "e" && !editing && !isInput) {
          e.preventDefault();
          startEditing();
          return;
        }
        if (e.key === "p" && !editing && !isInput) {
          e.preventDefault();
          togglePin(selected);
          return;
        }
        if ((e.key === "j" || e.key === "ArrowDown") && !isInput && !editing) {
          e.preventDefault();
          navigateMemory('next');
          return;
        }
        if ((e.key === "k" || e.key === "ArrowUp") && !isInput && !editing) {
          e.preventDefault();
          navigateMemory('prev');
          return;
        }
        return;
      }

      // ─── List view ───
      if (e.key === "/" && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Cmd/Ctrl+K focuses search (like Linear, Raycast)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === "Escape" && selectMode) {
        e.preventDefault();
        exitSelectMode();
        return;
      }

      // Escape blurs search input
      if (e.key === "Escape" && isInput) {
        (document.activeElement as HTMLElement)?.blur();
        return;
      }

      if (e.key === "s" && !isInput && !selectMode) {
        e.preventDefault();
        setSelectMode(true);
        return;
      }

      if (e.key === " " && !isInput && selectMode && focusedIndex >= 0 && memories[focusedIndex]) {
        e.preventDefault();
        toggleSelect(memories[focusedIndex].id);
        return;
      }

      if (e.key === "a" && !isInput && selectMode && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (selectedIds.size === memories.length) deselectAll();
        else selectAll();
        return;
      }

      if ((e.key === "j" || e.key === "ArrowDown") && !isInput) {
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = Math.min(prev + 1, memories.length - 1);
          const el = listRef.current?.children[next] as HTMLElement;
          el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return next;
        });
        return;
      }
      if ((e.key === "k" || e.key === "ArrowUp") && !isInput) {
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = Math.max(prev - 1, 0);
          const el = listRef.current?.children[next] as HTMLElement;
          el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return next;
        });
        return;
      }

      if (e.key === "Enter" && !isInput && focusedIndex >= 0 && memories[focusedIndex]) {
        e.preventDefault();
        setSelected(memories[focusedIndex]);
        setSelectedIndex(focusedIndex);
        setCopied(false);
        return;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selected, focusedIndex, memories, navigateMemory, selectMode, selectedIds, exitSelectMode, toggleSelect, selectAll, deselectAll, editing, startEditing, cancelEditing, togglePin]);

  // Reset focused index when memories change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [search, filter, sortBy, tagFilter]);

  // Sync search query to URL
  useEffect(() => {
    const url = new URL(window.location.href);
    if (search.trim()) {
      url.searchParams.set("q", search.trim());
    } else {
      url.searchParams.delete("q");
    }
    if (url.toString() !== window.location.href) {
      window.history.replaceState(null, "", url.toString());
    }
  }, [search]);

  const handleCopy = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, []);

  async function deleteMemory(id: string) {
    if (!confirm("Delete this memory? This can't be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/memories?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setMemories(prev => prev.filter(m => m.id !== id));
      setTotalMemories(prev => prev - 1);
      setSelected(null);
      setCopied(false);
      setEditing(false);
      toast.success("Memory deleted");
    } catch {
      toast.error("Failed to delete memory");
    }
    setDeleting(false);
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/sources').then(r => r.json()),
      fetch('/api/v1/memories?limit=100&sort=newest').then(r => r.json()),
      fetch('/api/v1/tags').then(r => r.json()).catch(() => ({ tags: [] })),
    ]).then(([srcData, memData, tagData]) => {
      setSources(srcData.sources || []);
      setMemories(memData.memories || []);
      setTotalMemories(memData.total || 0);
      setAllTags(tagData.tags || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search) {
        const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        const p = new URLSearchParams({ q: search, limit: '100' });
        if (filter && filter !== 'pinned') p.set('source', filter);
        fetch(`/api/v1/search?${p}`).then(r => r.json()).then((d: SearchResponse) => {
          const results = (d.results || []).map(toMemory);
          setMemories(results);
          setTotalMemories(d.totalResults || results.length);
          setSearchLayers(d.layers || null);
          const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
          setSearchDurationMs(Math.max(1, endedAt - startedAt));
          addSearchToHistory(search, results.length);
        }).catch(() => {});
      } else {
        setSearchLayers(null);
        setSearchDurationMs(null);
        const p = new URLSearchParams({ limit: '100', sort: sortBy });
        if (filter && filter !== 'pinned') p.set('source', filter);
        if (filter === 'pinned') p.set('pinned', 'true');
        if (tagFilter) p.set('tagId', tagFilter);
        fetch(`/api/v1/memories?${p}`).then(r => r.json()).then(d => {
          setMemories(d.memories || []);
          setTotalMemories(d.total || 0);
        }).catch(() => {});
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search, filter, sortBy, tagFilter]);

  // ── Infinite scroll ──────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || memories.length >= totalMemories || search) return;
    setLoadingMore(true);
    try {
      const p = new URLSearchParams({ limit: '100', offset: String(memories.length), sort: sortBy });
      if (filter && filter !== 'pinned') p.set('source', filter);
      if (filter === 'pinned') p.set('pinned', 'true');
      if (tagFilter) p.set('tagId', tagFilter);
      const res = await fetch(`/api/v1/memories?${p}`);
      const d = await res.json();
      setMemories(prev => [...prev, ...(d.memories || [])]);
    } catch { /* ignore */ }
    setLoadingMore(false);
  }, [loadingMore, memories.length, totalMemories, search, filter, sortBy, tagFilter]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore && memories.length < totalMemories && !search) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, loadingMore, memories.length, totalMemories, search]);

  // ── Tag helpers ──────────────────
  const refreshTags = useCallback(async () => {
    try {
      const r = await fetch('/api/v1/tags');
      const d = await r.json();
      setAllTags(d.tags || []);
    } catch { /* ignore */ }
  }, []);

  const createTag = useCallback(async (name: string, color?: string) => {
    if (!name.trim()) return null;
    setCreatingTag(true);
    try {
      const res = await fetch('/api/v1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color: color || 'teal' }),
      });
      const data = await res.json();
      if (data.tag) {
        if (!data.existed) {
          toast.success(`Tag "${data.tag.name}" created`);
        }
        await refreshTags();
        setNewTagName('');
        return data.tag;
      }
      if (data.error) toast.error(data.error);
      return null;
    } catch { toast.error('Failed to create tag'); return null; }
    finally { setCreatingTag(false); }
  }, [refreshTags]);

  const assignTag = useCallback(async (tagId: string, memoryIds: string[]) => {
    try {
      const res = await fetch('/api/v1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign', tagId, memoryIds }),
      });
      const data = await res.json();
      if (data.ok) {
        const tag = allTags.find(t => t.id === tagId);
        if (tag) {
          setMemories(prev => prev.map(m =>
            memoryIds.includes(m.id) && !m.tags?.some(t => t.id === tagId)
              ? { ...m, tags: [...(m.tags || []), tag] }
              : m
          ));
          if (selected && memoryIds.includes(selected.id)) {
            setSelected(prev => prev ? {
              ...prev,
              tags: [...(prev.tags || []), tag].filter((t, i, arr) => arr.findIndex(a => a.id === t.id) === i),
            } : null);
          }
        }
        await refreshTags();
        toast.success(`Tagged ${memoryIds.length} memor${memoryIds.length === 1 ? 'y' : 'ies'}`);
      }
    } catch { toast.error('Failed to tag'); }
  }, [allTags, selected, refreshTags]);

  const unassignTag = useCallback(async (tagId: string, memoryIds: string[]) => {
    try {
      await fetch('/api/v1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unassign', tagId, memoryIds }),
      });
      setMemories(prev => prev.map(m =>
        memoryIds.includes(m.id)
          ? { ...m, tags: (m.tags || []).filter(t => t.id !== tagId) }
          : m
      ));
      if (selected && memoryIds.includes(selected.id)) {
        setSelected(prev => prev ? {
          ...prev,
          tags: (prev.tags || []).filter(t => t.id !== tagId),
        } : null);
      }
      await refreshTags();
      toast.success('Tag removed');
    } catch { toast.error('Failed to remove tag'); }
  }, [selected, refreshTags]);

  const handleBatchTag = useCallback(async (tagId: string) => {
    if (selectedIds.size === 0) return;
    await assignTag(tagId, Array.from(selectedIds));
    setBatchTagMenuOpen(false);
  }, [selectedIds, assignTag]);

  return (
    <PageTransition className="space-y-6">
      {/* ═══ Header ═══ */}
      <Stagger>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[22px] md:text-[28px] font-semibold tracking-[-0.03em]">Explore</h1>
            <p className="text-[13px] text-zinc-500 mt-1">
              {loading ? (
                <span className="inline-block w-32 h-4 bg-white/[0.04] rounded animate-pulse" />
              ) : (
                <>{totalMemories.toLocaleString()} memories · {sources.length} source{sources.length !== 1 ? 's' : ''}</>
              )}
            </p>
          </div>
          {memories.length > 0 && (
            <button
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-medium transition-all active:scale-[0.96] ${
                selectMode
                  ? "text-teal-300 bg-teal-500/10 border border-teal-500/20"
                  : "text-zinc-500 hover:text-zinc-300 border border-white/[0.06] hover:bg-white/[0.04]"
              }`}
              title={selectMode ? "Exit select mode (Esc)" : "Select memories (s)"}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{selectMode ? "Cancel" : "Select"}</span>
            </button>
          )}
        </div>
      </Stagger>

      {/* ═══ Saved Search Pills ═══ */}
      {savedSearches.length > 0 && (
        <Stagger>
          <SavedSearchPills
            searches={savedSearches}
            activeId={activeSavedSearchId}
            onApply={handleApplySavedSearch}
            onDelete={handleDeleteSavedSearch}
          />
        </Stagger>
      )}

      {/* ═══ Search ═══ */}
      <Stagger>
        <div className="relative group/search">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-zinc-600 transition-colors group-focus-within/search:text-teal-400" />
          <input
            ref={searchInputRef}
            placeholder="Search your knowledge…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setActiveSavedSearchId(null); }}
            className="w-full h-11 pl-11 pr-28 sm:pr-32 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-[14px] placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-500/30 focus:border-teal-500/20 focus:bg-white/[0.04] transition-all"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {/* Saved searches toggle */}
            {savedSearches.length > 0 && (
              <button
                onClick={() => setSavedSearchMenuOpen(!savedSearchMenuOpen)}
                className={`p-1.5 rounded-lg transition-all ${
                  savedSearchMenuOpen || activeSavedSearchId
                    ? 'text-teal-400 bg-teal-500/10'
                    : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.06]'
                }`}
                title="Saved searches"
                aria-label="Saved searches"
              >
                <Star className="w-3.5 h-3.5" />
              </button>
            )}
            {/* Save current search */}
            {hasActiveFilters && !currentMatchesSaved && (
              <button
                onClick={() => { setSaveSearchDialogOpen(true); setSaveSearchName(search || 'My search'); }}
                className="p-1.5 rounded-lg text-zinc-600 hover:text-teal-400 hover:bg-teal-500/10 transition-all"
                title="Save this search"
                aria-label="Save this search"
              >
                <Bookmark className="w-3.5 h-3.5" />
              </button>
            )}
            {search ? (
              <button onClick={() => { setSearch(""); setActiveSavedSearchId(null); }} className="p-1 rounded-md hover:bg-white/[0.06] transition-colors">
                <X className="w-3.5 h-3.5 text-zinc-500" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[11px] font-mono text-zinc-600 bg-white/[0.04] border border-white/[0.08] rounded-md px-1.5 py-[2px]">
                <Command className="w-2.5 h-2.5" />K
              </kbd>
            )}
          </div>
        </div>

        {/* Saved Searches Dropdown */}
        {savedSearchMenuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setSavedSearchMenuOpen(false)} />
            <div className="relative z-30 mt-2 rounded-2xl border border-white/[0.08] bg-[#131315] shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Saved Searches</span>
                <span className="text-[10px] text-zinc-600">{savedSearches.length} saved</span>
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {savedSearches.map((ss) => {
                  const colors: Record<string, string> = {
                    teal: 'text-teal-400', sky: 'text-sky-400', emerald: 'text-emerald-400',
                    amber: 'text-amber-400', red: 'text-red-400', blue: 'text-blue-400',
                  };
                  return (
                    <div
                      key={ss.id}
                      className={`group flex items-center gap-2.5 px-4 py-2.5 hover:bg-white/[0.04] transition-colors cursor-pointer ${
                        activeSavedSearchId === ss.id ? 'bg-teal-500/[0.06]' : ''
                      }`}
                      onClick={() => handleApplySavedSearch(ss)}
                    >
                      <Star className={`w-3.5 h-3.5 shrink-0 ${ss.pinned ? 'fill-current' : ''} ${colors[ss.color] || colors.teal}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-zinc-200 truncate">{ss.name}</p>
                        <p className="text-[10px] text-zinc-600 truncate">{describeSavedSearch(ss)}</p>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleTogglePinSavedSearch(ss.id); }}
                          className="p-1 rounded-md hover:bg-white/[0.08] transition-colors"
                          title={ss.pinned ? 'Unpin' : 'Pin'}
                        >
                          <Pin className={`w-2.5 h-2.5 ${ss.pinned ? 'text-amber-400 fill-amber-400/30' : 'text-zinc-600'}`} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSavedSearch(ss.id, ss.name); }}
                          className="p-1 rounded-md hover:bg-red-500/10 transition-colors"
                          title="Delete"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-2.5 h-2.5 text-zinc-600 hover:text-red-400" />
                        </button>
                      </div>
                      {ss.useCount > 0 && (
                        <span className="text-[9px] text-zinc-700 tabular-nums shrink-0">{ss.useCount}×</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Save Search Dialog */}
        {saveSearchDialogOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setSaveSearchDialogOpen(false)} />
            <div className="relative z-30 mt-2 rounded-2xl border border-white/[0.08] bg-[#131315] shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 p-4">
              <h3 className="text-[13px] font-medium text-zinc-200 mb-3">Save this search</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={saveSearchName}
                  onChange={(e) => setSaveSearchName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveSearch(); if (e.key === 'Escape') setSaveSearchDialogOpen(false); }}
                  placeholder="Search name..."
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30 transition-all"
                  autoFocus
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-zinc-600 mr-1">Color:</span>
                  {(['teal', 'sky', 'emerald', 'amber', 'red', 'blue'] as const).map(c => (
                    <button
                      key={c}
                      onClick={() => setSaveSearchColor(c)}
                      className={`w-5 h-5 rounded-full transition-all ${
                        saveSearchColor === c ? 'ring-2 ring-offset-1 ring-offset-[#131315]' : ''
                      } ${
                        c === 'teal' ? 'bg-teal-500 ring-teal-400' :
                        c === 'sky' ? 'bg-sky-500 ring-sky-400' :
                        c === 'emerald' ? 'bg-emerald-500 ring-emerald-400' :
                        c === 'amber' ? 'bg-amber-500 ring-amber-400' :
                        c === 'red' ? 'bg-red-500 ring-red-400' :
                        'bg-blue-500 ring-blue-400'
                      }`}
                    />
                  ))}
                </div>
                <div className="text-[10px] text-zinc-600 space-y-0.5">
                  {search && <p>Query: &ldquo;{search}&rdquo;</p>}
                  {filter && <p>Source: {filter}</p>}
                  {tagFilter && <p>Tag: {tagFilter}</p>}
                  {sortBy !== 'newest' && <p>Sort: {sortBy}</p>}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setSaveSearchDialogOpen(false)}
                    className="h-8 px-3 rounded-xl text-[12px] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveSearch}
                    disabled={!saveSearchName.trim()}
                    className="h-8 px-4 rounded-xl text-[12px] font-medium text-black bg-teal-500 hover:bg-teal-400 transition-all disabled:opacity-50 active:scale-[0.97]"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Active saved search indicator */}
        {activeSavedSearchId && (() => {
          const active = savedSearches.find(s => s.id === activeSavedSearchId);
          if (!active) return null;
          const colors: Record<string, string> = {
            teal: 'border-teal-500/20 bg-teal-500/[0.06] text-teal-400',
            sky: 'border-sky-500/20 bg-sky-500/[0.06] text-sky-400',
            emerald: 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400',
            amber: 'border-amber-500/20 bg-amber-500/[0.06] text-amber-400',
            red: 'border-red-500/20 bg-red-500/[0.06] text-red-400',
            blue: 'border-blue-500/20 bg-blue-500/[0.06] text-blue-400',
          };
          return (
            <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-xl border ${colors[active.color] || colors.teal}`}>
              <Star className="w-3 h-3 fill-current" />
              <span className="text-[11px] font-medium">{active.name}</span>
              <button
                onClick={() => { setActiveSavedSearchId(null); setSearch(''); setFilter(null); setTagFilter(null); setSortBy('newest'); }}
                className="ml-auto p-0.5 hover:bg-white/[0.08] rounded transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })()}
      </Stagger>

      {/* ═══ Filters + View + Sort ═══ */}
      <Stagger>
        <div className="flex items-center justify-between gap-3">
          {/* Filter pills with overflow fade */}
          <div className="relative flex-1 min-w-0">
            <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
              <FilterPill active={filter === null && !tagFilter} onClick={() => { setFilter(null); setTagFilter(null); }} label="All" />
              <FilterPill
                active={filter === "pinned"}
                onClick={() => setFilter(filter === "pinned" ? null : "pinned")}
                label="Pinned"
                icon={<Pin className="w-3 h-3" />}
              />
              {activeSourceTypes.map(([type, count]) => {
                const cfg = getSourceType(type);
                const Icon = cfg.icon;
                return <FilterPill key={type} active={filter === type} onClick={() => setFilter(filter === type ? null : type)} label={type} count={count} icon={<Icon className="w-3 h-3" />} />;
              })}
              {/* Tag filter pills */}
              {allTags.length > 0 && (
                <>
                  <div className="w-px h-5 bg-white/[0.08] shrink-0 my-auto" />
                  {allTags.map(tag => (
                    <FilterPill
                      key={`tag-${tag.id}`}
                      active={tagFilter === tag.id}
                      onClick={() => setTagFilter(tagFilter === tag.id ? null : tag.id)}
                      label={tag.name}
                      count={tag.memory_count}
                      icon={<Tag className="w-3 h-3" />}
                      tagColor={tag.color}
                    />
                  ))}
                </>
              )}
            </div>
            {/* Right fade for overflow indication */}
            <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-[#0a0a0b] to-transparent pointer-events-none sm:hidden" />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* View Mode Toggle */}
            {memories.length > 0 && (
              <div className="hidden sm:flex items-center bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 transition-all ${
                    viewMode === "list"
                      ? "bg-teal-500/15 text-teal-300"
                      : "text-zinc-600 hover:text-zinc-400"
                  }`}
                  title="List view"
                  aria-label="List view"
                >
                  <LayoutList className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("compact")}
                  className={`p-1.5 transition-all ${
                    viewMode === "compact"
                      ? "bg-teal-500/15 text-teal-300"
                      : "text-zinc-600 hover:text-zinc-400"
                  }`}
                  title="Compact view"
                  aria-label="Compact view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Sort Dropdown */}
            {!search.trim() && memories.length > 0 && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setSortMenuOpen(!sortMenuOpen)}
                  className={`flex items-center gap-1.5 h-8 px-3 rounded-xl text-[11px] font-medium transition-all active:scale-[0.95] ${
                    sortMenuOpen
                      ? "bg-teal-500/15 text-teal-300 border border-teal-500/25"
                      : "text-zinc-500 border border-white/[0.06] hover:bg-white/[0.04] hover:text-zinc-300"
                  }`}
                >
                  <ArrowUpDown className="w-3 h-3" />
                  <span className="hidden sm:inline">{SORT_OPTIONS.find(s => s.id === sortBy)?.label || 'Sort'}</span>
                </button>

                {sortMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setSortMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 z-40 w-48 bg-[#131315] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                      <div className="py-1">
                        {SORT_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => { setSortBy(opt.id); setSortMenuOpen(false); }}
                            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-[12px] transition-colors ${
                              sortBy === opt.id
                                ? "text-teal-300 bg-teal-500/10"
                                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                            }`}
                          >
                            <opt.icon className={`w-3.5 h-3.5 shrink-0 ${sortBy === opt.id ? "text-teal-400" : "text-zinc-600"}`} />
                            <span className="flex-1">{opt.label}</span>
                            {sortBy === opt.id && (
                              <div className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </Stagger>

      {/* ═══ Search Stats + Did You Mean ═══ */}
      {search.trim() && !loading && (
        <Stagger>
          <SearchStats
            resultCount={memories.length}
            durationMs={searchDurationMs}
            layers={searchLayers}
          />
          <DidYouMean
            query={search}
            resultCount={memories.length}
            onSuggestionClick={(term: string) => setSearch(term)}
          />
          {searchLayers && searchLayers.bm25 > 0 && !searchLayers.vector && !searchLayers.tree && (
            <Link href="/app/settings" className="text-[10px] text-zinc-600 hover:text-teal-400 transition-colors italic mt-1 block">
              Connect AI for semantic search →
            </Link>
          )}
        </Stagger>
      )}

      {/* ═══ Selection Toolbar ═══ */}
      {selectMode && (
        <div className="sticky top-12 md:top-0 z-20 -mx-4 px-4 py-2.5 bg-[#0a0a0b]/90 backdrop-blur-xl border-b border-white/[0.06]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => selectedIds.size === memories.length ? deselectAll() : selectAll()}
                className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[11px] font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all active:scale-[0.96] shrink-0"
              >
                {selectedIds.size === memories.length ? (
                  <CheckSquare className="w-3.5 h-3.5 text-teal-400" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
                {selectedIds.size === memories.length ? "Deselect all" : "Select all"}
              </button>
              {selectedIds.size > 0 && (
                <span className="text-[11px] text-teal-400 font-medium tabular-nums shrink-0">
                  {selectedIds.size} selected
                </span>
              )}
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-1">
                {/* Batch tag */}
                <div className="relative">
                  <button
                    onClick={() => setBatchTagMenuOpen(!batchTagMenuOpen)}
                    className="flex items-center gap-1 h-8 px-2.5 rounded-xl text-[11px] font-medium text-teal-400 hover:text-teal-300 hover:bg-teal-500/10 transition-all active:scale-[0.96]"
                    title="Tag selected memories"
                    aria-label="Tag selected memories"
                  >
                    <Tag className="w-3 h-3" />
                    <span className="hidden sm:inline">Tag</span>
                  </button>
                  {batchTagMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setBatchTagMenuOpen(false)} />
                      <div className="absolute right-0 top-full mt-2 z-40 w-48 bg-[#131315] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        <div className="p-2.5 border-b border-white/[0.06]">
                          <input
                            placeholder="New tag…"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter' && newTagName.trim()) {
                                const tag = await createTag(newTagName);
                                if (tag) await handleBatchTag(tag.id);
                              }
                            }}
                            className="w-full h-8 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[12px] placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30 transition-all"
                            autoFocus
                          />
                        </div>
                        {allTags.length > 0 ? (
                          <div className="py-1 max-h-40 overflow-y-auto">
                            {allTags.map(tag => (
                              <button
                                key={tag.id}
                                onClick={() => handleBatchTag(tag.id)}
                                className="w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-white/[0.04] transition-colors"
                              >
                                <div className={`w-2 h-2 rounded-full ${tagDotColor(tag.color)}`} />
                                <span className="text-[12px] text-zinc-300">{tag.name}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="px-4 py-3 text-[11px] text-zinc-600 italic">Type to create a tag</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {/* Batch Pin/Unpin */}
                {(() => {
                  const selectedMems = memories.filter(m => selectedIds.has(m.id));
                  const allPinned = selectedMems.length > 0 && selectedMems.every(m => m.pinned);
                  return (
                    <button
                      onClick={() => handleBatchPin(!allPinned)}
                      disabled={batchPinning}
                      className="flex items-center gap-1 h-8 px-2.5 rounded-xl text-[11px] font-medium text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-all active:scale-[0.96] disabled:opacity-50"
                      title={allPinned ? "Unpin selected" : "Pin selected"}
                    >
                      {batchPinning ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : allPinned ? (
                        <PinOff className="w-3 h-3" />
                      ) : (
                        <Pin className="w-3 h-3" />
                      )}
                      <span className="hidden sm:inline">{allPinned ? "Unpin" : "Pin"}</span>
                    </button>
                  );
                })()}
                <button
                  onClick={handleBatchCopy}
                  className="flex items-center gap-1 h-8 px-2.5 rounded-xl text-[11px] font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all active:scale-[0.96]"
                  title="Copy selected"
                  aria-label="Copy selected memories"
                >
                  <Copy className="w-3 h-3" />
                  <span className="hidden sm:inline">Copy</span>
                </button>
                <button
                  onClick={handleBatchExport}
                  className="flex items-center gap-1 h-8 px-2.5 rounded-xl text-[11px] font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all active:scale-[0.96]"
                  title="Export selected as Markdown"
                  aria-label="Export selected memories as Markdown"
                >
                  <Download className="w-3 h-3" />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <button
                  onClick={handleBatchDelete}
                  disabled={batchDeleting}
                  className="flex items-center gap-1 h-8 px-2.5 rounded-xl text-[11px] font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all active:scale-[0.96] disabled:opacity-50"
                  title="Delete selected"
                  aria-label="Delete selected memories"
                >
                  {batchDeleting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                  <span className="hidden sm:inline">{batchDeleting ? "Deleting…" : "Delete"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Memory Cards — Using SearchResultCard ═══ */}
      <div ref={listRef} className={viewMode === "compact" ? "space-y-px" : "space-y-2"}>
        {memories.map((m, idx) => (
          <SearchResultCard
            key={m.id}
            id={m.id}
            content={m.content}
            source={m.source}
            sourceTitle={m.sourceTitle}
            timestamp={m.timestamp}
            score={m.score}
            pinned={m.pinned}
            tags={m.tags}
            layers={m.layers}
            query={search}
            isFocused={focusedIndex === idx}
            isSelected={selectedIds.has(m.id)}
            selectMode={selectMode}
            viewMode={viewMode}
            onClick={() => {
              if (selectMode) {
                toggleSelect(m.id);
              } else {
                setSelected(m); setSelectedIndex(idx); setFocusedIndex(idx); setCopied(false);
              }
            }}
          />
        ))}

        {/* DidYouMean — shown when search has few results */}
        {search.trim() && memories.length > 0 && memories.length <= 3 && !loading && (
          <DidYouMean
            query={search}
            resultCount={memories.length}
            onSuggestionClick={(term: string) => setSearch(term)}
          />
        )}
        {/* Infinite scroll sentinel */}
        {totalMemories > memories.length && !search && (
          <div ref={sentinelRef} className="flex items-center justify-center py-6">
            {loadingMore ? (
              <div className="flex items-center gap-2 text-[12px] text-zinc-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
                Loading more…
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
                <MoreHorizontal className="w-3.5 h-3.5" />
                {totalMemories - memories.length} more
              </div>
            )}
          </div>
        )}

        {/* ═══ Empty States ═══ */}
        {memories.length === 0 && !loading && (
          <>
            {totalMemories === 0 ? (
              <EmptyState
                icon={Compass}
                title="Your knowledge base is empty"
                description="Import your ChatGPT conversations, notes, or files to start exploring your mind."
                action={{ label: "Import your first memory", href: "/app/import" }}
                secondaryAction={{ label: "Try demo data", href: "/app?demo=true" }}
                color="teal"
              />
            ) : search.trim() ? (
              <div className="flex flex-col items-center justify-center text-center py-16">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-4">
                  <Search className="w-5 h-5 text-sky-400" />
                </div>
                <h2 className="text-[15px] font-semibold mb-1">No results for &ldquo;{search}&rdquo;</h2>
                <p className="text-[13px] text-zinc-500 max-w-sm mb-4">Try a different query, check your spelling, or remove some filters.</p>
                <DidYouMean
                  query={search}
                  resultCount={0}
                  onSuggestionClick={(term: string) => setSearch(term)}
                />
                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => setSearch("")}
                    className="h-8 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-[12px] font-medium text-white transition-all active:scale-[0.97]"
                  >
                    Clear search
                  </button>
                  {filter && (
                    <button
                      onClick={() => setFilter(null)}
                      className="h-8 px-4 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] text-[12px] text-zinc-400 font-medium transition-all active:scale-[0.97]"
                    >
                      Remove filter
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Search}
                title="No memories match this filter"
                description="Try adjusting your filter criteria or browse all memories."
                action={{ label: "View all", href: "/app/explore" }}
                color="sky"
                compact
              />
            )}
          </>
        )}

        {/* ═══ Keyboard Hints (desktop) ═══ */}
        {!loading && memories.length > 0 && (
          <div className="hidden md:flex items-center justify-center gap-4 pt-4 pb-2">
            <KbdHint keys={["j", "k"]} label="navigate" />
            <KbdHint keys={["↵"]} label="open" />
            <KbdHint keys={["/"]} label="search" />
            <KbdHint keys={["s"]} label={selectMode ? "select mode" : "select"} />
            {selectMode && (
              <>
                <KbdHint keys={["␣"]} label="toggle" />
                <KbdHint keys={["a"]} label="all" />
              </>
            )}
          </div>
        )}

        {/* ═══ Loading Skeleton ═══ */}
        {loading && memories.length === 0 && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02]" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-14 h-5 rounded-lg bg-white/[0.06] animate-pulse" />
                  <div className="flex-1 h-4 rounded-lg bg-white/[0.04] animate-pulse" />
                  <div className="w-12 h-3.5 rounded-lg bg-white/[0.03] animate-pulse" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 rounded-lg bg-white/[0.04] animate-pulse w-full" />
                  <div className="h-4 rounded-lg bg-white/[0.03] animate-pulse w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ Detail Bottom Sheet / Modal ═══ */}
      {selected && (
        <div
          className="fixed inset-0 z-[60]"
          onClick={() => { if (!editing) { setSelected(null); setCopied(false); setEditing(false); setTagAssignOpen(false); } }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-200" />
          <div
            className="absolute bottom-0 inset-x-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg bg-[#111113] border-t md:border border-white/[0.08] rounded-t-3xl md:rounded-3xl overflow-hidden animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-2 md:fade-in duration-200 shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile drag handle */}
            <div className="md:hidden flex justify-center pt-3 pb-1">
              <div className="w-8 h-1 rounded-full bg-white/[0.15]" />
            </div>

            {/* Header */}
            <div className="px-5 py-3 flex items-start justify-between border-b border-white/[0.06]">
              <div className="min-w-0 pr-3 flex-1">
                {editing ? (
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Title"
                    className="w-full text-[15px] font-semibold bg-transparent border-b border-teal-500/30 focus:border-teal-500/60 outline-none pb-0.5 transition-colors placeholder:text-zinc-600"
                  />
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-[15px] font-semibold truncate">{selected.sourceTitle}</h3>
                    {selected.pinned && (
                      <Pin className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30 shrink-0" />
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-2 py-[3px] rounded-lg font-semibold uppercase tracking-wide ${getSourceType(selected.source).badgeClasses}`}>
                    {selected.source}
                  </span>
                  <span className="text-[11px] text-zinc-500">{new Date(selected.timestamp).toLocaleDateString()}</span>
                  {editing && (
                    <span className="text-[10px] text-teal-400 font-medium animate-pulse">Editing</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {!editing && (
                  <>
                    <button
                      onClick={() => navigateMemory('prev')}
                      disabled={selectedIndex <= 0}
                      className="p-1.5 hover:bg-white/[0.06] rounded-lg disabled:opacity-20 transition-all"
                      title="Previous (↑ or k)"
                      aria-label="Previous memory"
                    >
                      <ChevronUp className="w-4 h-4 text-zinc-500" />
                    </button>
                    <span className="text-[10px] text-zinc-600 tabular-nums min-w-[2.5rem] text-center">
                      {selectedIndex >= 0 ? `${selectedIndex + 1}/${memories.length}` : '—'}
                    </span>
                    <button
                      onClick={() => navigateMemory('next')}
                      disabled={selectedIndex >= memories.length - 1}
                      className="p-1.5 hover:bg-white/[0.06] rounded-lg disabled:opacity-20 transition-all"
                      title="Next (↓ or j)"
                      aria-label="Next memory"
                    >
                      <ChevronDown className="w-4 h-4 text-zinc-500" />
                    </button>
                  </>
                )}
                <button onClick={() => { if (editing) cancelEditing(); setSelected(null); setCopied(false); setEditing(false); setTagAssignOpen(false); }} className="p-1.5 -mr-1 hover:bg-white/[0.06] rounded-lg transition-colors">
                  <X className="w-4 h-4 text-zinc-500" />
                </button>
              </div>
            </div>

            {/* Content Stats Bar */}
            {!editing && selected.content && (
              <div className="px-5 py-2 border-b border-white/[0.04] bg-white/[0.01] flex items-center gap-3 flex-wrap">
                {(() => {
                  const words = selected.content.trim().split(/\s+/).filter(Boolean).length;
                  const chars = selected.content.length;
                  const readMins = Math.max(1, Math.round(words / 225));
                  return (
                    <>
                      <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                        <Hash className="w-2.5 h-2.5 text-zinc-700" />
                        {words.toLocaleString()} words
                      </span>
                      <span className="w-[3px] h-[3px] rounded-full bg-zinc-800" />
                      <span className="text-[10px] text-zinc-600">{chars.toLocaleString()} chars</span>
                      <span className="w-[3px] h-[3px] rounded-full bg-zinc-800" />
                      <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                        <BookOpen className="w-2.5 h-2.5 text-zinc-700" />
                        {readMins} min read
                      </span>
                      {selected.importedAt && selected.importedAt !== selected.timestamp && (
                        <>
                          <span className="w-[3px] h-[3px] rounded-full bg-zinc-800" />
                          <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                            <Clock className="w-2.5 h-2.5 text-zinc-700" />
                            Imported {new Date(selected.importedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Content area */}
            <div className="px-5 py-4 overflow-y-auto max-h-[55dvh] md:max-h-[50vh]">
              {editing ? (
                <textarea
                  ref={editTextareaRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full min-h-[200px] text-[13px] text-zinc-300 leading-[1.7] bg-white/[0.02] border border-white/[0.08] rounded-2xl p-4 focus:outline-none focus:ring-1 focus:ring-teal-500/30 focus:border-teal-500/20 resize-y transition-all placeholder:text-zinc-600 font-mono"
                  placeholder="Memory content…"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      saveEdit();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEditing();
                    }
                  }}
                />
              ) : (
                <div className="text-[13px] text-zinc-300 leading-[1.7]">
                  <ChatMarkdown content={selected.content} />
                </div>
              )}
            </div>

            {/* Related Memories */}
            {!editing && (relatedLoading || relatedMemories.length > 0) && (
              <div className="px-5 py-3 border-t border-white/[0.04] bg-white/[0.01]">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3 h-3 text-teal-400/70" />
                  <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.08em]">
                    Related memories
                  </span>
                  {relatedLoading && (
                    <Loader2 className="w-2.5 h-2.5 text-zinc-600 animate-spin ml-1" />
                  )}
                </div>
                {relatedMemories.length > 0 ? (
                  <div className="space-y-1">
                    {relatedMemories.map((rel) => {
                      const relSt = getSourceType(rel.type);
                      const RelIcon = relSt.icon;
                      const relScorePercent = Math.round(rel.score * 100);
                      return (
                        <button
                          key={rel.id}
                          onClick={() => openRelatedMemory(rel.id)}
                          className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.08] transition-all group/rel active:scale-[0.99]"
                        >
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${relSt.bgColor}`}>
                            <RelIcon className={`w-3 h-3 ${relSt.textColor}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-zinc-300 font-medium truncate group-hover/rel:text-white transition-colors">
                              {rel.title}
                            </p>
                            <p className="text-[11px] text-zinc-600 truncate mt-0.5">
                              {rel.preview || "No preview"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 opacity-60 group-hover/rel:opacity-100 transition-opacity">
                            <div className="w-8 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-teal-500/50"
                                style={{ width: `${Math.max(relScorePercent, 10)}%` }}
                              />
                            </div>
                            <span className="text-[9px] text-zinc-600 tabular-nums font-mono w-5 text-right">
                              {relScorePercent}%
                            </span>
                            <ExternalLink className="w-2.5 h-2.5 text-zinc-700 group-hover/rel:text-teal-400 transition-colors" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : relatedLoading ? (
                  <div className="flex items-center gap-2 py-2 px-3">
                    <div className="w-6 h-6 rounded-lg bg-white/[0.04] animate-pulse" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-2/3 bg-white/[0.04] rounded animate-pulse" />
                      <div className="h-2.5 w-1/2 bg-white/[0.03] rounded animate-pulse" />
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Tags section */}
            {!editing && (
              <div className="px-5 py-3 border-t border-white/[0.04] bg-white/[0.01]">
                <div className="flex items-center gap-1.5 mb-2">
                  <Tag className="w-3 h-3 text-teal-400/70" />
                  <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.08em]">
                    Tags
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(selected.tags || []).map(tag => (
                    <span key={tag.id} className={`inline-flex items-center gap-1 text-[10px] px-2 py-[3px] rounded-lg font-semibold border ${tagColorClasses(tag.color)} group/tag`}>
                      <Tag className="w-2.5 h-2.5" />
                      {tag.name}
                      <button
                        onClick={(e) => { e.stopPropagation(); unassignTag(tag.id, [selected.id]); }}
                        className="ml-0.5 opacity-0 group-hover/tag:opacity-100 hover:text-white transition-all"
                        title="Remove tag"
                        aria-label="Remove tag"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  <div className="relative">
                    <button
                      onClick={() => setTagAssignOpen(!tagAssignOpen)}
                      className="inline-flex items-center gap-1 text-[10px] px-2 py-[3px] rounded-lg font-medium text-zinc-600 border border-dashed border-white/[0.1] hover:border-teal-500/30 hover:text-teal-400 transition-all"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      Add tag
                    </button>
                    {tagAssignOpen && (
                      <>
                        <div className="fixed inset-0 z-[70]" onClick={() => setTagAssignOpen(false)} />
                        <div className="absolute bottom-full mb-1.5 left-0 z-[80] w-52 bg-[#131315] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                          <div className="p-2.5 border-b border-white/[0.06]">
                            <div className="flex gap-1.5">
                              <input
                                placeholder="New tag…"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter' && newTagName.trim()) {
                                    const tag = await createTag(newTagName);
                                    if (tag) {
                                      await assignTag(tag.id, [selected.id]);
                                      setTagAssignOpen(false);
                                    }
                                  }
                                }}
                                className="flex-1 h-8 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[11px] placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/30 transition-all"
                                autoFocus
                              />
                              {newTagName.trim() && (
                                <button
                                  onClick={async () => {
                                    const tag = await createTag(newTagName);
                                    if (tag) {
                                      await assignTag(tag.id, [selected.id]);
                                      setTagAssignOpen(false);
                                    }
                                  }}
                                  disabled={creatingTag}
                                  className="h-8 px-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-[11px] font-medium text-white shrink-0 transition-all disabled:opacity-50"
                                >
                                  {creatingTag ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          </div>
                          {allTags.length > 0 && (
                            <div className="py-1 max-h-40 overflow-y-auto">
                              {allTags
                                .filter(tag => !selected.tags?.some(t => t.id === tag.id))
                                .map(tag => (
                                  <button
                                    key={tag.id}
                                    onClick={async () => {
                                      await assignTag(tag.id, [selected.id]);
                                      setTagAssignOpen(false);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-white/[0.04] transition-colors"
                                  >
                                    <div className={`w-2 h-2 rounded-full ${tagDotColor(tag.color)}`} />
                                    <span className="text-[12px] text-zinc-300">{tag.name}</span>
                                    <span className="text-[10px] text-zinc-600 ml-auto">{tag.memory_count}</span>
                                  </button>
                                ))}
                              {allTags.filter(tag => !selected.tags?.some(t => t.id === tag.id)).length === 0 && (
                                <p className="px-4 py-3 text-[11px] text-zinc-600 italic">All tags assigned</p>
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Footer actions */}
            <div className="px-5 py-3 border-t border-white/[0.06]">
              {editing ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={cancelEditing}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-medium text-zinc-400 hover:bg-white/[0.06] transition-colors"
                    >
                      Cancel
                    </button>
                    <span className="text-[10px] text-zinc-700 hidden sm:inline">
                      <kbd className="font-mono bg-white/[0.04] border border-white/[0.06] rounded px-1 py-[1px] text-[9px]">⌘</kbd>+<kbd className="font-mono bg-white/[0.04] border border-white/[0.06] rounded px-1 py-[1px] text-[9px]">↵</kbd> save
                    </span>
                  </div>
                  <button
                    onClick={saveEdit}
                    disabled={saving || !editContent.trim()}
                    className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-medium bg-teal-600 hover:bg-teal-500 text-white transition-all active:scale-[0.97] disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => askAboutMemory(selected)}
                    className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-[12px] font-medium text-black bg-teal-500 hover:bg-teal-400 transition-all active:scale-[0.97] shrink-0"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Ask about this</span>
                    <span className="sm:hidden">Ask</span>
                  </button>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => togglePin(selected)}
                      disabled={pinning}
                      className={`flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-xl text-[12px] font-medium transition-colors ${
                        selected.pinned
                          ? "text-amber-400 hover:bg-amber-500/10"
                          : "text-zinc-400 hover:bg-white/[0.06]"
                      }`}
                      title={selected.pinned ? "Unpin (p)" : "Pin to top (p)"}
                    >
                      {pinning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : selected.pinned ? (
                        <PinOff className="w-3.5 h-3.5" />
                      ) : (
                        <Pin className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">{selected.pinned ? "Unpin" : "Pin"}</span>
                    </button>
                    <button
                      onClick={() => handleCopy(selected.content)}
                      className="flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-xl text-[12px] font-medium text-zinc-400 hover:bg-white/[0.06] transition-colors"
                      title="Copy content"
                      aria-label="Copy memory content"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">{copied ? <span className="text-emerald-400">Copied</span> : "Copy"}</span>
                    </button>
                    <button
                      onClick={startEditing}
                      className="flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-xl text-[12px] font-medium text-zinc-400 hover:bg-white/[0.06] transition-colors"
                      title="Edit memory (e)"
                      aria-label="Edit memory"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                    <button
                      onClick={() => deleteMemory(selected.id)}
                      disabled={deleting}
                      className="flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-xl text-[12px] font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      title="Delete memory"
                      aria-label="Delete memory"
                    >
                      {deleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">{deleting ? "Deleting…" : "Delete"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Keyboard hints in modal */}
            <div className="hidden md:flex items-center justify-center gap-4 px-5 py-2 border-t border-white/[0.04] bg-white/[0.01]">
              {editing ? (
                <>
                  <KbdHint keys={["⌘", "↵"]} label="save" />
                  <KbdHint keys={["esc"]} label="cancel" />
                </>
              ) : (
                <>
                  <KbdHint keys={["↑", "↓"]} label="navigate" />
                  <KbdHint keys={["p"]} label="pin" />
                  <KbdHint keys={["e"]} label="edit" />
                  <KbdHint keys={["esc"]} label="close" />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}

/* ═══ Sub-components ═══ */

function FilterPill({ active, onClick, label, count, icon, tagColor }: {
  active: boolean; onClick: () => void; label: string; count?: number; icon?: React.ReactNode; tagColor?: string;
}) {
  const activeStyle = tagColor
    ? `${tagColorClasses(tagColor).replace('border-', 'border border-')} shadow-sm`
    : "bg-teal-500/15 text-teal-300 border border-teal-500/25 shadow-sm shadow-teal-500/10";
  return (
    <button
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all active:scale-[0.95] ${
        active ? activeStyle : "text-zinc-500 border border-white/[0.06] hover:bg-white/[0.04] hover:text-zinc-300"
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && <span className="text-[10px] opacity-60 tabular-nums">{count}</span>}
    </button>
  );
}

function KbdHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-zinc-700">
      {keys.map((key, i) => (
        <kbd key={i} className="font-mono bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-[1px] text-[9px] min-w-[18px] text-center">
          {key}
        </kbd>
      ))}
      {label}
    </span>
  );
}
