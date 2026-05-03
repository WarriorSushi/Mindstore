import { importDocuments } from "@/server/import-service";
import { assertPluginEnabled } from "@/server/plugins/ports/plugin-config";

const PLUGIN_SLUG = "youtube-transcript";

export interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

export interface VideoMetadata {
  title: string;
  channel: string;
  videoId: string;
  description: string;
  duration: string;
  thumbnailUrl: string;
  publishDate: string;
}

export interface TopicChunk {
  title: string;
  content: string;
  startTime: number;
  endTime: number;
  startTimestamp: string;
  endTimestamp: string;
  wordCount: number;
}

export interface TranscriptPreview {
  totalWords: number;
  totalSegments: number;
  totalChunks: number;
  durationFormatted: string;
  readingTime: string;
  preview: string;
  chunks: Array<{
    title: string;
    startTimestamp: string;
    endTimestamp: string;
    wordCount: number;
    preview: string;
  }>;
}

const YT_REGEX =
  /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;

export async function ensureYouTubeTranscriptReady() {
  await assertPluginEnabled(PLUGIN_SLUG);
}

export function extractVideoId(url: string): string | null {
  const match = url.match(YT_REGEX);
  return match?.[1] || null;
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function parseISODuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (
    Number.parseInt(match[1] || "0", 10) * 3600
    + Number.parseInt(match[2] || "0", 10) * 60
    + Number.parseInt(match[3] || "0", 10)
  );
}

function extractMeta(html: string, name: string, attr: string = "property"): string {
  const r1 = new RegExp(`<meta\\s+${attr}="${name}"\\s+content="([^"]*)"`, "i");
  const r2 = new RegExp(`<meta\\s+content="([^"]*)"\\s+${attr}="${name}"`, "i");
  const r3 = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, "i");
  const r4 = new RegExp(`<meta\\s+content="([^"]*)"\\s+name="${name}"`, "i");
  return (
    r1.exec(html)?.[1]
    || r2.exec(html)?.[1]
    || r3.exec(html)?.[1]
    || r4.exec(html)?.[1]
    || ""
  );
}

function extractBetween(html: string, start: string, end: string): string | null {
  const startIndex = html.indexOf(start);
  if (startIndex === -1) return null;
  const endIndex = html.indexOf(end, startIndex + start.length);
  if (endIndex === -1) return null;
  return html.slice(startIndex + start.length, endIndex).trim();
}

function extractJsonField(html: string, field: string): string {
  const pattern = new RegExp(`${field.replace(/"/g, '"')}\\s*:\\s*"([^"]{1,200})"`, "i");
  return html.match(pattern)?.[1] || "";
}

export async function fetchVideoMetadata(videoId: string): Promise<VideoMetadata> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch video page: ${response.status}`);
    }

    const html = await response.text();
    const title =
      extractMeta(html, "og:title")
      || extractMeta(html, "title")
      || extractBetween(html, "<title>", "</title>")?.replace(" - YouTube", "")
      || "Untitled Video";

    const channel =
      extractMeta(html, "og:video:tag")
      || extractJsonField(html, '"ownerChannelName"')
      || extractJsonField(html, '"author"')
      || "Unknown Channel";

    const description = extractMeta(html, "og:description") || extractMeta(html, "description") || "";
    const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const durationISO = extractMeta(html, "duration", "itemprop");
    const durationSeconds = durationISO ? parseISODuration(durationISO) : 0;
    const publishDate =
      extractMeta(html, "datePublished", "itemprop") || extractJsonField(html, '"publishDate"') || "";

    return {
      title,
      channel,
      videoId,
      description,
      duration: durationSeconds > 0 ? formatTime(durationSeconds) : "",
      thumbnailUrl,
      publishDate,
    };
  } catch {
    return {
      title: "YouTube Video",
      channel: "Unknown",
      videoId,
      description: "",
      duration: "",
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      publishDate: "",
    };
  }
}

export function cleanTranscriptText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n/g, " ")
    .trim();
}

export function normalizeSegments(
  raw: Array<{ text: string; offset: number; duration: number }>,
): TranscriptSegment[] {
  if (raw.length === 0) return [];

  const firstOffset = raw[0]?.offset || 0;
  const isMilliseconds = firstOffset > 1000 || (raw.length > 1 && (raw[1]?.offset || 0) > 100);

  return raw.map((segment) => ({
    text: segment.text,
    offset: isMilliseconds ? segment.offset / 1000 : segment.offset,
    duration: isMilliseconds ? segment.duration / 1000 : segment.duration,
  }));
}

export function chunkTranscript(
  segments: TranscriptSegment[],
  videoTitle: string,
  maxChunkChars: number = 3500,
): TopicChunk[] {
  if (segments.length === 0) return [];

  const chunks: TopicChunk[] = [];
  let currentSegments: TranscriptSegment[] = [];
  let currentText = "";
  let chunkStartTime = segments[0].offset;

  const flushChunk = () => {
    if (!currentText.trim()) return;

    const endSegment = currentSegments[currentSegments.length - 1];
    const endTime = endSegment.offset + endSegment.duration;
    const startTimestamp = formatTime(Math.floor(chunkStartTime));
    const endTimestamp = formatTime(Math.floor(endTime));

    chunks.push({
      title: `${videoTitle} [${startTimestamp}-${endTimestamp}]`,
      content: currentText.trim(),
      startTime: chunkStartTime,
      endTime,
      startTimestamp,
      endTimestamp,
      wordCount: currentText.split(/\s+/).filter(Boolean).length,
    });

    currentSegments = [];
    currentText = "";
  };

  for (const segment of segments) {
    const cleanText = cleanTranscriptText(segment.text);

    if (currentSegments.length === 0) {
      chunkStartTime = segment.offset;
    }

    const previousSegment = currentSegments[currentSegments.length - 1];
    const gap = previousSegment ? segment.offset - (previousSegment.offset + previousSegment.duration) : 0;
    const isLongPause = gap > 3;
    const wouldExceedTarget = currentText.length + cleanText.length > maxChunkChars;
    const atMinSize = currentText.length > 800;

    if (atMinSize && (isLongPause || wouldExceedTarget)) {
      flushChunk();
      chunkStartTime = segment.offset;
    }

    currentSegments.push(segment);
    currentText += `${currentText ? " " : ""}${cleanText}`;
  }

  flushChunk();
  return chunks;
}

export function formatChunkForMemory(
  chunk: TopicChunk,
  metadata: VideoMetadata,
  chunkIndex: number,
  totalChunks: number,
) {
  const parts: string[] = [
    `# ${metadata.title}`,
    `**Channel:** ${metadata.channel}`,
  ];

  if (metadata.publishDate) {
    parts.push(`**Published:** ${metadata.publishDate}`);
  }

  parts.push(`**Segment:** ${chunk.startTimestamp} - ${chunk.endTimestamp}`);

  if (totalChunks > 1) {
    parts.push(`**Part:** ${chunkIndex + 1} of ${totalChunks}`);
  }

  parts.push(`**Words:** ${chunk.wordCount.toLocaleString()}`, "", "---", "", chunk.content);

  return {
    content: parts.join("\n"),
    sourceTitle: totalChunks === 1 ? metadata.title : `${metadata.title} (Part ${chunkIndex + 1})`,
  };
}

export function buildTranscriptPreview(
  segments: TranscriptSegment[],
  metadata: VideoMetadata,
  chunks: TopicChunk[],
): TranscriptPreview {
  const fullText = segments.map((segment) => cleanTranscriptText(segment.text)).join(" ");
  const totalWords = fullText.split(/\s+/).filter(Boolean).length;

  return {
    totalWords,
    totalSegments: segments.length,
    totalChunks: chunks.length,
    durationFormatted: metadata.duration,
    readingTime: `${Math.ceil(totalWords / 225)} min`,
    preview: fullText.substring(0, 500) + (fullText.length > 500 ? "…" : ""),
    chunks: chunks.map((chunk) => ({
      title: chunk.title,
      startTimestamp: chunk.startTimestamp,
      endTimestamp: chunk.endTimestamp,
      wordCount: chunk.wordCount,
      preview: chunk.content.substring(0, 150) + (chunk.content.length > 150 ? "…" : ""),
    })),
  };
}

function mapTranscriptError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown transcript error";
  if (message.includes("disabled")) return "Transcripts are disabled for this video.";
  if (message.includes("not available") || message.includes("No transcripts")) {
    return "No transcripts available for this video. It may not have captions.";
  }
  if (message.includes("Too many")) return "YouTube rate limit hit. Please wait a minute and try again.";
  return `Failed to fetch transcript: ${message}`;
}

async function fetchTranscriptState(url: string) {
  const videoId = extractVideoId(url.trim());

  if (!videoId) {
    throw new Error("Invalid YouTube URL. Supported formats: youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/...");
  }

  await ensureYouTubeTranscriptReady();
  const { YoutubeTranscript } = await import("youtube-transcript");

  const [metadata, rawTranscript] = await Promise.all([
    fetchVideoMetadata(videoId),
    YoutubeTranscript.fetchTranscript(videoId).catch((error: unknown) => {
      throw new Error(mapTranscriptError(error));
    }),
  ]);

  if (!rawTranscript || rawTranscript.length === 0) {
    throw new Error("No transcript content found for this video.");
  }

  const segments = normalizeSegments(rawTranscript);
  const chunks = chunkTranscript(segments, metadata.title);
  const lastSegment = segments[segments.length - 1];
  const totalDuration = lastSegment ? lastSegment.offset + lastSegment.duration : 0;

  if (!metadata.duration && totalDuration > 0) {
    metadata.duration = formatTime(Math.floor(totalDuration));
  }

  return { videoId, metadata, segments, chunks };
}

export async function previewYouTubeTranscript(url: string) {
  const { videoId, metadata, segments, chunks } = await fetchTranscriptState(url);

  return {
    video: {
      title: metadata.title,
      channel: metadata.channel,
      videoId: metadata.videoId,
      duration: metadata.duration,
      thumbnailUrl: metadata.thumbnailUrl,
      publishDate: metadata.publishDate,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    },
    transcript: buildTranscriptPreview(segments, metadata, chunks),
  };
}

export async function importYouTubeTranscript({
  userId,
  url,
}: {
  userId: string;
  url: string;
}) {
  const { metadata, segments, chunks } = await fetchTranscriptState(url);
  const documents = chunks.map((chunk, index) => {
    const formatted = formatChunkForMemory(chunk, metadata, index, chunks.length);
    return {
      title: formatted.sourceTitle,
      content: formatted.content,
      sourceType: "youtube",
      metadata: {
        plugin: PLUGIN_SLUG,
        videoId: metadata.videoId,
        channel: metadata.channel,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
      },
      preChunked: true,
    };
  });

  const summary = await importDocuments({ userId, documents });
  const totalWords = segments.reduce(
    (sum, segment) => sum + cleanTranscriptText(segment.text).split(/\s+/).filter(Boolean).length,
    0,
  );

  return {
    imported: {
      video: {
        title: metadata.title,
        channel: metadata.channel,
        videoId: metadata.videoId,
        duration: metadata.duration,
      },
      totalWords,
      chunks: summary.chunks,
      embedded: summary.embedded,
      chunkDetails: chunks.map((chunk) => ({
        title: chunk.title,
        startTimestamp: chunk.startTimestamp,
        endTimestamp: chunk.endTimestamp,
        wordCount: chunk.wordCount,
      })),
    },
  };
}
