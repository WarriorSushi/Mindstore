import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { buildMindFile } from '@/server/mind-file/writer';

/**
 * POST /api/v1/export/mind — produce a portable .mind file
 *
 * Phase 4 (A.8). Returns a ZIP archive (`application/zip`) containing
 * memories.jsonl + embeddings.bin + tree_index.json + connections.json
 * + profile.json + manifest.json. The browser saves it as a download.
 *
 * Optional query parameters:
 *   ?label=<text>   — embedded in the manifest, ≤200 chars.
 *
 * No request body is required; POST is used (not GET) because this is
 * a state-affecting export from the user's perspective and we want
 * to gate it behind the write rate limit.
 *
 * Vercel Blob is intentionally not used in v1 — the file streams
 * directly back to the caller. Layering Blob on top later is a runtime
 * change, not a format change. Tracked under BLOCK-4 (cron + Blob).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'export-mind', RATE_LIMITS.write);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const rawLabel = searchParams.get('label');
  const label = rawLabel ? rawLabel.slice(0, 200) : undefined;

  try {
    const { bytes, manifest } = await buildMindFile(userId, { label });

    const datePart = manifest.generatedAt.replace(/[:T]/g, '-').slice(0, 19);
    const filename = `mindstore-${datePart}.mind`;

    // Wrap in Node Buffer to satisfy BodyInit; matches the repo
    // convention used by /api/v1/extension/package for ZIP downloads.
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Mind-Format': manifest.format,
        'X-Mind-Memory-Count': String(manifest.memoryCount),
        'X-Mind-Checksum': manifest.contentSha256,
      },
    });
  } catch (e) {
    console.error('[export-mind]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to build .mind file' },
      { status: 500 },
    );
  }
}
