import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dbHealthyMock, executeMock, authMock, headersMock } = vi.hoisted(() => ({
  dbHealthyMock: vi.fn(),
  executeMock: vi.fn(),
  authMock: vi.fn(),
  headersMock: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: { execute: executeMock },
  dbHealthy: dbHealthyMock,
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));
vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/postgres-client", () => ({
  getDatabaseConnectionDiagnostics: () => ({ configured: true }),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.AUTH_SECRET = "test-auth-secret";
  process.env.ALLOW_SINGLE_USER_MODE = "false";

  dbHealthyMock.mockReset().mockResolvedValue(true);
  executeMock.mockReset().mockResolvedValue([]);
  authMock.mockReset().mockResolvedValue(null);
  headersMock.mockReset().mockResolvedValue(new Headers());
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("public /api/health is minimal (SEC-7)", () => {
  it("returns only status + timestamp", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["status", "timestamp"]);
    expect(body.status).toBe("ok");
    // No provider/auth/db diagnostics leak.
    expect(body.providers).toBeUndefined();
    expect(body.auth).toBeUndefined();
    expect(body.database).toBeUndefined();
  });
});

describe("authenticated /api/v1/health gate (SEC-7)", () => {
  it("returns 401 in multi-user mode without credentials", async () => {
    const { GET } = await import("@/app/api/v1/health/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
