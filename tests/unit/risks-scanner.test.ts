/**
 * Knowledge Attack Surface — pure detector invariants.
 * scanUserKnowledge() reads/writes the DB and is integration territory.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/db', () => ({ db: { execute: vi.fn() } }));

import { scanMemoryContent, detectSilo, detectSpof } from '@/server/risks/scanner';

const mem = (id: string, content: string, sourceType = 'chatgpt') => ({ id, content, sourceType });

describe('scanMemoryContent — secret detection', () => {
  it('catches an OpenAI API key', () => {
    const out = scanMemoryContent(mem('m1', 'My key is sk-abcdef0123456789abcdef0123456789abcdef0123 keep secret'));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].riskType).toBe('secret');
    expect(out[0].severity).toBe('critical');
  });

  it('catches an Anthropic key', () => {
    const out = scanMemoryContent(mem('m2', 'Token sk-ant-abc123def456ghi789jkl012'));
    expect(out.find((r) => /Anthropic/i.test(r.description))).toBeDefined();
  });

  it('catches a Google API key', () => {
    const out = scanMemoryContent(mem('m3', 'Stored AIza0123456789abcdefghij_KLMNOPQRSTUV'));
    expect(out.find((r) => /Google/i.test(r.description))).toBeDefined();
  });

  it('catches an AWS access key', () => {
    const out = scanMemoryContent(mem('m4', 'AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE'));
    expect(out.find((r) => /AWS access/i.test(r.description))).toBeDefined();
  });

  it('catches a JWT', () => {
    const out = scanMemoryContent(mem('m5', 'token: eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0NTY3ODkwIiwib.SflKxwRJSMeKKF2QT4fwpMeJf36POk6'));
    expect(out.find((r) => /JWT/.test(r.description))).toBeDefined();
  });

  it('catches a private-key block', () => {
    const out = scanMemoryContent(mem('m6', 'cert:\n-----BEGIN RSA PRIVATE KEY-----\n...'));
    expect(out.find((r) => /Private-key/i.test(r.description))).toBeDefined();
    expect(out[0].severity).toBe('critical');
  });

  it('does not false-positive on benign content with sk- prefix', () => {
    const out = scanMemoryContent(mem('m7', 'sk-tank skipped'));
    expect(out.find((r) => r.riskType === 'secret' && /OpenAI/.test(r.description))).toBeUndefined();
  });
});

describe('scanMemoryContent — PII detection', () => {
  it('catches a US SSN pattern', () => {
    const out = scanMemoryContent(mem('m8', 'SSN: 123-45-6789'));
    expect(out.find((r) => r.riskType === 'pii')).toBeDefined();
  });

  it('catches a phone number', () => {
    const out = scanMemoryContent(mem('m9', 'Call me at +1 415 555 1234'));
    expect(out.find((r) => /Phone/.test(r.description))).toBeDefined();
  });
});

describe('detectSilo', () => {
  it('flags an 80%+ source concentration', () => {
    const out = detectSilo({ sourceCounts: { chatgpt: 90, kindle: 5, twitter: 5 }, total: 100 });
    expect(out).not.toBeNull();
    expect(out!.riskType).toBe('silo');
  });

  it('does not flag a balanced distribution', () => {
    const out = detectSilo({ sourceCounts: { chatgpt: 30, kindle: 30, obsidian: 20, twitter: 20 }, total: 100 });
    expect(out).toBeNull();
  });

  it('does not flag a tiny dataset (< 20 memories)', () => {
    const out = detectSilo({ sourceCounts: { chatgpt: 18 }, total: 18 });
    expect(out).toBeNull();
  });

  it('escalates to high severity when one source is 95%+', () => {
    const out = detectSilo({ sourceCounts: { chatgpt: 96, kindle: 4 }, total: 100 });
    expect(out!.severity).toBe('high');
  });
});

describe('detectSpof', () => {
  it('flags titles with credential-like words and few memories', () => {
    const out = detectSpof({
      perTitle: [
        { title: 'AWS root password', count: 1, memoryIds: ['m1'] },
        { title: 'Recovery codes',     count: 2, memoryIds: ['m2', 'm3'] },
      ],
    });
    expect(out.length).toBe(2);
    expect(out[0].severity).toBe('high'); // count=1
    expect(out[1].severity).toBe('medium'); // count=2
  });

  it('skips well-covered titles', () => {
    const out = detectSpof({
      perTitle: [
        { title: 'AWS root password', count: 5, memoryIds: ['a','b','c','d','e'] },
      ],
    });
    expect(out).toEqual([]);
  });

  it('skips titles without credential-like words', () => {
    const out = detectSpof({
      perTitle: [
        { title: 'Random thoughts on cookies', count: 1, memoryIds: ['m1'] },
      ],
    });
    expect(out).toEqual([]);
  });
});
