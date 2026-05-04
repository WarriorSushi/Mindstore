/**
 * Obsidian Vault Sync Plugin — Route (thin wrapper)
 *
 * GET  ?action=config|preview
 * POST action=save-config|export
 *
 * Logic delegated to src/server/plugins/ports/obsidian-sync.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import JSZip from 'jszip';
import {
  ensureInstalled,
  getObsidianConfig,
  saveObsidianConfig,
  loadMemories,
  loadConnections,
  buildVaultFileMap,
  buildExportPreview,
  buildExportSyncRecord,
} from '@/server/plugins/ports/obsidian-sync';

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureInstalled();
    const action = req.nextUrl.searchParams.get('action') || 'config';
    const config = await getObsidianConfig();

    if (action === 'config') {
      return NextResponse.json({ ...config, apiToken: undefined });
    }

    if (action === 'preview') {
      const memories = await loadMemories(userId);
      return NextResponse.json(buildExportPreview(memories, config));
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-obsidian-sync', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    await ensureInstalled();
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
    }

    const body = await req.json();

    if (body.action === 'save-config') {
      const config = await getObsidianConfig();
      if (body.vaultName !== undefined) config.vaultName = body.vaultName;
      if (body.folderStructure !== undefined) config.folderStructure = body.folderStructure;
      if (body.includeMetadata !== undefined) config.includeMetadata = body.includeMetadata;
      if (body.includeTags !== undefined) config.includeTags = body.includeTags;
      if (body.includeBacklinks !== undefined) config.includeBacklinks = body.includeBacklinks;
      if (body.includeWikilinks !== undefined) config.includeWikilinks = body.includeWikilinks;
      if (body.frontmatterStyle !== undefined) config.frontmatterStyle = body.frontmatterStyle;
      if (body.filterBySource !== undefined) config.filterBySource = body.filterBySource;
      await saveObsidianConfig(config);
      return NextResponse.json({ success: true });
    }

    if (body.action === 'export') {
      const config = await getObsidianConfig();
      let memories = await loadMemories(userId);

      if (config.filterBySource?.length) {
        memories = memories.filter(m => config.filterBySource!.includes(m.sourceType || 'text'));
      }

      let connections: any[] = [];
      if (config.includeBacklinks || config.includeWikilinks) {
        connections = await loadConnections(userId);
      }

      const fileMap = buildVaultFileMap(memories, connections, config);
      const zip = new JSZip();
      const vaultFolder = zip.folder(config.vaultName || 'MindStore')!;

      for (const [path, content] of fileMap) {
        vaultFolder.file(path, content);
      }

      // .obsidian config
      const obsFolder = vaultFolder.folder('.obsidian')!;
      obsFolder.file('app.json', JSON.stringify({ showViewHeader: true, alwaysUpdateLinks: true }, null, 2));
      obsFolder.file('appearance.json', JSON.stringify({ baseFontSize: 16, theme: 'obsidian' }, null, 2));

      vaultFolder.file('README.md', [
        `# ${config.vaultName || 'MindStore'} Vault`,
        '', `Exported from MindStore on ${new Date().toISOString().split('T')[0]}.`,
        '', '## Stats',
        `- **Memories exported:** ${memories.length}`,
        `- **Folder structure:** ${config.folderStructure}`,
        `- **Frontmatter:** ${config.frontmatterStyle === 'yaml' ? 'YAML' : 'None'}`,
        `- **Tags included:** ${config.includeTags ? 'Yes' : 'No'}`,
        `- **Wikilinks:** ${config.includeWikilinks ? 'Yes' : 'No'}`,
      ].join('\n'));

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Update config with sync record
      config.lastExportAt = new Date().toISOString();
      config.exportCount = (config.exportCount || 0) + 1;
      config.exportedMemoryIds = memories.map(m => String(m.id));
      config.syncHistory = [buildExportSyncRecord(memories.length), ...(config.syncHistory || [])].slice(0, 50);
      await saveObsidianConfig(config);

      return new Response(new Uint8Array(zipBuffer), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${config.vaultName || 'MindStore'}-vault.zip"`,
        },
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
