import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveApiKeyUserIdMock, buildMcpDiscoveryMock, createMcpServerMock } = vi.hoisted(() => ({
  resolveApiKeyUserIdMock: vi.fn(),
  buildMcpDiscoveryMock: vi.fn(),
  createMcpServerMock: vi.fn(),
}));

vi.mock("@/server/db", () => ({ db: { execute: vi.fn() } }));

vi.mock("@/server/api-keys", async () => {
  const actual = await vi.importActual<typeof import("@/server/api-keys")>("@/server/api-keys");
  return {
    ...actual,
    resolveApiKeyUserId: resolveApiKeyUserIdMock,
  };
});

vi.mock("@/server/mcp/runtime", () => ({
  buildMcpDiscovery: buildMcpDiscoveryMock,
  createOfficialMcpServer: createMcpServerMock,
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.AUTH_SECRET = "test-auth-secret";
  process.env.ALLOW_SINGLE_USER_MODE = "false";
  delete process.env.MCP_ALLOWED_ORIGINS;

  resolveApiKeyUserIdMock.mockReset();
  buildMcpDiscoveryMock.mockReset().mockResolvedValue({ name: "mindstore" });
  createMcpServerMock.mockReset().mockResolvedValue({
    connect: vi.fn(),
    close: vi.fn(),
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("/api/mcp auth + CORS (SEC-6)", () => {
  it("rejects POST in multi-user mode without credentials", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const req = new Request("http://localhost/api/mcp", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("rejects POST when an invalid bearer is presented", async () => {
    resolveApiKeyUserIdMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/mcp/route");
    const req = new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { authorization: "Bearer fake" },
      body: "{}",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("falls through to default user in single-user mode without credentials", async () => {
    process.env.ALLOW_SINGLE_USER_MODE = "true";

    // We can't easily exercise the full SDK transport in a unit test, but
    // we can prove the gate doesn't return 401 by checking that
    // createOfficialMcpServer is invoked.
    const { POST } = await import("@/app/api/mcp/route");
    const req = new Request("http://localhost/api/mcp", {
      method: "POST",
      body: "{}",
    });

    // Stub transport so handleSdkTransportRequest returns quickly.
    createMcpServerMock.mockResolvedValue({
      connect: vi.fn(),
      close: vi.fn(),
    });

    await POST(req as any).catch(() => {
      // The SDK transport is not fully usable in this stub; we only care
      // that auth did not gate the request out.
    });

    expect(createMcpServerMock).toHaveBeenCalled();
  });

  it("omits Access-Control-Allow-Origin when origin is not allow-listed", async () => {
    const { OPTIONS } = await import("@/app/api/mcp/route");
    const req = new Request("http://localhost/api/mcp", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example.com" },
    });
    const res = await OPTIONS(req as any);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("echoes the Origin when it appears in MCP_ALLOWED_ORIGINS", async () => {
    process.env.MCP_ALLOWED_ORIGINS = "https://allowed.example.com,https://other.example";
    const { OPTIONS } = await import("@/app/api/mcp/route");
    const req = new Request("http://localhost/api/mcp", {
      method: "OPTIONS",
      headers: { origin: "https://allowed.example.com" },
    });
    const res = await OPTIONS(req as any);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://allowed.example.com");
    expect(res.headers.get("vary")).toBe("Origin");
  });
});
