/**
 * Phase 1 golden-path E2E suite.
 *
 * Six scenarios that every PR must keep green. Slow tests; ~10–60s each.
 * Run with `npm run test:e2e`. CI runs them after the build step.
 *
 * The suite is deliberately small. New E2E tests are only added when an
 * existing scenario isn't catching a class of regressions we keep hitting.
 * For everything else, reach for `tests/api/*.test.ts` (Phase 1 deliverable)
 * or `tests/unit/*.test.ts`.
 *
 * These tests assume single-user mode (no Google OAuth env vars set in CI),
 * so they hit the default-user fallback. When multi-user mode lands
 * (per ARCH-1 / BLOCK-5), add a `signin.spec.ts` that mocks the OAuth
 * callback explicitly.
 */
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  // Capture console errors so a silent breakage gets surfaced as a failure.
  page.on("pageerror", (err) => {
    throw new Error(`Page-level error: ${err.message}`);
  });
});

test("landing page loads with hero copy and call to action", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The CTA targets the app — match a link to /app or /login depending on identity mode.
  const cta = page.getByRole("link", { name: /(get started|open app|sign in)/i }).first();
  await expect(cta).toBeVisible();
});

test("app dashboard renders empty state when there's no data", async ({ page }) => {
  await page.goto("/app");
  // The dashboard shell must render. Either a "welcome" empty state or actual widgets is acceptable.
  await expect(page.getByRole("main")).toBeVisible();
  // No raw error text leaks to the UI.
  await expect(page.locator("body")).not.toContainText(/Error: |TypeError: |stack:/i);
});

test("explore page accepts a search query and either shows results or an empty-state", async ({
  page,
}) => {
  await page.goto("/app/explore");
  const search = page.getByPlaceholder(/search/i).first();
  await expect(search).toBeVisible();
  await search.fill("hello world");
  await search.press("Enter");
  // Wait for either results, an empty state, or a friendly error — but not a stack trace.
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).not.toContainText(/Error: |TypeError: |stack:/i);
});

test("plugins page lists at least the built-in plugins", async ({ page }) => {
  await page.goto("/app/plugins");
  await expect(page.getByRole("main")).toBeVisible();
  // We have 35 plugins; surface at least one well-known one.
  await expect(page.locator("body")).toContainText(/flashcard/i);
});

test("settings page loads provider config without leaking unmasked keys", async ({ page }) => {
  await page.goto("/app/settings");
  await expect(page.getByRole("main")).toBeVisible();
  // Any key preview must be masked; assert no obvious live-key shapes leak.
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/sk-[A-Za-z0-9]{40,}/);
  expect(body).not.toMatch(/AIzaSy[A-Za-z0-9_-]{30,}/);
});

test("MCP discovery endpoint returns a JSON capability descriptor", async ({ request }) => {
  const res = await request.get("/api/mcp");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty("name");
  expect(body).toHaveProperty("capabilities");
  expect(body.capabilities).toHaveProperty("tools");
  // The 3 core tools are always advertised.
  const toolNames = (body.capabilities.tools as Array<{ name: string }>).map((t) => t.name);
  expect(toolNames).toEqual(expect.arrayContaining(["search_mind", "get_profile", "get_context"]));
});
