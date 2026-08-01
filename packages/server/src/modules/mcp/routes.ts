import type { FastifyInstance } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireUser } from "../../plugins/session.js";
import { AI_TOOLS } from "../ai/tools.js";

const METHOD_NOT_ALLOWED_BODY = JSON.stringify({
  jsonrpc: "2.0",
  error: { code: -32000, message: "Method not allowed - this server only supports stateless POST requests." },
  id: null,
});

/** One `McpServer` per request, registering the same AI_TOOLS the in-app chat uses (see modules/ai/tools.ts) - stateless (no session persisted between requests), matching the SDK's own recommended pattern for a simple HTTP API rather than a long-lived streaming session. */
function buildMcpServer(userId: string): McpServer {
  const server = new McpServer({ name: "notorious", version: "1.0.0" });
  for (const tool of AI_TOOLS) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.shape }, async (args: Record<string, unknown>) => {
      try {
        const output = await tool.execute(args, { userId });
        return { content: [{ type: "text" as const, text: JSON.stringify(output) }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: error instanceof Error ? error.message : "Tool call failed" }],
          isError: true,
        };
      }
    });
  }
  return server;
}

/**
 * Lets an external MCP client (Claude Desktop, Claude Code, ...) create/
 * manage objects via the same tool set the in-app AI chat uses - see
 * docs/MCP.md for how to point a client at this. Authenticated exactly like
 * any other API request: an `Authorization: Bearer ntr_...` personal API key
 * (see apiKeys/service.ts), already resolved into `request.user` by the
 * session plugin before this handler runs - no separate MCP-specific auth.
 */
export async function registerMcpRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/mcp", async (request, reply) => {
    const user = requireUser(request);
    // Hands the raw Node request/response to the MCP SDK's transport, which
    // writes the JSON-RPC response itself - Fastify must not also try to
    // send a reply for this request.
    reply.hijack();
    const server = buildMcpServer(user.id);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } finally {
      reply.raw.on("close", () => {
        void transport.close();
        void server.close();
      });
    }
  });

  // Stateless mode has no session to resume (GET) or end (DELETE) - matches
  // the SDK's own stateless example server.
  app.get("/api/v1/mcp", async (_request, reply) => {
    reply.code(405).header("Content-Type", "application/json").send(METHOD_NOT_ALLOWED_BODY);
  });
  app.delete("/api/v1/mcp", async (_request, reply) => {
    reply.code(405).header("Content-Type", "application/json").send(METHOD_NOT_ALLOWED_BODY);
  });
}
