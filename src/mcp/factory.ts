import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BitrixClient } from "../bitrix/client.js";
import type { TokenPayload } from "../utils/crypto.js";
import { registerWhoami } from "./tools/whoami.js";
import { registerUsers } from "./tools/users.js";
import { registerTasksList } from "./tools/tasks-list.js";
import { registerTasksGet } from "./tools/tasks-get.js";
import { registerTasksCreate } from "./tools/tasks-create.js";
import { registerTasksUpdate } from "./tools/tasks-update.js";
import { registerTasksActions } from "./tools/tasks-actions.js";
import { registerTasksComments } from "./tools/tasks-comments.js";
import { registerTasksCounters } from "./tools/tasks-counters.js";

// Creates a fully-configured MCP server for one user.
// Called fresh on each request — stateless, no shared state between requests.
export function createMcpServer(ctx: TokenPayload): McpServer {
  const client = new BitrixClient(ctx.webhook);

  const server = new McpServer(
    { name: "bitrix-mcp", version: "1.0.0" },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register all 17 tools
  registerWhoami(server, client, ctx);
  registerUsers(server, client);
  registerTasksList(server, client, ctx);
  registerTasksGet(server, client, ctx);
  registerTasksCreate(server, client, ctx);
  registerTasksUpdate(server, client, ctx);
  registerTasksActions(server, client, ctx);
  registerTasksComments(server, client, ctx);
  registerTasksCounters(server, client, ctx);

  return server;
}
