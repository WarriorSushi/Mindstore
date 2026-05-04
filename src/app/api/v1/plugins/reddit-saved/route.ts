import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import {
  buildRedditSampleItems,
  buildRedditStats,
  dedupeRedditItems,
  ensureRedditSavedReady,
  extractPostsFromCSV,
  importRedditItems,
  parseRedditJSON,
  parseReferenceCSV,
  type RedditPost,
} from "@/server/plugins/ports/reddit-importer";

async function processZipExport(buffer: ArrayBuffer): Promise<{ posts: RedditPost[]; comments: RedditPost[] }> {
  const zip = await JSZip.loadAsync(buffer);
  let posts: RedditPost[] = [];
  let comments: RedditPost[] = [];

  for (const fileName of Object.keys(zip.files).filter((filePath) => !zip.files[filePath].dir)) {
    const entry = zip.files[fileName];
    const baseName = fileName.split("/").pop()?.toLowerCase() || "";
    const content = await entry.async("string");

    if (!content.trim()) continue;

    if (baseName.endsWith(".json")) {
      const items = parseRedditJSON(content);
      posts = posts.concat(items.filter((item) => item.type === "post"));
      comments = comments.concat(items.filter((item) => item.type === "comment"));
      continue;
    }

    if (!baseName.endsWith(".csv")) continue;

    if (baseName.includes("saved_post") || baseName === "saved_posts.csv") {
      const full = extractPostsFromCSV(content, "post");
      posts = posts.concat(full.length > 0 && full.some((item) => item.body || item.title !== "Post")
        ? full
        : parseReferenceCSV(content, "post"));
    } else if (baseName.includes("saved_comment") || baseName === "saved_comments.csv") {
      const full = extractPostsFromCSV(content, "comment");
      comments = comments.concat(full.length > 0 && full.some((item) => item.body || item.title !== "Comment")
        ? full
        : parseReferenceCSV(content, "comment"));
    } else if (["posts.csv", "post_submissions.csv", "submissions.csv"].includes(baseName)) {
      posts = posts.concat(extractPostsFromCSV(content, "post"));
    } else if (["comments.csv", "comment_replies.csv"].includes(baseName)) {
      comments = comments.concat(extractPostsFromCSV(content, "comment"));
    }
  }

  return { posts, comments };
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'plugin-reddit-saved', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    await ensureRedditSavedReady();

    const formData = await req.formData();
    const file = formData.get("file");
    const action = typeof formData.get("action") === "string" ? String(formData.get("action")) : "import";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    let posts: RedditPost[] = [];
    let comments: RedditPost[] = [];
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".zip")) {
      ({ posts, comments } = await processZipExport(await file.arrayBuffer()));
    } else if (fileName.endsWith(".json")) {
      const items = parseRedditJSON(await file.text());
      posts = items.filter((item) => item.type === "post");
      comments = items.filter((item) => item.type === "comment");
    } else if (fileName.endsWith(".csv")) {
      const text = await file.text();
      const isComment = fileName.includes("comment");
      const extracted = extractPostsFromCSV(text, isComment ? "comment" : "post");
      if (extracted.length === 0) {
        comments = isComment ? parseReferenceCSV(text, "comment") : [];
        posts = isComment ? [] : parseReferenceCSV(text, "post");
      } else {
        comments = isComment ? extracted : [];
        posts = isComment ? [] : extracted;
      }
    } else {
      return NextResponse.json({
        error: "Unsupported file format. Upload a ZIP, CSV, or JSON file from Reddit data export.",
      }, { status: 400 });
    }

    ({ posts, comments } = dedupeRedditItems(posts, comments));

    if (posts.length === 0 && comments.length === 0) {
      return NextResponse.json({
        error: "No Reddit posts or comments found in this file. Make sure you uploaded a Reddit data export.",
      }, { status: 400 });
    }

    if (action === "preview") {
      return NextResponse.json({
        stats: buildRedditStats(posts, comments),
        sampleItems: buildRedditSampleItems(posts, comments),
      });
    }

    return NextResponse.json(await importRedditItems({ userId, posts, comments }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to import Reddit data";
    const status = message.includes("plugin is disabled") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
