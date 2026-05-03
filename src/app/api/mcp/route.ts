import { NextRequest, NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  buildMcpDiscovery,
  createOfficialMcpServer,
} from "@/server/mcp/runtime";
import { getApiKeyFromHeaders, resolveApiKeyUserId } from "@/server/api-keys";
import { isSingleUserModeEnabled } from "@/server/identity";
import { errors } from "@/server/api-errors";

const STATIC_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id",
  "Cache-Control": "no-store",
} as const;

/**
 * Resolve CORS headers for a given request:
 *   - If the request's Origin matches `MCP_ALLOWED_ORIGINS`
 *     (comma-separated env var), echo it back.
 *   - Otherwise, omit `Access-Control-Allow-Origin` entirely. Same-origin
 *     callers (e.g. our own UI) are unaffected; cross-origin browser
 *     callers from non-allow-listed origins will fail the CORS preflight.
 */
function corsHeadersFor(req: { headers: Headers } | NextRequest | null): Record<string, string> {
  const headers: Record<string, string> = { ...STATIC_CORS_HEADERS };

  const allowList = (process.env.MCP_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const origin = req?.headers.get("origin");
  if (origin && allowList.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  return headers;
}

/**
 * Auth gate for MCP requests.
 *   - Always accept a valid `Authorization: Bearer <api-key>` (api_keys table).
 *   - In single-user mode, the absence of credentials is also acceptable —
 *     existing local clients keep working without configuration.
 *   - In multi-user mode, missing/invalid credentials → 401.
 */
async function isAuthorizedMcpRequest(req: NextRequest): Promise<boolean> {
  const presented = getApiKeyFromHeaders(req.headers);
  if (presented) {
    const userId = await resolveApiKeyUserId(presented);
    if (userId) return true;
    // Bearer was presented but invalid — never fall back, even in single-user mode.
    return false;
  }

  return isSingleUserModeEnabled();
}

export async function GET(request: NextRequest) {
  const headers = corsHeadersFor(request);
  // Discovery is intentionally unauthenticated — clients use it to learn
  // whether they need credentials. It returns no user-scoped data.
  return NextResponse.json(await buildMcpDiscovery(), { headers });
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedMcpRequest(request))) {
    return withCors(errors.unauthorized(), request);
  }
  return handleSdkTransportRequest(request);
}

export async function DELETE(request: NextRequest) {
  if (!(await isAuthorizedMcpRequest(request))) {
    return withCors(errors.unauthorized(), request);
  }
  return handleSdkTransportRequest(request);
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { headers: corsHeadersFor(request) });
}

async function handleSdkTransportRequest(request: NextRequest) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = await createOfficialMcpServer();

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return withCors(response, request);
  } catch (error) {
    console.error("MCP transport error:", error);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      },
      {
        status: 500,
        headers: corsHeadersFor(request),
      }
    );
  } finally {
    await transport.close();
    await server.close();
  }
}

function withCors(response: Response, request: NextRequest | null) {
  const cors = corsHeadersFor(request);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
