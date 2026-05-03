/**
 * Tests for `safeFetch` (ARCH-14): defends `/api/v1/import-url` and any
 * future URL-fetching surface against SSRF DNS rebinding by re-validating
 * the resolved IP before issuing the fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dnsLookupMock } = vi.hoisted(() => ({
  dnsLookupMock: vi.fn(),
}));

vi.mock("node:dns", () => ({
  promises: { lookup: dnsLookupMock },
}));

// Stub out the auth/db transitive chain pulled in via @/server/user.
vi.mock("@/server/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/server/db", () => ({ db: { execute: vi.fn() } }));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  dnsLookupMock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("safeFetch (ARCH-14)", () => {
  it("rejects non-http URLs without resolving DNS or fetching", async () => {
    const { safeFetch, SafeFetchError } = await import("@/server/api-validation");

    await expect(safeFetch("file:///etc/passwd")).rejects.toBeInstanceOf(SafeFetchError);
    expect(dnsLookupMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects literal-private-IP hostnames without resolving DNS or fetching", async () => {
    const { safeFetch, SafeFetchError } = await import("@/server/api-validation");

    await expect(safeFetch("http://10.0.0.5/")).rejects.toBeInstanceOf(SafeFetchError);
    expect(dnsLookupMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when a public hostname resolves to a private IPv4 (DNS rebinding)", async () => {
    dnsLookupMock.mockResolvedValueOnce([{ address: "10.0.0.42", family: 4 }]);

    const { safeFetch, SafeFetchError } = await import("@/server/api-validation");

    await expect(safeFetch("http://attacker.example.com/")).rejects.toThrow(
      /private IPv4 \(10\.0\.0\.42\)/,
    );
    expect(dnsLookupMock).toHaveBeenCalledWith("attacker.example.com", expect.objectContaining({ all: true }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when a public hostname resolves to a private IPv6", async () => {
    dnsLookupMock.mockResolvedValueOnce([{ address: "fc00::1", family: 6 }]);

    const { safeFetch, SafeFetchError } = await import("@/server/api-validation");

    await expect(safeFetch("https://attacker.example.com/")).rejects.toThrow(
      /private IPv6 \(fc00::1\)/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when even one of multiple resolved IPs is private", async () => {
    dnsLookupMock.mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 }, // sneaks in a loopback
    ]);

    const { safeFetch, SafeFetchError } = await import("@/server/api-validation");

    await expect(safeFetch("http://example.com/")).rejects.toBeInstanceOf(SafeFetchError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("issues the fetch when all resolved addresses are public", async () => {
    dnsLookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const { safeFetch } = await import("@/server/api-validation");

    const res = await safeFetch("http://example.com/");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces ENOTFOUND as a 400 SafeFetchError", async () => {
    dnsLookupMock.mockRejectedValueOnce(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));

    const { safeFetch } = await import("@/server/api-validation");

    await expect(safeFetch("http://does-not-resolve.invalid/")).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/does not resolve/i),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("times out when fetch hangs longer than timeoutMs", async () => {
    dnsLookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    // Simulate a hang: never resolve. Use AbortError when the controller fires.
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal as AbortSignal | undefined;
          if (signal) {
            signal.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        }),
    );

    const { safeFetch } = await import("@/server/api-validation");

    await expect(safeFetch("http://example.com/", { timeoutMs: 5 })).rejects.toMatchObject({
      status: 504,
      message: expect.stringMatching(/timed out/i),
    });
  });

  it("does not call DNS for literal IP hostnames that pass the public check", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const { safeFetch } = await import("@/server/api-validation");

    const res = await safeFetch("http://93.184.216.34/");
    expect(res.status).toBe(200);
    expect(dnsLookupMock).not.toHaveBeenCalled();
  });
});
