import { z } from 'zod';
import { errors } from './api-errors';
import { NextResponse } from 'next/server';
import { getUserId } from './user';
import { promises as dns } from 'node:dns';

/**
 * Resolve the calling user's ID, returning a 401 NextResponse when no
 * credentials are present and single-user mode is disabled. In single-user
 * mode, falls through to the default user UUID so existing self-hosted
 * deployments keep working.
 *
 * Pattern:
 * ```ts
 * const auth = await requireUserId();
 * if (auth instanceof NextResponse) return auth;
 * const userId = auth;
 * ```
 */
export async function requireUserId(): Promise<string | NextResponse> {
  try {
    return await getUserId();
  } catch {
    return errors.unauthorized();
  }
}

/**
 * Parse a JSON body against a Zod schema. Returns either the parsed
 * value or a NextResponse with a 400 error describing the failure.
 *
 * Pattern:
 * ```ts
 * const parsed = await parseJsonBody(req, MySchema);
 * if (parsed instanceof NextResponse) return parsed;
 * const data = parsed; // typed
 * ```
 */
export async function parseJsonBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<z.output<T> | NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errors.badRequest('Invalid JSON body');
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return errors.badRequest(formatZodIssues(result.error));
  }

  return result.data;
}

function formatZodIssues(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return 'Invalid request';
  const path = first.path.length ? `${first.path.join('.')}: ` : '';
  return `${path}${first.message}`;
}

/**
 * Reject http(s)-only URLs and block private/loopback IP ranges (SSRF guard).
 *
 * Blocks:
 *   - Non-http(s) schemes
 *   - IPv4: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
 *           169.254.0.0/16 (link-local), 127.0.0.0/8 (loopback),
 *           0.0.0.0/8
 *   - IPv6: ::1, fc00::/7 (unique local), fe80::/10 (link-local)
 *   - Hostnames "localhost", ".localhost", ".local"
 *
 * Hostnames that aren't literal IPs are accepted as-is; resolution-time
 * SSRF (DNS rebinding) requires a fetch-time check, which is out of scope
 * for this simple guard. The owner can layer that on later.
 */
export function isPublicHttpUrl(value: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only http and https URLs are allowed' };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) return { ok: false, reason: 'Missing hostname' };

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return { ok: false, reason: 'localhost is not allowed' };
  }

  // Strip IPv6 brackets — URL.hostname leaves them off but be defensive.
  const cleaned = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  if (isIPv4Literal(cleaned) && isPrivateIPv4(cleaned)) {
    return { ok: false, reason: 'private/loopback IPv4 not allowed' };
  }

  if (cleaned.includes(':') && isPrivateIPv6(cleaned)) {
    return { ok: false, reason: 'private/loopback IPv6 not allowed' };
  }

  return { ok: true, url: parsed };
}

function isIPv4Literal(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function isPrivateIPv4(host: string): boolean {
  const [a, b] = host.split('.').map(Number);
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === '::1' || lower === '::' ) return true;
  // fc00::/7 — unique local addresses (fc00–fdff prefix)
  if (/^fc[0-9a-f]{2}:/.test(lower) || /^fd[0-9a-f]{2}:/.test(lower)) return true;
  // fe80::/10 — link-local (fe80–febf prefix)
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  return false;
}

/**
 * SafeFetch — DNS-resolved-IP-aware fetch wrapper that defends against
 * the SSRF DNS rebinding class of attacks beyond what `isPublicHttpUrl`
 * alone can catch.
 *
 * Pipeline:
 *   1. Validate URL shape with `isPublicHttpUrl` (sync IP-literal check).
 *   2. If hostname is not a literal IP, resolve it via `dns.lookup({all:true})`
 *      and assert every resolved address is also public.
 *   3. Perform the fetch with an AbortController-driven timeout.
 *
 * Residual risk: between step 2 and step 3 there is a TOCTOU window where
 * DNS could rebind. The robust fix is a custom http/https Agent whose
 * `lookup` callback re-validates per-attempt; that is documented as a
 * Phase-2 follow-up in STATUS.md (ARCH-14 residual). The current pre-check
 * still defeats most off-the-shelf rebinding tools.
 *
 * Throws `SafeFetchError` for guard failures (with `status: 400`) and for
 * upstream errors (with `status: 502` or original status). Callers convert
 * to NextResponse as needed.
 */
export class SafeFetchError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const guard = isPublicHttpUrl(rawUrl);
  if (!guard.ok) {
    throw new SafeFetchError(guard.reason, 400);
  }
  const url = guard.url;

  const host = url.hostname.toLowerCase();
  const cleaned = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const isLiteralIp = isIPv4Literal(cleaned) || (cleaned.includes(':') && !cleaned.startsWith('['));

  // For non-literal hostnames, resolve DNS and re-validate.
  if (!isLiteralIp) {
    try {
      const addresses = await dns.lookup(cleaned, { all: true, verbatim: true });
      for (const { address, family } of addresses) {
        if (family === 4 && isPrivateIPv4(address)) {
          throw new SafeFetchError(`Hostname resolves to private IPv4 (${address})`, 400);
        }
        if (family === 6 && isPrivateIPv6(address)) {
          throw new SafeFetchError(`Hostname resolves to private IPv6 (${address})`, 400);
        }
      }
    } catch (err) {
      if (err instanceof SafeFetchError) throw err;
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        throw new SafeFetchError(`Hostname does not resolve (${code})`, 400);
      }
      throw new SafeFetchError(`DNS lookup failed: ${(err as Error).message}`, 502);
    }
  }

  // Perform the fetch with a timeout. We layer our timeout on top of any
  // caller-provided signal. Track our own timer-fired flag so we can map
  // the abort reason back to a 504 (vs a generic 502).
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...rest } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('Timeout'));
  }, timeoutMs);
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason);
    else callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), { once: true });
  }

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (err) {
    if (timedOut || (err as Error).name === 'AbortError') {
      throw new SafeFetchError(`Request timed out after ${timeoutMs}ms`, 504);
    }
    throw new SafeFetchError(`Upstream fetch failed: ${(err as Error).message}`, 502);
  } finally {
    clearTimeout(timer);
  }
}
