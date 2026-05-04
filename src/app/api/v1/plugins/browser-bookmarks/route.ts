import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import {
  buildBookmarkPreview,
  ensureBrowserBookmarksReady,
  extractReadableText,
  importBrowserBookmarks,
  parseBookmarksHTML,
} from "@/server/plugins/ports/browser-bookmarks";

async function fetchPageContent(url: string, timeoutMs: number = 8000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
    });

    clearTimeout(timer);

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return null;
    }

    return extractReadableText(await response.text());
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-browser-bookmarks', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    await ensureBrowserBookmarksReady();

    const formData = await req.formData();
    const file = formData.get("file");
    const action = typeof formData.get("action") === "string" ? String(formData.get("action")) : "import";
    const fetchContent = formData.get("fetchContent") === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No bookmarks file uploaded" }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".html") && !fileName.endsWith(".htm")) {
      return NextResponse.json({
        error:
          "Please upload a bookmarks HTML file. Export from your browser: Chrome (chrome://bookmarks -> Export), Firefox (Library -> Export), Safari (File -> Export Bookmarks).",
      }, { status: 400 });
    }

    const html = await file.text();
    if (!html.includes("NETSCAPE-Bookmark") && !html.includes("<DT>") && !html.includes("HREF=")) {
      return NextResponse.json({
        error: "This doesn't look like a browser bookmarks export. Look for \"Export Bookmarks\" in your browser settings.",
      }, { status: 400 });
    }

    const parsed = parseBookmarksHTML(html);
    if (parsed.all.length === 0) {
      return NextResponse.json({
        error: "No bookmarks found in the file. The file may be empty or in an unsupported format.",
      }, { status: 404 });
    }

    if (action === "preview") {
      return NextResponse.json(buildBookmarkPreview(parsed));
    }

    return NextResponse.json(await importBrowserBookmarks({
      userId,
      parsed,
      fetchContent,
      fetchContentForUrl: fetchPageContent,
    }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("plugin is disabled") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
