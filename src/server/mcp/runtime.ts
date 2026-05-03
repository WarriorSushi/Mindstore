import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/server/db";
import { generateEmbeddings } from "@/server/embeddings";
import { pluginRuntime } from "@/server/plugins/runtime";
import { getInstalledPluginMap } from "@/server/plugins/state";
import { retrieve } from "@/server/retrieval";
import { getUserId } from "@/server/user";
import { sql } from "drizzle-orm";
import { z } from "zod";

export const MINDSTORE_MCP_SERVER_INFO = {
  name: "mindstore",
  version: "0.2.0",
  description: "Your personal MindStore — searchable knowledge from your conversations, notes, and documents",
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
