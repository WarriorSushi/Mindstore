import "server-only";

import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";
import { DOC_FILES } from "@/lib/docs-manifest";

const DOCS_ROOT = path.join(process.cwd(), "docs");
const DOC_FILE_SET = new Set<string>(DOC_FILES);
const DOC_SLUG_MAP = new Map<string, string>(
  DOC_FILES.map((relativePath) => {
    const slug = filePathToSlug(relativePath);
    return [slug.join("/"), relativePath];
  })
);

export interface DocPage {
  slug: string[];
  title: string;
  description: string;
  body: string;
  html: string;
  path: string;
  url: string;
  section: string;
}

export interface DocNavGroup {
  key: string;
  label: string;
  items: Array<{
    title: string;
    href: string;
  }>;
}

const SECTION_LABELS: Record<string, string> = {
  root: "Overview",
  "getting-started": "Getting Started",
  concepts: "Concepts",
  "import-guides": "Import Guides",
  "search-and-chat": "Search and Chat",
  plugins: "Plugins",
  mcp: "MCP",
  deploy: "Deploy",
  "api-reference": "API Reference",
  examples: "Examples",
  troubleshooting: "Troubleshooting",
  build: "Build",
  adr: "Architecture Decisions",
  releases: "Release Notes",
};

const SECTION_ORDER = [
  "root",
  "getting-started",
  "concepts",
  "import-guides",
  "search-and-chat",
  "plugins",
  "mcp",
  "deploy",
  "api-reference",
  "examples",
  "troubleshooting",
  "build",
  "adr",
  "releases",
] as const;

export async function getDocBySlug(slug: string[]): Promise<DocPage | null> {
  const filePath = await resolveDocFilePath(slug);
  if (!filePath) {
    return null;
  }

  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  const currentSlug = filePathToSlug(filePath);
  const body = parsed.content.trim();

  return {
    slug: currentSlug,
    title: extractTitle(body, currentSlug),
    description: extractDescription(body),
    body,
    html: await renderMarkdown(stripLeadingTitle(body), currentSlug),
    path: filePath,
    url: slugToUrl(currentSlug),
    section: currentSlug[0] ?? "root",
  };
}

export async function getAllDocs(): Promise<DocPage[]> {
  const docs = await Promise.all(
    DOC_FILES.map(async (relativePath) => {
      const filePath = path.join(DOCS_ROOT, relativePath);
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = matter(raw);
      const slug = filePathToSlug(relativePath);
      const body = parsed.content.trim();

      return {
        slug,
        title: extractTitle(body, slug),
        description: extractDescription(body),
        body,
        html: "",
        path: filePath,
        url: slugToUrl(slug),
        section: slug[0] ?? "root",
      } satisfies DocPage;
    })
  );

  return docs.sort((left, right) => left.url.localeCompare(right.url));
}

export function getAllDocSlugs(): string[][] {
  return DOC_FILES.map((relativePath) => filePathToSlug(relativePath));
}

export async function getDocsNavigation(): Promise<DocNavGroup[]> {
  const docs = await getAllDocs();
  const groups = new Map<string, DocNavGroup>();

  for (const doc of docs) {
    const key = doc.section;
    const label = SECTION_LABELS[key] ?? startCase(key);
    const group = groups.get(key) ?? { key, label, items: [] };
    group.items.push({
      title: doc.title,
      href: doc.url,
    });
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((left, right) => left.href.localeCompare(right.href)),
    }))
    .sort((left, right) => compareSectionOrder(left.key, right.key));
}

async function resolveDocFilePath(slug: string[]): Promise<string | null> {
  const normalized = slug.filter(Boolean);
  const candidates = normalized.length ? [normalized.join("/"), `${normalized.join("/")}/index`] : [""];

  for (const candidate of candidates) {
    const relativePath = DOC_SLUG_MAP.get(candidate);
    if (relativePath && DOC_FILE_SET.has(relativePath)) {
      return path.join(DOCS_ROOT, relativePath);
    }
  }

  return null;
}

function filePathToSlug(filePath: string): string[] {
  const relativePath = filePath.replace(/\\/g, "/");
  if (relativePath === "index.md") {
    return [];
  }

  return relativePath.replace(/\.md$/i, "").split("/").filter((segment) => segment !== "index");
}

function slugToUrl(slug: string[]): string {
  return slug.length ? `/docs/${slug.join("/")}` : "/docs";
}

function extractTitle(body: string, slug: string[]): string {
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) {
    return heading;
  }

  return startCase(slug[slug.length - 1] ?? "Docs");
}

function extractDescription(body: string): string {
  const line = body
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry && !entry.startsWith("#"));

  return line ?? "MindStore documentation";
}

async function renderMarkdown(body: string, currentSlug: string[]): Promise<string> {
  const renderer = new marked.Renderer();

  renderer.link = ({ href, title, text }) => {
    const resolvedHref = href ? resolveMarkdownHref(href, currentSlug) : "#";
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    const external = resolvedHref.startsWith("http");
    const rel = external ? ` rel="noreferrer noopener"` : "";
    const target = external ? ` target="_blank"` : "";

    return `<a href="${escapeHtml(resolvedHref)}"${titleAttribute}${rel}${target}>${text}</a>`;
  };

  return await marked.parse(body, {
    renderer,
    async: true,
    gfm: true,
  });
}

function stripLeadingTitle(body: string): string {
  return body.replace(/^#\s+.+?(?:\r?\n){1,2}/, "");
}

function resolveMarkdownHref(href: string, currentSlug: string[]): string {
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("#")) {
    return href;
  }

  if (href.startsWith("/")) {
    return href;
  }

  const currentPath = currentSlug.length ? currentSlug.join("/") : "index";
  const currentDir = path.posix.dirname(currentPath);
  const joined = path.posix.normalize(path.posix.join(currentDir, href));
  const withoutExtension = joined.replace(/\.md$/i, "").replace(/\/index$/i, "");
  const normalized = withoutExtension === "index" ? "" : withoutExtension;
  return normalized ? `/docs/${normalized}` : "/docs";
}

function startCase(value: string): string {
  return value
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function compareSectionOrder(left: string, right: string): number {
  const leftIndex = SECTION_ORDER.indexOf(left as (typeof SECTION_ORDER)[number]);
  const rightIndex = SECTION_ORDER.indexOf(right as (typeof SECTION_ORDER)[number]);

  if (leftIndex === -1 && rightIndex === -1) {
    return left.localeCompare(right);
  }

  if (leftIndex === -1) {
    return 1;
  }

  if (rightIndex === -1) {
    return -1;
  }

  return leftIndex - rightIndex;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
