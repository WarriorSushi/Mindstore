/**
 * Memory Audit Trail — citations + provenance.
 * Phase 4 innovation B.9 in FEATURE_BACKLOG.md.
 *
 * Pure functions that turn a memory's metadata + attribution JSONB
 * into APA / MLA / Chicago citation strings, plus a provenance chain
 * the UI can render in the memory detail panel.
 *
 * The `attribution` JSONB is set by importer plugins (Kindle, YouTube,
 * Notion, etc.) when they create memories. Existing memories without
 * attribution still produce a sensible best-effort citation from
 * source_type + source_title + created_at.
 */

export type CitationStyle = 'apa' | 'mla' | 'chicago';

export interface MemoryAttribution {
  /** Original URL the content came from (browser bookmark, YouTube, web page). */
  originalUrl?: string;
  /** Author or speaker name when known (Kindle book author, podcast host). */
  author?: string;
  /** Title independent of source_title (e.g. for chapter-level imports). */
  title?: string;
  /** ISO date the source was published (Kindle book year, YouTube upload date). */
  publishedAt?: string;
  /** Importer plugin slug that created the memory. */
  importerSlug?: string;
  /** ISO date when the memory was imported. */
  importedAt?: string;
  /** Edits log: each entry { at: ISOdate, by?: userId|"user", summary?: string }. */
  edits?: Array<{ at: string; by?: string; summary?: string }>;
}

export interface MemoryForCitation {
  id: string;
  content: string;
  sourceType: string;
  sourceTitle: string | null;
  createdAt: Date | string | null;
  attribution: MemoryAttribution;
}

/** Produce a citation string in the requested style. */
export function buildCitation(memory: MemoryForCitation, style: CitationStyle): string {
  const author = memory.attribution.author?.trim() || pseudoAuthorFromSource(memory);
  const title = memory.attribution.title?.trim() || memory.sourceTitle?.trim() || 'Untitled';
  const yearString = formatYear(memory.attribution.publishedAt ?? memory.createdAt);
  const url = memory.attribution.originalUrl?.trim();
  const accessed = formatAccessedDate(memory.attribution.importedAt ?? memory.createdAt);

  switch (style) {
    case 'apa':
      // Author. (Year). Title. Source. URL
      return [
        `${author}.`,
        `(${yearString}).`,
        `${title}.`,
        capitalize(memory.sourceType) + '.',
        url ? `${url}` : '',
      ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    case 'mla':
      // Author. "Title." Source, Year, URL. Accessed Date.
      return [
        `${author}.`,
        `"${title}."`,
        `${capitalize(memory.sourceType)},`,
        `${yearString},`,
        url ? `${url}.` : '',
        accessed ? `Accessed ${accessed}.` : '',
      ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    case 'chicago':
      // Author. "Title." Source. Year. URL.
      return [
        `${author}.`,
        `"${title}."`,
        `${capitalize(memory.sourceType)}.`,
        `${yearString}.`,
        url ? `${url}.` : '',
      ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
}

/** Build a small "provenance chain" object for the memory detail UI. */
export function buildProvenance(memory: MemoryForCitation): {
  source: string;
  importer: string | null;
  importedAt: string | null;
  originalUrl: string | null;
  edits: Array<{ at: string; by?: string; summary?: string }>;
} {
  const importedAt = memory.attribution.importedAt
    ?? (memory.createdAt ? new Date(memory.createdAt).toISOString() : null);
  return {
    source: memory.sourceType,
    importer: memory.attribution.importerSlug ?? null,
    importedAt,
    originalUrl: memory.attribution.originalUrl ?? null,
    edits: memory.attribution.edits ?? [],
  };
}

function pseudoAuthorFromSource(memory: MemoryForCitation): string {
  switch (memory.sourceType) {
    case 'chatgpt': return 'ChatGPT conversation';
    case 'claude':  return 'Claude conversation';
    case 'kindle':  return memory.sourceTitle ?? 'Kindle clipping';
    case 'youtube': return memory.sourceTitle ?? 'YouTube video';
    case 'notion':  return memory.sourceTitle ?? 'Notion page';
    case 'obsidian':return memory.sourceTitle ?? 'Obsidian note';
    case 'twitter': return memory.attribution.author ?? 'Twitter user';
    case 'reddit':  return memory.attribution.author ?? 'Reddit user';
    case 'url':     return memory.sourceTitle ?? 'Web page';
    default:        return 'Author unknown';
  }
}

function formatYear(value: string | Date | null | undefined): string {
  if (!value) return 'n.d.';
  try {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return 'n.d.';
    return String(d.getUTCFullYear());
  } catch {
    return 'n.d.';
  }
}

function formatAccessedDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  try {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
