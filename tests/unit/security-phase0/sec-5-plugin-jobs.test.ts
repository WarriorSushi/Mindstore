import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runDuePluginJobsMock, resolveApiKeyUserIdMock } = vi.hoisted(() => ({
  runDuePluginJobsMock: vi.fn(),
  resolveApiKeyUserIdMock: vi.fn(),
}));

vi.mock("@/server/plugin-jobs", () => ({
  runDuePluginJobs: runDuePluginJobsMock,
}));

vi.mock("@/server/db", () => ({ db: { execute: vi.fn() } }));

vi.mock("@/server/api-keys", async () => {
  const actual = await vi.importActual<typeof import("@/server/api-keys")>("@/server/api-keys");
  return {
    ...actual,
    resolveApiKeyUserId: resolveApiKeyUserIdMock,
  };
});

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.AUTH_SECRET = "test-auth-secret";
  process.env.ALLOW_SINGLE_USER_MODE = "false";
  delete process.env.INTERNAL_JOB_TOKEN;

  runDuePluginJobsMock.mockReset().mockResolvedValue([]);
  resolveApiKeyUserIdMock.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function postRequest(headers: Record<string, string> = {}, body: unknown = {}) {
  return new Request("http://localhost/api/v1/plugin-jobs/run-due", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("/api/v1/plugin-jobs/run-due auth gate (SEC-5)", () => {
  it("returns 401 without any credentials", async () => {
    const { POST } = await import("@/app/api/v1/plugin-jobs/run-due/route");
    const res = await POST(postRequest() as any);
    expect(res.status).toBe(401);
    expect(runDuePluginJobsMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer token", async () => {
    resolveApiKeyUserIdMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/v1/plugin-jobs/run-due/route");
    const res = await POST(
      postRequest({ authorization: "Bearer not-a-real-key" }) as any,
    );
    expect(res.status).toBe(401);
    expect(runDuePluginJobsMock).not.toHaveBeenCalled();
  });

  it("accepts the INTERNAL_JOB_TOKEN as a bearer", async () => {
    process.env.INTERNAL_JOB_TOKEN = "internal-secret";
    const { POST } = await import("@/app/api/v1/plugin-jobs/run-due/route");
    const res = await POST(
      postRequest({ authorization: "Bearer internal-secret" }) as any,
    );
    expect(res.status).toBe(200);
    expect(runDuePluginJobsMock).toHaveBeenCalled();
  });

  it("accepts a valid api key from the api_keys table", async () => {
    resolveApiKeyUserIdMock.mockResolvedValue("user-uuid");
    const { POST } = await import("@/app/api/v1/plugin-jobs/run-due/route");
    const res = await POST(
      postRequest({ authorization: "Bearer msk_real_token" }) as any,
    );
    expect(res.status).toBe(200);
  });

  it("accepts the Vercel cron header even without a bearer", async () => {
    const { POST } = await import("@/app/api/v1/plugin-jobs/run-due/route");
    const res = await POST(
      postRequest({ "x-vercel-cron": "1" }) as any,
    );
    expect(res.status).toBe(200);
  });
});
