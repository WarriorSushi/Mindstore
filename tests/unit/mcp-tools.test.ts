/**
 * Extended MCP tools — schema invariants + dispatcher routing.
 *
 * The four tools added in commit (this commit) — get_timeline,
 * get_contradictions, get_threads, learn_fact — extend the original
 * three (search_mind, get_profile, get_context) without altering them.
 *
 * Most of the heavy lifting is delegated to existing modules
 * (`retrieve`, `retrieveAdversarial`, `generateEmbeddings`, `db`),
 * each already covered by its own unit tests. Here we lock in:
 *
 *   - Tool definitions are well-formed (every required field present,
 *     names unique, schemas valid JSON-schema shape).
 *   - The dispatcher (`callMcpTool`) routes the four new names to
 *     functions that exist (asserted via dynamic import).
 *   - Static expectations about the public tool surface so the
 *     marketplace listing and /mcp-setup page stay in sync.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/db', () => ({ db: { execute: vi.fn() } }));
vi.mock('@/server/embeddings', () => ({
  generateEmbeddings: vi.fn(async () => null),
  getEmbeddingConfig: vi.fn(async () => null),
}));
vi.mock('@/server/retrieval', () => ({
  retrieve: vi.fn(async () => []),
  buildTreeIndex: vi.fn(async () => undefined),
}));
vi.mock('@/server/retrieval-adversarial', () => ({
  retrieveAdversarial: vi.fn(async () => []),
}));
vi.mock('@/server/auth', () => ({ auth: vi.fn(async () => null) }));
vi.mock('@/server/identity', () => ({
  DEFAULT_USER_ID: '00000000-0000-0000-0000-000000000001',
  isSingleUserModeEnabled: () => true,
  isGoogleAuthConfigured: () => false,
  getIdentityMode: () => 'single-user',
}));
vi.mock('@/server/api-keys', () => ({
  getApiKeyFromHeaders: () => null,
  resolveApiKeyUserId: vi.fn(async () => null),
}));
vi.mock('@/server/plugins/state', () => ({
  getInstalledPluginMap: vi.fn(async () => new Map()),
}));
vi.mock('@/server/plugins/runtime', () => ({
  pluginRuntime: {
    getMcpTools: () => [],
    getMcpResources: () => [],
    getPrompts: () => [],
  },
}));

import { CORE_MCP_TOOLS, callMcpTool } from '@/server/mcp/runtime';
import { db } from '@/server/db';
import { retrieve } from '@/server/retrieval';
import { retrieveAdversarial } from '@/server/retrieval-adversarial';

describe('Extended MCP tool definitions', () => {
  it('exposes the original three core tools', () => {
    const names = CORE_MCP_TOOLS.map((t) => t.name);
    expect(names).toContain('search_mind');
    expect(names).toContain('get_profile');
    expect(names).toContain('get_context');
  });

  it('exposes the four new tools', () => {
    const names = CORE_MCP_TOOLS.map((t) => t.name);
    expect(names).toContain('get_timeline');
    expect(names).toContain('get_contradictions');
    expect(names).toContain('get_threads');
    expect(names).toContain('learn_fact');
  });

  it('every tool has a unique name', () => {
    const names = CORE_MCP_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every tool has a description and JSON-schema input', () => {
    for (const tool of CORE_MCP_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it('learn_fact and get_timeline declare required fields', () => {
    const learn = CORE_MCP_TOOLS.find((t) => t.name === 'learn_fact')!;
    expect(learn.inputSchema.required).toContain('content');

    const tl = CORE_MCP_TOOLS.find((t) => t.name === 'get_timeline')!;
    expect(tl.inputSchema.required).toContain('topic');
  });

  it('get_threads makes topic optional (no-topic mode = recent threads)', () => {
    const t = CORE_MCP_TOOLS.find((t) => t.name === 'get_threads')!;
    expect(t.inputSchema.required ?? []).not.toContain('topic');
  });
});

describe('Dispatcher routing for new tools', () => {
  it('get_timeline returns "no memories matched" when retrieve returns []', async () => {
    vi.mocked(retrieve).mockResolvedValueOnce([]);
    const result = await callMcpTool('get_timeline', { topic: 'rust async runtime' });
    expect(result.text).toMatch(/No memories matched/i);
  });

  it('get_contradictions returns the empty-state hint when retrieveAdversarial returns []', async () => {
    vi.mocked(retrieveAdversarial).mockResolvedValueOnce([]);
    const result = await callMcpTool('get_contradictions', { query: 'monorepos' });
    expect(result.text).toMatch(/No recorded contradictions/i);
    expect(result.text).toContain('monorepos');
  });

  it('get_threads (no topic) hits the recent-threads SQL path and returns the empty-state hint when DB returns []', async () => {
    vi.mocked(db.execute).mockResolvedValueOnce([] as never);
    const result = await callMcpTool('get_threads', {});
    expect(result.text).toMatch(/No active threads/i);
  });

  it('get_threads (with topic) returns no-coherent-threads when retrieve returns 1 isolated match', async () => {
    vi.mocked(retrieve).mockResolvedValueOnce([
      {
        memoryId: 'm1',
        content: 'isolated thought',
        sourceType: 'chatgpt',
        sourceTitle: 'A Title',
        createdAt: new Date('2026-01-01'),
        score: 0.5,
        layers: { vector: 0.5 },
      } as never,
    ]);
    const result = await callMcpTool('get_threads', { topic: 'lone topic' });
    // 1 result = no thread of ≥2 → falls through to the "scattered" message
    expect(result.text).toMatch(/scattered|no coherent thread/i);
  });

  it('learn_fact rejects empty content', async () => {
    const result = await callMcpTool('learn_fact', { content: '   ' });
    expect(result.text).toMatch(/required and must not be empty/i);
  });

  it('learn_fact rejects content over 50k chars', async () => {
    const huge = 'x'.repeat(50_001);
    const result = await callMcpTool('learn_fact', { content: huge });
    expect(result.text).toMatch(/exceeds the 50,000-character limit/i);
  });

  it('learn_fact stores a memory and reports the new id', async () => {
    vi.mocked(db.execute).mockResolvedValueOnce(undefined as never);
    const result = await callMcpTool('learn_fact', {
      content: 'I prefer Drizzle over Prisma for query control.',
      category: 'preference',
    });
    expect(result.text).toMatch(/^Stored\. id=[0-9a-f-]{36}/);
    expect(result.text).toContain('Category: "preference"');
  });

  it('rejects an unknown tool name', async () => {
    await expect(callMcpTool('not_a_real_tool', {})).rejects.toThrow(/Unknown tool/);
  });
});

describe('Tool description quality (marketplace-facing copy)', () => {
  // The descriptions are user-visible in MCP client UIs; lock in that
  // every one of them mentions a use-case verb, so an LLM client can
  // pick the right tool without reading the schema.
  it('every new tool description mentions what it returns or does', () => {
    const newTools = ['get_timeline', 'get_contradictions', 'get_threads', 'learn_fact'];
    for (const name of newTools) {
      const tool = CORE_MCP_TOOLS.find((t) => t.name === name)!;
      expect(tool.description).toMatch(/return|surface|find|store|teach|see|trace/i);
    }
  });

  it('learn_fact description tells the AI when to call it', () => {
    const tool = CORE_MCP_TOOLS.find((t) => t.name === 'learn_fact')!;
    expect(tool.description).toMatch(/remember|note|save/i);
  });
});
