import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { generateEmbeddings } from "@/server/embeddings";
import { pluginRuntime } from "@/server/plugins/runtime";
import { getInstalledPluginMap } from "@/server/plugins/state";
import { retrieve } from "@/server/retrieval";
import { retrieveAdversarial } from "@/server/retrieval-adversarial";
import { getUserId } from "@/server/user";
import { sql } from "drizzle-orm";
import { z } from "zod";

export const MINDSTORE_MCP_SERVER_INFO = {
  name: "mindstore",
  version: "0.3.0",
  description: "Your personal MindStore — searchable knowledge from your conversations, notes, and documents. Search, contextualize, contradict, thread, and write to your second brain from any MCP client.",
};

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        enum?: string[];
      }
    >;
    required?: string[];
  };
}

interface StatsRow {
  total: string;
  sources: string;
  earliest: string | Date | null;
  latest: string | Date | null;
}

interface ByTypeRow {
  source_type: string;
  count: string;
}

interface TopSourceRow {
  source_title: string | null;
  source_type: string;
  count: string;
}

interface RecentRow {
  id: string;
  content: string;
  source_type: string;
  source_title: string | null;
  created_at: string | Date | null;
}

export const CORE_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: "search_mind",
    description: "Search your personal knowledge base semantically. Returns relevant memories from your conversations, notes, documents, and more.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query" },
        limit: { type: "number", description: "Max results (default 5, max 20)" },
        source: { type: "string", description: "Filter by source type: chatgpt, text, file, url" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_profile",
    description: "Get a summary of the user's knowledge base: how many memories, what sources, top topics.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_context",
    description: "Get relevant context for a topic from the user's knowledge base. Returns top matching memories formatted for use as context.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic to get context about" },
        limit: { type: "number", description: "Max memories to include (default 5)" },
      },
      required: ["topic"],
    },
  },
  {
    name: "get_timeline",
    description: "See how the user's thinking on a topic evolved over time. Returns matching memories sorted oldest-to-newest with timestamps, optionally bounded by a date range. Useful for 'when did I first learn X?' or 'how have my views on Y shifted since last year?'",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic to trace through time" },
        fromDate: { type: "string", description: "Optional ISO date (YYYY-MM-DD) lower bound" },
        toDate: { type: "string", description: "Optional ISO date (YYYY-MM-DD) upper bound" },
        limit: { type: "number", description: "Max memories (default 20, max 50)" },
      },
      required: ["topic"],
    },
  },
  {
    name: "get_contradictions",
    description: "Surface contradictions in the user's knowledge base for a query. Uses precomputed contradictions from the contradiction-finder plugin. Returns memories that disagree with each other so the AI can present 'devil's advocate' views or admit uncertainty rather than parroting one side. Falls back gracefully if no contradictions are recorded.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Query to check for contradictions" },
        limit: { type: "number", description: "Max contradicting pairs to return (default 5, max 15)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_threads",
    description: "Find coherent threads of thought on a topic — groups of memories from the same source (document, conversation, book) where the topic appears. Helps an AI assistant follow a line of reasoning rather than seeing isolated chunks. If no topic is given, returns the user's most prolific recent threads.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Optional topic to thread on. Omit for most-active recent threads." },
        limit: { type: "number", description: "Max threads to return (default 5, max 15)" },
      },
    },
  },
  {
    name: "learn_fact",
    description: "Teach MindStore a new fact from the current conversation. The AI assistant calls this when the user says something worth remembering ('remember that X' / 'note this' / 'save this for later'). The fact is embedded and stored alongside the user's other memories. Returns the new memory's id.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The fact to remember (1-50,000 characters)" },
        category: { type: "string", description: "Optional category label (e.g., 'preference', 'project-status', 'goal')" },
        source: { type: "string", description: "Optional human-readable source label (e.g., 'Conversation with Claude on 2026-05-04')" },
      },
      required: ["content"],
    },
  },
];

export const CORE_MCP_RESOURCES = [
  {
    uri: "mindstore://profile",
    name: "Knowledge Profile",
    description: "Summary statistics about the user's stored knowledge",
    mimeType: "application/json",
  },
  {
    uri: "mindstore://recent",
    name: "Recent Memories",
    description: "The 10 most recently added memories",
    mimeType: "application/json",
  },
];

export async function getMcpUserId(): Promise<string> {
  return await getUserId();
}

export async function getMcpBindings() {
  const installedMap = await getInstalledPluginMap();

  return {
    tools: pluginRuntime.getMcpTools(installedMap),
    resources: pluginRuntime.getMcpResources(installedMap),
    prompts: pluginRuntime.getPrompts(installedMap),
  };
}

export async function buildMcpDiscovery() {
  const bindings = await getMcpBindings();

  return {
    name: MINDSTORE_MCP_SERVER_INFO.name,
    version: MINDSTORE_MCP_SERVER_INFO.version,
    description: MINDSTORE_MCP_SERVER_INFO.description,
    capabilities: {
      tools: [...CORE_MCP_TOOLS, ...bindings.tools.map((binding) => binding.tool.definition)],
      resources: [
        ...CORE_MCP_RESOURCES,
        ...bindings.resources.map((binding) => ({
          uri: binding.resource.uri,
          name: binding.resource.name,
          description: binding.resource.description,
          mimeType: binding.resource.mimeType,
        })),
      ],
      prompts: bindings.prompts.map((binding) => binding.prompt.definition),
    },
    status: "active",
  };
}

export async function callMcpTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "search_mind":
      return { text: await toolSearchMind(args as { query: string; limit?: number; source?: string }) };
    case "get_profile":
      return { text: await toolGetProfile() };
    case "get_context":
      return { text: await toolGetContext(args as { topic: string; limit?: number }) };
    case "get_timeline":
      return { text: await toolGetTimeline(args as { topic: string; fromDate?: string; toDate?: string; limit?: number }) };
    case "get_contradictions":
      return { text: await toolGetContradictions(args as { query: string; limit?: number }) };
    case "get_threads":
      return { text: await toolGetThreads(args as { topic?: string; limit?: number }) };
    case "learn_fact":
      return { text: await toolLearnFact(args as { content: string; category?: string; source?: string }) };
    default: {
      const bindings = await getMcpBindings();
      const pluginTool = bindings.tools.find((binding) => binding.tool.definition.name === name);
      if (!pluginTool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const userId = await getMcpUserId();
      return await pluginTool.tool.handler(args, {
        userId,
        pluginSlug: pluginTool.pluginSlug,
        pluginConfig: pluginTool.pluginConfig,
      });
    }
  }
}

export async function readMcpResource(uri: string) {
  switch (uri) {
    case "mindstore://profile":
      return await resourceProfile();
    case "mindstore://recent":
      return await resourceRecent();
    default: {
      const bindings = await getMcpBindings();
      const pluginResource = bindings.resources.find((binding) => binding.resource.uri === uri);
      if (!pluginResource) {
        throw new Error(`Unknown resource: ${uri}`);
      }

      const userId = await getMcpUserId();
      return await pluginResource.resource.read({
        userId,
        pluginSlug: pluginResource.pluginSlug,
        pluginConfig: pluginResource.pluginConfig,
      });
    }
  }
}

export async function getMcpPrompt(name: string, args: Record<string, unknown>) {
  const bindings = await getMcpBindings();
  const prompt = bindings.prompts.find((binding) => binding.prompt.definition.name === name);
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  const userId = await getMcpUserId();
  return await prompt.prompt.render(args, {
    userId,
    pluginSlug: prompt.pluginSlug,
    pluginConfig: prompt.pluginConfig,
  });
}

export async function createOfficialMcpServer() {
  const server = new McpServer(
    {
      name: MINDSTORE_MCP_SERVER_INFO.name,
      version: MINDSTORE_MCP_SERVER_INFO.version,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  for (const tool of CORE_MCP_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: jsonObjectSchemaToZodObject(tool.inputSchema),
      },
      async (args) => {
        const result = await callMcpTool(tool.name, (args as Record<string, unknown>) ?? {});
        return {
          content: [{ type: "text", text: result.text }],
        };
      }
    );
  }

  for (const resource of CORE_MCP_RESOURCES) {
    server.registerResource(
      resource.name,
      resource.uri,
      {
        description: resource.description,
        mimeType: resource.mimeType,
      },
      async () => ({
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: await readMcpResource(resource.uri),
          },
        ],
      })
    );
  }

  const bindings = await getMcpBindings();

  for (const binding of bindings.tools) {
    server.registerTool(
      binding.tool.definition.name,
      {
        description: binding.tool.definition.description,
        inputSchema: jsonObjectSchemaToZodObject(binding.tool.definition.inputSchema),
      },
      async (args) => {
        const result = await callMcpTool(binding.tool.definition.name, (args as Record<string, unknown>) ?? {});
        return {
          content: [{ type: "text", text: result.text }],
        };
      }
    );
  }

  for (const binding of bindings.resources) {
    server.registerResource(
      binding.resource.name,
      binding.resource.uri,
      {
        description: binding.resource.description,
        mimeType: binding.resource.mimeType,
      },
      async () => ({
        contents: [
          {
            uri: binding.resource.uri,
            mimeType: binding.resource.mimeType,
            text: await readMcpResource(binding.resource.uri),
          },
        ],
      })
    );
  }

  for (const binding of bindings.prompts) {
    server.registerPrompt(
      binding.prompt.definition.name,
      {
        description: binding.prompt.definition.description,
        argsSchema: promptArgumentsToZodShape(binding.prompt.definition.arguments),
      },
      async (args) => {
        const rendered = await getMcpPrompt(
          binding.prompt.definition.name,
          (args as Record<string, unknown>) ?? {}
        );
        return {
          description: rendered.description,
          messages: rendered.messages.map((message) => ({
            role: normalizePromptRole(message.role),
            content: {
              type: "text" as const,
              text: message.role === "system" ? `[System]\n${message.content}` : message.content,
            },
          })),
        };
      }
    );
  }

  return server;
}

async function toolSearchMind(args: { query: string; limit?: number; source?: string }): Promise<string> {
  const limit = Math.min(args.limit || 5, 20);
  const userId = await getMcpUserId();

  let embedding: number[] | null = null;
  try {
    // Search-side embedding — Gemini needs RETRIEVAL_QUERY tagging.
    const embeddings = await generateEmbeddings([args.query], { mode: 'query' });
    if (embeddings && embeddings.length > 0) {
      embedding = embeddings[0];
    }
  } catch {
    // Fall back to non-vector search.
  }

  const results = await retrieve(args.query, embedding, {
    userId,
    limit,
    sourceTypes: args.source ? [args.source] : undefined,
  });

  if (results.length === 0) {
    return `No results found for "${args.query}" in the knowledge base.`;
  }

  const formatted = results
    .map((result, index) => {
      const date = result.createdAt ? new Date(result.createdAt).toLocaleDateString() : "unknown date";
      const layers = Object.keys(result.layers).join("+");
      return `[${index + 1}] "${result.sourceTitle || "Untitled"}" (${result.sourceType}, ${date}) [matched via: ${layers}]\n${result.content}`;
    })
    .join("\n\n---\n\n");

  return `Found ${results.length} relevant memories:\n\n${formatted}`;
}

async function toolGetProfile(): Promise<string> {
  const userId = await getMcpUserId();

  const stats = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT source_type) as source_types,
      COUNT(DISTINCT source_title) as sources,
      MIN(created_at) as earliest,
      MAX(created_at) as latest
    FROM memories WHERE user_id = ${userId}::uuid
  `);

  const byType = await db.execute(sql`
    SELECT source_type, COUNT(*) as count
    FROM memories WHERE user_id = ${userId}::uuid
    GROUP BY source_type ORDER BY count DESC
  `);

  const topSources = await db.execute(sql`
    SELECT source_title, source_type, COUNT(*) as count
    FROM memories WHERE user_id = ${userId}::uuid
    GROUP BY source_title, source_type
    ORDER BY count DESC LIMIT 10
  `);

  const row = ((stats as unknown as StatsRow[])?.[0]) || ({} as Partial<StatsRow>);
  const total = parseInt(row.total || "0", 10) || 0;

  if (total === 0) {
    return "The knowledge base is empty. No memories have been imported yet.";
  }

  const typeBreakdown = (byType as unknown as ByTypeRow[])
    .map((entry) => `  - ${entry.source_type}: ${entry.count} memories`)
    .join("\n");

  const topSourcesList = (topSources as unknown as TopSourceRow[])
    .map((entry) => `  - "${entry.source_title || "Untitled"}" (${entry.source_type}): ${entry.count} chunks`)
    .join("\n");

  const earliest = row.earliest ? new Date(row.earliest).toLocaleDateString() : "N/A";
  const latest = row.latest ? new Date(row.latest).toLocaleDateString() : "N/A";

  return `Knowledge Base Profile:
- Total memories: ${total}
- Distinct sources: ${row.sources || 0}
- Date range: ${earliest} to ${latest}

By type:
${typeBreakdown}

Top sources:
${topSourcesList}`;
}

async function toolGetContext(args: { topic: string; limit?: number }): Promise<string> {
  const result = await toolSearchMind({ query: args.topic, limit: args.limit || 5 });
  return `Context from the user's knowledge base about "${args.topic}":\n\n${result}`;
}

interface TimelineRow {
  id: string;
  content: string;
  source_type: string;
  source_title: string | null;
  created_at: string | Date | null;
}

async function toolGetTimeline(args: {
  topic: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<string> {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
  const userId = await getMcpUserId();

  let embedding: number[] | null = null;
  try {
    const embeddings = await generateEmbeddings([args.topic], { mode: 'query' });
    if (embeddings && embeddings.length > 0) {
      embedding = embeddings[0];
    }
  } catch {
    // fall back to text-only retrieval
  }

  // Validate optional date bounds. If invalid, ignore (don't error — the
  // AI client may pass loose strings).
  const from = parseLooseDate(args.fromDate);
  const to = parseLooseDate(args.toDate);

  const dateFrom = from ?? undefined;
  const dateTo = to ?? undefined;

  // Overfetch so we have material to sort chronologically; the user
  // asked for `limit` semantically-relevant results spanning time, not
  // the strict top-k.
  const overfetch = Math.max(limit * 3, 60);
  const matches = await retrieve(args.topic, embedding, {
    userId,
    limit: overfetch,
    dateFrom,
    dateTo,
  });

  if (matches.length === 0) {
    return `No memories matched "${args.topic}"${
      from || to ? ' in the requested date range' : ''
    }.`;
  }

  // Sort oldest → newest. Memories without dates sink to the end.
  const sorted = [...matches].sort((a, b) => {
    const aTs = a.createdAt ? new Date(a.createdAt).getTime() : Number.POSITIVE_INFINITY;
    const bTs = b.createdAt ? new Date(b.createdAt).getTime() : Number.POSITIVE_INFINITY;
    return aTs - bTs;
  });

  const trimmed = sorted.slice(0, limit);

  const lines = trimmed.map((row, index) => {
    const date = row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 10) : 'unknown date';
    const title = row.sourceTitle || 'Untitled';
    return `[${index + 1}] ${date} — "${title}" (${row.sourceType})\n${row.content}`;
  });

  const span =
    from || to
      ? ` between ${from ? from.toISOString().slice(0, 10) : 'the beginning'} and ${
          to ? to.toISOString().slice(0, 10) : 'now'
        }`
      : '';

  return `Timeline for "${args.topic}"${span}: ${trimmed.length} memories oldest → newest.\n\n${lines.join(
    '\n\n---\n\n',
  )}`;
}

async function toolGetContradictions(args: { query: string; limit?: number }): Promise<string> {
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 15);
  const userId = await getMcpUserId();

  let embedding: number[] | null = null;
  try {
    const embeddings = await generateEmbeddings([args.query], { mode: 'query' });
    if (embeddings && embeddings.length > 0) embedding = embeddings[0];
  } catch {
    // fall back
  }

  const adversarial = await retrieveAdversarial(args.query, embedding, {
    userId,
    limit,
  });

  if (adversarial.length === 0) {
    return `No recorded contradictions in the user's knowledge base for "${args.query}". (Either the topic is consistent, or the contradiction-finder plugin hasn't scanned this area yet.)`;
  }

  // For each adversarial result, fetch the contradicting memories' content
  // so the AI client gets both sides without a follow-up call.
  const opposingIds = Array.from(
    new Set(adversarial.flatMap((row) => row.opposingMemoryIds)),
  );
  const opposingMap = new Map<string, { content: string; sourceTitle: string | null; sourceType: string }>();
  if (opposingIds.length > 0) {
    const rows = (await db.execute(sql`
      SELECT id, content, source_title, source_type
      FROM memories
      WHERE user_id = ${userId}::uuid AND id = ANY(${opposingIds}::uuid[])
    `)) as unknown as Array<{
      id: string;
      content: string;
      source_title: string | null;
      source_type: string;
    }>;
    for (const row of rows) {
      opposingMap.set(row.id, {
        content: row.content,
        sourceTitle: row.source_title,
        sourceType: row.source_type,
      });
    }
  }

  const blocks = adversarial.map((result, index) => {
    const opposingDetails = result.opposingMemoryIds
      .map((id, opIndex) => {
        const opp = opposingMap.get(id);
        if (!opp) return `  ↔ [opposing memory ${id}] (content not available)`;
        return `  ↔ "${opp.sourceTitle || 'Untitled'}" (${opp.sourceType})\n     ${opp.content}`;
      })
      .join('\n');

    const topics = result.contradictionTopics.length
      ? ` [topics: ${result.contradictionTopics.join(', ')}]`
      : '';

    return `[${index + 1}]${topics} "${result.sourceTitle || 'Untitled'}" (${result.sourceType})\n${result.content}\n\n${opposingDetails}`;
  });

  return `Found ${adversarial.length} contradictions related to "${args.query}". Each block is one memory plus the memory(ies) it disagrees with:\n\n${blocks.join('\n\n===\n\n')}`;
}

interface ThreadMemberRow {
  id: string;
  content: string;
  source_type: string;
  source_title: string | null;
  created_at: string | Date | null;
}

async function toolGetThreads(args: { topic?: string; limit?: number }): Promise<string> {
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 15);
  const userId = await getMcpUserId();

  // Topic-mode: search semantically, then group results by source_title.
  // Each group ≥ 2 memories is considered a "thread" — a coherent line
  // of thinking visible across multiple chunks of the same source.
  if (args.topic && args.topic.trim()) {
    let embedding: number[] | null = null;
    try {
      const embeddings = await generateEmbeddings([args.topic], { mode: 'query' });
      if (embeddings && embeddings.length > 0) embedding = embeddings[0];
    } catch {
      // fall back to lexical-only
    }

    const matches = await retrieve(args.topic, embedding, {
      userId,
      limit: 60, // overfetch so groups have material
    });

    if (matches.length === 0) {
      return `No threads found for "${args.topic}". The topic may not appear in any of your memories yet.`;
    }

    type Thread = {
      sourceTitle: string;
      sourceType: string;
      memoryCount: number;
      earliest: Date | null;
      latest: Date | null;
      preview: string;
    };

    const threadMap = new Map<string, Thread>();
    for (const row of matches) {
      const key = `${row.sourceType}::${row.sourceTitle ?? 'Untitled'}`;
      const ts = row.createdAt ? new Date(row.createdAt) : null;
      const existing = threadMap.get(key);
      if (existing) {
        existing.memoryCount += 1;
        if (ts) {
          if (!existing.earliest || ts < existing.earliest) existing.earliest = ts;
          if (!existing.latest || ts > existing.latest) existing.latest = ts;
        }
      } else {
        threadMap.set(key, {
          sourceTitle: row.sourceTitle ?? 'Untitled',
          sourceType: row.sourceType,
          memoryCount: 1,
          earliest: ts,
          latest: ts,
          preview: row.content.length > 200 ? row.content.slice(0, 200) + '…' : row.content,
        });
      }
    }

    // Threads with only 1 memory aren't really threads — they're single hits.
    const threads = Array.from(threadMap.values())
      .filter((t) => t.memoryCount >= 2)
      .sort((a, b) => b.memoryCount - a.memoryCount)
      .slice(0, limit);

    if (threads.length === 0) {
      return `Found ${matches.length} matches for "${args.topic}" but they're scattered across different sources — no coherent thread of ≥2 memories from the same source. Try search_mind for the raw matches.`;
    }

    const blocks = threads.map((thread, index) => {
      const span =
        thread.earliest && thread.latest && thread.earliest.getTime() !== thread.latest.getTime()
          ? `${thread.earliest.toISOString().slice(0, 10)} → ${thread.latest.toISOString().slice(0, 10)}`
          : thread.earliest
            ? thread.earliest.toISOString().slice(0, 10)
            : 'unknown date';
      return `[${index + 1}] "${thread.sourceTitle}" (${thread.sourceType}) — ${thread.memoryCount} memories, ${span}\n   First-match preview: ${thread.preview}`;
    });

    return `Threads on "${args.topic}":\n\n${blocks.join('\n\n')}\n\nUse search_mind with source="<sourceType>" to drill into a specific thread's memories.`;
  }

  // No-topic mode: most prolific recent sources in the last 90 days.
  const recent = (await db.execute(sql`
    SELECT
      source_type,
      source_title,
      COUNT(*)::int AS memory_count,
      MIN(created_at) AS earliest,
      MAX(created_at) AS latest
    FROM memories
    WHERE user_id = ${userId}::uuid
      AND created_at >= NOW() - INTERVAL '90 days'
      AND source_title IS NOT NULL
    GROUP BY source_type, source_title
    HAVING COUNT(*) >= 2
    ORDER BY memory_count DESC, latest DESC
    LIMIT ${limit}
  `)) as unknown as Array<{
    source_type: string;
    source_title: string | null;
    memory_count: number;
    earliest: string | Date | null;
    latest: string | Date | null;
  }>;

  if (recent.length === 0) {
    return 'No active threads in the last 90 days. Try get_threads with a specific topic, or import more content.';
  }

  const blocks = recent.map((row, index) => {
    const earliest = row.earliest ? new Date(row.earliest).toISOString().slice(0, 10) : '?';
    const latest = row.latest ? new Date(row.latest).toISOString().slice(0, 10) : '?';
    return `[${index + 1}] "${row.source_title}" (${row.source_type}) — ${row.memory_count} memories, ${earliest} → ${latest}`;
  });

  return `Most active recent threads (last 90 days):\n\n${blocks.join('\n')}\n\nCall get_threads with a topic to thread by topic instead, or search_mind to see individual memories.`;
}

async function toolLearnFact(args: {
  content: string;
  category?: string;
  source?: string;
}): Promise<string> {
  const content = args.content?.trim() ?? '';
  if (content.length === 0) {
    return 'Error: content is required and must not be empty.';
  }
  if (content.length > 50_000) {
    return 'Error: content exceeds the 50,000-character limit. Pass a shorter excerpt and call again.';
  }

  const userId = await getMcpUserId();

  // Generate an embedding so the fact is searchable from day one.
  let embeddingLiteral: string | null = null;
  try {
    const embeddings = await generateEmbeddings([content]);
    if (embeddings && embeddings.length > 0) {
      embeddingLiteral = `[${embeddings[0].join(',')}]`;
    }
  } catch {
    // Embedding failure is non-fatal — the memory still gets stored,
    // and the indexing-jobs queue can backfill embeddings later.
  }

  const id = randomUUID();
  const sourceLabel = (args.source && args.source.trim()) || 'AI assistant via MCP';
  const metadata: Record<string, unknown> = {
    learnedVia: 'mcp:learn_fact',
    learnedAt: new Date().toISOString(),
  };
  if (args.category) metadata.category = args.category.slice(0, 100);

  if (embeddingLiteral) {
    await db.execute(sql`
      INSERT INTO memories (id, user_id, content, embedding, source_type, source_id, source_title, metadata, created_at, imported_at)
      VALUES (
        ${id}::uuid, ${userId}::uuid, ${content},
        ${embeddingLiteral}::vector,
        'ai-taught', null, ${sourceLabel},
        ${JSON.stringify(metadata)}::jsonb,
        NOW(), NOW()
      )
    `);
  } else {
    await db.execute(sql`
      INSERT INTO memories (id, user_id, content, source_type, source_id, source_title, metadata, created_at, imported_at)
      VALUES (
        ${id}::uuid, ${userId}::uuid, ${content},
        'ai-taught', null, ${sourceLabel},
        ${JSON.stringify(metadata)}::jsonb,
        NOW(), NOW()
      )
    `);
  }

  return `Stored. id=${id}. Source label: "${sourceLabel}". ${
    args.category ? `Category: "${args.category}". ` : ''
  }${
    embeddingLiteral ? 'Embedded and immediately searchable.' : 'Stored without embedding (provider unavailable); will be backfilled by the indexing job.'
  }`;
}

/** Parse a loose YYYY-MM-DD or full ISO string. Returns null on garbage. */
function parseLooseDate(value: string | undefined): Date | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) return null;
  return date;
}

async function resourceProfile(): Promise<string> {
  return await toolGetProfile();
}

async function resourceRecent(): Promise<string> {
  const userId = await getMcpUserId();

  const recent = await db.execute(sql`
    SELECT id, content, source_type, source_title, created_at
    FROM memories WHERE user_id = ${userId}::uuid
    ORDER BY created_at DESC LIMIT 10
  `);

  const rows = recent as unknown as RecentRow[];
  if (!rows.length) {
    return "No memories yet.";
  }

  const formatted = rows
    .map((row, index) => {
      const date = row.created_at ? new Date(row.created_at).toLocaleDateString() : "unknown";
      const preview = row.content.length > 300 ? `${row.content.slice(0, 300)}...` : row.content;
      return `[${index + 1}] "${row.source_title || "Untitled"}" (${row.source_type}, ${date})\n${preview}`;
    })
    .join("\n\n---\n\n");

  return `10 most recent memories:\n\n${formatted}`;
}

function jsonObjectSchemaToZodObject(schema: McpToolDefinition["inputSchema"]) {
  const required = new Set(schema.required ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, property] of Object.entries(schema.properties)) {
    let field: z.ZodTypeAny;

    if (property.enum?.length && property.enum.every((value) => typeof value === "string")) {
      field = z.enum(property.enum as [string, ...string[]]);
    } else {
      switch (property.type) {
        case "number":
          field = z.number();
          break;
        case "boolean":
          field = z.boolean();
          break;
        default:
          field = z.string();
          break;
      }
    }

    if (property.description) {
      field = field.describe(property.description);
    }

    if (!required.has(key)) {
      field = field.optional();
    }

    shape[key] = field;
  }

  return z.object(shape);
}

function promptArgumentsToZodShape(
  argumentsList: Array<{ name: string; description: string; required?: boolean }> | undefined
) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const argument of argumentsList ?? []) {
    let field: z.ZodTypeAny = z.string().describe(argument.description);
    if (!argument.required) {
      field = field.optional();
    }
    shape[argument.name] = field;
  }

  return shape;
}

function normalizePromptRole(role: "system" | "user" | "assistant") {
  return role === "system" ? "user" : role;
}
