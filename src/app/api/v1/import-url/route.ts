import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import {
  parseJsonBody,
  requireUserId,
  safeFetch,
  SafeFetchError,
} from '@/server/api-validation';

const ImportUrlSchema = z.object({
  url: z.string().min(1),
});

/**
 * POST /api/v1/import-url — extract text from a URL server-side
 * Body: { url: string }
 * Returns: { title, content, url }
 *
 * This replaces the client-side CORS proxy approach (allorigins.win)
 * which was fragile and leaked user URLs to a third party.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;

  const limited = applyRateLimit(req, 'import-url', RATE_LIMITS.write);
  if (limited) return limited;

  const body = await parseJsonBody(req, ImportUrlSchema);
  if (body instanceof NextResponse) return body;

  let res: Response;
  try {
    // safeFetch enforces:
    //   - http(s)-only
    //   - literal-IP rejection (private/loopback)
    //   - DNS lookup re-validation (defeats most SSRF DNS rebinding)
    //   - 15s timeout
    res = await safeFetch(body.url, {
      headers: {
        'User-Agent': 'MindStore/0.3 (knowledge-import)',
        'Accept': 'text/html,application/xhtml+xml,text/plain,*/*',
      },
      timeoutMs: 15000,
    });
  } catch (err) {
    if (err instanceof SafeFetchError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'Unknown fetch error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const url = res.url || body.url;
  const parsed = new URL(url);

  try {
    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch (${res.status})` }, { status: 502 });
    }

    const contentType = res.headers.get('content-type') || '';
    const html = await res.text();

    // Extract text content
    let title = url;
    let content = '';

    if (contentType.includes('text/html') || contentType.includes('xhtml')) {
      // Extract title
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) title = titleMatch[1].replace(/\s+/g, ' ').trim();

      // Extract og:title as fallback
      if (title === url) {
        const ogMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
        if (ogMatch) title = ogMatch[1];
      }

      // Strip scripts, styles, nav, footer, header, aside
      content = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<aside[\s\S]*?<\/aside>/gi, '')
        .replace(/<[^>]+>/g, ' ')  // strip remaining HTML tags
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#\d+;/g, '')
        .replace(/\s+/g, ' ')     // collapse whitespace
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
    } else {
      // Plain text or other format — use as-is
      content = html.trim();
    }

    if (content.length < 50) {
      return NextResponse.json({ error: 'No meaningful content found on page' }, { status: 422 });
    }

    // Truncate to reasonable size (100KB of text)
    if (content.length > 100_000) {
      content = content.slice(0, 100_000) + '\n\n[Content truncated at 100KB]';
    }

    return NextResponse.json({ title, content, url: parsed.href });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json({ error: 'URL fetch timed out (15s)' }, { status: 504 });
    }
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
