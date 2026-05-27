import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BitrixClient } from "../../bitrix/client.js";
import type { TokenPayload } from "../../utils/crypto.js";

export function registerTasksGet(server: McpServer, client: BitrixClient, ctx: TokenPayload): void {
  server.registerTool(
    "bitrix_tasks_get",
    {
      description:
        "Get full details of a single task by ID. Access is denied if you are not a creator, responsible, accomplice, or auditor of that task.",
      inputSchema: {
        task_id: z.number().int().positive().describe("Bitrix24 task ID"),
      },
    },
    async ({ task_id }) => {
      try {
        const task = await client.getTask(task_id, ctx.bitrixUserId);

        if (task.my_role.length === 0) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "Access denied: you are not a participant in this task.",
              },
            ],
          };
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(task) }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        };
      }
    },
  );
}
