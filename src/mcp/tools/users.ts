import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BitrixClient } from "../../bitrix/client.js";

export function registerUsers(server: McpServer, client: BitrixClient): void {
  server.registerTool(
    "bitrix_users_search",
    {
      description:
        "Search Bitrix24 portal users by name, last name, or email. Use this to find user IDs when assigning or delegating tasks.",
      inputSchema: {
        query: z.string().min(1).describe("Part of a name, last name, or email address"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results (default 20)"),
      },
    },
    async ({ query, limit }) => {
      try {
        const users = await client.searchUsers(query, limit ?? 20);
        return { content: [{ type: "text" as const, text: JSON.stringify(users) }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        };
      }
    },
  );

  server.registerTool(
    "bitrix_users_list",
    {
      description: "List active users on the Bitrix24 portal. Useful for picking assignees.",
      inputSchema: {
        page: z.number().int().min(1).optional().describe("Page number (default 1)"),
        active_only: z
          .boolean()
          .optional()
          .describe("Filter to active users only (default true)"),
      },
    },
    async ({ page, active_only }) => {
      try {
        const result = await client.listUsers(page ?? 1, active_only ?? true);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        };
      }
    },
  );
}
