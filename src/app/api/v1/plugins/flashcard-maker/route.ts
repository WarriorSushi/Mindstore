import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from "@/server/api-rate-limit";
import { requireUserId } from "@/server/api-validation";
import {
  createFlashcardDeck,
  deleteFlashcard,
  deleteFlashcardDeck,
  ensureFlashcardMakerInstalled,
  generateFlashcards,
  getFlashcardDeckDetail,
  getFlashcardReviewSession,
  getFlashcardStats,
  listFlashcardDeckSummaries,
  reviewFlashcard,
  saveFlashcardsToDeck,
} from "@/server/plugins/ports/flashcard-maker";

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureFlashcardMakerInstalled();
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "decks";

    if (action === "decks") {
      return NextResponse.json({ decks: await listFlashcardDeckSummaries(userId) });
    }

    if (action === "cards") {
      const deckId = searchParams.get("deckId");
      if (!deckId) {
        return NextResponse.json({ error: "deckId required" }, { status: 400 });
      }

      const deck = await getFlashcardDeckDetail(userId, deckId);
      if (!deck) {
        return NextResponse.json({ error: "Deck not found" }, { status: 404 });
      }

      return NextResponse.json({ deck });
    }

    if (action === "review") {
      const deckId = searchParams.get("deckId");
      if (!deckId) {
        return NextResponse.json({ error: "deckId required" }, { status: 400 });
      }

      const review = await getFlashcardReviewSession(userId, deckId);
      if (!review) {
        return NextResponse.json({ error: "Deck not found" }, { status: 404 });
      }

      return NextResponse.json(review);
    }

    if (action === "generate") {
      const memoryIds = searchParams.get("memoryIds")?.split(",").filter(Boolean);
      const topic = searchParams.get("topic") || undefined;
      const limit = Number.parseInt(searchParams.get("limit") || "10", 10);
      return NextResponse.json(await generateFlashcards(userId, { memoryIds, topic, limit }));
    }

    if (action === "stats") {
      return NextResponse.json(await getFlashcardStats(userId));
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "No AI provider configured" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-flashcard-maker', RATE_LIMITS.ai);
  if (limited) return limited;

  try {
    await ensureFlashcardMakerInstalled();
    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "create-deck") {
      return NextResponse.json({
        deck: await createFlashcardDeck(userId, {
          name: String(body.name || ""),
          description: typeof body.description === "string" ? body.description : undefined,
          color: typeof body.color === "string" ? body.color : undefined,
        }),
      });
    }

    if (action === "save-cards") {
      if (typeof body.deckId !== "string" || !Array.isArray(body.cards) || body.cards.length === 0) {
        return NextResponse.json({ error: "deckId and cards required" }, { status: 400 });
      }

      return NextResponse.json(await saveFlashcardsToDeck(userId, body.deckId, body.cards));
    }

    if (action === "review-card") {
      if (typeof body.deckId !== "string" || typeof body.cardId !== "string" || typeof body.grade !== "number") {
        return NextResponse.json({ error: "deckId, cardId, and grade required" }, { status: 400 });
      }
      if (body.grade < 0 || body.grade > 5) {
        return NextResponse.json({ error: "grade must be 0-5" }, { status: 400 });
      }

      return NextResponse.json(await reviewFlashcard(userId, body.deckId, body.cardId, body.grade));
    }

    if (action === "delete-deck") {
      if (typeof body.deckId !== "string") {
        return NextResponse.json({ error: "deckId required" }, { status: 400 });
      }
      return NextResponse.json(await deleteFlashcardDeck(userId, body.deckId));
    }

    if (action === "delete-card") {
      if (typeof body.deckId !== "string" || typeof body.cardId !== "string") {
        return NextResponse.json({ error: "deckId and cardId required" }, { status: 400 });
      }
      return NextResponse.json(await deleteFlashcard(userId, body.deckId, body.cardId));
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") || message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
