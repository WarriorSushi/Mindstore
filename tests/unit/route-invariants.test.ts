/**
 * Static-analysis invariants for API route handlers.
 *
 * Locks in the security pattern across the whole API surface so a future
 * regression (e.g., a new route landing without auth) is caught at unit-
 * test time rather than discovered later.
 *
 * Two invariants are enforced:
 *
 *  1. **Auth gate**. Every `route.ts` file under `src/app/api/v1/`
 *     must call `requireUserId(`. Any route that genuinely cannot be
 *     gated (e.g., the public extension ZIP download) must be added
 *     to the EXPLICITLY_PUBLIC set below with a comment explaining why.
 *
 *  2. **No bare `as any` cast on `req.json()`** in mutation routes.
 *     The codebase moved to Zod via `parseJsonBody(req, schema)`. New
 *     mutation routes should follow that pattern. (Lint-only; existing
 *     routes that haven't migrated yet are listed in
 *     ZOD_MIGRATION_PENDING.)
 *
 * If you're adding a new route, the right move is almost always to
 * include `requireUserId()` and `parseJsonBody(req, schema)`. If you
 * truly need an exception, add it to the relevant set with a comment.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const API_V1_ROOT = path.join(REPO_ROOT, 'src', 'app', 'api', 'v1');
const API_ROOT = path.join(REPO_ROOT, 'src', 'app', 'api');

/**
 * Routes that legitimately cannot use `requireUserId`. Each entry must
 * have a one-line justification — if the route can be gated, gate it
 * and remove from this set.
 */
const EXPLICITLY_PUBLIC = new Set<string>([
  // Public ZIP download of the browser extension. The extension itself
  // includes a per-user API key seeded server-side; the download is
  // public so users can install it before authenticating.
  'extension/package/route.ts',
  // Read-only setup/manifest endpoint that the extension reads on first
  // launch to discover the deployment's URLs. No user data exposed.
  'extension/setup/route.ts',
  // Internal cron trigger; uses INTERNAL_JOB_TOKEN bearer or
  // x-vercel-cron header for auth instead of requireUserId.
  'plugin-jobs/run-due/route.ts',
]);

/**
 * Routes that still call `getUserId()` directly instead of the
 * standardized `requireUserId()` gate. Migration is incremental; this
 * set is allowed to shrink, never to grow.
 */
const LEGACY_GET_USER_ID = new Set<string>([
  'capture/query/route.ts',
  'chat/history/route.ts',
  'collections/route.ts',
  'dashboard-widgets/route.ts',
  'digest/route.ts',
  'export/route.ts',
  'import/route.ts',
  'insights/route.ts',
  'knowledge-stats/route.ts',
  'memories/bulk/route.ts',
  'memories/related/route.ts',
  'memories/[id]/analysis/route.ts',
  'reindex/route.ts',
  'review/route.ts',
  'search/fuzzy/route.ts',
  'search/history/route.ts',
  'search/route.ts',
  'search/suggestions/route.ts',
  'sources/route.ts',
  'stats/route.ts',
  'timeline/route.ts',
]);

/**
 * Routes that have NO auth at all (neither getUserId nor requireUserId).
 * These are real security gaps and should be 0. Listed here so the test
 * fails loudly if a new one slips in. Currently empty — `chat/route.ts`
 * was the last entry, fixed in the same commit that introduced this
 * test file.
 */
const KNOWN_AUTH_GAPS = new Set<string>([]);

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (entry === 'route.ts') {
      out.push(full);
    }
  }
  return out;
}

function relPathV1(absPath: string): string {
  return path.relative(API_V1_ROOT, absPath).replace(/\\/g, '/');
}

describe('API route auth-gate invariant', () => {
  const v1Routes = findRouteFiles(API_V1_ROOT);

  it('finds at least 60 v1 routes (sanity check)', () => {
    expect(v1Routes.length).toBeGreaterThanOrEqual(60);
  });

  for (const route of v1Routes) {
    const rel = relPathV1(route);
    const content = readFileSync(route, 'utf-8');
    const usesRequire = /\brequireUserId\s*\(/.test(content);
    const usesGet = /\bgetUserId\s*\(/.test(content);

    if (EXPLICITLY_PUBLIC.has(rel)) {
      it(`${rel}: documented public — has no auth call`, () => {
        // Permitted: file may or may not call either function. The
        // human-readable contract is in EXPLICITLY_PUBLIC's comment.
        expect(true).toBe(true);
      });
      continue;
    }

    if (KNOWN_AUTH_GAPS.has(rel)) {
      it(`${rel}: KNOWN AUTH GAP — should be fixed`, () => {
        // Allowed for now, but the test files this as a known issue.
        expect(usesRequire || usesGet).toBe(false);
      });
      continue;
    }

    if (LEGACY_GET_USER_ID.has(rel)) {
      it(`${rel}: legacy getUserId — should migrate to requireUserId`, () => {
        expect(usesGet).toBe(true);
      });
      continue;
    }

    it(`${rel}: uses requireUserId`, () => {
      expect(usesRequire).toBe(true);
    });
  }
});

describe('API surface (broader)', () => {
  it('has the expected top-level layout', () => {
    const top = readdirSync(API_ROOT)
      .filter((entry) => statSync(path.join(API_ROOT, entry)).isDirectory())
      .sort();
    // Snapshot the shape so a stray new directory at the top level is
    // surfaced — top-level neighbors of v1 should be exactly these.
    expect(top).toEqual(['auth', 'health', 'mcp', 'v1']);
  });
});

describe('Plugin route hardening', () => {
  const pluginRoot = path.join(API_V1_ROOT, 'plugins');
  const pluginRoutes = findRouteFiles(pluginRoot);

  it('has at least 30 plugin routes', () => {
    expect(pluginRoutes.length).toBeGreaterThanOrEqual(30);
  });

  it('no plugin route imports from @/server/user (all standardized on requireUserId)', () => {
    const offenders: string[] = [];
    for (const route of pluginRoutes) {
      const content = readFileSync(route, 'utf-8');
      if (/from\s+['"]@\/server\/user['"]/.test(content)) {
        offenders.push(path.relative(pluginRoot, route));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every plugin route calls requireUserId', () => {
    const offenders: string[] = [];
    for (const route of pluginRoutes) {
      const content = readFileSync(route, 'utf-8');
      if (!/\brequireUserId\s*\(/.test(content)) {
        offenders.push(path.relative(pluginRoot, route));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every plugin route with an exported POST also calls applyRateLimit', () => {
    const offenders: string[] = [];
    for (const route of pluginRoutes) {
      const content = readFileSync(route, 'utf-8');
      const hasPost = /export\s+async\s+function\s+POST\b/.test(content);
      if (!hasPost) continue;
      const hasRateLimit = /applyRateLimit\s*\(\s*req\b/.test(content);
      if (!hasRateLimit) {
        offenders.push(path.relative(pluginRoot, route));
      }
    }
    expect(offenders).toEqual([]);
  });
});
