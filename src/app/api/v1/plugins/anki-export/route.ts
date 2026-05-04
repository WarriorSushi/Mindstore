/**
 * Anki Deck Export Plugin — Route (thin wrapper)
 *
 * GET  ?action=decks          — List available decks for export
 * GET  ?action=preview&deckId= — Preview cards in a deck
 * GET  ?action=config         — Get export configuration
 * POST ?action=export         — Generate and return .apkg file
 * POST ?action=export-csv     — Export as CSV (simpler alternative)
 *
 * Logic delegated to src/server/plugins/ports/anki-export.ts
 */

import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { NextRequest, NextResponse } from 'next/server';
import {
  ensureInstalled,
  getDecks,
  getMemoryCount,
  summarizeDecks,
  totalCards,
  createExportPackage,
  computeExportStats,
  exportCardsCSV,
  EXPORT_FORMATS,
} from '@/server/plugins/ports/anki-export';

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureInstalled();
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'decks';

    if (action === 'decks') {
      const decks = await getDecks();
      return NextResponse.json({
        decks: summarizeDecks(decks),
        totalCards: totalCards(decks),
        totalMemories: await getMemoryCount(userId),
        formats: EXPORT_FORMATS,
      });
    }

    if (action === 'preview') {
      const deckId = searchParams.get('deckId');
      if (!deckId) return NextResponse.json({ error: 'deckId required' }, { status: 400 });
      const decks = await getDecks();
      const deck = decks.find(d => d.id === deckId);
      if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

      return NextResponse.json({
        deck: {
          id: deck.id, name: deck.name, description: deck.description,
          color: deck.color, cardCount: deck.cards.length,
        },
        cards: deck.cards.slice(0, 20).map(c => ({
          id: c.id, front: c.front, back: c.back, hint: c.hint,
          tags: c.tags, source: c.sourceTitle,
          ease: c.sm2.easeFactor, interval: c.sm2.interval, reps: c.sm2.repetitions,
        })),
        hasMore: deck.cards.length > 20,
        totalCards: deck.cards.length,
      });
    }

    if (action === 'config') {
      const decks = await getDecks();
      return NextResponse.json({
        hasFlashcards: decks.some(d => d.cards.length > 0),
        deckCount: decks.length,
        totalCards: totalCards(decks),
        supportedFormats: ['tsv', 'csv'],
        ankiImportGuide: 'https://docs.ankiweb.net/importing/text-files.html',
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-anki-export', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    await ensureInstalled();
    const body = await req.json();

    if (body.action === 'export') {
      const { deckIds = [], format = 'tsv', includeMetadata = false } = body;
      const decks = await getDecks();

      if (decks.length === 0 || decks.every(d => d.cards.length === 0)) {
        return NextResponse.json({
          error: 'No flashcards to export. Create some flashcards first using the Flashcard Maker plugin.',
        }, { status: 400 });
      }

      const { buffer, filename, contentType } = await createExportPackage(decks, deckIds, format, includeMetadata);
      return NextResponse.json({
        file: buffer.toString('base64'),
        filename,
        contentType,
        size: buffer.length,
        stats: computeExportStats(decks, deckIds),
      });
    }

    if (body.action === 'export-csv') {
      const { deckIds = [], includeMetadata = true } = body;
      const decks = await getDecks();
      const { csv, cardCount } = exportCardsCSV(decks, deckIds, includeMetadata);

      if (cardCount === 0) {
        return NextResponse.json({ error: 'No cards to export' }, { status: 400 });
      }

      return NextResponse.json({
        file: Buffer.from(csv).toString('base64'),
        filename: 'mindstore_flashcards.csv',
        contentType: 'text/csv',
        size: Buffer.from(csv).length,
        cardCount,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
