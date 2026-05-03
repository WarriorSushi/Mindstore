"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Mic, MicOff, Square, Play, Pause, Save, Trash2, Loader2,
  Clock, FileText, ChevronRight, AlertCircle, Check, Volume2,
  Radio, Waves, RotateCcw, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { PageTransition, Stagger } from "@/components/PageTransition";
import { EmptyFeatureState } from "@/components/EmptyFeatureState";
import { usePageTitle } from "@/lib/use-page-title";

// ─── Types ────────────────────────────────────────────────────

interface Recording {
  id: string;
  title: string;
  transcript: string;
  duration_seconds: number;
  audio_size: number;
  language: string;
  provider: string;
  model: string;
  word_count: number;
  saved_as_memory: boolean;
  memory_id: string | null;
  created_at: string;
}

interface VoiceStats {
  totalRecordings: number;
  totalDuration: number;
  totalWords: number;
  savedCount: number;
  avgDuration: number;
}

type RecordingState = "idle" | "recording" | "transcribing" | "done" | "error";

// ─── Audio Visualizer ─────────────────────────────────────────

function useAudioVisualizer(stream: MediaStream | null, isRecording: boolean) {
  const [levels, setLevels] = useState<number[]>(new Array(32).fill(0));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || !isRecording) {
      setLevels(new Array(32).fill(0));
      return;
    }

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      analyser.getByteFrequencyData(dataArray);
      // Take 32 evenly-spaced bars from the frequency data
      const bars: number[] = [];
      const step = Math.floor(dataArray.length / 32);
      for (let i = 0; i < 32; i++) {
        bars.push(dataArray[i * step] / 255);
      }
      setLevels(bars);
      animFrameRef.current = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      ctx.close();
    };
  }, [stream, isRecording]);

  return levels;
}

// ─── Format helpers ───────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ─── Component ────────────────────────────────────────────────

export default function VoicePage() {
  usePageTitle("Voice");
  // Recording state
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Result state
  const [currentTranscript, setCurrentTranscript] = useState<{
    id: string; title: string; transcript: string; language: string;
    duration: number; wordCount: number; provider: string;
  } | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // History
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [stats, setStats] = useState<VoiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Provider check
  const [providerAvailable, setProviderAvailable] = useState<boolean | null>(null);
  const [providerInfo, setProviderInfo] = useState<{ provider: string; model: string } | null>(null);

  // Audio levels for visualizer
  const levels = useAudioVisualizer(mediaStream, recordingState === "recording");

  // ─── Init ────────────────────────────────────────────────────

  useEffect(() => {
    checkProvider();
    loadRecordings();
    loadStats();
  }, []);

  async function checkProvider() {
    try {
      const res = await fetch("/api/v1/plugins/voice-to-memory?action=check");
      const data = await res.json();
      setProviderAvailable(data.available);
      if (data.available) {
        setProviderInfo({ provider: data.provider, model: data.model });
      }
    } catch {
      setProviderAvailable(false);
    }
  }

  async function loadRecordings() {
    try {
      const res = await fetch("/api/v1/plugins/voice-to-memory?action=recordings&limit=20");
      const data = await res.json();
      setRecordings(data.recordings || []);
    } catch (err) {
      console.error("Failed to load recordings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const res = await fetch("/api/v1/plugins/voice-to-memory?action=stats");
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }

  // ─── Recording controls ─────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        setAudioChunks(chunks);
      };

      recorder.start(1000); // Collect data every second
      setMediaRecorder(recorder);
      setMediaStream(stream);
      setRecordingState("recording");
      setRecordingTime(0);
      setCurrentTranscript(null);

      // Timer
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Microphone access denied:", err);
      toast.error("Microphone access denied. Please allow microphone permissions.");
      setRecordingState("error");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      setMediaStream(null);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [mediaRecorder, mediaStream]);

  // Auto-transcribe after recording stops
  useEffect(() => {
    if (audioChunks.length > 0 && recordingState === "recording") {
      // Recording just stopped, transcribe
      transcribeAudio(audioChunks);
    }
  }, [audioChunks]);

  async function transcribeAudio(chunks: Blob[]) {
    setRecordingState("transcribing");

    try {
      const audioBlob = new Blob(chunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const res = await fetch("/api/v1/plugins/voice-to-memory", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Transcription failed");
      }

      const data = await res.json();
      setCurrentTranscript(data);
      setRecordingState("done");
      setTitleDraft(data.title);
      toast.success("Transcription complete!");
      loadRecordings();
      loadStats();
    } catch (err: any) {
      console.error("Transcription error:", err);
      toast.error(err.message || "Transcription failed");
      setRecordingState("error");
    }
  }

  // ─── Save as memory ─────────────────────────────────────────

  async function saveAsMemory(recordingId: string, customTitle?: string) {
    setSaving(recordingId);
    try {
      const res = await fetch("/api/v1/plugins/voice-to-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          recordingId,
          title: customTitle,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }

      toast.success("Saved to your knowledge base!");
      loadRecordings();
      loadStats();

      // Update current transcript if it matches
      if (currentTranscript?.id === recordingId) {
        setCurrentTranscript(null);
        setRecordingState("idle");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(null);
    }
  }

  // ─── Delete recording ───────────────────────────────────────

  async function deleteRecording(recordingId: string) {
    try {
      await fetch("/api/v1/plugins/voice-to-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", recordingId }),
      });
      toast.success("Recording deleted");
      setRecordings((prev) => prev.filter((r) => r.id !== recordingId));
      if (currentTranscript?.id === recordingId) {
        setCurrentTranscript(null);
        setRecordingState("idle");
      }
      loadStats();
    } catch {
      toast.error("Failed to delete recording");
    }
  }

  // ─── Update title ───────────────────────────────────────────

  async function updateTitle(recordingId: string, title: string) {
    try {
      await fetch("/api/v1/plugins/voice-to-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", recordingId, title }),
      });
      setEditingTitle(false);
      if (currentTranscript?.id === recordingId) {
        setCurrentTranscript({ ...currentTranscript, title });
      }
      loadRecordings();
    } catch {
      toast.error("Failed to update title");
    }
  }

  // ─── Reset ──────────────────────────────────────────────────

  function resetRecorder() {
    setRecordingState("idle");
    setCurrentTranscript(null);
    setAudioChunks([]);
    setRecordingTime(0);
    setEditingTitle(false);
  }

  // ─── Cleanup on unmount ─────────────────────────────────────

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
    };
  }, [mediaStream]);

  // ─── Render ─────────────────────────────────────────────────

  // Data-zero: no transcription provider available AND no recordings yet
  if (providerAvailable === false && !loading && recordings.length === 0) {
    return (
      <PageTransition>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-24">
          <Stagger>
            <div className="flex items-center gap-3 mb-8">
              <div className="flex-1">
                <h1 className="text-[20px] font-semibold text-white tracking-tight">Voice-to-Memory</h1>
                <p className="text-[13px] text-zinc-500 mt-0.5">
                  Record your thoughts — transcribed and saved as searchable knowledge
                </p>
              </div>
            </div>
          </Stagger>
          <EmptyFeatureState
            icon={Mic}
            title="Voice-to-Memory is ready when transcription is connected"
            description="Add an OpenAI or Gemini API key in Settings so we can transcribe your recordings and turn them into searchable memories."
            ctaText="Connect provider →"
            ctaHref="/app/settings"
            secondaryText="Gemini's free tier is enough to get started"
          />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-24">
        {/* Header */}
        <Stagger>
          <div className="flex items-center gap-3 mb-8">
            <div className="flex-1">
              <h1 className="text-[20px] font-semibold text-white tracking-tight">
                Voice-to-Memory
              </h1>
              <p className="text-[13px] text-zinc-500 mt-0.5">
                Record your thoughts — transcribed and saved as searchable knowledge
              </p>
            </div>
            {providerInfo && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/[0.06] border border-teal-500/[0.12]">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                <span className="text-[11px] font-medium text-teal-400 capitalize">
                  {providerInfo.provider} · {providerInfo.model}
                </span>
              </div>
            )}
          </div>
        </Stagger>

        {/* Provider not available warning */}
        {providerAvailable === false && (
          <Stagger>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5 mb-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-[14px] font-medium text-amber-300 mb-1">
                    No Transcription Provider
                  </h3>
                  <p className="text-[13px] text-amber-400/70 leading-relaxed">
                    Voice-to-Memory requires an OpenAI or Gemini API key for transcription.
                    Add one in{" "}
                    <Link href="/app/settings" className="underline hover:text-amber-300">
                      Settings
                    </Link>{" "}
                    to get started.
                  </p>
                </div>
              </div>
            </div>
          </Stagger>
        )}

        {/* Stats row */}
        {stats && stats.totalRecordings > 0 && (
          <Stagger>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Recordings", value: stats.totalRecordings.toString(), icon: Mic },
                { label: "Total Time", value: formatDuration(stats.totalDuration), icon: Clock },
                { label: "Words", value: stats.totalWords.toLocaleString(), icon: FileText },
                { label: "Saved", value: stats.savedCount.toString(), icon: Save },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 text-center"
                >
                  <stat.icon className="w-3.5 h-3.5 text-zinc-600 mx-auto mb-1.5" />
                  <div className="text-[16px] font-semibold text-white">{stat.value}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>
          </Stagger>
        )}

        {/* Recording Studio */}
        <Stagger>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden mb-8">
            {/* Visualizer area */}
            <div className="relative h-48 sm:h-56 flex items-center justify-center bg-gradient-to-b from-white/[0.01] to-transparent">
              {/* Audio bars */}
              {recordingState === "recording" && (
                <div className="absolute inset-0 flex items-center justify-center gap-[3px] px-8">
                  {levels.map((level, i) => (
                    <div
                      key={i}
                      className="w-[6px] sm:w-[7px] rounded-full transition-all duration-75"
                      style={{
                        height: `${Math.max(4, level * 120)}px`,
                        backgroundColor: level > 0.6
                          ? "rgba(20, 184, 166, 0.8)"   // teal for loud
                          : level > 0.3
                          ? "rgba(56, 189, 248, 0.5)"   // sky for medium
                          : "rgba(113, 113, 122, 0.3)", // zinc for quiet
                        opacity: 0.4 + level * 0.6,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Center content */}
              <div className="relative z-10 text-center">
                {recordingState === "idle" && (
                  <div>
                    <div className="w-16 h-16 rounded-full bg-teal-500/[0.08] border border-teal-500/20 flex items-center justify-center mx-auto mb-3">
                      <Mic className="w-7 h-7 text-teal-400" />
                    </div>
                    <p className="text-[14px] text-zinc-400">
                      Tap to start recording
                    </p>
                    <p className="text-[12px] text-zinc-600 mt-1">
                      Your voice will be transcribed and saved as a memory
                    </p>
                  </div>
                )}

                {recordingState === "recording" && (
                  <div>
                    <div className="flex items-center gap-2 justify-center mb-2">
                      <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                      <span className="text-[13px] font-medium text-red-400 uppercase tracking-wider">
                        Recording
                      </span>
                    </div>
                    <div className="text-[36px] sm:text-[42px] font-mono font-light text-white tabular-nums">
                      {formatDuration(recordingTime)}
                    </div>
                  </div>
                )}

                {recordingState === "transcribing" && (
                  <div>
                    <Loader2 className="w-10 h-10 text-teal-400 animate-spin mx-auto mb-3" />
                    <p className="text-[14px] text-zinc-400 font-medium">
                      Transcribing...
                    </p>
                    <p className="text-[12px] text-zinc-600 mt-1">
                      {providerInfo?.provider === "openai" ? "Using Whisper" : "Using Gemini"}
                    </p>
                  </div>
                )}

                {recordingState === "done" && currentTranscript && (
                  <div className="px-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/[0.08] border border-emerald-500/20 flex items-center justify-center mx-auto mb-2">
                      <Check className="w-5 h-5 text-emerald-400" />
                    </div>
                    <p className="text-[13px] text-emerald-400 font-medium">
                      Transcription complete
                    </p>
                    <p className="text-[12px] text-zinc-500 mt-1">
                      {currentTranscript.wordCount} words · {currentTranscript.language}
                    </p>
                  </div>
                )}

                {recordingState === "error" && (
                  <div>
                    <div className="w-10 h-10 rounded-full bg-red-500/[0.08] border border-red-500/20 flex items-center justify-center mx-auto mb-2">
                      <MicOff className="w-5 h-5 text-red-400" />
                    </div>
                    <p className="text-[13px] text-red-400 font-medium">
                      Recording failed
                    </p>
                    <p className="text-[12px] text-zinc-500 mt-1">
                      Check microphone permissions
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4 py-5 border-t border-white/[0.04]">
              {recordingState === "idle" && (
                <button
                  onClick={startRecording}
                  disabled={providerAvailable === false}
                  className="w-14 h-14 rounded-full bg-teal-500 hover:bg-teal-400 active:scale-95 flex items-center justify-center transition-all shadow-lg shadow-teal-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Mic className="w-6 h-6 text-white" />
                </button>
              )}

              {recordingState === "recording" && (
                <button
                  onClick={stopRecording}
                  className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-400 active:scale-95 flex items-center justify-center transition-all shadow-lg shadow-red-500/20"
                >
                  <Square className="w-5 h-5 text-white fill-white" />
                </button>
              )}

              {recordingState === "transcribing" && (
                <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
                </div>
              )}

              {recordingState === "done" && (
                <>
                  <button
                    onClick={resetRecorder}
                    className="w-11 h-11 rounded-full bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.06] flex items-center justify-center transition-all"
                    title="Record another"
                  >
                    <RotateCcw className="w-4.5 h-4.5 text-zinc-400" />
                  </button>

                  {currentTranscript && (
                    <button
                      onClick={() => saveAsMemory(currentTranscript.id, titleDraft)}
                      disabled={saving === currentTranscript.id}
                      className="h-11 px-6 rounded-full bg-teal-500 hover:bg-teal-400 active:scale-[0.97] flex items-center gap-2 transition-all shadow-lg shadow-teal-500/20 disabled:opacity-50"
                    >
                      {saving === currentTranscript.id ? (
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 text-white" />
                      )}
                      <span className="text-[13px] font-medium text-white">
                        Save to Knowledge Base
                      </span>
                    </button>
                  )}

                  {currentTranscript && (
                    <button
                      onClick={() => deleteRecording(currentTranscript.id)}
                      className="w-11 h-11 rounded-full bg-white/[0.04] border border-white/[0.08] hover:bg-red-500/10 hover:border-red-500/20 flex items-center justify-center transition-all"
                      title="Discard"
                    >
                      <Trash2 className="w-4.5 h-4.5 text-zinc-400 hover:text-red-400" />
                    </button>
                  )}
                </>
              )}

              {recordingState === "error" && (
                <button
                  onClick={resetRecorder}
                  className="h-11 px-6 rounded-full bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.06] flex items-center gap-2 transition-all"
                >
                  <RotateCcw className="w-4 h-4 text-zinc-400" />
                  <span className="text-[13px] font-medium text-zinc-300">Try Again</span>
                </button>
              )}
            </div>
          </div>
        </Stagger>

        {/* Current transcript */}
        {currentTranscript && recordingState === "done" && (
          <Stagger>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5 mb-8">
              {/* Title */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-teal-500/[0.08] border border-teal-500/[0.15] flex items-center justify-center shrink-0 mt-0.5">
                  <FileText className="w-4 h-4 text-teal-400" />
                </div>
                <div className="flex-1 min-w-0">
                  {editingTitle ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") updateTitle(currentTranscript.id, titleDraft);
                          if (e.key === "Escape") setEditingTitle(false);
                        }}
                        className="flex-1 bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-[14px] text-white outline-none focus:border-teal-500/30"
                        autoFocus
                      />
                      <button
                        onClick={() => updateTitle(currentTranscript.id, titleDraft)}
                        className="text-[12px] text-teal-400 hover:text-teal-300"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-medium text-white truncate">
                        {currentTranscript.title}
                      </h3>
                      <button
                        onClick={() => {
                          setEditingTitle(true);
                          setTitleDraft(currentTranscript.title);
                        }}
                        className="text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500">
                    <span>{currentTranscript.wordCount} words</span>
                    <span className="text-zinc-700">·</span>
                    <span>{currentTranscript.language}</span>
                    <span className="text-zinc-700">·</span>
                    <span className="capitalize">{currentTranscript.provider}</span>
                  </div>
                </div>
              </div>

              {/* Transcript text */}
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4">
                <p className="text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {currentTranscript.transcript}
                </p>
              </div>
            </div>
          </Stagger>
        )}

        {/* Recording history */}
        <Stagger>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.04]">
              <div className="flex items-center gap-2">
                <Waves className="w-4 h-4 text-zinc-500" />
                <h2 className="text-[13px] font-semibold text-zinc-300 uppercase tracking-wider">
                  Recent Recordings
                </h2>
              </div>
              {recordings.length > 0 && (
                <span className="text-[11px] text-zinc-600">
                  {recordings.length} recording{recordings.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.04] animate-pulse shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-36 rounded bg-white/[0.05] animate-pulse" />
                      <div className="h-2.5 w-24 rounded bg-white/[0.03] animate-pulse" />
                    </div>
                    <div className="h-3 w-12 rounded bg-white/[0.03] animate-pulse" />
                  </div>
                ))}
              </div>
            ) : recordings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-3">
                  <Mic className="w-5 h-5 text-zinc-600" />
                </div>
                <p className="text-[13px] text-zinc-400 mb-1">No recordings yet</p>
                <p className="text-[12px] text-zinc-600">
                  Tap the record button above to capture your first thought
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {recordings.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group"
                  >
                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      rec.saved_as_memory
                        ? "bg-emerald-500/[0.06] border border-emerald-500/[0.12]"
                        : "bg-white/[0.03] border border-white/[0.06]"
                    }`}>
                      {rec.saved_as_memory ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Mic className="w-4 h-4 text-zinc-500" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[13px] font-medium text-white truncate">
                        {rec.title || "Untitled Recording"}
                      </h4>
                      <p className="text-[12px] text-zinc-500 line-clamp-1 mt-0.5">
                        {rec.transcript?.substring(0, 100)}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-600">
                        {rec.duration_seconds > 0 && (
                          <>
                            <span>{formatDuration(rec.duration_seconds)}</span>
                            <span className="text-zinc-700">·</span>
                          </>
                        )}
                        <span>{rec.word_count} words</span>
                        <span className="text-zinc-700">·</span>
                        <span>{formatRelativeTime(rec.created_at)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {!rec.saved_as_memory && (
                        <button
                          onClick={() => saveAsMemory(rec.id)}
                          disabled={saving === rec.id}
                          className="h-7 px-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-[11px] font-medium text-teal-400 hover:bg-teal-500/15 transition-all flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {saving === rec.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Save className="w-3 h-3" />
                          )}
                          Save
                        </button>
                      )}
                      <button
                        onClick={() => deleteRecording(rec.id)}
                        className="w-7 h-7 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-red-500/10 hover:border-red-500/20 flex items-center justify-center transition-all"
                      >
                        <Trash2 className="w-3 h-3 text-zinc-500 group-hover:text-zinc-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Stagger>
      </div>
    </PageTransition>
  );
}
