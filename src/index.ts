#!/usr/bin/env node
// IMPORTANT: stdio MCP servers must never write to stdout. console.log corrupts
// the JSON-RPC frame. Always use console.error (which writes to stderr).

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { AscClient } from "./client.js";
import { loadCredentialsFromEnv } from "./auth.js";
import { allTools } from "./tools/registry.js";

async function main(): Promise<void> {
  const creds = loadCredentialsFromEnv();
  const client = new AscClient(creds);
  const tools = allTools(client);
  const toolMap = new Map(tools.map((t) => [t.name, t] as const));

  const server = new Server(
    { name: "appstore-connect-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema, { target: "openApi3" }) as Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = toolMap.get(req.params.name);
    if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
    const parsed = tool.inputSchema.parse(req.params.arguments ?? {});
    const result = await tool.handler(parsed);
    return {
      content: [
        {
          type: "text",
          text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`appstore-connect-mcp ready (${tools.length} tools)`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
