/**
 * Memory Audit Trail — citation builder + provenance helper invariants.
 * Pure functions; no DB.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCitation,
  buildProvenance,
  type MemoryForCitation,
} from '@/server/attribution/citations';

const baseMemory: MemoryForCitation = {
  id: '00000000-0000-0000-0000-000000000001',
  content: 'A useful idea about distributed systems.',
  sourceType: 'chatgpt',
  sourceTitle: 'Distributed systems chat',
  createdAt: new Date('2026-03-15T12:00:00Z'),
  attribution: {},
};

describe('buildCitation', () => {
  it('produces a sensible APA citation when only source-type metadata is known', () => {
    const cite = buildCitation(baseMemory, 'apa');
    expect(cite).toMatch(/ChatGPT conversation/);
    expect(cite).toMatch(/\(2026\)/);
    expect(cite).toMatch(/Distributed systems chat/);
    expect(cite).toMatch(/Chatgpt/);
  });

  it('uses the explicit author and title from attribution when present', () => {
    const cite = buildCitation({
      ...baseMemory,
      attribution: {
        author: 'Lamport, L.',
        title: 'Time, Clocks, and the Ordering of Events',
        publishedAt: '1978-07-01',
        originalUrl: 'https://example.com/lamport-1978',
      },
    }, 'apa');
    expect(cite).toMatch(/Lamport, L\./);
    expect(cite).toMatch(/\(1978\)/);
    expect(cite).toMatch(/Time, Clocks/);
    expect(cite).toContain('https://example.com/lamport-1978');
  });

  it('produces an MLA citation with quoted title and Accessed date', () => {
    const cite = buildCitation({
      ...baseMemory,
      attribution: {
        importedAt: '2026-04-01T00:00:00Z',
      },
    }, 'mla');
    expect(cite).toMatch(/"Distributed systems chat\."/);
    expect(cite).toMatch(/Accessed/);
    expect(cite).toMatch(/2026/);
  });

  it('produces a Chicago citation with title in quotes and source capitalized', () => {
    const cite = buildCitation(baseMemory, 'chicago');
    expect(cite).toMatch(/"Distributed systems chat\."/);
    expect(cite).toMatch(/Chatgpt/);
  });

  it('falls back to "n.d." when the published date is missing AND createdAt is null', () => {
    const cite = buildCitation({
      ...baseMemory,
      createdAt: null,
      attribution: {},
    }, 'apa');
    expect(cite).toMatch(/n\.d\./);
  });

  it('does not crash on completely empty attribution', () => {
    const cite = buildCitation({
      ...baseMemory,
      sourceTitle: null,
      attribution: {},
    }, 'apa');
    expect(cite.length).toBeGreaterThan(0);
  });
});

describe('buildProvenance', () => {
  it('falls back to createdAt when attribution.importedAt is missing', () => {
    const prov = buildProvenance(baseMemory);
    expect(prov.importedAt).toBe('2026-03-15T12:00:00.000Z');
    expect(prov.source).toBe('chatgpt');
    expect(prov.edits).toEqual([]);
  });

  it('preserves the edits log verbatim', () => {
    const prov = buildProvenance({
      ...baseMemory,
      attribution: {
        edits: [
          { at: '2026-04-01T10:00:00Z', by: 'user', summary: 'fixed typo' },
          { at: '2026-04-05T10:00:00Z', by: 'user', summary: 'added link' },
        ],
      },
    });
    expect(prov.edits.length).toBe(2);
    expect(prov.edits[0].summary).toBe('fixed typo');
  });
});
