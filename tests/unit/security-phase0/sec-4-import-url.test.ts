import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, headersMock, applyRateLimitMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  headersMock: vi.fn(),
  applyRateLimitMock: vi.fn().mockReturnValue(null),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/server/db", () => ({ db: { execute: vi.fn() } }));

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
const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.AUTH_SECRET = "test-auth-secret";
  process.env.ALLOW_SINGLE_USER_MODE = "false";

  authMock.mockResolvedValue(null);
  headersMock.mockResolvedValue(new Headers());
  applyRateLimitMock.mockReset().mockReturnValue(null);
  fetchSpy.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function postUrl(url: unknown) {
  const { POST } = await import("@/app/api/v1/import-url/route");
  const req = new Request("http://localhost/api/v1/import-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return POST(req as any);
}

describe("/api/v1/import-url auth + SSRF gate (SEC-4)", () => {
  it("returns 401 in multi-user mode without credentials", async () => {
    const res = await postUrl("https://example.com");
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks private/loopback/non-http URLs with 400", async () => {
    authMock.mockResolvedValue({ userId: "11111111-1111-1111-1111-111111111111" });

    for (const blocked of [
      "file:///etc/passwd",
      "ftp://example.com",
      "http://127.0.0.1",
      "http://localhost/x",
      "http://10.0.0.5",
      "http://192.168.1.1",
      "http://169.254.169.254/latest/meta-data/", // AWS metadata
      "http://172.16.0.1",
      "http://[::1]/",
      "http://[fc00::1]/",
    ]) {
      const res = await postUrl(blocked);
      expect(res.status).toBe(400);
      const body = await res.json();
      // safeFetch surfaces specific reasons: scheme, localhost, private IPv4/IPv6
      expect(body.error).toMatch(/(not allowed|http and https|localhost)/i);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies with 400", async () => {
    authMock.mockResolvedValue({ userId: "11111111-1111-1111-1111-111111111111" });
    const res = await postUrl(123 as any);
    expect(res.status).toBe(400);
  });

  it("applies the write rate limit when authenticated", async () => {
    authMock.mockResolvedValue({ userId: "11111111-1111-1111-1111-111111111111" });
    fetchSpy.mockResolvedValue(
      new Response("<html><title>t</title><body>" + "x".repeat(100) + "</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }) as any,
    );

    await postUrl("https://example.com/article");
    expect(applyRateLimitMock).toHaveBeenCalled();
    expect(applyRateLimitMock.mock.calls[0][1]).toBe("import-url");
    expect(applyRateLimitMock.mock.calls[0][2]).toEqual({ limit: 30, windowSeconds: 60 });
  });
});
