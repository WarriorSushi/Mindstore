import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { executeMock, authMock, headersMock, applyRateLimitMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  authMock: vi.fn(),
  headersMock: vi.fn(),
  applyRateLimitMock: vi.fn().mockReturnValue(null),
}));

vi.mock("@/server/db", () => ({
  db: { execute: executeMock },
}));

vi.mock("@/server/auth", () => ({
  auth: authMock,
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

// Don't actually do work for these dependencies — only the auth gate matters.
vi.mock("@/server/embeddings", () => ({
  getEmbeddingConfig: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/server/encryption", () => ({
  encrypt: (s: string) => s,
  decrypt: (s: string) => s,
}));

vi.mock("@/server/postgres-client", () => ({
  getDatabaseConnectionDiagnostics: () => ({ configured: false }),
}));

vi.mock("@/server/runtime-requirements", () => ({
  PROVIDER_AUTH_ROADMAP: {},
  PROVIDER_CATALOG: {},
  RUNTIME_REQUIREMENTS: {},
}));

vi.mock("@/server/api-rate-limit", () => ({
  applyRateLimit: applyRateLimitMock,
  RATE_LIMITS: {
    standard: { limit: 120, windowSeconds: 60 },
    write: { limit: 30, windowSeconds: 60 },
    ai: { limit: 20, windowSeconds: 60 },
    auth: { limit: 10, windowSeconds: 300 },
  },
  getClientIp: () => "test",
}));

const ORIGINAL_ENV = { ...process.env };

function emptyHeaders() {
  return new Headers();
}

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.AUTH_SECRET = "test-auth-secret";
  process.env.ALLOW_SINGLE_USER_MODE = "false";

  authMock.mockResolvedValue(null);
  headersMock.mockResolvedValue(emptyHeaders());
  executeMock.mockReset();
  applyRateLimitMock.mockReset();
  applyRateLimitMock.mockReturnValue(null);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("/api/v1/settings auth gate (SEC-1, SEC-2)", () => {
  it("GET returns 401 when no credentials are presented in multi-user mode", async () => {
    const { GET } = await import("@/app/api/v1/settings/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("POST returns 401 when no credentials are presented in multi-user mode", async () => {
    const { POST } = await import("@/app/api/v1/settings/route");
    const req = new Request("http://localhost/api/v1/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "sk-bogus" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("POST applies the write rate limit when authenticated", async () => {
    // Pretend a real session resolves a user id.
    authMock.mockResolvedValue({ userId: "11111111-1111-1111-1111-111111111111" });
    executeMock.mockResolvedValue([]);

    const { POST } = await import("@/app/api/v1/settings/route");
    const req = new Request("http://localhost/api/v1/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ embeddingProvider: "gemini" }),
    });
    await POST(req as any);
    expect(applyRateLimitMock).toHaveBeenCalled();
    expect(applyRateLimitMock.mock.calls[0][1]).toBe("settings");
    expect(applyRateLimitMock.mock.calls[0][2]).toEqual({ limit: 30, windowSeconds: 60 });
  });
});
