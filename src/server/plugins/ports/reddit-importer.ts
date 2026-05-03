import { importDocuments } from "@/server/import-service";
import { assertPluginEnabled } from "@/server/plugins/ports/plugin-config";

const PLUGIN_SLUG = "reddit-saved";
const MAX_IMPORT_CHUNKS = 500;

export interface RedditPost {
  id: string;
  title: string;
  body: string;
  subreddit: string;
  author: string;
  url: string;
  permalink: string;
  score: number;
  created: string;
  type: "post" | "comment";
  parentTitle?: string;
  isLink: boolean;
}

export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    const nextChar = clean[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      current.push(field);
      field = "";
    } else if (char === "\n" || (char === "\r" && nextChar === "\n")) {
      current.push(field);
      field = "";
      if (current.some((value) => value.trim())) rows.push(current);
      current = [];
      if (char === "\r") index += 1;
    } else {
      field += char;
    }
  }

  current.push(field);
  if (current.some((value) => value.trim())) rows.push(current);
  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/\s+/g, "_"));
  const mappedRows = rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (row[index] || "").trim();
    });
    return record;
  });

  return { headers, rows: mappedRows };
}

export function parseRedditDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const numeric = Number(dateStr);
  if (!Number.isNaN(numeric) && numeric > 1e9 && numeric < 1e11) {
    return new Date(numeric * 1000).toISOString();
  }
  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function extractPostsFromCSV(csvText: string, type: "post" | "comment"): RedditPost[] {
  const { rows } = parseCSV(csvText);
  if (rows.length === 0) return [];

  const fieldMap: Record<string, string[]> = {
    id: ["id", "post_id", "comment_id", "thing_id"],
    title: ["title", "post_title", "link_title", "submission_title"],
    body: ["body", "selftext", "self_text", "text", "content", "comment_body"],
    subreddit: ["subreddit", "subreddit_name", "community", "sr"],
    author: ["author", "author_name", "username", "user"],
    url: ["url", "link_url", "post_url"],
    permalink: ["permalink", "link", "post_link"],
    score: ["score", "upvotes", "ups", "points"],
    created: ["date", "created", "created_utc", "created_at", "timestamp", "time", "post_date"],
  };

  const findField = (row: Record<string, string>, candidates: string[]) => {
    for (const candidate of candidates) {
      if (row[candidate] !== undefined && row[candidate] !== "") return row[candidate];
    }
    return "";
  };

  return rows
    .map((row) => {
      const id = findField(row, fieldMap.id) || Math.random().toString(36).slice(2);
      const title = findField(row, fieldMap.title);
      const body = findField(row, fieldMap.body);
      const subreddit = findField(row, fieldMap.subreddit).replace(/^r\//, "");
      const author = findField(row, fieldMap.author).replace(/^u\//, "");
      const url = findField(row, fieldMap.url);
      const permalink = findField(row, fieldMap.permalink);
      const score = Number.parseInt(findField(row, fieldMap.score), 10) || 0;
      const created = parseRedditDate(findField(row, fieldMap.created)) || new Date().toISOString();

      if (!title && !body && !permalink) return null;

      return {
        id,
        title: title || (type === "comment" ? "Comment" : "Post"),
        body: body || "",
        subreddit,
        author,
        url: url || "",
        permalink: permalink || "",
        score,
        created,
        type,
        parentTitle: type === "comment" ? title : undefined,
        isLink: Boolean(url && url !== permalink && !url.includes("reddit.com")),
      } satisfies RedditPost;
    })
    .filter(Boolean) as RedditPost[];
}

export function parseReferenceCSV(csvText: string, type: "post" | "comment"): RedditPost[] {
  const { rows } = parseCSV(csvText);
  if (rows.length === 0) return [];

  return rows
    .map((row) => {
      const id = row.id || row.thing_id || Math.random().toString(36).slice(2);
      const permalink = row.permalink || row.link || "";
      if (!permalink) return null;

      const subreddit = permalink.match(/\/r\/([^/]+)/)?.[1] || "";
      const title = permalink.match(/\/comments\/[^/]+\/([^/]+)/)?.[1]
        ?.replace(/_/g, " ")
        .replace(/^\w/, (char) => char.toUpperCase())
        || (type === "comment" ? "Saved Comment" : "Saved Post");

      return {
        id,
        title,
        body: "",
        subreddit,
        author: "",
        url: `https://www.reddit.com${permalink}`,
        permalink,
        score: 0,
        created: parseRedditDate(row.date || row.created || row.created_utc || "") || new Date().toISOString(),
        type,
        isLink: false,
      } satisfies RedditPost;
    })
    .filter(Boolean) as RedditPost[];
}

export function parseRedditJSON(jsonText: string): RedditPost[] {
  try {
    const data = JSON.parse(jsonText);
    const items = Array.isArray(data) ? data : (data.data || data.children || data.posts || data.saved || []);
    return items
      .map((item: unknown) => {
        const itemRecord = isRecord(item) ? item : {};
        const payload = isRecord(itemRecord.data) ? itemRecord.data : itemRecord;
        const id = asString(payload.id) || asString(payload.name) || Math.random().toString(36).slice(2);
        const titleValue = asString(payload.title) || asString(payload.link_title);
        const body = asString(payload.body)
          || asString(payload.selftext)
          || asString(payload.self_text)
          || asString(payload.text)
          || "";
        const subreddit = (asString(payload.subreddit) || asString(payload.subreddit_name_prefixed) || "").replace(/^r\//, "");
        const author = (asString(payload.author) || asString(payload.author_name) || "").replace(/^u\//, "");
        const url = asString(payload.url) || asString(payload.link_url) || "";
        const permalink = asString(payload.permalink) || "";
        const score = asNumber(payload.score) || asNumber(payload.ups) || 0;
        const type: "post" | "comment" =
          payload.body !== undefined || itemRecord.kind === "t1" || payload.type === "comment"
            ? "comment"
            : "post";

        return {
          id,
          title: titleValue || (type === "comment" ? "Comment" : "Post"),
          body,
          subreddit,
          author,
          url,
          permalink,
          score,
          created:
            parseRedditDate(String(payload.created_utc || payload.created || payload.date || ""))
            || new Date().toISOString(),
          type,
          parentTitle: type === "comment" ? titleValue || undefined : undefined,
          isLink: Boolean(url && payload.is_self !== true && !url.includes("reddit.com")),
        } satisfies RedditPost;
      })
      .filter((item: RedditPost) => item.title || item.body);
  } catch {
    return [];
  }
}

export function dedupeRedditItems(posts: RedditPost[], comments: RedditPost[]) {
  const seen = new Set<string>();
  return {
    posts: posts.filter((post) => {
      if (seen.has(post.id)) return false;
      seen.add(post.id);
      return true;
    }),
    comments: comments.filter((comment) => {
      if (seen.has(comment.id)) return false;
      seen.add(comment.id);
      return true;
    }),
  };
}

export function formatRedditContent(item: RedditPost) {
  const parts: string[] = [];
  if (item.type === "comment") {
    parts.push(`**Comment** on r/${item.subreddit}`);
    if (item.parentTitle) parts.push(`Re: ${item.parentTitle}`);
  } else {
    parts.push(`**${item.title}**`, `r/${item.subreddit}`);
  }

  const metadata: string[] = [];
  if (item.author) metadata.push(`u/${item.author}`);
  if (item.score) metadata.push(`${item.score} points`);
  if (item.created) {
    metadata.push(new Date(item.created).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }));
  }
  if (metadata.length > 0) parts.push(metadata.join(" · "));
  if (item.body) parts.push("", item.body);
  if (item.isLink && item.url) parts.push("", `🔗 ${item.url}`);
  if (item.permalink) {
    const fullUrl = item.permalink.startsWith("http")
      ? item.permalink
      : `https://www.reddit.com${item.permalink}`;
    parts.push("", `Source: ${fullUrl}`);
  }

  return {
    title:
      item.type === "comment"
        ? `💬 Comment on r/${item.subreddit}: ${item.parentTitle || item.title}`.slice(0, 200)
        : `📝 r/${item.subreddit}: ${item.title}`.slice(0, 200),
    content: parts.join("\n"),
  };
}

export function chunkRedditContent(content: string, maxChars: number = 4000) {
  if (content.length <= maxChars) return [content];

  const chunks: string[] = [];
  const paragraphs = content.split("\n\n");
  let current = "";

  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length + 2 > maxChars && current) {
      chunks.push(current.trim());
      current = "";
    }
    current += `${current ? "\n\n" : ""}${paragraph}`;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function buildRedditStats(posts: RedditPost[], comments: RedditPost[]) {
  const all = [...posts, ...comments];
  const subredditCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();

  for (const item of all) {
    if (item.subreddit) {
      subredditCounts.set(item.subreddit, (subredditCounts.get(item.subreddit) || 0) + 1);
    }
    if (item.author) {
      authorCounts.set(item.author, (authorCounts.get(item.author) || 0) + 1);
    }
  }

  const dates = all.map((item) => new Date(item.created).getTime()).filter((value) => !Number.isNaN(value)).sort();
  const totalScore = all.reduce((sum, item) => sum + (item.score || 0), 0);

  return {
    totalPosts: posts.length,
    totalComments: comments.length,
    totalItems: all.length,
    subreddits: [...subredditCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count),
    dateRange: {
      oldest:
        dates.length > 0
          ? new Date(dates[0]).toLocaleDateString("en-US", { year: "numeric", month: "short" })
          : null,
      newest:
        dates.length > 0
          ? new Date(dates[dates.length - 1]).toLocaleDateString("en-US", { year: "numeric", month: "short" })
          : null,
    },
    topAuthors: [...authorCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10),
    avgScore: all.length > 0 ? Math.round(totalScore / all.length) : 0,
  };
}

export function buildRedditSampleItems(posts: RedditPost[], comments: RedditPost[]) {
  return [...posts, ...comments]
    .sort((left, right) => (right.score || 0) - (left.score || 0))
    .slice(0, 8)
    .map((item) => ({
      title:
        item.type === "comment"
          ? (item.parentTitle || item.title || "Comment").slice(0, 100)
          : (item.title || "Post").slice(0, 100),
      subreddit: item.subreddit,
      type: item.type,
      score: item.score,
      preview: (item.body || "").slice(0, 150),
      date: item.created
        ? new Date(item.created).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
        : "",
    }));
}

export async function ensureRedditSavedReady() {
  await assertPluginEnabled(PLUGIN_SLUG);
}

export async function importRedditItems({
  userId,
  posts,
  comments,
}: {
  userId: string;
  posts: RedditPost[];
  comments: RedditPost[];
}) {
  await ensureRedditSavedReady();

  const allItems = [...posts, ...comments];
  const documents = allItems.flatMap((item) => {
    const formatted = formatRedditContent(item);
    const chunks = chunkRedditContent(formatted.content);

    return chunks.map((chunk, index) => ({
      title: chunks.length > 1 ? `${formatted.title} (${index + 1}/${chunks.length})` : formatted.title,
      content: chunks.length > 1 ? `[Part ${index + 1}/${chunks.length}]\n\n${chunk}` : chunk,
      sourceType: "reddit",
      timestamp: item.created ? new Date(item.created) : undefined,
      metadata: {
        plugin: PLUGIN_SLUG,
        subreddit: item.subreddit,
        itemType: item.type,
        permalink: item.permalink,
        score: item.score,
      },
      preChunked: true,
    }));
  });

  const cappedDocuments = documents.slice(0, MAX_IMPORT_CHUNKS);
  const summary = await importDocuments({ userId, documents: cappedDocuments });

  return {
    imported: {
      totalItems: allItems.length,
      totalPosts: posts.length,
      totalComments: comments.length,
      chunks: summary.chunks,
      skipped: documents.length > MAX_IMPORT_CHUNKS ? documents.length - MAX_IMPORT_CHUNKS : 0,
      topSubreddits: buildRedditStats(posts, comments).subreddits.slice(0, 5),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : 0;
}
