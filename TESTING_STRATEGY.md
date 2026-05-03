# MindStore Testing Strategy

**Audience:** anyone (human or agent) writing or modifying tests.
**Companion docs:** `CLAUDE_TAKEOVER.md` §3.4 (Definition of Done), `PRODUCTION_READINESS.md` §"Cross-cutting concerns / Testing strategy".

This file describes the test architecture: what we test, where the test goes, what to mock, and the bar a test must clear before it counts.

---

## 1. The pyramid

```
                E2E (Playwright)
              tests/e2e/*.spec.ts
            ─────────────────────────
              Integration / API
            tests/api/*.test.ts (Phase 1+)
        ────────────────────────────────────
                Unit (Vitest)
              tests/unit/*.test.ts
       ───────────────────────────────────────
```

| Layer | Runner | Roughly | Speed | When to write |
|---|---|---|---|---|
| Unit | Vitest 3 | 369 tests today | < 1s each | Always — for every port file, every module with non-trivial logic. |
| API | Vitest with `next/server` mocks | 0 today; Phase 1 deliverable | < 5s each | For every route handler you ship/modify. |
| E2E | Playwright | 0 today; Phase 1 deliverable (6 golden paths) | 10-60s each | Only for golden paths and high-risk regression catchers. |

If you can write a fast unit test for the behavior, do that instead of a slow API or E2E test. The E2E suite stays small on purpose.

---

## 2. Where tests live

```
tests/
├── unit/                       # Vitest, mocked external dependencies
│   ├── <slug>.test.ts          # one per plugin port
│   ├── security-phase0/        # SEC-1..SEC-7 + embedding mode (Phase 0)
│   └── <module>.test.ts        # one per non-port server module (logger, retrieval, etc.)
├── api/                        # Vitest, real Postgres test container (Phase 1+)
│   └── <route-path>.test.ts    # one per route handler
├── e2e/                        # Playwright
│   └── <scenario>.spec.ts      # named for the user journey (signin, import, chat, plugin, mcp)
└── stubs/                      # Reusable test doubles
    └── server-only.ts          # silences Next.js server-only imports under Vitest
```

A new feature that adds a port + route + page should produce **at least three new test files**:

- `tests/unit/<slug>.test.ts` — port logic.
- `tests/api/<slug>.test.ts` — route handler.
- An E2E only if the feature changes a golden path.

---

## 3. Coverage bars

From `PRODUCTION_READINESS.md` §0:

| Path | Required line coverage |
|---|---|
| `src/server/` | ≥ 70% |
| `src/app/api/` | ≥ 50% |
| `src/components/` | ≥ 40% |
| `src/lib/` | ≥ 70% |

`@vitest/coverage-v8` is already a dev dep; running `npx vitest --coverage` produces both `text` and `html` reports. CI gates on these thresholds starting Phase 1.

Coverage is necessary but not sufficient. A 70% line-covered module with no edge-case tests is worse than a 50% line-covered module with carefully chosen invariants.

---

## 4. What a good unit test looks like

### Shape

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { thingUnderTest } from "@/server/path/to/module";
import { db } from "@/server/db";

vi.mock("@/server/db", () => ({
  db: { execute: vi.fn() },
}));

describe("thingUnderTest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the empty result when there are no memories", async () => {
    vi.mocked(db.execute).mockResolvedValue([]);
    const result = await thingUnderTest({ userId: "abc" });
    expect(result.items).toEqual([]);
    expect(result.summary).toMatch(/no memories/i);
  });

  it("propagates DB errors as MindStoreError, never as raw Postgres errors", async () => {
    vi.mocked(db.execute).mockRejectedValue(new Error("connection terminated"));
    await expect(thingUnderTest({ userId: "abc" }))
      .rejects.toThrow(/database temporarily unavailable/i);
  });
});
```

### Rules

- **One behavior per `it()`**. The test name reads as the spec.
- **Mock at the module boundary, not the function boundary.** `vi.mock("@/server/db", ...)` once at the top, not `vi.spyOn` per test.
- **Cover the unhappy paths.** A test that only asserts the success case is a confidence trap.
- **Use real fixtures over big inline literals.** Put long sample inputs (e.g., a Kindle clipping file) in `tests/fixtures/<name>.txt` and read them with `fs.readFile`.

### Bad smells

- A test that stubs `process.env` but doesn't restore it (use `vi.stubEnv` + `afterEach(() => vi.unstubAllEnvs())`).
- A test that asserts on a private internal (e.g., a function name in an error). Assert behavior, not implementation.
- A test that imports `next/server` without the `server-only` stub. See `tests/stubs/server-only.ts` and the alias in `vitest.config.ts`.
- "Tests" that are just snapshot dumps without invariants. Snapshots are fine for stable pure-function output (HTML rendering, JSON serialization), not for "this is what the function returned today".

---

## 5. What an API test looks like (Phase 1+)

API tests run the route handler against a real Postgres test container. They live under `tests/api/`.

### Shape

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestContext, TestContext } from "tests/api/_helpers";

let ctx: TestContext;
beforeAll(async () => { ctx = await createTestContext(); });
afterAll(async () => { await ctx.dispose(); });

describe("GET /api/v1/search", () => {
  it("requires auth", async () => {
    const res = await ctx.request("GET", "/api/v1/search?q=hello");
    expect(res.status).toBe(401);
  });

  it("returns ranked results from BM25 + vector + tree", async () => {
    await ctx.seed.memories([
      { content: "remote work is hard", sourceType: "chatgpt" },
      { content: "I love working remotely", sourceType: "obsidian" },
    ]);
    const res = await ctx.request("GET", "/api/v1/search?q=remote+work", { auth: ctx.user.token });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.layers.bm25).toBeGreaterThan(0);
  });
});
```

`createTestContext` (Phase 1 deliverable) handles:
- Spinning up Postgres + pgvector via Testcontainers.
- Running migrations.
- Creating a test user with a session token.
- Tearing down between tests.

Until that helper exists, write the unit test today and stub the DB; promote to an API test when the helper lands.

---

## 6. What an E2E test looks like

Playwright. Runs against a real dev server (or against the deployed preview URL in CI).

### Shape

```ts
import { test, expect } from "@playwright/test";

test("user can search after signing in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /sign in/i }).click();
  // ... mocked OAuth via page.route(...)
  await expect(page).toHaveURL(/\/app/);

  await page.getByRole("link", { name: /explore/i }).click();
  await page.getByPlaceholder(/search/i).fill("remote work");
  await page.keyboard.press("Enter");

  await expect(page.getByText(/result/i).first()).toBeVisible();
});
```

### Rules

- Use **role-based selectors** (`getByRole`, `getByText`) over CSS selectors — they break less when styles change.
- Mock OAuth via `page.route("**/api/auth/**", ...)` so tests don't actually hit Google.
- Don't wait fixed times; wait on user-visible state (`await expect(...).toBeVisible()`).

The six Phase-1 golden paths (see `PRODUCTION_READINESS.md` §1.6):

1. Sign-in flow.
2. Import 5 memories from a ChatGPT export.
3. Search ranks them.
4. Chat returns a streaming, cited answer.
5. Plugin install appears in nav.
6. MCP `search_mind` over Bearer auth returns the seeded memory.

We do **not** add a seventh E2E test until one of those breaks repeatedly enough to warrant it.

---

## 7. Mock policy

| Boundary | Mock? | How |
|---|---|---|
| `@/server/db` | Yes in unit tests | `vi.mock("@/server/db", ...)` |
| `@/server/db` | No in API tests | Real Postgres via Testcontainers |
| `@/server/embeddings` (provider HTTP) | Yes always | `vi.mock` returning canned vectors of correct dimension |
| `@/server/ai-client` (provider HTTP) | Yes always | `vi.mock` returning the test prompt's expected output |
| `next-auth` session | Yes in unit + API | `vi.mock("@/server/auth", () => ({ auth: vi.fn(...) }))` |
| `crypto.randomUUID` | Avoid mocking | If determinism matters, pass IDs in via param or use `vi.useFakeTimers + globalThis.crypto`. |
| File I/O (`fs/promises`) | Mock when it's a small fixture | `vi.mock("node:fs/promises")` or read from `tests/fixtures/`. |
| Network (`fetch`) | Mock always | `vi.stubGlobal("fetch", vi.fn())`; assert on the request shape. |

The rule: **mock everything that crosses a process boundary** in unit tests. In API tests, only mock the AI providers (because they're paid + non-deterministic) and OAuth (because we don't want to hit Google).

---

## 8. Determinism

Tests must be deterministic. If a test is flaky, fix the cause; do not add retries.

Common flakiness sources and fixes:

- **Time-dependent logic** (`new Date()`, SM-2 intervals) → `vi.useFakeTimers(); vi.setSystemTime(...)`.
- **Random IDs in assertions** → use a stable ID generator passed via param, or assert on the *shape* (`expect(id).toMatch(/^[0-9a-f-]{36}$/)`).
- **Map/Set iteration order** in JS → never rely on it; sort before asserting.
- **Floating-point retrieval scores** → `expect(score).toBeCloseTo(expected, 4)`.
- **Postgres locking under parallel tests** → run API tests serially (`vitest.config.ts: test.maxConcurrency = 1` for `tests/api/`).

---

## 9. Test data

- **Fixtures:** under `tests/fixtures/`. One file per fixture. Real-world inputs (a 50KB Kindle clipping, a 200KB ChatGPT export). Loaded with `fs.readFile`.
- **Factories:** under `tests/factories/`. Pure functions returning seeded objects (`makeMemory({ content: "..." })`).
- **Snapshots:** under `__snapshots__/` next to the test file. Only for stable, structural output. Run `npx vitest -u` to update.

Don't put fixtures in `src/`. Don't put production code in `tests/`.

---

## 10. CI

`.github/workflows/ci.yml` runs on every PR and every push to `main` / `claude/**` / `feat/**` / `fix/**`:

1. `npm ci`
2. `npm run lint:ci`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`
6. `npx playwright install --with-deps chromium`
7. `npm run test:e2e`

A PR doesn't merge until every step is green. If a flaky test is blocking merges, fix it or quarantine it (skip + open a bug); never just merge over red.

---

## 11. When you change a test

- **Removing a test** requires explicit justification in the PR description. The default is that every test is an invariant we want to keep.
- **Renaming a test** keeps the original assertions; rename the description.
- **Skipping a test** (`it.skip`) requires a reference to a STATUS row or GitHub issue with the unblock condition.

---

## 12. New patterns to adopt as we scale

These will land alongside the features that need them (none required today):

- **Property-based testing** (`fast-check`) for retrieval scoring math, SM-2 intervals, RRF fusion.
- **Contract tests** between plugin SDK and registry — assert that every manifest in `PLUGIN_MANIFESTS` parses against the SDK schema.
- **Performance regression tests** — search p95 latency, build size budget.
- **MCP conformance tests** — the `@modelcontextprotocol/sdk` test client running our `/api/mcp` against the spec.

If you find yourself writing the third copy of similar test scaffolding, that's a signal — extract it into `tests/_helpers/` and update this doc.
