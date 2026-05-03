import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, headersMock, applyRateLimitMock, generateEmbeddingsMock, getEmbeddingConfigMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  headersMock: vi.fn(),
  applyRateLimitMock: vi.fn().mockReturnValue(null),
  generateEmbeddingsMock: vi.fn(),
  getEmbeddingConfigMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/server/db", () => ({ db: { execute: vi.fn() } }));

vi.mock("@/server/embeddings", () => ({
  generateEmbeddings: generateEmbeddingsMock,
  getEmbeddingConfig: getEmbeddingConfigMock,
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

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.AUTH_SECRET = "test-auth-secret";
  process.env.ALLOW_SINGLE_USER_MODE = "false";

  authMock.mockResolvedValue(null);
  headersMock.mockResolvedValue(new Headers());
  applyRateLimitMock.mockReset().mockReturnValue(null);
  generateEmbeddingsMock.mockReset();
  getEmbeddingConfigMock.mockReset().mockResolvedValue({ provider: "openai", apiKey: "x", model: "y" });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("/api/v1/embed auth gate (SEC-3)", () => {
  it("returns 401 in multi-user mode without credentials", async () => {
    const { POST } = await import("@/app/api/v1/embed/route");
    const req = new Request("http://localhost/api/v1/embed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texts: ["hello"] }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("rejects malformed input with 400", async () => {
    authMock.mockResolvedValue({ userId: "11111111-1111-1111-1111-111111111111" });

    const { POST } = await import("@/app/api/v1/embed/route");

    // Empty array (Zod min=1 should reject).
    let res = await POST(
      new Request("http://localhost/api/v1/embed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texts: [] }),
      }) as any,
    );
    expect(res.status).toBe(400);

    // Way too many.
    res = await POST(
      new Request("http://localhost/api/v1/embed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texts: new Array(51).fill("x") }),
      }) as any,
    );
    expect(res.status).toBe(400);

    // Wrong shape.
    res = await POST(
      new Request("http://localhost/api/v1/embed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texts: "not-an-array" }),
      }) as any,
    );
    expect(res.status).toBe(400);
  });

  it("applies the standard rate limit when authenticated", async () => {
    authMock.mockResolvedValue({ userId: "11111111-1111-1111-1111-111111111111" });
    generateEmbeddingsMock.mockResolvedValue([[0.1, 0.2]]);

    const { POST } = await import("@/app/api/v1/embed/route");
    const req = new Request("http://localhost/api/v1/embed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texts: ["hello"] }),
    });
    await POST(req as any);
    expect(applyRateLimitMock).toHaveBeenCalled();
    expect(applyRateLimitMock.mock.calls[0][1]).toBe("embed");
    expect(applyRateLimitMock.mock.calls[0][2]).toEqual({ limit: 120, windowSeconds: 60 });
  });
});
