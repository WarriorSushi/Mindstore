/**
 * Markdown Blog Export Plugin — Route (thin wrapper)
 *
 * GET  ?action=config|preview
 * POST ?action=export
 *
 * Logic delegated to src/server/plugins/ports/markdown-blog-export.ts
 */

import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import {
  ensureInstalled,
  fetchMemories,
  getSourceStats,
  TEMPLATES,
  getTemplate,
  getFileName,
  buildExportContent,
  ASTRO_CONTENT_CONFIG,
} from '@/server/plugins/ports/markdown-blog-export';

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureInstalled();
    const action = req.nextUrl.searchParams.get('action') || 'config';

    if (action === 'config') {
      return NextResponse.json({
        templates: TEMPLATES,
        stats: await getSourceStats(userId),
      });
    }

    if (action === 'preview') {
      const templateId = req.nextUrl.searchParams.get('template') || 'plain';
      const sourceType = req.nextUrl.searchParams.get('sourceType') || undefined;
      const template = getTemplate(templateId);
      const memories = await fetchMemories(userId, sourceType);

      return NextResponse.json({
        previews: memories.slice(0, 5).map((m, i) => ({
          id: m.id,
          fileName: getFileName(m, template, i),
          title: m.source_title,
          preview: buildExportContent(m, template, { author: '', draft: false, includeMetadata: true }).slice(0, 500),
          wordCount: m.content.split(/\s+/).filter(Boolean).length,
        })),
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

  const limited = applyRateLimit(req, 'plugin-markdown-blog-export', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    await ensureInstalled();
    const body = await req.json();

    if (body.action === 'export') {
      const {
        templateId = 'plain', sourceTypes, author = '',
        draft = false, includeMetadata = true, groupBySource = false,
      } = body;

      const template = getTemplate(templateId);
      let memories;
      if (sourceTypes?.length) {
        const all = [];
        for (const st of sourceTypes) all.push(...(await fetchMemories(userId, st)));
        memories = all;
      } else {
        memories = await fetchMemories(userId);
      }

      if (memories.length === 0) {
        return NextResponse.json({ error: 'No memories to export' }, { status: 400 });
      }

      const zip = new JSZip();
      let totalWords = 0;

      for (let i = 0; i < memories.length; i++) {
        const m = memories[i];
        const fileName = getFileName(m, template, i);
        const content = buildExportContent(m, template, { author, draft, includeMetadata });
        totalWords += m.content.split(/\s+/).filter(Boolean).length;
        const path = groupBySource
          ? `${template.contentDir}/${m.source_type}/${fileName}`
          : `${template.contentDir}/${fileName}`;
        zip.file(path, content);
      }

      if (templateId === 'astro') zip.file('src/content/config.ts', ASTRO_CONTENT_CONFIG);
      zip.file('README.md', [
        '# MindStore Blog Export', '',
        `Exported ${memories.length} posts on ${new Date().toISOString().slice(0, 10)}`,
        `Framework: ${template.name}`,
        `Total words: ${totalWords.toLocaleString()}`,
      ].join('\n'));

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      return NextResponse.json({
        file: zipBuffer.toString('base64'),
        filename: `mindstore_${templateId}_export.zip`,
        contentType: 'application/zip',
        stats: { postsExported: memories.length, totalWords, template: template.name },
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
