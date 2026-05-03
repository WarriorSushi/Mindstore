import { NextRequest, NextResponse } from "next/server";
import { normalizeCaptureQuery } from "@/server/capture";
import { generateEmbeddings } from "@/server/embeddings";
import { retrieve } from "@/server/retrieval";
import { getUserId } from "@/server/user";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  return handleQuery(searchParams.get("q"), searchParams.get("limit"));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return handleQuery(body?.query, body?.limit);
}

async function handleQuery(rawQuery: unknown, rawLimit: unknown) {
  try {
    const { query, limit } = normalizeCaptureQuery(rawQuery, rawLimit);

    if (!query) {
      return NextResponse.json({ error: "Missing query." }, { status: 400 });
    }

    const userId = await getUserId();
    let queryEmbedding: number[] | null = null;

    try {
      // Search-side embedding — Gemini needs RETRIEVAL_QUERY tagging.
      const embeddings = await generateEmbeddings([query], { mode: 'query' });
      queryEmbedding = embeddings && embeddings.length > 0 ? embeddings[0] : null;
    } catch {
      queryEmbedding = null;
    }

    const results = await retrieve(query, queryEmbedding, {
      userId,
      limit,
    });

    return NextResponse.json({
      query,
      results: results.map((result) => ({
        id: result.memoryId,
        title: result.sourceTitle || "Untitled Memory",
        sourceType: result.sourceType,
        excerpt: compactExcerpt(result.content),
        url: typeof result.metadata.url === "string" ? result.metadata.url : null,
        score: Number(result.score.toFixed(4)),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function compactExcerpt(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, 280);
}
