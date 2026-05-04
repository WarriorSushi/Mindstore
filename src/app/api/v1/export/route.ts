import { getUserId } from '@/server/user';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { sql } from 'drizzle-orm';

/**
 * GET /api/v1/export — export all user data as JSON backup
 * 
 * Includes: memories, tags, profile, facts, flashcard decks, settings
 * Can be re-imported via POST /api/v1/import with { memories: [...] }
 * 
 * Query params:
 *   ?format=json (default)
 *   ?format=markdown — flat markdown export
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'json';

    // Fetch all user data in parallel
    const [memoriesRes, tagsRes, memoryTagsRes, profileRes, factsRes, decksRes, settingsRes] = await Promise.allSettled([
      db.execute(sql`
        SELECT id, content, source_type, source_id, source_title, metadata, created_at, imported_at
        FROM memories WHERE user_id = ${userId}::uuid
        ORDER BY created_at
      `),
      db.execute(sql`
        SELECT id, name, color FROM tags WHERE user_id = ${userId}::uuid ORDER BY name
      `).catch(() => []),
      db.execute(sql`
        SELECT memory_id, tag_id FROM memory_tags
        WHERE memory_id IN (SELECT id FROM memories WHERE user_id = ${userId}::uuid)
      `).catch(() => []),
      db.execute(sql`
        SELECT key, value, category, confidence, source FROM profile
        WHERE user_id = ${userId}::uuid ORDER BY category, key
      `).catch(() => []),
      db.execute(sql`
        SELECT fact, category, entities, learned_at FROM facts
        WHERE user_id = ${userId}::uuid ORDER BY learned_at
      `).catch(() => []),
      db.execute(sql`
        SELECT name, description, color, cards, created_at FROM flashcard_decks
        WHERE user_id = ${userId}::uuid ORDER BY created_at
      `).catch(() => []),
      db.execute(sql`
        SELECT key, value FROM settings
        WHERE user_id = ${userId}::uuid
          AND key NOT LIKE '%api_key%' AND key NOT LIKE '%secret%'
      `).catch(() => []),
    ]);

    const memories = memoriesRes.status === 'fulfilled' ? (memoriesRes.value as any[]) : [];
    const tags = tagsRes.status === 'fulfilled' ? (tagsRes.value as any[]) : [];
    const memoryTags = memoryTagsRes.status === 'fulfilled' ? (memoryTagsRes.value as any[]) : [];
    const profileData = profileRes.status === 'fulfilled' ? (profileRes.value as any[]) : [];
    const facts = factsRes.status === 'fulfilled' ? (factsRes.value as any[]) : [];
    const decks = decksRes.status === 'fulfilled' ? (decksRes.value as any[]) : [];
    const settings = settingsRes.status === 'fulfilled' ? (settingsRes.value as any[]) : [];

    // Build tag lookup for memory-tag associations
    const tagMap = new Map<string, string>();
    for (const t of tags) tagMap.set(t.id, t.name);
    const memTagMap = new Map<string, string[]>();
    for (const mt of memoryTags as any[]) {
      const tagName = tagMap.get(mt.tag_id);
      if (tagName) {
        if (!memTagMap.has(mt.memory_id)) memTagMap.set(mt.memory_id, []);
        memTagMap.get(mt.memory_id)!.push(tagName);
      }
    }

    if (format === 'markdown') {
      // Markdown export — one big file grouped by source
      const bySource = new Map<string, any[]>();
      for (const m of memories) {
        const src = m.source_type || 'unknown';
        if (!bySource.has(src)) bySource.set(src, []);
        bySource.get(src)!.push(m);
      }

      let md = `# MindStore Export\n\nExported: ${new Date().toISOString()}\nTotal memories: ${memories.length}\n\n---\n\n`;

      for (const [source, mems] of bySource) {
        md += `## ${source} (${mems.length})\n\n`;
        for (const m of mems) {
          const title = m.source_title || 'Untitled';
          const tags = memTagMap.get(m.id) || [];
          md += `### ${title}\n`;
          if (tags.length > 0) md += `Tags: ${tags.join(', ')}\n`;
          md += `Date: ${m.created_at ? new Date(m.created_at).toISOString().split('T')[0] : 'unknown'}\n\n`;
          md += `${m.content}\n\n---\n\n`;
        }
      }

      return new NextResponse(md, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="mindstore-export-${new Date().toISOString().split('T')[0]}.md"`,
        },
      });
    }

    // JSON export
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      stats: {
        memories: memories.length,
        tags: tags.length,
        facts: facts.length,
        flashcardDecks: decks.length,
        profileEntries: profileData.length,
      },
      memories: memories.map(r => ({
        id: r.id,
        content: r.content,
        source: r.source_type,
        sourceId: r.source_id,
        sourceTitle: r.source_title,
        tags: memTagMap.get(r.id) || [],
        timestamp: r.created_at,
        importedAt: r.imported_at,
        metadata: r.metadata || {},
      })),
      tags: tags.map(t => ({ name: t.name, color: t.color })),
      profile: profileData.map(p => ({
        key: p.key,
        value: p.value,
        category: p.category,
        confidence: p.confidence,
      })),
      facts: facts.map(f => ({
        fact: f.fact,
        category: f.category,
        entities: f.entities,
        learnedAt: f.learned_at,
      })),
      flashcardDecks: decks.map(d => ({
        name: d.name,
        description: d.description,
        color: d.color,
        cards: d.cards,
        createdAt: d.created_at,
      })),
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="mindstore-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
