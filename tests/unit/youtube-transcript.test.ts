import { describe, expect, it } from "vitest";
import {
  buildTranscriptPreview,
  chunkTranscript,
  extractVideoId,
  normalizeSegments,
} from "@/server/plugins/ports/youtube-importer";

describe("youtube transcript port", () => {
  it("extracts a video id from common YouTube URLs", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("normalizes millisecond transcript offsets to seconds", () => {
    const segments = normalizeSegments([
      { text: "hello", offset: 1200, duration: 1800 },
      { text: "world", offset: 4000, duration: 900 },
    ]);

    expect(segments[0]?.offset).toBeCloseTo(1.2);
    expect(segments[1]?.duration).toBeCloseTo(0.9);
  });

  it("chunks and previews a transcript", () => {
    const segments = normalizeSegments([
      { text: "We start with the first idea. ".repeat(20), offset: 0, duration: 2 },
      { text: "Then we expand it with more context. ".repeat(20), offset: 2.1, duration: 2 },
      { text: "A long pause happens here. ".repeat(10), offset: 8, duration: 1.5 },
      { text: "Then a second topic begins. ".repeat(10), offset: 10, duration: 2 },
    ]);

    const chunks = chunkTranscript(segments, "Demo Video", 60);
    const preview = buildTranscriptPreview(segments, {
      title: "Demo Video",
      channel: "MindStore",
      videoId: "demo1234567",
      description: "",
      duration: "0:12",
      thumbnailUrl: "",
      publishDate: "",
    }, chunks);

    expect(chunks.length).toBeGreaterThan(1);
    expect(preview.totalSegments).toBe(4);
    expect(preview.chunks[0]?.title).toContain("Demo Video");
  });
});
