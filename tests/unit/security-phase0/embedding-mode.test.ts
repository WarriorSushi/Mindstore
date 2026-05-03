import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: { execute: executeMock },
}));

vi.mock("@/server/encryption", () => ({
  decrypt: (s: string) => s,
}));

const ORIGINAL_ENV = { ...process.env };
const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  // Force the Gemini provider path.
  delete process.env.OPENAI_API_KEY;
  delete process.env.OLLAMA_URL;
  process.env.GEMINI_API_KEY = "test-gemini-key";

  executeMock.mockReset().mockResolvedValue([]);
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue(
    new Response(JSON.stringify({ embeddings: [{ values: [0.1, 0.2] }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }) as any,
  );
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("generateEmbeddings(mode) — Gemini RETRIEVAL_QUERY fix", () => {
  it("defaults to RETRIEVAL_DOCUMENT for ingestion-side calls", async () => {
    const { generateEmbeddings } = await import("@/server/embeddings");
    await generateEmbeddings(["a memory body"]);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.requests[0].taskType).toBe("RETRIEVAL_DOCUMENT");
  });

  it("uses RETRIEVAL_QUERY when mode is 'query'", async () => {
    const { generateEmbeddings } = await import("@/server/embeddings");
    await generateEmbeddings(["search me"], { mode: "query" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.requests[0].taskType).toBe("RETRIEVAL_QUERY");
  });
});
