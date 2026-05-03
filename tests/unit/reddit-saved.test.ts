import { describe, expect, it } from "vitest";
import {
  buildRedditSampleItems,
  buildRedditStats,
  extractPostsFromCSV,
  formatRedditContent,
  parseRedditJSON,
} from "@/server/plugins/ports/reddit-importer";

describe("reddit saved port", () => {
  it("extracts reddit posts from csv", () => {
    const posts = extractPostsFromCSV("id,title,body,subreddit,author,score,created_utc\n1,Hello,Body text,mindstore,irfan,10,1704067200", "post");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.subreddit).toBe("mindstore");
  });

  it("parses reddit json payloads", () => {
    const items = parseRedditJSON(JSON.stringify([{ id: "1", title: "Test", subreddit: "pkm", author: "u", created_utc: 1704067200 }]));
    expect(items[0]?.title).toBe("Test");
  });

  it("builds stats, previews, and formatted content", () => {
    const items = extractPostsFromCSV("id,title,body,subreddit,author,score,created_utc\n1,Hello,Body text,mindstore,irfan,10,1704067200", "post");
    const stats = buildRedditStats(items, []);
    const samples = buildRedditSampleItems(items, []);
    const formatted = formatRedditContent(items[0]!);

    expect(stats.totalItems).toBe(1);
    expect(samples[0]?.title).toBe("Hello");
    expect(formatted.content).toContain("Body text");
  });
});
