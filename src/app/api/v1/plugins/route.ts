/**
 * Plugin Registry API
 * 
 * GET  /api/v1/plugins         — List all plugins (catalog + installed status)
 * POST /api/v1/plugins         — Install a plugin
 * 
 * Query params:
 *   ?category=import|analysis|action|export|ai
 *   ?installed=true|false
 *   ?slug=kindle-importer      — Get a single plugin's details
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/server/db';
import { eq } from 'drizzle-orm';
import { FEATURED_PLUGIN_SLUGS, pluginRuntime } from '@/server/plugins/runtime';
import type { PluginStatus } from '@/server/plugins/types';
import {
  getPluginJobSchedules,
  runPluginJob,
  upsertPluginJobSchedule,
} from '@/server/plugin-jobs';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const installed = searchParams.get('installed');
    const slug = searchParams.get('slug');

    // ─── Single plugin detail ─────────────────────────────────
    if (slug) {
      const canonicalSlug = pluginRuntime.resolveSlug(slug) ?? slug;
      const manifest = pluginRuntime.getManifest(canonicalSlug);
      if (!manifest) {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
      }

      // Check if installed
      const [dbRecord] = await db
        .select()
        .from(schema.plugins)
        .where(eq(schema.plugins.slug, canonicalSlug))
        .limit(1);

      return NextResponse.json({
        ...manifest,
        source: pluginRuntime.resolvePlugin(canonicalSlug)?.descriptor.source ?? 'builtin',
        installed: !!dbRecord,
        status: dbRecord?.status || null,
        config: dbRecord?.config || {},
        dashboardWidgets: pluginRuntime.getDashboardWidgetDefinitions(canonicalSlug),
        jobs: pluginRuntime.getJobDefinitions(canonicalSlug),
        runtimeSurfaces: {
          dashboardWidgets: pluginRuntime.getDashboardWidgetDefinitions(canonicalSlug).length,
          jobs: pluginRuntime.getJobDefinitions(canonicalSlug).length,
        },
        jobRuns: getJobRuns(dbRecord?.metadata),
        jobSchedules: Object.fromEntries(
          (await getPluginJobSchedules(userId, canonicalSlug)).map((schedule) => [schedule.jobId, schedule])
        ),
        installedAt: dbRecord?.installedAt || null,
        lastError: dbRecord?.lastError || null,
      });
    }

    // ─── Full catalog ─────────────────────────────────────────
    
    // Get all installed plugins from DB
    const installedPlugins = await db.select().from(schema.plugins);
    const installedMap = new Map(
      installedPlugins.map((p) => [p.slug, { status: p.status, config: p.config as Record<string, unknown> }])
    );

    // Build catalog
    let catalog = pluginRuntime.buildStoreCatalog(installedMap, FEATURED_PLUGIN_SLUGS);

    // Filter by category
    if (category) {
      catalog = catalog.filter((p) => p.category === category);
    }

    // Filter by installed status
    if (installed === 'true') {
      catalog = catalog.filter((p) => p.installed);
    } else if (installed === 'false') {
      catalog = catalog.filter((p) => !p.installed);
    }

    // Sort: featured first, then alphabetical
    catalog.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return a.name.localeCompare(b.name);
    });

    // Count summary
    const summary = {
      total: pluginRuntime.getAllManifests().length,
      installed: installedPlugins.length,
      active: installedPlugins.filter((p) => p.status === 'active').length,
      byCategory: {
        import: catalog.filter((p) => p.category === 'import').length,
        analysis: catalog.filter((p) => p.category === 'analysis').length,
        action: catalog.filter((p) => p.category === 'action').length,
        export: catalog.filter((p) => p.category === 'export').length,
        ai: catalog.filter((p) => p.category === 'ai').length,
      },
    };

    return NextResponse.json({ plugins: catalog, summary });
  } catch (err) {
    console.error('Plugin list error:', err);
    return NextResponse.json({ error: 'Failed to fetch plugins' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-mutate', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    const body = await req.json();
    const { action, slug, config } = body;

    if (!slug) {
      return NextResponse.json({ error: 'Plugin slug is required' }, { status: 400 });
    }

    const canonicalSlug = pluginRuntime.resolveSlug(slug) ?? slug;
    const manifest = pluginRuntime.getManifest(canonicalSlug);
    if (!manifest) {
      return NextResponse.json({ error: `Unknown plugin: ${slug}` }, { status: 404 });
    }

    switch (action) {
      // ─── INSTALL ──────────────────────────────────────────
      case 'install': {
        // Check if already installed
        const [existing] = await db
          .select()
          .from(schema.plugins)
          .where(eq(schema.plugins.slug, canonicalSlug))
          .limit(1);

        if (existing) {
          return NextResponse.json({ error: 'Plugin already installed', plugin: existing }, { status: 409 });
        }

        // Install
        const normalizedInstall = pluginRuntime.validateAndNormalizeConfig(canonicalSlug, config, {
          existingConfig: {},
          includeDefaults: true,
        });

        if (!normalizedInstall.isValid) {
          return NextResponse.json(
            {
              error: 'Plugin configuration is invalid',
              fieldErrors: normalizedInstall.errors,
            },
            { status: 400 }
          );
        }

        const [installed] = await db
          .insert(schema.plugins)
          .values({
            slug: canonicalSlug,
            name: manifest.name,
            description: manifest.description,
            version: manifest.version,
            type: manifest.type,
            status: 'active',
            icon: manifest.icon,
            category: manifest.category,
            author: manifest.author,
            config: normalizedInstall.config,
            metadata: {
              capabilities: manifest.capabilities,
              hooks: manifest.hooks,
              routes: manifest.routes,
              mcpTools: manifest.mcpTools,
              aliases: manifest.aliases || [],
              dashboardWidgets: manifest.ui?.dashboardWidgets || [],
              jobs: manifest.jobs || [],
              jobRuns: {},
            },
          })
          .returning();

        await pluginRuntime.runHookForPlugin(canonicalSlug, 'onInstall', {
          pluginConfig: (installed.config as Record<string, unknown>) || {},
        });

        return NextResponse.json({ 
          message: `${manifest.name} installed successfully`,
          plugin: installed,
        }, { status: 201 });
      }

      // ─── UNINSTALL ────────────────────────────────────────
      case 'uninstall': {
        const [deleted] = await db
          .delete(schema.plugins)
          .where(eq(schema.plugins.slug, canonicalSlug))
          .returning();

        if (!deleted) {
          return NextResponse.json({ error: 'Plugin not installed' }, { status: 404 });
        }

        await pluginRuntime.runHookForPlugin(canonicalSlug, 'onUninstall', {
          pluginConfig: (deleted.config as Record<string, unknown>) || {},
        });

        return NextResponse.json({ 
          message: `${manifest.name} uninstalled successfully`,
        });
      }

      // ─── ENABLE ───────────────────────────────────────────
      case 'enable': {
        const [updated] = await db
          .update(schema.plugins)
          .set({ status: 'active' as PluginStatus, updatedAt: new Date(), lastError: null })
          .where(eq(schema.plugins.slug, canonicalSlug))
          .returning();

        if (!updated) {
          return NextResponse.json({ error: 'Plugin not installed' }, { status: 404 });
        }

        await pluginRuntime.runHookForPlugin(canonicalSlug, 'onEnable', {
          pluginConfig: (updated.config as Record<string, unknown>) || {},
        });

        return NextResponse.json({ message: `${manifest.name} enabled`, plugin: updated });
      }

      // ─── DISABLE ──────────────────────────────────────────
      case 'disable': {
        const [updated] = await db
          .update(schema.plugins)
          .set({ status: 'disabled' as PluginStatus, updatedAt: new Date() })
          .where(eq(schema.plugins.slug, canonicalSlug))
          .returning();

        if (!updated) {
          return NextResponse.json({ error: 'Plugin not installed' }, { status: 404 });
        }

        await pluginRuntime.runHookForPlugin(canonicalSlug, 'onDisable', {
          pluginConfig: (updated.config as Record<string, unknown>) || {},
        });

        return NextResponse.json({ message: `${manifest.name} disabled`, plugin: updated });
      }

      // ─── UPDATE CONFIG ────────────────────────────────────
      case 'configure': {
        if (!config || typeof config !== 'object') {
          return NextResponse.json({ error: 'Config object is required' }, { status: 400 });
        }

        // Merge with existing config
        const [existing] = await db
          .select()
          .from(schema.plugins)
          .where(eq(schema.plugins.slug, canonicalSlug))
          .limit(1);

        if (!existing) {
          return NextResponse.json({ error: 'Plugin not installed' }, { status: 404 });
        }

        const normalizedConfig = pluginRuntime.validateAndNormalizeConfig(canonicalSlug, config, {
          existingConfig: (existing.config as Record<string, unknown>) || {},
        });

        if (!normalizedConfig.isValid) {
          return NextResponse.json(
            {
              error: 'Plugin configuration is invalid',
              fieldErrors: normalizedConfig.errors,
            },
            { status: 400 }
          );
        }

        const [updated] = await db
          .update(schema.plugins)
          .set({ config: normalizedConfig.config, updatedAt: new Date() })
          .where(eq(schema.plugins.slug, canonicalSlug))
          .returning();

        return NextResponse.json({
          message: `${manifest.name} configured`,
          plugin: updated,
          fieldErrors: {},
        });
      }

      // ─── CONFIGURE JOB SCHEDULE ───────────────────────────
      case 'configure-job-schedule': {
        const jobId = typeof body.jobId === 'string' ? body.jobId : '';
        const enabled = body.enabled !== false;
        const intervalMinutes =
          typeof body.intervalMinutes === 'number' && Number.isFinite(body.intervalMinutes)
            ? body.intervalMinutes
            : undefined;

        if (!jobId) {
          return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
        }

        const jobDefinition = pluginRuntime
          .getJobDefinitions(canonicalSlug)
          .find((job) => job.id === jobId);

        if (!jobDefinition) {
          return NextResponse.json({ error: `Unknown job: ${jobId}` }, { status: 404 });
        }

        if (jobDefinition.trigger !== 'scheduled') {
          return NextResponse.json(
            { error: `Job ${jobId} is not declared as scheduled.` },
            { status: 400 }
          );
        }

        const schedule = await upsertPluginJobSchedule({
          userId,
          pluginSlug: canonicalSlug,
          jobId,
          enabled,
          intervalMinutes,
        });

        return NextResponse.json({
          message: enabled ? `${manifest.name} schedule enabled` : `${manifest.name} schedule disabled`,
          jobId,
          schedule,
        });
      }

      // ─── RUN JOB ───────────────────────────────────────────
      case 'run-job': {
        const jobId = typeof body.jobId === 'string' ? body.jobId : '';
        const reason = typeof body.reason === 'string' ? body.reason : undefined;

        if (!jobId) {
          return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
        }

        const [existing] = await db
          .select()
          .from(schema.plugins)
          .where(eq(schema.plugins.slug, canonicalSlug))
          .limit(1);

        if (!existing) {
          return NextResponse.json({ error: 'Plugin not installed' }, { status: 404 });
        }

        const result = await runPluginJob({
          userId,
          pluginSlug: canonicalSlug,
          jobId,
          reason,
        });

        const [updated] = await db
          .select()
          .from(schema.plugins)
          .where(eq(schema.plugins.slug, canonicalSlug))
          .limit(1);

        return NextResponse.json({
          message: `${manifest.name} job completed`,
          result,
          jobId,
          plugin: updated,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Valid: install, uninstall, enable, disable, configure, configure-job-schedule, run-job` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error('Plugin action error:', err);
    return NextResponse.json({ error: 'Plugin operation failed' }, { status: 500 });
  }
}

function getJobRuns(metadata: unknown): Record<string, unknown> {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return {};
  }

  const jobRuns = (metadata as Record<string, unknown>).jobRuns;
  if (typeof jobRuns !== 'object' || jobRuns === null || Array.isArray(jobRuns)) {
    return {};
  }

  return jobRuns as Record<string, unknown>;
}
