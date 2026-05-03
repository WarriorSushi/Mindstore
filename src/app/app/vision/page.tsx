"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Image as ImageIcon, Upload, Loader2, Save, Trash2, Check,
  AlertCircle, Camera, FileText, BarChart3, Pencil, RefreshCw,
  Monitor, BookOpen, PenTool, Smile, ChevronRight, ArrowLeft,
  Layers, X, Eye, Grid, List,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { PageTransition, Stagger } from "@/components/PageTransition";
import { EmptyFeatureState } from "@/components/EmptyFeatureState";
import { usePageTitle } from "@/lib/use-page-title";

// ─── Types ────────────────────────────────────────────────────

interface ImageAnalysis {
  id: string;
  title: string;
  description: string;
  image_data: string | null;
  image_size: number;
  image_format: string;
  image_width: number | null;
  image_height: number | null;
  tags: string[];
  context_type: string;
  provider: string;
  model: string;
  word_count: number;
  saved_as_memory: boolean;
  memory_id: string | null;
  created_at: string;
}

interface ImageStats {
  totalImages: number;
  savedCount: number;
  totalWords: number;
  totalSize: number;
  avgWords: number;
}

type ViewMode = "upload" | "detail" | "gallery";

// ─── Context types ────────────────────────────────────────────

const CONTEXT_TYPES = [
  { key: "general", label: "General", icon: ImageIcon, desc: "Any image — AI decides the best approach" },
  { key: "screenshot", label: "Screenshot", icon: Monitor, desc: "App or website screenshot" },
  { key: "whiteboard", label: "Whiteboard", icon: PenTool, desc: "Whiteboard, handwritten notes" },
  { key: "document", label: "Document", icon: FileText, desc: "Scanned or photographed document" },
  { key: "diagram", label: "Diagram", icon: Layers, desc: "Flowchart, architecture, or technical drawing" },
  { key: "photo", label: "Photo", icon: Camera, desc: "Photograph of a scene or event" },
  { key: "chart", label: "Chart", icon: BarChart3, desc: "Graph, chart, or data visualization" },
  { key: "meme", label: "Meme", icon: Smile, desc: "Meme or social media image" },
];

// ─── Helpers ──────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "yesterday";
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Component ────────────────────────────────────────────────

export default function ImageToMemoryPage() {
  usePageTitle("Vision");
  // State
  const [view, setView] = useState<ViewMode>("upload");
  const [images, setImages] = useState<ImageAnalysis[]>([]);
  const [stats, setStats] = useState<ImageStats | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [providerAvailable, setProviderAvailable] = useState<boolean | null>(null);
  const [providerInfo, setProviderInfo] = useState<{ provider: string; model: string } | null>(null);

  // Upload state
  const [dragOver, setDragOver] = useState(false);
  const [contextType, setContextType] = useState("general");
  const [customPrompt, setCustomPrompt] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [galleryMode, setGalleryMode] = useState<"grid" | "list">("grid");

  // Editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingMemory, setSavingMemory] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // ─── Data loading ───────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [imagesRes, statsRes, checkRes] = await Promise.all([
        fetch("/api/v1/plugins/image-to-memory?action=images"),
        fetch("/api/v1/plugins/image-to-memory?action=stats"),
        fetch("/api/v1/plugins/image-to-memory?action=check"),
      ]);

      if (imagesRes.ok) {
        const data = await imagesRes.json();
        setImages(data.images || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
      if (checkRes.ok) {
        const data = await checkRes.json();
        setProviderAvailable(data.available);
        if (data.provider) setProviderInfo({ provider: data.provider, model: data.model });
      }
    } catch (e) {
      console.error("Failed to load image data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── File handling ──────────────────────────────────────────

  const handleFileSelect = useCallback((file: File) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/tiff"];
    if (!allowedTypes.includes(file.type)) {
      toast.error(`Unsupported format: ${file.type.split("/")[1]}`, {
        description: "Supported: JPEG, PNG, GIF, WebP, BMP, TIFF",
      });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Image too large", { description: "Maximum 20MB" });
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setView("upload");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCustomPrompt("");
    setContextType("general");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [previewUrl]);

  // ─── Analyze ────────────────────────────────────────────────

  const analyzeImage = useCallback(async () => {
    if (!selectedFile) return;

    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      formData.append("context", contextType);
      if (customPrompt.trim()) formData.append("prompt", customPrompt.trim());

      const res = await fetch("/api/v1/plugins/image-to-memory", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Analysis failed");
      }

      const result = await res.json();
      toast.success("Image analyzed", { description: `${result.wordCount} words · ${result.tags.length} tags` });

      // Refresh data and show the new analysis
      await loadData();

      // Select the new image
      const updatedImages = await fetch("/api/v1/plugins/image-to-memory?action=images").then((r) => r.json());
      const newImage = (updatedImages.images || []).find((i: ImageAnalysis) => i.id === result.id);
      if (newImage) {
        setSelectedImage(newImage);
        setView("detail");
      }

      clearFile();
    } catch (e: any) {
      toast.error("Analysis failed", { description: e.message });
    } finally {
      setAnalyzing(false);
    }
  }, [selectedFile, contextType, customPrompt, loadData, clearFile]);

  // ─── Save to memory ────────────────────────────────────────

  const saveAsMemory = useCallback(async (image: ImageAnalysis) => {
    setSavingMemory(true);
    try {
      const res = await fetch("/api/v1/plugins/image-to-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", imageId: image.id }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }

      const result = await res.json();
      toast.success("Saved to knowledge base", { description: `${result.wordCount} words · Find it in Explore` });
      await loadData();

      // Update selected image state
      setSelectedImage((prev) =>
        prev && prev.id === image.id ? { ...prev, saved_as_memory: true, memory_id: result.memoryId } : prev
      );
    } catch (e: any) {
      toast.error("Save failed", { description: e.message });
    } finally {
      setSavingMemory(false);
    }
  }, [loadData]);

  // ─── Re-analyze ─────────────────────────────────────────────

  const reanalyze = useCallback(async (image: ImageAnalysis, context?: string, prompt?: string) => {
    setReanalyzing(true);
    try {
      const res = await fetch("/api/v1/plugins/image-to-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reanalyze",
          imageId: image.id,
          context: context || image.context_type,
          prompt,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Re-analysis failed");
      }

      const result = await res.json();
      toast.success("Re-analyzed", { description: `${result.wordCount} words · ${result.tags.length} tags` });
      await loadData();

      setSelectedImage((prev) =>
        prev && prev.id === image.id
          ? { ...prev, title: result.title, description: result.description, tags: result.tags, word_count: result.wordCount }
          : prev
      );
    } catch (e: any) {
      toast.error("Re-analysis failed", { description: e.message });
    } finally {
      setReanalyzing(false);
    }
  }, [loadData]);

  // ─── Delete ─────────────────────────────────────────────────

  const deleteImage = useCallback(async (imageId: string) => {
    setDeletingId(imageId);
    try {
      const res = await fetch("/api/v1/plugins/image-to-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", imageId }),
      });

      if (!res.ok) throw new Error("Delete failed");

      toast.success("Deleted");
      setImages((prev) => prev.filter((i) => i.id !== imageId));
      if (selectedImage?.id === imageId) {
        setSelectedImage(null);
        setView("gallery");
      }
      loadData();
    } catch (e: any) {
      toast.error("Delete failed", { description: e.message });
    } finally {
      setDeletingId(null);
    }
  }, [selectedImage, loadData]);

  // ─── Update title ───────────────────────────────────────────

  const updateTitle = useCallback(async (imageId: string, title: string) => {
    try {
      await fetch("/api/v1/plugins/image-to-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", imageId, title }),
      });
      setImages((prev) => prev.map((i) => (i.id === imageId ? { ...i, title } : i)));
      setSelectedImage((prev) => (prev && prev.id === imageId ? { ...prev, title } : prev));
      setEditingTitle(false);
    } catch {
      toast.error("Failed to update title");
    }
  }, []);

  // ─── Loading ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="space-y-2">
          <div className="animate-pulse rounded-xl bg-white/[0.04] h-7 w-40" />
          <div className="animate-pulse rounded-xl bg-white/[0.04] h-4 w-56" />
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 space-y-4">
          <div className="animate-pulse rounded-xl bg-white/[0.04] h-5 w-32" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
                <div className="animate-pulse rounded-lg bg-white/[0.04] w-full h-20" />
                <div className="animate-pulse rounded-xl bg-white/[0.04] h-3 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────

  // Data-zero: no Vision AI provider AND no images analyzed
  if (providerAvailable === false && !loading && images.length === 0) {
    return (
      <PageTransition>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <Stagger>
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1">
                <h1 className="text-[22px] sm:text-[28px] font-semibold tracking-[-0.03em] text-white">
                  Image to Memory
                </h1>
                <p className="text-zinc-500 text-[13px] mt-0.5">
                  Upload images → AI describes → save as searchable knowledge
                </p>
              </div>
            </div>
          </Stagger>
          <EmptyFeatureState
            icon={ImageIcon}
            title="Vision is ready when an AI provider is connected"
            description="Add an OpenAI or Gemini API key in Settings so we can analyze images and turn them into searchable memories."
            ctaText="Connect provider →"
            ctaHref="/app/settings"
            secondaryText="Gemini's free tier supports vision out of the box"
          />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <Stagger>
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1">
              <h1 className="text-[22px] sm:text-[28px] font-semibold tracking-[-0.03em] text-white">
                Image to Memory
              </h1>
              <p className="text-zinc-500 text-[13px] mt-0.5">
                Upload images → AI describes → save as searchable knowledge
              </p>
            </div>
            {providerInfo && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-[11px] text-zinc-500">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                {providerInfo.provider} · {providerInfo.model}
              </div>
            )}
          </div>
        </Stagger>

        {/* Provider warning */}
        {providerAvailable === false && (
          <Stagger>
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/[0.06] border border-amber-500/[0.12] mb-6">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[13px] text-amber-300 font-medium">No Vision AI provider configured</p>
                <p className="text-[12px] text-amber-400/60 mt-0.5">
                  Image analysis requires OpenAI (GPT-4o), Gemini, or Ollama (llava).{" "}
                  <Link href="/app/settings" className="underline hover:text-amber-300">
                    Configure in Settings →
                  </Link>
                </p>
              </div>
            </div>
          </Stagger>
        )}

        {/* Stats row */}
        {stats && stats.totalImages > 0 && (
          <Stagger>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Images", value: stats.totalImages, icon: ImageIcon, color: "text-teal-400" },
                { label: "Saved", value: stats.savedCount, icon: Check, color: "text-emerald-400" },
                { label: "Words", value: stats.totalWords.toLocaleString(), icon: FileText, color: "text-sky-400" },
                { label: "Data", value: formatFileSize(stats.totalSize), icon: Camera, color: "text-amber-400" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]"
                >
                  <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                  <div>
                    <div className="text-[15px] font-semibold text-white tabular-nums">{s.value}</div>
                    <div className="text-[10px] text-zinc-600">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </Stagger>
        )}

        {/* View tabs */}
        <Stagger>
          <div className="flex items-center gap-2 mb-5">
            <button
              onClick={() => { setView("upload"); setSelectedImage(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                view === "upload"
                  ? "bg-teal-500/10 text-teal-300 border border-teal-500/20"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent hover:bg-white/[0.03]"
              }`}
            >
              <Upload className="w-3 h-3" />
              Upload
            </button>
            <button
              onClick={() => { setView("gallery"); setSelectedImage(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                view === "gallery"
                  ? "bg-teal-500/10 text-teal-300 border border-teal-500/20"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent hover:bg-white/[0.03]"
              }`}
            >
              <Grid className="w-3 h-3" />
              Gallery
              {images.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/[0.06] text-[10px] tabular-nums">
                  {images.length}
                </span>
              )}
            </button>
          </div>
        </Stagger>

        {/* ─── Upload View ─────────────────────────────────────── */}
        {view === "upload" && (
          <Stagger>
            <div className="space-y-5">
              {/* Drop zone */}
              <div
                ref={dropZoneRef}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !selectedFile && fileInputRef.current?.click()}
                className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden ${
                  dragOver
                    ? "border-teal-400/40 bg-teal-500/[0.06]"
                    : selectedFile
                    ? "border-white/[0.08] bg-white/[0.02]"
                    : "border-white/[0.08] bg-white/[0.02] hover:border-teal-400/20 hover:bg-white/[0.03]"
                }`}
              >
                {selectedFile && previewUrl ? (
                  <div className="p-4">
                    <div className="relative flex justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-h-[300px] rounded-xl object-contain"
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); clearFile(); }}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm text-zinc-400 hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-center gap-3 mt-3 text-[12px] text-zinc-500">
                      <span>{selectedFile.name}</span>
                      <span>·</span>
                      <span>{formatFileSize(selectedFile.size)}</span>
                      <span>·</span>
                      <span>{selectedFile.type.split("/")[1]?.toUpperCase()}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-4">
                      <Camera className="w-5 h-5 text-teal-400" />
                    </div>
                    <p className="text-[14px] text-zinc-300 font-medium mb-1">
                      Drop an image here or click to browse
                    </p>
                    <p className="text-[12px] text-zinc-600">
                      JPEG, PNG, GIF, WebP, BMP, TIFF · Up to 20MB
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,image/tiff"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>

              {/* Context type selector */}
              {selectedFile && (
                <>
                  <div>
                    <label className="text-[12px] text-zinc-500 font-medium mb-2 block">
                      Image type — helps AI focus its analysis
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {CONTEXT_TYPES.map((ct) => (
                        <button
                          key={ct.key}
                          onClick={() => setContextType(ct.key)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all ${
                            contextType === ct.key
                              ? "bg-teal-500/10 border border-teal-500/20 text-teal-300"
                              : "bg-white/[0.02] border border-white/[0.06] text-zinc-400 hover:text-zinc-300 hover:bg-white/[0.04]"
                          }`}
                        >
                          <ct.icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-[12px] font-medium">{ct.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom prompt */}
                  <div>
                    <label className="text-[12px] text-zinc-500 font-medium mb-2 block">
                      Additional instructions (optional)
                    </label>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="E.g., Focus on the text in the upper right, or Identify the programming language..."
                      rows={2}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-[13px] text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-teal-500/30 resize-none transition-colors"
                    />
                  </div>

                  {/* Analyze button */}
                  <button
                    onClick={analyzeImage}
                    disabled={analyzing || providerAvailable === false}
                    className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-teal-600 hover:bg-teal-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-medium text-[14px] transition-all active:scale-[0.98]"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing image...
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4" />
                        Analyze with AI
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </Stagger>
        )}

        {/* ─── Gallery View ────────────────────────────────────── */}
        {view === "gallery" && !selectedImage && (
          <Stagger>
            {images.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                  <ImageIcon className="w-5 h-5 text-zinc-600" />
                </div>
                <p className="text-[14px] text-zinc-400 font-medium mb-1">No images analyzed yet</p>
                <p className="text-[12px] text-zinc-600 mb-4">Upload an image and let AI describe it</p>
                <button
                  onClick={() => setView("upload")}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-[13px] font-medium transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload Image
                </button>
              </div>
            ) : (
              <div>
                {/* Gallery header */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[12px] text-zinc-600">{images.length} image{images.length !== 1 ? "s" : ""}</p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setGalleryMode("grid")}
                      className={`p-1.5 rounded-lg transition-colors ${
                        galleryMode === "grid" ? "text-teal-400 bg-teal-500/10" : "text-zinc-600 hover:text-zinc-400"
                      }`}
                    >
                      <Grid className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setGalleryMode("list")}
                      className={`p-1.5 rounded-lg transition-colors ${
                        galleryMode === "list" ? "text-teal-400 bg-teal-500/10" : "text-zinc-600 hover:text-zinc-400"
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Grid view */}
                {galleryMode === "grid" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {images.map((image) => (
                      <button
                        key={image.id}
                        onClick={() => { setSelectedImage(image); setView("detail"); }}
                        className="group text-left rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all overflow-hidden"
                      >
                        {/* Thumbnail */}
                        {image.image_data ? (
                          <div className="aspect-video bg-black/40 overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={image.image_data}
                              alt={image.title}
                              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                            />
                          </div>
                        ) : (
                          <div className="aspect-video bg-white/[0.01] flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-zinc-800" />
                          </div>
                        )}

                        <div className="p-3">
                          <h3 className="text-[13px] font-medium text-zinc-200 line-clamp-1 group-hover:text-white transition-colors">
                            {image.title}
                          </h3>
                          <p className="text-[11px] text-zinc-600 line-clamp-2 mt-1">
                            {image.description?.slice(0, 100)}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] text-zinc-600">
                              {formatRelativeTime(image.created_at)}
                            </span>
                            {image.saved_as_memory && (
                              <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
                                <Check className="w-2.5 h-2.5" />
                                Saved
                              </span>
                            )}
                            {image.tags?.length > 0 && (
                              <span className="text-[10px] text-zinc-700">{image.tags.length} tags</span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  /* List view */
                  <div className="rounded-2xl border border-white/[0.06] divide-y divide-white/[0.04]">
                    {images.map((image) => (
                      <button
                        key={image.id}
                        onClick={() => { setSelectedImage(image); setView("detail"); }}
                        className="group w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                      >
                        {/* Mini thumbnail */}
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.03] border border-white/[0.06] shrink-0">
                          {image.image_data ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={image.image_data} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="w-4 h-4 text-zinc-700" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-[13px] font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
                            {image.title}
                          </h3>
                          <div className="flex items-center gap-2 text-[11px] text-zinc-600">
                            <span>{image.context_type}</span>
                            <span>·</span>
                            <span>{image.word_count} words</span>
                            <span>·</span>
                            <span>{formatRelativeTime(image.created_at)}</span>
                          </div>
                        </div>

                        {image.saved_as_memory && (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-700 shrink-0 group-hover:text-zinc-400 transition-colors" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Stagger>
        )}

        {/* ─── Detail View ─────────────────────────────────────── */}
        {(view === "detail" || (view === "gallery" && selectedImage)) && selectedImage && (
          <Stagger>
            <div className="space-y-4">
              {/* Back + actions bar */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setSelectedImage(null); setView("gallery"); }}
                  className="p-1.5 rounded-lg hover:bg-white/[0.04] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex-1" />

                {/* Action buttons */}
                <div className="flex items-center gap-1.5">
                  {/* Re-analyze */}
                  {selectedImage.image_data && (
                    <button
                      onClick={() => reanalyze(selectedImage)}
                      disabled={reanalyzing}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
                    >
                      {reanalyzing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      Re-analyze
                    </button>
                  )}

                  {/* Save */}
                  {!selectedImage.saved_as_memory ? (
                    <button
                      onClick={() => saveAsMemory(selectedImage)}
                      disabled={savingMemory}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-medium disabled:opacity-50 transition-colors"
                    >
                      {savingMemory ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
                      Save to Memory
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[11px] font-medium">
                      <Check className="w-3 h-3" />
                      Saved
                    </span>
                  )}

                  {/* Delete */}
                  <button
                    onClick={() => deleteImage(selectedImage.id)}
                    disabled={deletingId === selectedImage.id}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    {deletingId === selectedImage.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Image preview */}
              {selectedImage.image_data && (
                <div className="rounded-2xl overflow-hidden bg-black/40 border border-white/[0.06]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedImage.image_data}
                    alt={selectedImage.title}
                    className="w-full max-h-[400px] object-contain"
                  />
                </div>
              )}

              {/* Title */}
              <div className="flex items-start gap-2">
                {editingTitle ? (
                  <input
                    type="text"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateTitle(selectedImage.id, titleDraft);
                      if (e.key === "Escape") setEditingTitle(false);
                    }}
                    onBlur={() => setEditingTitle(false)}
                    autoFocus
                    className="flex-1 text-[18px] font-semibold text-white bg-transparent border-b border-teal-500/30 focus:outline-none pb-1"
                  />
                ) : (
                  <h2
                    className="flex-1 text-[18px] font-semibold text-white cursor-pointer hover:text-teal-300 transition-colors group"
                    onClick={() => { setEditingTitle(true); setTitleDraft(selectedImage.title); }}
                  >
                    {selectedImage.title}
                    <Pencil className="inline w-3 h-3 ml-2 text-zinc-700 group-hover:text-teal-400 transition-colors" />
                  </h2>
                )}
              </div>

              {/* Meta info */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-600">
                <span>{selectedImage.context_type}</span>
                <span>·</span>
                <span>{selectedImage.word_count} words</span>
                <span>·</span>
                <span>{selectedImage.provider} · {selectedImage.model}</span>
                <span>·</span>
                <span>{formatRelativeTime(selectedImage.created_at)}</span>
                {selectedImage.image_size > 0 && (
                  <>
                    <span>·</span>
                    <span>{formatFileSize(selectedImage.image_size)}</span>
                  </>
                )}
              </div>

              {/* Tags */}
              {selectedImage.tags && selectedImage.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedImage.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 text-[11px] border border-teal-500/15"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-4">
                <h3 className="text-[12px] text-zinc-500 font-medium mb-3 flex items-center gap-1.5">
                  <BookOpen className="w-3 h-3" />
                  AI Description
                </h3>
                <div className="text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {selectedImage.description}
                </div>
              </div>
            </div>
          </Stagger>
        )}
      </div>
    </PageTransition>
  );
}
