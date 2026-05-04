import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { parseMindFile, MindFileError } from '@/server/mind-file/reader';
import { mergeMindFile } from '@/server/mind-file/merger';

/**
 * POST /api/v1/import/mind — import a .mind file into the user's base
 *
 * Phase 4 (A.8).
 *
 * Accepts either:
 *   - multipart/form-data with a `file` field, or
 *   - raw bytes (any other content-type) — the request body IS the .mind
 *
 * Optional query parameters:
 *   ?dryRun=1       — parse + plan but skip the INSERTs; useful for the
 *                     conflict-resolver UI to preview the merge.
 *
 * Dedup is content-hash based (sha256 of sourceType + content). Merging
 * is idempotent — re-importing the same file yields zero new memories
 * on the second run.
 */
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'import-mind', RATE_LIMITS.write);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const dryRunParam = searchParams.get('dryRun');
  const dryRun = dryRunParam === '1' || dryRunParam === 'true';

  let bytes: Uint8Array;
  try {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData();
      const fileField = form.get('file');
      if (!(fileField instanceof File)) {
        return NextResponse.json(
          { error: 'Missing "file" form field' },
          { status: 400 },
        );
      }
      if (fileField.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          {
            error: `File too large (${Math.round(fileField.size / 1_000_000)}MB). Maximum 200MB.`,
          },
          { status: 413 },
        );
      }
      bytes = new Uint8Array(await fileField.arrayBuffer());
    } else {
      const buf = await req.arrayBuffer();
      if (buf.byteLength > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          {
            error: `Upload too large (${Math.round(buf.byteLength / 1_000_000)}MB). Maximum 200MB.`,
          },
          { status: 413 },
        );
      }
      bytes = new Uint8Array(buf);
    }
  } catch {
    return NextResponse.json({ error: 'Could not read upload' }, { status: 400 });
  }

  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }

  try {
    const parsed = await parseMindFile(bytes);
    const report = await mergeMindFile(userId, parsed, { dryRun });

    return NextResponse.json({
      manifest: parsed.manifest,
      report,
      dryRun,
    });
  } catch (e) {
    if (e instanceof MindFileError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('[import-mind]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to import .mind file' },
      { status: 500 },
    );
  }
}
