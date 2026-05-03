import { inArray } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { PLUGIN_MANIFESTS } from "@/server/plugins/registry";

/**
 * Resolve a slug — including legacy aliases — to the canonical manifest slug.
 * Returns the input slug unchanged if no alias is found (caller decides
 * whether that is an error). See STATUS.md ARCH-12.
 */
export function resolveCanonicalSlug(slug: string): string {
  if (PLUGIN_MANIFESTS[slug]) return slug;
  for (const manifest of Object.values(PLUGIN_MANIFESTS)) {
    if (manifest.aliases?.includes(slug)) {
      return manifest.slug;
    }
  }
  return slug;
}

/**
 * Build the candidate slug list for a DB lookup: the canonical slug plus any
 * declared aliases. Lets the DB lookup match rows that were inserted under a
 * legacy slug (pre-rename) without requiring a data migration.
 */
function candidateSlugs(slug: string): string[] {
  const canonical = resolveCanonicalSlug(slug);
  const manifest = PLUGIN_MANIFESTS[canonical];
  const aliases = manifest?.aliases ?? [];
  return Array.from(new Set([canonical, slug, ...aliases]));
}

export async function ensurePluginInstalled(slug: string) {
  const canonical = resolveCanonicalSlug(slug);
  const manifest = PLUGIN_MANIFESTS[canonical];
  const slugs = candidateSlugs(slug);
  const [existing] = await db
    .select()
    .from(schema.plugins)
    .where(inArray(schema.plugins.slug, slugs))
    .limit(1);

  if (existing || !manifest) {
    return;
  }

  await db.insert(schema.plugins).values({
    slug: manifest.slug,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    type: manifest.type,
    status: "active",
    icon: manifest.icon,
    category: manifest.category,
    author: manifest.author,
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
  });
}

export async function assertPluginEnabled(slug: string) {
  await ensurePluginInstalled(slug);

  const [plugin] = await db
    .select({
      slug: schema.plugins.slug,
      name: schema.plugins.name,
      status: schema.plugins.status,
    })
    .from(schema.plugins)
    .where(inArray(schema.plugins.slug, candidateSlugs(slug)))
    .limit(1);

  if (!plugin) {
    throw new Error(`${slug} plugin not found.`);
  }

  if (plugin.status === "disabled") {
    throw new Error(`${plugin.name} plugin is disabled. Enable it in the Plugins page.`);
  }

  return plugin;
}

export async function getPluginConfig<T extends object>(slug: string, fallback: T): Promise<T> {
  const [row] = await db
    .select({ config: schema.plugins.config })
    .from(schema.plugins)
    .where(inArray(schema.plugins.slug, candidateSlugs(slug)))
    .limit(1);

  if (!row?.config || typeof row.config !== "object" || Array.isArray(row.config)) {
    return { ...fallback };
  }

  return {
    ...fallback,
    ...(row.config as Partial<T>),
  };
}

export async function savePluginConfig<T extends object>(slug: string, config: T) {
  await db
    .update(schema.plugins)
    .set({
      config,
      updatedAt: new Date(),
    })
    .where(inArray(schema.plugins.slug, candidateSlugs(slug)));
}

export async function updatePluginConfig<T extends object>(
  slug: string,
  fallback: T,
  updater: (config: T) => T,
) {
  const current = await getPluginConfig(slug, fallback);
  const next = updater(current);
  await savePluginConfig(slug, next);
  return next;
}

export function createPluginScopedId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function stripMarkdownFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
}

export function parseJsonValue<T>(value: string): T {
  return JSON.parse(stripMarkdownFence(value)) as T;
}
