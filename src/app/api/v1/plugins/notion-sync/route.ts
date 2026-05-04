/**
 * Notion Sync Plugin — Route (thin wrapper)
 *
 * GET  ?action=config|history|preview
 * POST action=validate|save-config|create-database|sync|disconnect
 *
 * Logic delegated to src/server/plugins/ports/notion-sync.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import {
  ensureInstalled,
  getNotionConfig,
  saveNotionConfig,
  loadUserMemories,
  validateNotionToken,
  listNotionDatabases,
  createNotionDatabase,
  filterUnsyncedMemories,
  pushBatch,
  buildSyncRecord,
} from '@/server/plugins/ports/notion-sync';

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    await ensureInstalled();
    const action = req.nextUrl.searchParams.get('action') || 'config';
    const config = await getNotionConfig();

    if (action === 'config') {
      let databases: Array<{ id: string; title: string }> = [];
      if (config.apiToken) databases = await listNotionDatabases(config.apiToken);
      return NextResponse.json({
        connected: !!config.apiToken,
        databaseId: config.databaseId || null,
        databaseName: config.databaseName || null,
        syncDirection: config.syncDirection,
        autoSync: config.autoSync,
        syncInterval: config.syncInterval,
        lastSyncAt: config.lastSyncAt || null,
        lastSyncCount: config.lastSyncCount || 0,
        totalSynced: config.totalSynced || 0,
        filterBySource: config.filterBySource || [],
        databases,
      });
    }

    if (action === 'history') {
      return NextResponse.json({ history: (config.syncHistory || []).slice(0, 20) });
    }

    if (action === 'preview') {
      const syncedIds = new Set(config.syncedMemoryIds || []);
      const memories = await loadUserMemories(userId);
      const unsynced = filterUnsyncedMemories(memories, syncedIds);

      const sourceBreakdown: Record<string, number> = {};
      for (const m of unsynced) sourceBreakdown[m.sourceType || 'text'] = (sourceBreakdown[m.sourceType || 'text'] || 0) + 1;

      return NextResponse.json({
        totalMemories: memories.length, unsyncedCount: unsynced.length,
        syncedCount: syncedIds.size, sourceBreakdown,
        sample: unsynced.slice(0, 5).map(m => ({
          id: m.id, title: m.sourceTitle || m.content.split('\n')[0].substring(0, 60),
          sourceType: m.sourceType, createdAt: m.createdAt, preview: m.content.substring(0, 120),
        })),
      });
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

  const limited = applyRateLimit(req, 'plugin-notion-sync', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    await ensureInstalled();
    const body = await req.json();
    const { action } = body;

    if (action === 'validate') {
      if (!body.token) return NextResponse.json({ error: 'Token required' }, { status: 400 });
      const result = await validateNotionToken(body.token);
      let databases: Array<{ id: string; title: string }> = [];
      if (result.valid) databases = await listNotionDatabases(body.token);
      return NextResponse.json({ ...result, databases });
    }

    if (action === 'save-config') {
      const config = await getNotionConfig();
      if (body.token) config.apiToken = body.token;
      if (body.databaseId !== undefined) config.databaseId = body.databaseId;
      if (body.databaseName !== undefined) config.databaseName = body.databaseName;
      if (body.syncDirection !== undefined) config.syncDirection = body.syncDirection;
      if (body.autoSync !== undefined) config.autoSync = body.autoSync;
      if (body.syncInterval !== undefined) config.syncInterval = body.syncInterval;
      if (body.filterBySource !== undefined) config.filterBySource = body.filterBySource;
      await saveNotionConfig(config);
      return NextResponse.json({ success: true });
    }

    if (action === 'create-database') {
      const config = await getNotionConfig();
      if (!config.apiToken) return NextResponse.json({ error: 'Not connected to Notion' }, { status: 400 });
      const result = await createNotionDatabase(config.apiToken);
      if (!result) return NextResponse.json({ error: 'Failed to create database' }, { status: 400 });
      config.databaseId = result.id;
      config.databaseName = result.title;
      await saveNotionConfig(config);
      return NextResponse.json({ success: true, database: result });
    }

    if (action === 'sync') {
      const config = await getNotionConfig();
      if (!config.apiToken) return NextResponse.json({ error: 'Not connected to Notion' }, { status: 400 });
      if (!config.databaseId) return NextResponse.json({ error: 'No database selected' }, { status: 400 });

      const syncedIds = new Set(config.syncedMemoryIds || []);
      const allMemories = await loadUserMemories(userId);
      const toSync = filterUnsyncedMemories(allMemories, syncedIds, config.filterBySource);
      const { successCount, errors, syncedIds: newIds } = await pushBatch(config.apiToken, config.databaseId, toSync, 50);

      config.syncedMemoryIds = [...(config.syncedMemoryIds || []), ...newIds];
      config.lastSyncAt = new Date().toISOString();
      config.lastSyncCount = successCount;
      config.totalSynced = (config.totalSynced || 0) + successCount;
      config.syncHistory = [buildSyncRecord(successCount, errors), ...(config.syncHistory || [])].slice(0, 50);
      await saveNotionConfig(config);

      return NextResponse.json({
        success: true, synced: successCount, errors: errors.length,
        remaining: toSync.length - Math.min(toSync.length, 50),
      });
    }

    if (action === 'disconnect') {
      const config = await getNotionConfig();
      config.apiToken = undefined;
      config.databaseId = undefined;
      config.databaseName = undefined;
      config.syncedMemoryIds = [];
      config.totalSynced = 0;
      await saveNotionConfig(config);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
